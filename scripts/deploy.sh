#!/usr/bin/env bash
# One-command deploy for the media-producer droplet.
#
#   bash scripts/deploy.sh            # deploy origin/master
#   bash scripts/deploy.sh <branch>   # deploy another branch
#
# Reads instance config + secrets from /etc/media-producer/env (see DEPLOY.md
# for the template) so nothing sensitive lives in the repo, restarts the app
# under pm2, and verifies the NEW commit is actually the one serving /health
# before declaring success.
set -euo pipefail

BRANCH="${1:-master}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${MP_ENV_FILE:-/etc/media-producer/env}"
APP_NAME="${MP_PM2_NAME:-media-producer}"

cd "$REPO_DIR"
echo "== media-producer deploy =="
echo "repo:    $REPO_DIR"
echo "branch:  $BRANCH"

git fetch origin "$BRANCH"
git checkout -q "$BRANCH" 2>/dev/null || git checkout -q -b "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH" >/dev/null
SHA="$(git rev-parse --short HEAD)"
echo "commit:  $SHA ($(git log -1 --format=%s | head -c 80))"

npm ci --no-audit --no-fund
npm run build

# Environment: secrets and instance config live OUTSIDE the repo.
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  echo "env:     $ENV_FILE loaded"
else
  echo "env:     WARNING -- no $ENV_FILE; running with the current shell env only"
fi
# Report auth mode without leaking values (401 mysteries start here).
echo "auth:    AUTH_TOKENS=$([ -n "${AUTH_TOKENS:-}" ] && echo set || echo unset)  SESSION_SECRET=$([ -n "${SESSION_SECRET:-}" ] && echo set || echo unset)"
PORT="${MP_PORT:-3200}"
export MP_GIT_SHA="$SHA"

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload "$APP_NAME" --update-env
else
  pm2 start dist/index.js --name "$APP_NAME" --time
fi
pm2 save >/dev/null 2>&1 || true

# Health check: wait for the server to answer, then confirm it serves THIS
# commit (a healthy response from a stale process is the classic silent
# deploy failure).
echo -n "health:  "
for i in $(seq 1 30); do
  body="$(curl -sf --max-time 2 "http://127.0.0.1:${PORT}/health" 2>/dev/null || true)"
  if [ -n "$body" ]; then
    case "$body" in
      *"$SHA"*)
        echo "$body"
        echo "OK -- commit $SHA is live on :$PORT"
        exit 0
        ;;
    esac
  fi
  sleep 1
done
echo "FAILED"
echo "No healthy response carrying commit $SHA on :$PORT after 30s." >&2
echo "Check: pm2 logs $APP_NAME --lines 50" >&2
exit 1
