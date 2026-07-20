#!/usr/bin/env bash
# Cron-driven health watchdog (installed by setup-watchdog.sh, runs every
# minute). pm2 only notices process DEATH; this catches the wedged-but-alive
# states we actually shipped: event loop stuck (online, 0% CPU, Caddy 502)
# and a half-built dist crash-looping after an interrupted deploy.
#
# Escalation ladder, one rung per state file:
#   /health fails 3 minutes in a row      -> pm2 restart
#   2 pm2 restarts without recovery       -> full `deploy.sh master` (rebuilds
#                                            dist from origin, the only cure
#                                            for a corrupted build), under an
#                                            flock so cron ticks don't stack.
# Any successful probe resets the ladder.
set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MP_ENV_FILE:-/etc/media-producer/env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && . "$ENV_FILE" >/dev/null 2>&1 || true
PORT="${MP_PORT:-3200}"
APP_NAME="${MP_PM2_NAME:-media-producer-mcp}"
FAILS_F=/tmp/mp-watchdog-fails
RESTARTS_F=/tmp/mp-watchdog-restarts
DEPLOY_LOCK=/tmp/mp-watchdog-deploy.lock

if curl -sf --max-time 5 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
  rm -f "$FAILS_F" "$RESTARTS_F"
  exit 0
fi

FAILS=$(( $(cat "$FAILS_F" 2>/dev/null || echo 0) + 1 ))
echo "$FAILS" > "$FAILS_F"
echo "$(date -Is) /health on :$PORT not answering (strike $FAILS/3)"
[ "$FAILS" -lt 3 ] && exit 0

RESTARTS=$(( $(cat "$RESTARTS_F" 2>/dev/null || echo 0) + 1 ))
echo "$RESTARTS" > "$RESTARTS_F"
rm -f "$FAILS_F"

if [ "$RESTARTS" -le 2 ]; then
  echo "$(date -Is) pm2 restart $APP_NAME (attempt $RESTARTS/2)"
  # No --update-env: keep the env the app was deployed with, not cron's.
  pm2 restart "$APP_NAME" >/dev/null 2>&1 \
    || echo "$(date -Is) pm2 restart failed (will escalate to redeploy)"
else
  echo "$(date -Is) restarts did not recover the app -- full redeploy of master"
  # flock: a redeploy takes minutes; later cron ticks must not stack on it.
  flock -n "$DEPLOY_LOCK" bash "$REPO_DIR/scripts/deploy.sh" master \
    && rm -f "$RESTARTS_F" \
    || echo "$(date -Is) redeploy failed or already in progress"
fi
