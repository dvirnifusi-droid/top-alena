#!/usr/bin/env bash
# Additive, idempotent: add ReservationSettings.slot_capacity to EVERY schema
# (main = Alena + each tenant_<slug>). Safe to re-run. Run from /opt/top-alena.
# Must run BEFORE rebuilding the api container (new Prisma client selects the
# column, so it has to exist first).
set -uo pipefail
cd /opt/top-alena

SQL_ADD='ALTER TABLE "ReservationSettings" ADD COLUMN IF NOT EXISTS "slot_capacity" INTEGER DEFAULT 36;'

echo "== MAIN (Alena) =="
echo "$SQL_ADD" | docker compose exec -T api npx prisma db execute --stdin --schema prisma/schema.prisma && echo "  MAIN slot_capacity OK"
# Alena keeps 12+ = private event: max public party = 11 (only if still at the default 12/NULL).
echo 'UPDATE "ReservationSettings" SET "max_party_size" = 11 WHERE "max_party_size" IS NULL OR "max_party_size" = 12;' \
  | docker compose exec -T api npx prisma db execute --stdin --schema prisma/schema.prisma && echo "  ALENA max_party_size=11 OK"

echo "== TENANTS =="
for c in $(docker ps --format '{{.Names}}' | grep '^tenant-.*-api$'); do
  url=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | tail -1 | cut -d= -f2-)
  if [ -z "$url" ]; then echo "  $c — no DATABASE_URL, skipped"; continue; fi
  echo "$SQL_ADD" | docker compose exec -T api npx prisma db execute --stdin --url "$url" && echo "  $c OK"
done
echo "== DONE =="
