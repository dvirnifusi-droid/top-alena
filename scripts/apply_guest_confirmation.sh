#!/usr/bin/env bash
# Additive, idempotent: same-day guest reconfirmation columns on Reservation,
# for EVERY schema (main + tenants).
#
# Must run BEFORE rebuilding api — the new Prisma client selects these columns,
# and a client that selects a column the DB doesn't have fails every query on the
# table (P2022). Never `prisma db push` here: the prod schema has drift and push
# would try to "fix" it destructively.
set -uo pipefail
cd /opt/top-alena

read -r -d '' SQL <<'EOSQL'
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "confirm_request_sent_at" TIMESTAMP(3);
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "confirm_request_sid" TEXT;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "confirm_request_delivered" BOOLEAN;
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "guest_confirmed_at" TIMESTAMP(3);
ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "guest_declined_at" TIMESTAMP(3);
EOSQL

echo "== MAIN =="
echo "$SQL" | docker compose exec -T api npx prisma db execute --stdin --schema prisma/schema.prisma && echo "  MAIN OK"

echo "== TENANTS =="
for c in $(docker ps --format '{{.Names}}' | grep '^tenant-.*-api$'); do
  url=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | tail -1 | cut -d= -f2-)
  if [ -z "$url" ]; then echo "  $c — no DATABASE_URL, skipped"; continue; fi
  echo "$SQL" | docker compose exec -T api npx prisma db execute --stdin --url "$url" && echo "  $c OK"
done
echo "== DONE =="
