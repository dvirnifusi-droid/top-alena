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

# Skip if no lock — but do quick fetch to see if there's anything new.
git fetch origin "$BRANCH" --quiet 2>/dev/null || { echo "fetch failed, skipping"; exit 0; }

LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse "origin/$BRANCH")
if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  # No changes. Quick exit.
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

# docker-compose.yml changes require the caddy container to be recreated
# so it picks up new volume bind mounts.
if echo "$CHANGED" | grep -qE '^docker-compose\.yml$'; then
  RECREATE_CADDY=true
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

if $RECREATE_CADDY; then
  echo "==> Recreating caddy (docker-compose.yml volumes changed)"
  docker compose up -d caddy 2>&1 | tail -4
fi

echo "==> Done. Now at $(git rev-parse --short HEAD)"
