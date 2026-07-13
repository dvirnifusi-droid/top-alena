#!/bin/bash
# Auto-deploy: runs every 2 min via cron. Pulls origin/migration and, if
# anything changed, rebuilds the affected containers. Safe to run when
# nothing changed (no-op fast return).
#
# Install once:
#   cp /opt/top-alena/scripts/autodeploy.sh /usr/local/bin/topalena-autodeploy.sh
#   chmod +x /usr/local/bin/topalena-autodeploy.sh
# (Cron already runs it every 2 min per the existing crontab entry.)

set -uo pipefail

REPO=/opt/top-alena
BRANCH=migration
LOG=/var/log/topalena-autodeploy.log

cd "$REPO" || exit 1

exec >>"$LOG" 2>&1
echo "==================== $(date -u '+%Y-%m-%d %H:%M:%S UTC') ===================="

# One-time bootstrap: install jq if missing. Our provisioner + watchdog
# scripts depend on it, and skipping this dependency silently is what
# caused a full afternoon of "why isn't bigizik online" — the smoke test
# refuses to run without jq, and the provisioner would still crash on
# JSON parsing. Install once and forget.
if ! command -v jq >/dev/null 2>&1; then
  echo "==> Installing jq (missing)"
  DEBIAN_FRONTEND=noninteractive apt-get install -y jq >/dev/null 2>&1 || echo "!!! jq install failed"
fi

# DRAIN THE PROVISIONING QUEUE FIRST — before any git checks or fast-exit.
# This is the critical fix: if we exit early because git has no changes,
# ProvisioningJobs sit in 'pending' forever. Running this here means every
# 'approve tenant' / 'reprovision' click gets picked up within one
# autodeploy tick (~2min) with zero manual SSH work from the operator.
# provisioner-cron.sh exits <1s when the queue is empty, so overhead is nil.
bash /opt/top-alena/scripts/provisioner-cron.sh 2>&1 | tail -4 || true

# Self-installing crontab entry — runs provisioner-cron.sh every minute
# independently of autodeploy, so newly-approved tenants come up in ≤1min
# instead of waiting on the autodeploy tick.
if ! crontab -l 2>/dev/null | grep -q 'provisioner-cron.sh'; then
  echo "==> Installing provisioner-cron.sh crontab entry (runs every 1min)"
  (crontab -l 2>/dev/null; echo '* * * * * bash /opt/top-alena/scripts/provisioner-cron.sh >> /var/log/topalena-provisioner.log 2>&1') | crontab -
fi

# Self-installing hourly supplier-order reminder cron (idempotent). Placed here
# BEFORE the no-change fast-exit so it lands even when the box is unreachable
# by SSH — a plain git push wires it on the next autodeploy tick.
if ! crontab -l 2>/dev/null | grep -q 'supplier-order-alerts'; then
  echo "==> Installing supplier-order-alerts crontab entry (hourly)"
  (crontab -l 2>/dev/null; echo '0 * * * * curl -fsS -X POST -H "x-cron-secret: $(grep ^CRON_SECRET /opt/top-alena/apps/api/.env | cut -d= -f2-)" http://localhost:3001/api/cron/supplier-order-alerts > /dev/null 2>&1') | crontab -
fi

# Skip if no lock — but do quick fetch to see if there's anything new.
git fetch origin "$BRANCH" --quiet 2>/dev/null || { echo "fetch failed, skipping"; exit 0; }

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")
if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  # No git changes. Provisioner already ran above; safe to exit.
  exit 0
fi

echo "==> Deploying $LOCAL_SHA -> $REMOTE_SHA"

# Determine which containers need to rebuild by looking at changed paths.
CHANGED=$(git diff --name-only "$LOCAL_SHA" "$REMOTE_SHA")
echo "==> Changed files:"
echo "$CHANGED" | head -20

git reset --hard "origin/$BRANCH" || { echo "reset failed"; exit 1; }
chmod +x scripts/*.sh 2>/dev/null || true

# NOW that the latest scripts are on disk, run ensure-wildcard-cert.sh.
# Idempotent — first run generates the cert + migrates every `tls internal`
# in Caddyfile/tenants to point at it. Subsequent runs are no-ops until
# the cert nears expiry.
bash /opt/top-alena/scripts/ensure-wildcard-cert.sh 2>&1 | tail -8 || true

REBUILD_API=false
REBUILD_WEB=false
RECREATE_CADDY=false
RELOAD_CADDY=false

# docker-compose.yml changes require the caddy container to be recreated
# so it picks up new volume bind mounts.
if echo "$CHANGED" | grep -qE '^docker-compose\.yml$'; then
  RECREATE_CADDY=true
fi
# Caddyfile changes only need a config reload — no container restart.
# Otherwise a route/redirect edit lands in git but Caddy keeps serving
# the old config forever until the next docker-compose.yml change.
if echo "$CHANGED" | grep -qE '^Caddyfile$'; then
  RELOAD_CADDY=true
fi

if echo "$CHANGED" | grep -qE '^apps/api/|^docker-compose\.yml|^Dockerfile$'; then
  REBUILD_API=true
fi
if echo "$CHANGED" | grep -qE '^dist/|^Dockerfile\.web|^docker-compose\.yml'; then
  REBUILD_WEB=true
fi
if echo "$CHANGED" | grep -qE '^scripts/'; then
  # Scripts changed — sync tenant caddy configs (idempotent) in case
  # provisioning logic was updated.
  bash /opt/top-alena/scripts/sync-tenant-caddy.sh 2>&1 | tail -10 || true
fi

if $REBUILD_API && $REBUILD_WEB; then
  echo "==> Rebuilding api + web"
  docker compose up -d --build api web 2>&1 | tail -6
elif $REBUILD_API; then
  echo "==> Rebuilding api only"
  docker compose up -d --build api 2>&1 | tail -4
elif $REBUILD_WEB; then
  echo "==> Rebuilding web only"
  docker compose up -d --build web 2>&1 | tail -4
else
  echo "==> No container rebuild needed (only scripts / config changed)"
fi

# Tenant containers run the same top-alena-api image but are NOT managed by
# docker compose — a compose rebuild leaves them on the old image forever.
# (This is exactly why hamara kept returning unknown_function for fns that
# were already deployed on the main container.) Recreate them on every api
# rebuild so all tenants always run the same code as the main app.
if $REBUILD_API; then
  echo "==> Redeploying tenant containers on the fresh image"
  bash /opt/top-alena/scripts/redeploy-all-tenants.sh 2>&1 | tail -8 || true
fi

if $RECREATE_CADDY; then
  echo "==> Recreating caddy (docker-compose.yml volumes changed)"
  docker compose up -d caddy 2>&1 | tail -4
elif $RELOAD_CADDY; then
  echo "==> Reloading Caddy config"
  docker exec top-alena-caddy-1 caddy reload --config /etc/caddy/Caddyfile 2>&1 | tail -4 || true
fi

echo "==> Done. Now at $(git rev-parse --short HEAD)"
