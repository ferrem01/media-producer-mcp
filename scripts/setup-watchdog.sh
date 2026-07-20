#!/usr/bin/env bash
# Install the droplet health watchdog (idempotent; called from deploy.sh).
#
# Two layers on top of pm2's own crash-restart:
#   1. pm2 max_memory_restart -- bounce the app if it balloons.
#   2. /etc/cron.d probe (scripts/health-watchdog.sh) every minute -- catches
#      "online but wedged" (pm2 sees a live pid, the port serves nothing)
#      and escalates: pm2 restart, then a full redeploy of master.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${MP_PM2_NAME:-media-producer-mcp}"
CRON_FILE="/etc/cron.d/media-producer-watchdog"
LOG_FILE="/var/log/mp-watchdog.log"
MEM_LIMIT="${MP_MAX_MEMORY_RESTART:-1200M}"

command -v crontab >/dev/null 2>&1 || command -v cron >/dev/null 2>&1 || {
  echo "watchdog: no cron on this host -- skipping"; exit 0; }

chmod +x "$REPO_DIR/scripts/health-watchdog.sh"

# Layer 1: memory ceiling. pm2 has no "set option on live process" command;
# apply it via a one-off restart ONLY when it isn't already set (a restart is
# seconds of downtime -- don't pay it on every deploy).
CURRENT_LIMIT="$(pm2 jlist 2>/dev/null | node -e '
  let d = ""; process.stdin.on("data", (c) => d += c).on("end", () => {
    try {
      const hit = JSON.parse(d).find((p) => p.name === process.argv[1]);
      if (hit) process.stdout.write(String(hit.pm2_env?.max_memory_restart || ""));
    } catch {}
  });' "$APP_NAME" 2>/dev/null || true)"
if [ -z "$CURRENT_LIMIT" ] || [ "$CURRENT_LIMIT" = "0" ]; then
  if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    echo "watchdog: applying max_memory_restart=$MEM_LIMIT to $APP_NAME"
    pm2 restart "$APP_NAME" --max-memory-restart "$MEM_LIMIT" >/dev/null
  fi
else
  echo "watchdog: max_memory_restart already set ($CURRENT_LIMIT bytes)"
fi

# Layer 2: the cron probe. cron.d wants root:root 0644 and a sane PATH (cron's
# default PATH has neither node nor pm2).
NODE_BIN="$(dirname "$(command -v node)")"
cat > "$CRON_FILE" <<EOF
# Installed by media-producer-mcp scripts/setup-watchdog.sh -- do not hand-edit.
PATH=$NODE_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root bash $REPO_DIR/scripts/health-watchdog.sh >> $LOG_FILE 2>&1
EOF
chmod 0644 "$CRON_FILE"
echo "watchdog: cron installed ($CRON_FILE), log at $LOG_FILE"
