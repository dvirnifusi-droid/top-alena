#!/bin/bash
# Polled by cron every 30s. Picks the next pending ProvisioningJob from
# the api, runs provision-tenant.sh, reports result back.
#
# Failures are non-fatal — they just get logged and reported. The api row
# is marked 'failed' with the error in `error`.

set -uo pipefail

API="http://localhost:3001"
CRON_SECRET="$(grep ^CRON_SECRET /opt/top-alena/apps/api/.env | cut -d= -f2-)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Claim next job. Server marks it 'running' and returns details.
RESP=$(curl -fsS -X POST "${API}/api/fn/pickNextProvisioningJob" \
  -H "Content-Type: application/json" \
  -d "{\"cron_secret\":\"${CRON_SECRET}\"}" 2>/dev/null || echo '{"data":{"job":null}}')

JOB=$(echo "$RESP" | python3 -c "import json,sys;d=json.load(sys.stdin);j=d.get('data',{}).get('job') or d.get('job');print(json.dumps(j) if j else '')")
[ -z "$JOB" ] && exit 0  # No work

JOB_ID=$(echo "$JOB" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
TENANT_ID=$(echo "$JOB" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'] if 'id' in json.load(sys.stdin) else '')")
SLUG=$(echo "$JOB" | python3 -c "import json,sys;print(json.load(sys.stdin).get('slug',''))")
DB_NAME=$(echo "$JOB" | python3 -c "import json,sys;print(json.load(sys.stdin).get('db_name',''))")
CONTAINER=$(echo "$JOB" | python3 -c "import json,sys;print(json.load(sys.stdin).get('container_name',''))")
TENANT_ID=$(echo "$JOB" | python3 -c "import json,sys;j=json.load(sys.stdin);print(j.get('tenant_id') or j.get('id',''))")

if [ -z "$SLUG" ] || [ -z "$DB_NAME" ] || [ -z "$CONTAINER" ]; then
  echo "❌ Malformed job payload, skipping"
  exit 0
fi

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

# Report back. JSON-escape using python.
PAYLOAD=$(python3 -c "
import json,sys
print(json.dumps({
  'cron_secret': sys.argv[1],
  'job_id': sys.argv[2],
  'tenant_id': sys.argv[3],
  'status': sys.argv[4],
  'log': sys.argv[5],
  'error': sys.argv[6],
}))
" "$CRON_SECRET" "$JOB_ID" "$TENANT_ID" "$STATUS" "$LOG" "$ERR")

curl -fsS -X POST "${API}/api/fn/reportProvisioningResult" \
  -H "Content-Type: application/json" -d "$PAYLOAD" >/dev/null 2>&1 || true

echo "==> Job $JOB_ID ($SLUG): $STATUS"
