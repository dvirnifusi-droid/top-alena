#!/usr/bin/env bash
set -euo pipefail

# Locate the deployed repo (where docker-compose.yml lives)
APP=""
for d in /root/top-alena-migration /opt/top-alena /opt/top-alena-migration /root/app /root/top-alena; do
  if [ -f "$d/docker-compose.yml" ]; then APP="$d"; break; fi
done
if [ -z "$APP" ]; then
  APP="$(find /root /opt -maxdepth 3 -name docker-compose.yml 2>/dev/null | head -1 | xargs -r dirname)"
fi
: "${APP:?could not locate docker-compose.yml}"
cd "$APP"
echo "==> repo: $APP"

echo "==> pulling latest origin/migration"
git fetch origin migration
git reset --hard origin/migration
echo "==> now at: $(git rev-parse --short HEAD) - $(git log -1 --pretty=%s)"

echo "==> rebuilding (a few minutes)..."
docker compose up -d --build

echo "==> waiting for API..."
sleep 8
echo "==> self-test getTreats (expect a JSON treats array):"
curl -s -m 15 -X POST http://localhost:3001/api/public/fn/getTreats -H "Content-Type: application/json" -d '{}' | head -c 300
echo
echo "==> REDEPLOY_DONE"
