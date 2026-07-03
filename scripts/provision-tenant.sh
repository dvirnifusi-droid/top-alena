#!/bin/bash
# Provisions a new tenant using SCHEMA-per-tenant isolation in the shared
# Supabase Postgres instance. Each restaurant gets its own schema named
# tenant_<slug>; the api container for that tenant points at the same DB
# but with ?schema=tenant_<slug> in its DATABASE_URL. The schema is
# seeded from a structure-only dump of Alena's public schema, so every
# tenant starts with identical empty tables.
#
# Idempotent — safe to re-run.
#
# Usage: provision-tenant.sh <slug> <unused-db-name> <container_name>
#   (db_name arg kept for backward compat with the api-side payload)

set -euo pipefail

SLUG="${1:?slug required}"
_UNUSED="${2:-}"
CONTAINER="${3:?container_name required}"
SUBDOMAIN="${SLUG}.topalena.com"
SCHEMA="tenant_${SLUG}"
DUMP_FILE="/tmp/alena_schema_dump.sql"

if ! [[ "$SLUG" =~ ^[a-z][a-z0-9-]{2,}$ ]]; then
  echo "❌ Invalid slug: $SLUG"; exit 1
fi

echo "==> Provisioning $SUBDOMAIN (schema=$SCHEMA, container=$CONTAINER)"

# Read main DATABASE_URL from the api container (it has the Supabase URL).
# We'll reuse the same credentials for psql + the tenant's connection.
MAIN_DB_URL=$(docker exec top-alena-api-1 sh -c 'echo $DATABASE_URL')
if [ -z "$MAIN_DB_URL" ]; then
  echo "❌ Couldn't read DATABASE_URL from top-alena-api-1"; exit 1
fi

# === 1. CREATE SCHEMA tenant_<slug> ===========================================
echo "==> [1/4] Creating schema $SCHEMA in Supabase"
docker run --rm --network top-alena_default postgres:16-alpine \
  psql "$MAIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS \"$SCHEMA\";" >/dev/null

# === 2. Dump public schema (structure-only) once + reload into tenant schema ===
echo "==> [2/4] Copying table structure from public → $SCHEMA"
docker run --rm --network top-alena_default postgres:16-alpine \
  pg_dump --schema=public --schema-only --no-owner --no-privileges "$MAIN_DB_URL" \
  | sed "s/CREATE TABLE public\./CREATE TABLE \"$SCHEMA\"./g; s/REFERENCES public\./REFERENCES \"$SCHEMA\"./g; s/CREATE INDEX \"/CREATE INDEX IF NOT EXISTS \"/g; s/CREATE UNIQUE INDEX \"/CREATE UNIQUE INDEX IF NOT EXISTS \"/g" \
  | docker run --rm -i --network top-alena_default postgres:16-alpine \
    psql "$MAIN_DB_URL" -v ON_ERROR_STOP=0 -X >/dev/null 2>&1 || true

# === 3. Spin up the tenant api container ======================================
echo "==> [3/4] Spawning api container $CONTAINER"
TENANT_DB_URL="${MAIN_DB_URL}?schema=${SCHEMA}"
docker rm -f "$CONTAINER" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network top-alena_default \
  --env-file /opt/top-alena/apps/api/.env \
  -e DATABASE_URL="$TENANT_DB_URL" \
  -e TENANT_SLUG="$SLUG" \
  -e TENANT_SCHEMA="$SCHEMA" \
  top-alena-api:latest

sleep 5

# === 4. Caddy site config + reload ============================================
echo "==> [4/4] Writing Caddy config + reload"
CADDY_DIR="/etc/caddy/tenants"
mkdir -p "$CADDY_DIR"
cat > "$CADDY_DIR/${SLUG}.caddy" <<EOF
${SUBDOMAIN} {
  tls /etc/caddy/certs/wildcard.crt /etc/caddy/certs/wildcard.key
  @api path /api/*
  handle @api {
    reverse_proxy ${CONTAINER}:3001
  }
  handle {
    reverse_proxy top-alena-web-1:80
  }
  encode gzip
}
EOF

bash "$(dirname "$0")/sync-tenant-caddy.sh"

echo "✅ Done. $SUBDOMAIN is live."
