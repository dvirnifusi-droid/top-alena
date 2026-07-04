#!/bin/bash
# Run the email invoice scan in the foreground and print the result.
# Usage on VPS: cd /opt/top-alena && git pull && bash scripts/rescan.sh
cd /opt/top-alena
SECRET=$(grep ^CRON_SECRET apps/api/.env | cut -d= -f2-)
echo "scanning... (this can take a few minutes on a full backfill)"
curl -s -m 590 -X POST -H "x-cron-secret: $SECRET" http://localhost:3001/api/cron/email-invoice-scan
echo
echo "done."
