#!/bin/bash
# Fix #3 (owner rule: "collect EVERYTHING labeled invoice"):
#  - fast-path import for subject/filename containing חשבונית/invoice/receipt
#  - broadened LLM classification (any business invoice, not just food suppliers)
#  - scan Gmail "All Mail" instead of INBOX only (catches archived/filed mail)
# Clears previous not_invoice verdicts so they get re-evaluated, resets scan
# cursors, and drains the whole 30-day window again.
set -e
cd /opt/top-alena

echo "[1/4] rebuilding api container..."
docker compose up -d --build api

echo "[2/4] clearing old not_invoice verdicts + resetting scan cursors..."
docker compose exec -T api node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const d=await p.emailMessageLog.deleteMany({where:{outcome:'not_invoice'}});const u=await p.emailAccount.updateMany({data:{last_checked_at:null}});console.log('cleared '+d.count+' not_invoice rows; reset '+u.count+' accounts');await p.\$disconnect();})();"

echo "[3/4] waiting for api to accept requests..."
SECRET=$(grep ^CRON_SECRET apps/api/.env | cut -d= -f2-)
sleep 8

echo "[4/4] draining backlog (repeat scans until no new messages)..."
count_logs() { docker compose exec -T api node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.emailMessageLog.count().then(c=>{console.log(c);return p.\$disconnect();});"; }
for i in $(seq 1 40); do
  before=$(count_logs)
  res=$(curl -fsS -m 590 -X POST -H "x-cron-secret: $SECRET" http://localhost:3001/api/cron/email-invoice-scan)
  after=$(count_logs)
  echo "pass $i: $res (new log rows: $((after-before)))"
  if [ "$after" = "$before" ]; then echo "BACKLOG FULLY DRAINED after $i passes"; break; fi
done
echo "DONE."
