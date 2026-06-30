#!/bin/bash
# Provisions a new tenant restaurant:
#   1. Creates a PostgreSQL database scoped to that tenant
#   2. Spins up a docker container running the same api image, pointed at the new DB
#   3. Drops a Caddy site config so <slug>.topalena.com routes to that container
#   4. Reloads Caddy (zero-downtime)
#
# Idempotent — safe to re-run.
#
# Usage: provision-tenant.sh <slug> <db_name> <container_name>
#   e.g.  provision-tenant.sh rest1 topalena_rest1 tenant-rest1-api

set -euo pipefail

SLUG="${1:?slug required}"
DB_NAME="${2:?db_name required}"
CONTAINER="${3:?container_name required}"
SUBDOMAIN="${SLUG}.topalena.com"

# Validate slug to be safe (the api-side already validates, defense in depth).
if ! [[ "$SLUG" =~ ^[a-z][a-z0-9-]{2,}$ ]]; then
  echo "❌ Invalid slug: $SLUG"; exit 1
fi

echo "==> Provisioning $SUBDOMAIN (db=$DB_NAME, container=$CONTAINER)"

# 1. Create database — uses the main DB's postgres role.
echo "==> [1/4] Creating database $DB_NAME"
docker exec top-alena-postgres-1 psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || docker exec top-alena-postgres-1 psql -U postgres -c "CREATE DATABASE \"$DB_NAME\""

# 2. Spin up tenant api container reusing the same image. We give it its
# own DATABASE_URL but EVERYTHING ELSE (Twilio, Gemini, etc) is inherited
# from the main api's env via --env-file. Tenant can later override its
# own integrations via the in-app Settings page (TBD).
echo "==> [2/4] Spawning api container $CONTAINER"
docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network top-alena_default \
  --env-file /opt/top-alena/apps/api/.env \
  -e DATABASE_URL="postgresql://postgres:$(grep ^POSTGRES_PASSWORD /opt/top-alena/.env | cut -d= -f2- | tr -d '\"')@top-alena-postgres-1:5432/$DB_NAME?schema=public" \
  -e TENANT_SLUG="$SLUG" \
  top-alena-api:latest

# Give it ~10s to come up and run prisma migrations on the fresh DB.
sleep 10

# 3. Caddy site config. Each tenant gets its own block. Reuses the shared
# web image (served from main top-alena-web-1) for the frontend assets,
# and proxies /api/* to its dedicated api container.
echo "==> [3/4] Writing Caddy config"
CADDY_DIR="/etc/caddy/tenants"
mkdir -p "$CADDY_DIR"
cat > "$CADDY_DIR/${SLUG}.caddy" <<EOF
${SUBDOMAIN} {
  handle /api/* {
    reverse_proxy ${CONTAINER}:3001
  }
  handle {
    reverse_proxy top-alena-web-1:80
  }
}
EOF

# 4. Reload Caddy (config is mounted, just send SIGHUP). The main Caddyfile
# must contain `import /etc/caddy/tenants/*.caddy` — verified once at setup.
echo "==> [4/4] Reloading Caddy"
docker exec top-alena-caddy-1 caddy reload --config /etc/caddy/Caddyfile

echo "✅ Done. $SUBDOMAIN is live."
