#!/bin/bash
# Print email-invoice import diagnostics: outcome breakdown, interesting rows,
# and imported invoices. Usage: cd /opt/top-alena && git pull && bash scripts/email-status.sh
cd /opt/top-alena
docker compose exec -T api node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const outcomes = await p.emailMessageLog.groupBy({ by: ['outcome'], _count: { _all: true } });
  const interesting = await p.emailMessageLog.findMany({
    where: { outcome: { not: 'no_attachment' } },
    select: { sender_email: true, subject: true, outcome: true, error: true },
    orderBy: { createdAt: 'desc' },
  });
  const suspects = await p.emailMessageLog.findMany({
    where: { OR: [
      { sender_email: { contains: 'dreamvps' } },
      { sender_email: { contains: 'finpart' } },
      { subject: { contains: '15516' } },
      { subject: { contains: '164612' } },
      { subject: { contains: 'BUYME' } },
    ] },
    select: { sender_email: true, subject: true, outcome: true, error: true },
  });
  const invoices = await p.invoice.findMany({
    where: { source: 'email' },
    select: { invoice_number: true, total_amount: true, email_sender: true, status: true },
  });
  console.log(JSON.stringify({ outcomes, interesting, suspects, email_invoices: invoices }, null, 1));
  await p.\$disconnect();
})();
"
