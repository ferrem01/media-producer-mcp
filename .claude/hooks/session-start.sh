#!/bin/bash
# SessionStart hook: provision the container for the full render pipeline.
# Installs Node deps, ffmpeg (apt), and the Playwright Chromium browser so the
# media-producer pipeline can plan -> render -> encode videos in-session.
#
# Requires the environment's Network access to be "Full" (or "Custom" including
# cdn.playwright.dev) so the Playwright browser binary can download.
# Runs only in Claude Code on the web. Idempotent and non-interactive.
set -uo pipefail

# Web-only: skip entirely on local machines.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

echo "[setup] Installing Node dependencies..."
npm install --no-audit --no-fund

# Some base images ship broken third-party PPAs (ondrej/php, deadsnakes) that
# return 403 and poison every apt run. Disable them before installing ffmpeg.
echo "[setup] Disabling broken third-party apt sources (if present)..."
for f in $(grep -rl "launchpadcontent\|ondrej\|deadsnakes" /etc/apt/sources.list.d/ 2>/dev/null || true); do
  mv "$f" "$f.disabled" 2>/dev/null || true
done

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[setup] Installing ffmpeg via apt..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq && apt-get install -y -qq --no-install-recommends ffmpeg \
    || echo "[setup] WARNING: ffmpeg install failed (apt/network). Encoding will not work until resolved."
else
  echo "[setup] ffmpeg already present: $(ffmpeg -version 2>/dev/null | head -1)"
fi

echo "[setup] Installing Playwright Chromium..."
# Non-fatal: a blocked CDN (Network access != Full) should not abort the session.
npx playwright install chromium \
  || echo "[setup] WARNING: Playwright Chromium install failed. Set Network access to 'Full' (or allow cdn.playwright.dev) in the environment settings, then start a NEW session."

echo "[setup] Building project..."
npm run build || echo "[setup] WARNING: build failed (see output above)."

echo "[setup] Done."
