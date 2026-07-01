#!/usr/bin/env bash
set -euo pipefail

# 1) Locate the deployed repo (where docker-compose.yml lives)
APP=""
for d in /root/top-alena-migration /opt/top-alena /opt/top-alena-migration /root/app /root/top-alena; do
  if [ -f "$d/docker-compose.yml" ]; then APP="$d"; break; fi
done
if [ -z "$APP" ]; then
  APP="$(find /root /opt -maxdepth 3 -name docker-compose.yml 2>/dev/null | head -1 | xargs -r dirname)"
fi
: "${APP:?could not locate docker-compose.yml}"
echo "==> repo: $APP"

# 2) Install the auto-deploy worker: rebuilds ONLY when origin/migration advances
WORKER=/usr/local/bin/topalena-autodeploy.sh
cat > "$WORKER" <<EOF
#!/usr/bin/env bash
set -e
cd "$APP"
git fetch origin migration --quiet
LOCAL=\$(git rev-parse HEAD)
REMOTE=\$(git rev-parse origin/migration)
if [ "\$LOCAL" != "\$REMOTE" ]; then
  echo "\$(date -u +%FT%TZ) deploying \$LOCAL -> \$REMOTE" >> /var/log/topalena-deploy.log
  git reset --hard origin/migration
  docker compose up -d --build >> /var/log/topalena-deploy.log 2>&1
  # After the main image rebuilds, every tenant container still points at
  # the OLD image ID by internal identity. Recreate them so they pick up
  # the freshly-built top-alena-api:latest.
  if [ -x "$APP/scripts/redeploy-all-tenants.sh" ]; then
    bash "$APP/scripts/redeploy-all-tenants.sh" >> /var/log/topalena-deploy.log 2>&1 || echo "\$(date -u +%FT%TZ) tenant redeploy failed" >> /var/log/topalena-deploy.log
  fi
  echo "\$(date -u +%FT%TZ) done" >> /var/log/topalena-deploy.log
fi
EOF
chmod +x "$WORKER"
echo "==> installed worker: $WORKER"

# 3) Install the cron entry (every 2 minutes), de-duplicated.
# Build the new crontab in a variable first — piping `crontab -l` directly is
# fragile when no crontab exists yet (grep returns non-zero and aborts set -e).
CRON_LINE="*/2 * * * * $WORKER"
EXISTING="$(crontab -l 2>/dev/null | grep -v 'topalena-autodeploy.sh' || true)"
printf '%s\n%s\n' "$EXISTING" "$CRON_LINE" | sed '/^$/d' | crontab -
echo "==> cron installed:"; crontab -l | grep topalena-autodeploy.sh || true

# 3b) Ensure a CRON_SECRET in the API env, and install the hourly restroom
# reminder cron (round hour) that hits the secret-guarded endpoint.
ENVFILE="$APP/apps/api/.env"
touch "$ENVFILE"
if ! grep -q '^CRON_SECRET=' "$ENVFILE"; then
  SECRET="$(openssl rand -hex 24)"
  printf 'CRON_SECRET=%s\n' "$SECRET" >> "$ENVFILE"
  echo "==> generated CRON_SECRET"
else
  SECRET="$(grep '^CRON_SECRET=' "$ENVFILE" | head -1 | cut -d= -f2-)"
  echo "==> reusing existing CRON_SECRET"
fi
RESTROOM_LINE="0 * * * * curl -fsS -m 30 -X POST http://localhost:3001/api/cron/restroom-reminder -H 'x-cron-secret: ${SECRET}' >/dev/null 2>&1"
EXISTING2="$(crontab -l 2>/dev/null | grep -v 'restroom-reminder' || true)"
printf '%s\n%s\n' "$EXISTING2" "$RESTROOM_LINE" | sed '/^$/d' | crontab -
echo "==> restroom reminder cron installed:"; crontab -l | grep restroom-reminder || true

# 4) Run one deploy right now (this pulls the latest fixes and rebuilds)
echo "==> running first deploy now (a few minutes)..."
cd "$APP"
git fetch origin migration
git reset --hard origin/migration
echo "==> now at: $(git rev-parse --short HEAD) - $(git log -1 --pretty=%s)"
docker compose up -d --build

echo "==> waiting for API..."
sleep 8
echo "==> self-test getTreats:"
curl -s -m 15 -X POST http://localhost:3001/api/public/fn/getTreats -H "Content-Type: application/json" -d '{}' | head -c 200
echo
echo "==> AUTODEPLOY_READY"
