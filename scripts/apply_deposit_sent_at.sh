#!/usr/bin/env bash
# Additive, idempotent: add Reservation.deposit_sent_at to EVERY schema (main + tenants).
# Must run BEFORE rebuilding api (the new Prisma client selects the column).
set -uo pipefail
cd /opt/top-alena

SQL='ALTER TABLE "Reservation" ADD COLUMN IF NOT EXISTS "deposit_sent_at" TIMESTAMP(3);'

echo "== MAIN =="
echo "$SQL" | docker compose exec -T api npx prisma db execute --stdin --schema prisma/schema.prisma && echo "  MAIN OK"

echo "== TENANTS =="
for c in $(docker ps --format '{{.Names}}' | grep '^tenant-.*-api$'); do
  url=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | tail -1 | cut -d= -f2-)
  if [ -z "$url" ]; then echo "  $c — no DATABASE_URL, skipped"; continue; fi
  echo "$SQL" | docker compose exec -T api npx prisma db execute --stdin --url "$url" && echo "  $c OK"
done
echo "== DONE =="
