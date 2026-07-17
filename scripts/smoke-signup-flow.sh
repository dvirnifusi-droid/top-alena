#!/bin/bash
# End-to-end smoke test: signup → approve → provision → welcome delivery.
# Creates a throwaway tenant `smoketest-YYMMDD-HHMM`, drives it through
# the full flow, prints ✅/❌ at each step, cleans up on exit.
#
# Run this BEFORE opening signup to the public. If any step fails, fix
# it before customers can sign up.
#
# Usage: bash /opt/top-alena/scripts/smoke-signup-flow.sh [--keep]
#   --keep : don't cleanup at the end (for post-mortem investigation)

set -uo pipefail
API="http://localhost:3001"
CRON_SECRET="$(grep ^CRON_SECRET /opt/top-alena/apps/api/.env | cut -d= -f2-)"
SUPER_PHONE="${SUPER_ADMIN_PHONE:-0522280014}"   # Dvir's phone by default — override in env
SUPER_EMAIL="dvirnifusi@gmail.com"
STAMP=$(date +%y%m%d-%H%M)
SLUG="smoketest-$STAMP"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

if ! command -v jq >/dev/null; then echo "❌ jq missing"; exit 1; fi

# psql isn't installed in the api node container — use an ephemeral
# postgres:16-alpine container on the same docker network (same pattern
# provision-tenant.sh already uses). Reads DATABASE_URL from the api env.
DB_URL=$(docker exec top-alena-api-1 sh -c 'echo $DATABASE_URL')
if [ -z "$DB_URL" ]; then echo "❌ Could not read DATABASE_URL from top-alena-api-1"; exit 1; fi
DB_URL="${DB_URL%%\?*}"  # strip Prisma-only params (connection_limit) — psql rejects them
psql_run() {
  docker run --rm --network top-alena_default -e PGPASSWORD_DUMMY=1 \
    postgres:16-alpine psql "$DB_URL" -v ON_ERROR_STOP=1 -t -A "$@"
}

pass() { echo "  ✅ $*"; }
fail() { echo "  ❌ $*"; SMOKE_FAILED=1; }
step() { echo ""; echo "━━━ $* ━━━"; }
SMOKE_FAILED=0

cleanup() {
  if [ "$KEEP" = "1" ]; then
    echo ""
    echo "===> --keep flag set, leaving $SLUG behind for investigation"
    return
  fi
  echo ""
  echo "━━━ Cleanup ━━━"
  docker rm -f "tenant-${SLUG}-api" 2>/dev/null && pass "Container removed" || pass "No container to remove"
  # Delete tenant row + provisioning jobs via ephemeral psql container
  psql_run -c "DELETE FROM \"ProvisioningJob\" WHERE tenant_id IN (SELECT id FROM \"Tenant\" WHERE slug='${SLUG}');
               DELETE FROM \"OnboardingState\" WHERE tenant_id IN (SELECT id FROM \"Tenant\" WHERE slug='${SLUG}');
               DELETE FROM \"Tenant\" WHERE slug='${SLUG}';
               DROP SCHEMA IF EXISTS tenant_${SLUG} CASCADE;" >/dev/null 2>&1 \
    && pass "DB cleaned" || fail "DB cleanup issue"
  rm -f "/etc/caddy/tenants/${SLUG}.caddy"
  sed -i "/^${SLUG}\.topalena\.com {/,/^}/d" /opt/top-alena/Caddyfile 2>/dev/null || true
  pass "Caddy block removed"
}
trap cleanup EXIT

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  TopAlena signup-flow smoke test                         ║"
echo "║  Slug: $SLUG"
echo "╚══════════════════════════════════════════════════════════╝"

step "1/6 requestTenantSignup"
SIGNUP=$(curl -sS -X POST "${API}/api/public/fn/requestTenantSignup" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg slug "$SLUG" --arg phone "$SUPER_PHONE" --arg email "$SUPER_EMAIL" \
        '{restaurant_name:"Smoke Test Restaurant", owner_name:"Smoke Bot", owner_phone:$phone, owner_email:$email, slug:$slug}')")
echo "$SIGNUP" | jq -c '.' | head -c 300; echo
TID=$(echo "$SIGNUP" | jq -r '.data.tenant_id // .tenant_id // ""')
if [ -z "$TID" ]; then fail "signup returned no tenant_id"; exit 1; fi
pass "tenant_id = $TID"

step "2/6 approveTenant (direct DB — no super-admin JWT available in shell)"
psql_run -c "UPDATE \"Tenant\" SET status='pending_provisioning', approved_at=NOW() WHERE id='${TID}';
             INSERT INTO \"ProvisioningJob\"(id,tenant_id,status) VALUES ('smoke-job-${STAMP}', '${TID}', 'pending');" \
  >/dev/null 2>&1 && pass "Tenant approved + job queued" || { fail "approve failed"; exit 1; }

step "3/6 provisioner-cron runs"
bash /opt/top-alena/scripts/provisioner-cron.sh
sleep 2
docker ps --format '{{.Names}}' | grep -q "tenant-${SLUG}-api" && pass "Container running" || fail "Container not running"

step "4/6 subdomain HTTP check (internal)"
CODE=$(curl -sk --resolve "${SLUG}.topalena.com:443:127.0.0.1" -o /dev/null -w "%{http_code}" --max-time 10 "https://${SLUG}.topalena.com/" 2>/dev/null || echo 000)
[ "$CODE" = "200" ] && pass "HTTPS 200 from Caddy" || fail "HTTPS returned $CODE"

step "5/6 tenant marked live in DB"
STATUS=$(psql_run -c "SELECT status FROM \"Tenant\" WHERE id='${TID}';" 2>/dev/null | tr -d '[:space:]')
[ "$STATUS" = "live" ] && pass "status = live" || fail "status = '$STATUS' (expected live)"

step "6/6 welcome delivery recorded"
DELIVERY=$(psql_run -c "SELECT COALESCE(last_welcome_sms_status,'-') || '/' || COALESCE(last_welcome_email_status,'-') || '/' || COALESCE(last_welcome_wa_status,'-') FROM \"Tenant\" WHERE id='${TID}';" 2>/dev/null | tr -d '[:space:]')
echo "  Delivery (sms/email/wa) = $DELIVERY"
if echo "$DELIVERY" | grep -q sent; then pass "at least one channel delivered"; else fail "no channel delivered"; fi

echo ""
if [ "$SMOKE_FAILED" = "0" ]; then
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  ✅✅✅ ALL SMOKE TESTS PASSED — safe to open signup ✅✅✅  ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 0
else
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  ❌ SMOKE TEST FAILED — DO NOT OPEN SIGNUP ❌            ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  exit 1
fi
