# Deploying media-producer-mcp

One command on the droplet:

```bash
bash scripts/deploy.sh            # deploy origin/master
bash scripts/deploy.sh mybranch   # deploy a branch
```

The script pulls the branch, `npm ci` + builds, loads `/etc/media-producer/env`,
reloads pm2, and then **verifies the new commit is the one actually serving**
`/health` (which reports `commit`). A deploy that leaves an old process running
fails loudly instead of silently.

## First-time setup

1. Node 20+, pm2 (`npm i -g pm2`), ffmpeg on PATH, and the repo cloned
   (default assumption: the repo dir is wherever you run the script from).
2. Create the env file (root-readable is fine; the app runs as whoever runs pm2):

```bash
sudo mkdir -p /etc/media-producer
sudo tee /etc/media-producer/env >/dev/null <<'EOF'
# ── Required ──
ANTHROPIC_API_KEY=sk-ant-...

# ── Auth (either or both; if NEITHER is set, the server runs with auth OFF) ──
# Static tokens: comma-separated token:tenant pairs.
AUTH_TOKENS=preview123:marc-getquotient-ai
# Enables Google-login JWTs. Changing it invalidates all previously issued JWTs.
SESSION_SECRET=change-me

# ── Instance ──
MP_PORT=3200
MP_DATA_DIR=/data/media-producer
# Enables POST /api/deploy (remote one-command deploy). Use a long random
# value; it is deliberately separate from AUTH_TOKENS -- preview tokens live
# in shareable URLs and must never be able to trigger deploys.
MP_DEPLOY_TOKEN=
# The base URL baked into preview_url links handed to clients.
# Set to https://your-domain once Caddy is in front (see below).
MP_PUBLIC_URL=http://159.203.115.164:3200

# ── Optional media providers ──
PEXELS_API_KEY=
JAMENDO_CLIENT_ID=
MP_LOGODEV_TOKEN=
OPENAI_API_KEY=

# ── Optional tuning (defaults are sane) ──
# MP_MAX_REVISIONS=1
# MP_RENDER_CONCURRENCY=
# MP_SCENE_CONCURRENCY=
# MP_LLM_MODEL= / MP_CRITIQUE_MODEL= / MP_TASTE_MODEL= / MP_CAPTION_MODEL=
# MP_CHROMIUM_PATH=   (only for sandboxes without the bundled browser)
EOF
```

3. First deploy: `bash scripts/deploy.sh`. Subsequent deploys are the same command.

`pm2 startup` (once) makes the app survive droplet reboots; the script already
runs `pm2 save` after each deploy.

## HTTPS with Caddy (automatic)

Every deploy runs `scripts/setup-caddy.sh` (idempotent, best-effort): it
installs Caddy, writes `/etc/caddy/Caddyfile` (`reverse_proxy 127.0.0.1:$MP_PORT`),
opens 80/443 in ufw, points `MP_PUBLIC_URL` in the env file at the HTTPS
domain, and reloads. Controls in `/etc/media-producer/env`:

- `MP_CADDY_DOMAIN=media.yourdomain.com` — the domain to serve (point its DNS
  A record at the droplet first). **If unset**, the script falls back to
  `<ip-with-dashes>.sslip.io` (e.g. `159-203-115-164.sslip.io`), which
  resolves to the droplet with zero DNS setup — so HTTPS works before you own
  a domain. Set a real domain later and redeploy; one variable, done.
- `MP_CADDY_DISABLE=1` — opt out entirely.
- A hand-written `/etc/caddy/Caddyfile` (no "managed by media-producer-mcp"
  header) is never touched — the script defers to it and tells you so.

Once live, every `preview_url` the server hands out uses the HTTPS domain
automatically. (Caddy passes the `Authorization` header through by default;
the Studio front-end also carries the token as a query param, so either path
works.) HTTPS also unlocks `getUserMedia` for the Recorder extension without
the insecure-origins Chrome flag.

Note: bare-IP links (`http://IP:3200/...`) never pass through Caddy — Caddy
only answers for the domain on ports 80/443.

## Remote deploy (no SSH)

With `MP_DEPLOY_TOKEN` set in the env file, the server exposes a self-deploy
endpoint — the running process spawns `scripts/deploy.sh` **detached**, so it
survives the pm2 reload that replaces its parent:

```bash
curl -X POST "https://your-host/api/deploy" \
  -H "Authorization: Bearer <tenant-token>" \
  -H "X-Deploy-Token: <MP_DEPLOY_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"branch":"master"}'

curl "https://your-host/api/deploy/log?deploy_token=<MP_DEPLOY_TOKEN>&token=<tenant-token>"   # tail the output
curl https://your-host/health                                            # commit field = deployed sha
```

Safety: it refuses with `409` while any generate/render job is running or
queued (the reload would kill them) — pass `{"force": true}` to override.
The deploy token is separate from `AUTH_TOKENS` on purpose: preview tokens
live in shareable URLs and must never be able to trigger deploys.

## Debugging a deploy

- `curl -s localhost:3200/health` → `{ status, version, commit }`. If `commit`
  doesn't match `git rev-parse --short HEAD` in the repo, an old process is
  still serving.
- `pm2 logs media-producer --lines 100`
- Auth 401s: the deploy script prints whether `AUTH_TOKENS` / `SESSION_SECRET`
  are set. Remember a changed `SESSION_SECRET` (or a restart with a different
  env) invalidates all previously issued JWTs — old `preview_url` links die.

## Rollback

```bash
bash scripts/deploy.sh <branch>       # any branch
# or pin an exact commit:
git -C <repo> reset --hard <sha> && npm ci && npm run build && pm2 reload media-producer --update-env
```
