#!/bin/bash
# On-demand historical backfill. Pulls invoices from the last N days (default 60)
# across all connected mailboxes, then drains until nothing new is found.
# Usage on VPS: cd /opt/top-alena && git pull && bash scripts/email-backfill.sh [days]
DAYS="${1:-60}"
cd /opt/top-alena
SECRET=$(grep ^CRON_SECRET apps/api/.env | cut -d= -f2-)
count_logs() { docker compose exec -T api node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.emailMessageLog.count().then(c=>{console.log(c);return p.\$disconnect();});"; }

echo "backfilling last $DAYS days across all mailboxes..."
prev=-1
for i in $(seq 1 80); do
  before=$(count_logs)
  res=$(curl -s -m 590 -X POST -H "x-cron-secret: $SECRET" "http://localhost:3001/api/cron/email-invoice-backfill?days=$DAYS")
  rc=$?
  after=$(count_logs)
  if [ $rc -ne 0 ]; then
    echo "pass $i: scan still running server-side (curl rc=$rc), waiting 60s... (log rows: $after)"
    sleep 60
  else
    echo "pass $i: $res (new log rows: $((after-before)))"
  fi
  if [ "$after" = "$prev" ] && [ "$after" = "$before" ] && [ $rc -eq 0 ]; then echo "BACKFILL FULLY DRAINED"; break; fi
  prev=$after
done
echo "DONE."
