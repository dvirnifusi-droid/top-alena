#!/bin/bash
# One-shot: deploy the attachment-detection fix, clear the wrongly-logged
# "no_attachment" rows, reset scan cursors, and kick a full rescan.
# Run on the VPS: cd /opt/top-alena && git pull && bash scripts/email-fix.sh
set -e
cd /opt/top-alena

echo "[1/3] rebuilding api container..."
docker compose up -d --build api

echo "[2/3] clearing bad log rows + resetting scan cursor..."
docker compose exec -T api node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const d=await p.emailMessageLog.deleteMany({where:{outcome:'no_attachment'}});const u=await p.emailAccount.updateMany({data:{last_checked_at:null}});console.log('cleared '+d.count+' log rows; reset '+u.count+' accounts');await p.\$disconnect();})();"

echo "[3/3] starting full rescan in background..."
SECRET=$(grep ^CRON_SECRET /opt/top-alena/apps/api/.env | cut -d= -f2-)
nohup curl -fsS -m 590 -X POST -H "x-cron-secret: $SECRET" http://localhost:3001/api/cron/email-invoice-scan > /tmp/rescan.json 2>&1 &

echo "DONE. Invoices will start appearing within minutes (WhatsApp alerts on import)."
