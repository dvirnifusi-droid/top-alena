#!/bin/bash
# Runs every 5 min from cron. Alerts via Pushover if any tenant is stuck:
#   - pending_provisioning > 10 min (cron never ran, provision failed silently)
#   - pending_approval > 24h (Dvir forgot to approve)
#   - status = 'live' but last_welcome_at is null (welcome never sent)
#
# One alert per (tenant, kind) — we key on a state marker so it doesn't
# spam every 5 min for the same problem.

set -uo pipefail
API="http://localhost:3001"
CRON_SECRET="$(grep ^CRON_SECRET /opt/top-alena/apps/api/.env | cut -d= -f2-)"
MARKER_DIR=/var/lib/topalena/alerts
mkdir -p "$MARKER_DIR"

if [ -z "$CRON_SECRET" ]; then
  echo "❌ CRON_SECRET empty, aborting"
  exit 1
fi

RESP=$(curl -fsS -X POST "${API}/api/public/fn/checkStuckTenants" \
  -H "Content-Type: application/json" \
  -d "{\"cron_secret\":\"${CRON_SECRET}\"}" 2>/dev/null || echo '{"stuck":[]}')

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ jq missing"; exit 1
fi

# Iterate stuck items — each is {tenant_id, slug, kind, msg}
echo "$RESP" | jq -c '.stuck[]? // empty' | while read -r item; do
  TID=$(echo "$item" | jq -r '.tenant_id')
  SLUG=$(echo "$item" | jq -r '.slug')
  KIND=$(echo "$item" | jq -r '.kind')
  MSG=$(echo "$item" | jq -r '.msg')
  MARKER="$MARKER_DIR/${TID}_${KIND}"
  if [ -f "$MARKER" ]; then continue; fi   # already alerted
  echo "==> alerting on stuck tenant $SLUG ($KIND): $MSG"
  curl -fsS -X POST "${API}/api/public/fn/pushoverAlert" \
    -H "Content-Type: application/json" \
    -d "$(jq -nc --arg secret "$CRON_SECRET" --arg t "TopAlena stuck tenant" --arg m "$MSG" '{cron_secret:$secret, title:$t, message:$m, priority:1}')" \
    >/dev/null 2>&1 || true
  touch "$MARKER"
done

# Clear stale markers older than 3 days so a re-recurrence is alerted again.
find "$MARKER_DIR" -type f -mtime +3 -delete 2>/dev/null || true
