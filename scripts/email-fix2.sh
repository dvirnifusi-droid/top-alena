#!/bin/bash
# Fix #2: the 100-message cap used to advance the scan cursor past unprocessed
# messages (the "middle of the window" got skipped forever). This deploys the
# cursor fix, resets cursors to re-cover the full 30-day window (log dedupe
# keeps it cheap), waits for the api to be ready, and drains the backlog with
# repeated scans until nothing new is found.
set -e
cd /opt/top-alena

echo "[1/4] rebuilding api container..."
docker compose up -d --build api

echo "[2/4] resetting scan cursors (log rows kept - dedupe handles them)..."
docker compose exec -T api node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const u=await p.emailAccount.updateMany({data:{last_checked_at:null}});console.log('reset '+u.count+' accounts');await p.\$disconnect();})();"

echo "[3/4] waiting for api to accept requests..."
SECRET=$(grep ^CRON_SECRET apps/api/.env | cut -d= -f2-)
for i in $(seq 1 30); do
  if curl -fsS -m 5 http://localhost:3001/api/auth/me -o /dev/null 2>/dev/null || [ $? -eq 22 ]; then break; fi
  sleep 2
done

echo "[4/4] draining backlog (repeat scans until no new messages)..."
count_logs() { docker compose exec -T api node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.emailMessageLog.count().then(c=>{console.log(c);return p.\$disconnect();});"; }
for i in $(seq 1 20); do
  before=$(count_logs)
  res=$(curl -fsS -m 590 -X POST -H "x-cron-secret: $SECRET" http://localhost:3001/api/cron/email-invoice-scan)
  after=$(count_logs)
  echo "pass $i: $res (new log rows: $((after-before)))"
  if [ "$after" = "$before" ]; then echo "BACKLOG FULLY DRAINED after $i passes"; break; fi
done
echo "DONE."
