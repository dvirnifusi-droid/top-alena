#!/bin/bash
# Fix #5: link-based invoices. Emails that carry the invoice as a LINK/button in
# the body (icount, ezcount, invoice-maven, tamal/easy, cohenb…) instead of a
# PDF attachment are now followed and the PDF pulled from the link (safely).
# Clears the stuck 'error' rows and the invoice-labeled 'no_attachment' rows so
# they get re-examined with link support, resets cursors, drains the backlog.
cd /opt/top-alena

echo "[1/3] rebuilding api container..."
docker compose up -d --build api || exit 1

echo "[2/3] clearing stuck rows (error + invoice-labeled no_attachment) + resetting cursors..."
docker compose exec -T api node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const kw=['חשבונית','קבלה','invoice','receipt'];const e=await p.emailMessageLog.deleteMany({where:{outcome:'error'}});const n=await p.emailMessageLog.deleteMany({where:{outcome:'no_attachment',OR:kw.map(k=>({subject:{contains:k}}))}});const u=await p.emailAccount.updateMany({data:{last_checked_at:null}});console.log('cleared '+e.count+' error + '+n.count+' labeled-no_attachment rows; reset '+u.count+' accounts');await p.\$disconnect();})();" || exit 1

echo "[3/3] draining backlog (resilient loop)..."
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
