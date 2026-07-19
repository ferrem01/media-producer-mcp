#!/usr/bin/env bash
# Idempotent Caddy install + HTTPS config, run on every deploy (from
# scripts/deploy.sh, best-effort -- a failure here never fails the deploy).
#
# Config comes from the instance env file (default /etc/media-producer/env):
#   MP_CADDY_DISABLE=1   skip entirely (opt out)
#   MP_CADDY_DOMAIN=...  domain Caddy should serve. If unset, falls back to
#                        <public-ip-with-dashes>.sslip.io, which resolves to
#                        the droplet with zero DNS setup -- so HTTPS works
#                        before you own a domain. Swap in a real domain later
#                        by setting MP_CADDY_DOMAIN and redeploying.
#
# What it does (each step skipped when already true):
#   1. apt-install caddy
#   2. write /etc/caddy/Caddyfile -> reverse_proxy 127.0.0.1:$MP_PORT
#   3. open ports 80/443 if ufw is active
#   4. point MP_PUBLIC_URL in the env file at https://<domain> so every
#      preview_url / studio link the server hands out is HTTPS
#   5. reload caddy and probe https://<domain>/health
set -uo pipefail

ENV_FILE="${MP_ENV_FILE:-/etc/media-producer/env}"
if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
fi

if [ "${MP_CADDY_DISABLE:-}" = "1" ]; then
  echo "caddy:   disabled via MP_CADDY_DISABLE"
  exit 0
fi
if ! command -v systemctl >/dev/null 2>&1; then
  echo "caddy:   no systemd on this host; skipping"
  exit 0
fi

SUDO=""
[ "$(id -u)" = "0" ] || SUDO="sudo -n"

PORT="${MP_PORT:-3200}"
DOMAIN="${MP_CADDY_DOMAIN:-}"
if [ -z "$DOMAIN" ]; then
  IP="$(curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || true)"
  [ -n "$IP" ] || IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  case "$IP" in
    ""|10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[0-1].*)
      echo "caddy:   no public IP found and MP_CADDY_DOMAIN unset; skipping"
      exit 0
      ;;
  esac
  DOMAIN="${IP//./-}.nip.io"
  echo "caddy:   MP_CADDY_DOMAIN unset -- using zero-DNS fallback $DOMAIN"
fi

# 1. Install (idempotent).
if ! command -v caddy >/dev/null 2>&1; then
  echo "caddy:   installing..."
  if ! ($SUDO apt-get update -qq && $SUDO apt-get install -y -qq caddy) >/dev/null 2>&1; then
    echo "caddy:   apt install failed -- see https://caddyserver.com/docs/install; skipping"
    exit 0
  fi
fi

# 2. Caddyfile (write only on change; keep a stamp of what we manage).
CADDYFILE="/etc/caddy/Caddyfile"
# The email gives Caddy an ACME account for BOTH CAs -- without it the
# ZeroSSL fallback can't issue, which matters on shared fallback domains
# (sslip.io) where Let's Encrypt per-domain rate limits are often exhausted.
# Default is the repo owner's operational contact; override with
# MP_CADDY_EMAIL in the env file (cert-expiry notices go here).
ACME_EMAIL="${MP_CADDY_EMAIL:-marc@getquotient.ai}"
WANT="# managed by media-producer-mcp scripts/setup-caddy.sh
{
    email $ACME_EMAIL
}
$DOMAIN {
    tls {
        key_type rsa4096
    }
    reverse_proxy 127.0.0.1:$PORT
}"
if [ "$($SUDO cat "$CADDYFILE" 2>/dev/null)" != "$WANT" ]; then
  if [ -f "$CADDYFILE" ] && ! $SUDO head -1 "$CADDYFILE" 2>/dev/null | grep -q "managed by media-producer-mcp"; then
    # A hand-written Caddyfile that already fronts our port is a WORKING
    # setup, not an obstacle: adopt its site address as the HTTPS domain
    # (so MP_PUBLIC_URL flips to it below) and change nothing.
    if $SUDO grep -Eq "reverse_proxy (localhost|127\.0\.0\.1):$PORT" "$CADDYFILE"; then
      FOUND="$($SUDO grep -Eo '^[A-Za-z0-9.-]+[[:space:]]*\{' "$CADDYFILE" | head -1 | tr -d ' {')"
      if [ -n "$FOUND" ]; then
        DOMAIN="$FOUND"
        echo "caddy:   adopting existing hand-written config for $DOMAIN (file untouched)"
      else
        echo "caddy:   existing config proxies :$PORT but no site address found; leaving it alone."
        exit 0
      fi
    else
      echo "caddy:   $CADDYFILE exists, is NOT managed by this script, and does not proxy :$PORT -- leaving it alone."
      echo "caddy:   add 'reverse_proxy 127.0.0.1:$PORT' for $DOMAIN yourself, or delete the file and redeploy."
      exit 0
    fi
  else
    printf '%s\n' "$WANT" | $SUDO tee "$CADDYFILE" >/dev/null
    CHANGED=1
  fi
fi

# 3. Firewall: Caddy needs 80 (ACME challenge) + 443.
if command -v ufw >/dev/null 2>&1 && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
  $SUDO ufw allow 80/tcp >/dev/null 2>&1 || true
  $SUDO ufw allow 443/tcp >/dev/null 2>&1 || true
fi

# 4. Point MP_PUBLIC_URL at the HTTPS domain (deploy.sh sources the env file
#    AFTER this script runs, so the app picks it up in the same deploy).
PUBLIC="https://$DOMAIN"
if [ -f "$ENV_FILE" ] && [ "${MP_PUBLIC_URL:-}" != "$PUBLIC" ]; then
  if grep -q "^MP_PUBLIC_URL=" "$ENV_FILE"; then
    $SUDO sed -i "s|^MP_PUBLIC_URL=.*|MP_PUBLIC_URL=$PUBLIC|" "$ENV_FILE"
  else
    printf 'MP_PUBLIC_URL=%s\n' "$PUBLIC" | $SUDO tee -a "$ENV_FILE" >/dev/null
  fi
  echo "caddy:   MP_PUBLIC_URL -> $PUBLIC (was ${MP_PUBLIC_URL:-unset})"
fi

# 5. Enable + reload, then probe. First run needs a Let's Encrypt issuance,
#    which can take ~10-30s; don't fail the deploy over a slow cert.
$SUDO systemctl enable --now caddy >/dev/null 2>&1 || true
if [ "${CHANGED:-}" = "1" ]; then
  $SUDO systemctl reload caddy 2>/dev/null || $SUDO systemctl restart caddy 2>/dev/null || true
fi
for i in $(seq 1 15); do
  if curl -sf --max-time 3 "https://$DOMAIN/health" >/dev/null 2>&1; then
    echo "caddy:   OK -- https://$DOMAIN is live"
    exit 0
  fi
  sleep 2
done
echo "caddy:   https://$DOMAIN not answering yet (cert may still be issuing) -- check: journalctl -u caddy -n 50"
exit 0
