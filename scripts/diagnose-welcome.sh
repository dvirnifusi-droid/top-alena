#!/bin/bash
# Usage: bash /opt/top-alena/scripts/diagnose-welcome.sh <tenant_slug>
# Diagnoses why a tenant owner didn't receive their welcome message.
# Checks env, DB, and recent api logs for resend/twilio/whatsapp errors.

set -uo pipefail
SLUG="${1:-bigizik}"

echo "============================================================"
echo "  DIAGNOSING WELCOME DELIVERY FOR: $SLUG"
echo "============================================================"
echo ""

echo "=== [1/5] Env vars set in top-alena-api-1 ==="
docker exec top-alena-api-1 sh -c 'echo "TWILIO_ACCOUNT_SID  = ${TWILIO_ACCOUNT_SID:+SET (${#TWILIO_ACCOUNT_SID} chars)}"; echo "TWILIO_AUTH_TOKEN   = ${TWILIO_AUTH_TOKEN:+SET}"; echo "TWILIO_PHONE_NUMBER = ${TWILIO_PHONE_NUMBER:-EMPTY}"; echo "TWILIO_WHATSAPP_FROM= ${TWILIO_WHATSAPP_FROM:-EMPTY}"; echo "RESEND_API_KEY      = ${RESEND_API_KEY:+SET (${#RESEND_API_KEY} chars)}"; echo "EMAIL_FROM          = ${EMAIL_FROM:-default (noreply@alenabepita.co.il)}"'
echo ""

echo "=== [2/5] Tenant row in DB ==="
docker exec top-alena-api-1 sh -c '
  psql "$DATABASE_URL" -t -c "
    SELECT slug,
           status,
           owner_name,
           owner_phone,
           owner_email,
           subdomain_url,
           to_char(created_at, '"'"'YYYY-MM-DD HH24:MI'"'"') AS created,
           to_char(approved_at, '"'"'YYYY-MM-DD HH24:MI'"'"') AS approved,
           to_char(live_at, '"'"'YYYY-MM-DD HH24:MI'"'"') AS live
    FROM \"Tenant\"
    WHERE slug = '"'"'"$1"'"'"';
  "
' _ "$SLUG"
echo ""

echo "=== [3/5] Last 100 API log lines mentioning resend/twilio/whatsapp/welcome ==="
docker logs top-alena-api-1 --tail 500 2>&1 > /tmp/apilog.txt
grep -iE 'resend|twilio|whatsapp|welcome|email|resendtenant' /tmp/apilog.txt | tail -50 || echo "(no matches — the fn may not have been called yet)"
echo ""

echo "=== [4/5] Test Resend API key directly ==="
docker exec top-alena-api-1 sh -c '
  if [ -z "${RESEND_API_KEY:-}" ]; then
    echo "RESEND_API_KEY not set — email will always skip"
  else
    curl -sS -o /tmp/r.json -w "HTTP %{http_code}\n" https://api.resend.com/domains \
      -H "Authorization: Bearer $RESEND_API_KEY"
    head -c 500 /tmp/r.json
    echo ""
  fi
'
echo ""

echo "=== [5/5] Test Twilio API directly ==="
docker exec top-alena-api-1 sh -c '
  if [ -z "${TWILIO_ACCOUNT_SID:-}" ]; then
    echo "TWILIO_ACCOUNT_SID not set"
  else
    curl -sS -o /tmp/t.json -w "HTTP %{http_code}\n" \
      "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}.json" \
      -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}"
    head -c 300 /tmp/t.json
    echo ""
  fi
'
echo ""
echo "============================================================"
echo "  DONE"
echo "============================================================"
