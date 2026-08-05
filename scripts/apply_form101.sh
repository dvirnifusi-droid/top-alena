#!/usr/bin/env bash
# Digital טופס 101 — additive, idempotent schema for EVERY schema (main + tenants).
# Spec: docs/SPEC_FORM101.md
#
# Must run BEFORE rebuilding api. EmployeeForm is a raw-SQL table (no Prisma
# model), so this isn't the usual P2022 client-mismatch — it's simpler and just
# as fatal: the new code's raw queries name these columns, and every one of them
# errors until the columns exist.
# Never `prisma db push` here: the prod schema has drift and push would try to
# "fix" it destructively.
#
# ⚠️ THE INDEX SWAP IS THE DANGEROUS PART. EmployeeForm carries a unique index on
# (employee_id, form_type) which allows exactly ONE row per employee per form
# type — i.e. it blocks the yearly 101 renewal outright. The order below is not
# cosmetic:
#   1. add tax_year
#   2. BACKFILL it — Postgres treats NULLs as distinct, so a unique index over a
#      nullable column that's still NULL enforces nothing
#   3. create the new 3-column unique index
#   4. only THEN drop the old 2-column one
# Doing 4 before 3 leaves a window with no uniqueness at all; doing 3 before 2
# builds an index that lets duplicates through forever.
#
# tax_year = 0 means "not a yearly form" — work agreements, safety training, and
# every 101 that was filled manually before this feature existed. Those legacy
# rows stay untouched and keep showing in the employee card.
set -uo pipefail
cd /opt/top-alena

read -r -d '' SQL <<'EOSQL'
-- 1. new columns ------------------------------------------------------------
ALTER TABLE "EmployeeForm" ADD COLUMN IF NOT EXISTS "tax_year"          INTEGER;
ALTER TABLE "EmployeeForm" ADD COLUMN IF NOT EXISTS "status"            TEXT;
ALTER TABLE "EmployeeForm" ADD COLUMN IF NOT EXISTS "sent_at"           TIMESTAMP(3);
ALTER TABLE "EmployeeForm" ADD COLUMN IF NOT EXISTS "locked_at"         TIMESTAMP(3);
ALTER TABLE "EmployeeForm" ADD COLUMN IF NOT EXISTS "signed_ip"         TEXT;
ALTER TABLE "EmployeeForm" ADD COLUMN IF NOT EXISTS "signed_user_agent" TEXT;
ALTER TABLE "EmployeeForm" ADD COLUMN IF NOT EXISTS "public_token"      TEXT;
ALTER TABLE "EmployeeForm" ADD COLUMN IF NOT EXISTS "token_expires_at"  TIMESTAMP(3);
-- identified = the employee was logged in when they signed (Tax Authority rules
-- require unique identification). false = filled through the token link.
ALTER TABLE "EmployeeForm" ADD COLUMN IF NOT EXISTS "identified"        BOOLEAN;

-- 2. backfill BEFORE any unique index touches the column ---------------------
UPDATE "EmployeeForm" SET "tax_year" = 0 WHERE "tax_year" IS NULL;
ALTER TABLE "EmployeeForm" ALTER COLUMN "tax_year" SET DEFAULT 0;

-- 3. new uniqueness, while the old index is still in place -------------------
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeForm_emp_type_year"
  ON "EmployeeForm" ("employee_id","form_type","tax_year");

-- 4. and only now retire the one that blocks yearly renewal ------------------
DROP INDEX IF EXISTS "EmployeeForm_emp_type";

CREATE UNIQUE INDEX IF NOT EXISTS "EmployeeForm_public_token"
  ON "EmployeeForm" ("public_token") WHERE "public_token" IS NOT NULL;

-- 5. signable text templates (employment agreement) -------------------------
-- body = the agreement text with {{placeholders}}; fields = who fills each one.
ALTER TABLE "EmployeeFormTemplate" ADD COLUMN IF NOT EXISTS "body"   TEXT;
ALTER TABLE "EmployeeFormTemplate" ADD COLUMN IF NOT EXISTS "fields" JSONB;
-- Part א of form 101 (מספר תיק ניכויים, name, address, phone). Kept HERE and not
-- on RestaurantProfile on purpose: RestaurantProfile is a Prisma model, so a new
-- column there means the generated client selects it and every query on the
-- table dies with P2022 until this script has run everywhere. This table is
-- raw-SQL only, so it carries no such risk.
ALTER TABLE "EmployeeFormTemplate" ADD COLUMN IF NOT EXISTS "employer" JSONB;

-- 6. version archive — the rules require every previous version kept ---------
CREATE TABLE IF NOT EXISTS "EmployeeFormVersion" (
  "id"          TEXT PRIMARY KEY,
  "form_id"     TEXT NOT NULL,
  "employee_id" TEXT NOT NULL,
  "form_type"   TEXT,
  "tax_year"    INTEGER,
  "form_data"   JSONB,
  "reason"      TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "EmployeeFormVersion_form" ON "EmployeeFormVersion" ("form_id");
CREATE INDEX IF NOT EXISTS "EmployeeFormVersion_emp"  ON "EmployeeFormVersion" ("employee_id");
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
