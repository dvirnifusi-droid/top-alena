#!/bin/bash
# Promote a user in a tenant schema to 'owner' role. Idempotent.
#
# Usage: bash promote-tenant-user.sh <tenant-slug> <user-email>
#   e.g. bash promote-tenant-user.sh miha dvirnifusi@gmail.com

set -e

SLUG="${1:?tenant-slug required}"
EMAIL="${2:?user-email required}"
SCHEMA="tenant_${SLUG}"

MAIN_DB_URL=$(docker exec top-alena-api-1 sh -c 'echo $DATABASE_URL')
if [ -z "$MAIN_DB_URL" ]; then
  echo "Could not read DATABASE_URL from top-alena-api-1"
  exit 1
fi

docker run --rm --network top-alena_default postgres:16-alpine \
  psql "$MAIN_DB_URL" -c "UPDATE \"$SCHEMA\".\"User\" SET role='owner' WHERE email='$EMAIL';"

echo "==> Verifying:"
docker run --rm --network top-alena_default postgres:16-alpine \
  psql "$MAIN_DB_URL" -c "SELECT email, role FROM \"$SCHEMA\".\"User\" WHERE email='$EMAIL';"
