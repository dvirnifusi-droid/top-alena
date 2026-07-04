#!/bin/bash
# Fix #4: process EVERY attachment in an email, and every attachment can yield
# SEVERAL invoices (bundle/מרכזת). Clears 'imported' log rows so already-seen
# messages get re-examined for the attachments/invoices that were skipped —
# existing invoices are protected by the unique email key + supplier+number
# duplicate guards. Then drains with resilient retries (no set -e on the loop).
cd /opt/top-alena

echo "[1/3] rebuilding api container..."
docker compose up -d --build api || exit 1

echo "[2/3] clearing imported log rows + resetting scan cursors..."
docker compose exec -T api node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const d=await p.emailMessageLog.deleteMany({where:{outcome:{in:['imported','error']}}});const u=await p.emailAccount.updateMany({data:{last_checked_at:null}});console.log('cleared '+d.count+' rows; reset '+u.count+' accounts');await p.\$disconnect();})();" || exit 1

echo "[3/3] draining backlog (resilient loop; scans continue server-side even if curl times out)..."
SECRET=$(grep ^CRON_SECRET apps/api/.env | cut -d= -f2-)
count_logs() { docker compose exec -T api node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.emailMessageLog.count().then(c=>{console.log(c);return p.\$disconnect();});"; }
sleep 15
prev=-1
for i in $(seq 1 60); do
  before=$(count_logs)
  res=$(curl -s -m 590 -X POST -H "x-cron-secret: $SECRET" http://localhost:3001/api/cron/email-invoice-scan)
  rc=$?
  after=$(count_logs)
  if [ $rc -ne 0 ]; then
    echo "pass $i: scan still running server-side (curl rc=$rc), waiting 60s... (log rows so far: $after)"
    sleep 60
  else
    echo "pass $i: $res (new log rows: $((after-before)))"
  fi
  if [ "$after" = "$prev" ] && [ "$after" = "$before" ] && [ $rc -eq 0 ]; then echo "BACKLOG FULLY DRAINED"; break; fi
  prev=$after
done
echo "DONE."
