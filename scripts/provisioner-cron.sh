#!/bin/bash
# Polled by cron every 30s. Picks the next pending ProvisioningJob from
# the api, runs provision-tenant.sh, reports result back.
#
# Uses `jq` for robust JSON parsing — the previous version used Python
# one-liners that crashed silently on empty responses, which caused
# bigizik to provision successfully but never get its status updated to
# 'live' or trigger the welcome message.
#
# Falls back to a log file at /var/log/topalena-provisioner.log so ops
# can see WHY a job didn't get picked up when nothing shows up in the UI.

set -uo pipefail

API="http://localhost:3001"
LOG_TAIL="/var/log/topalena-provisioner.log"
CRON_SECRET="$(grep ^CRON_SECRET /opt/top-alena/apps/api/.env | cut -d= -f2-)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "[$(date -Iseconds)] $*"; }

# Sanity: bail if jq is missing rather than silently failing later.
if ! command -v jq >/dev/null 2>&1; then
  log "❌ jq not installed. Run: apt-get install -y jq"
  exit 1
fi
if [ -z "$CRON_SECRET" ]; then
  log "❌ CRON_SECRET is empty. Check /opt/top-alena/apps/api/.env"
  exit 1
fi

# Claim next job. Server marks it 'running' and returns details.
RESP=$(curl -fsS -X POST "${API}/api/public/fn/pickNextProvisioningJob" \
  -H "Content-Type: application/json" \
  -d "{\"cron_secret\":\"${CRON_SECRET}\"}" 2>/dev/null || echo '{"data":{"job":null}}')

# jq // null lets us treat missing keys as null instead of crashing.
JOB=$(echo "$RESP" | jq -c '.data.job // .job // null')
if [ "$JOB" = "null" ] || [ -z "$JOB" ]; then
  exit 0  # No work
fi

JOB_ID=$(echo "$JOB" | jq -r '.job_id // .id // ""')
TENANT_ID=$(echo "$JOB" | jq -r '.tenant_id // .id // ""')
SLUG=$(echo "$JOB" | jq -r '.slug // ""')
DB_NAME=$(echo "$JOB" | jq -r '.db_name // ""')
CONTAINER=$(echo "$JOB" | jq -r '.container_name // ""')

if [ -z "$SLUG" ] || [ -z "$DB_NAME" ] || [ -z "$CONTAINER" ]; then
  log "❌ Malformed job payload — slug='$SLUG' db='$DB_NAME' container='$CONTAINER'"
  # Report failure so the tenant row doesn't sit stuck forever.
  if [ -n "$JOB_ID" ] && [ -n "$TENANT_ID" ]; then
    ERR_PAYLOAD=$(jq -nc \
      --arg secret "$CRON_SECRET" \
      --arg jid "$JOB_ID" \
      --arg tid "$TENANT_ID" \
      '{cron_secret:$secret, job_id:$jid, tenant_id:$tid, status:"failed", log:"malformed job payload", error:"missing slug/db/container"}')
    curl -fsS -X POST "${API}/api/public/fn/reportProvisioningResult" \
      -H "Content-Type: application/json" -d "$ERR_PAYLOAD" >/dev/null 2>&1 || true
  fi
  exit 0
fi

log "==> Provisioning $SLUG (job=$JOB_ID)"

LOG_FILE=$(mktemp)
ERR=""
STATUS="success"

# Actually provision.
if ! bash "$SCRIPT_DIR/provision-tenant.sh" "$SLUG" "$DB_NAME" "$CONTAINER" >"$LOG_FILE" 2>&1; then
  STATUS="failed"
  ERR=$(tail -c 1500 "$LOG_FILE")
fi

LOG=$(tail -c 7000 "$LOG_FILE")
rm -f "$LOG_FILE"

# Build the report payload with jq — handles all escaping (newlines,
# quotes, unicode) that Python's positional-args approach kept mangling.
PAYLOAD=$(jq -nc \
  --arg secret "$CRON_SECRET" \
  --arg jid "$JOB_ID" \
  --arg tid "$TENANT_ID" \
  --arg status "$STATUS" \
  --arg log "$LOG" \
  --arg err "$ERR" \
  '{cron_secret:$secret, job_id:$jid, tenant_id:$tid, status:$status, log:$log, error:$err}')

# Report back — this is what flips status to 'live' AND fires the welcome
# messages. Failure to POST here = tenant stuck in pending_provisioning
# forever. Retry a few times before giving up.
REPORT_OK=0
for attempt in 1 2 3; do
  if curl -fsS -X POST "${API}/api/public/fn/reportProvisioningResult" \
       -H "Content-Type: application/json" -d "$PAYLOAD" >/dev/null 2>&1; then
    REPORT_OK=1
    break
  fi
  log "   report attempt $attempt failed, retrying in 3s"
  sleep 3
done

if [ "$REPORT_OK" != "1" ]; then
  log "❌ reportProvisioningResult FAILED after 3 attempts — tenant $SLUG likely stuck in pending_provisioning. Container may be up regardless; run resendTenantWelcome manually."
else
  log "==> Job $JOB_ID ($SLUG): $STATUS"
fi
