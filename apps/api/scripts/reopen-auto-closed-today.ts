// One-shot recovery: re-open ShiftTracking rows that were auto-closed today,
// returning them to status='active' so the owner can close them manually
// with the correct end-time after the 3 auto-close paths were disabled.
//
// Identification criteria:
//   - shift_start within the last 36 hours (covers a dinner shift that ran past midnight)
//   - status in ('completed', 'auto_closed')
//   - auto_close_reason is non-null (i.e. the system, not a human, set the end)
//
// What we do per row:
//   1. Clear shift_end, total_hours, effective_hours, auto_close_reason
//   2. Set status back to 'active'
//   3. Print before/after for visibility
//
// Idempotent: running again will find no matches (auto_close_reason already null).

import { prisma } from '../src/db.js';

async function main() {
  const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const closed: any[] = await (prisma as any).shiftTracking.findMany({
    where: {
      shift_start: { gte: cutoff },
      status: { in: ['completed', 'auto_closed'] },
      auto_close_reason: { not: null },
    },
    orderBy: { shift_start: 'desc' },
  });

  if (closed.length === 0) {
    console.log('No auto-closed shifts found in the last 36 hours. Nothing to revert.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${closed.length} auto-closed shifts in last 36h:\n`);
  for (const t of closed) {
    const startedAt = new Date(t.shift_start).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
    const endedAt = t.shift_end ? new Date(t.shift_end).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—';
    console.log(`  • ${t.employee_name.padEnd(20)} | start ${startedAt} | end ${endedAt} | ${t.total_hours?.toFixed(2) || '0'}h | reason: ${t.auto_close_reason}`);
  }

  console.log(`\nReverting all ${closed.length} shifts to status='active'…\n`);

  let success = 0, failed = 0;
  for (const t of closed) {
    try {
      await (prisma as any).shiftTracking.update({
        where: { id: t.id },
        data: {
          status: 'active',
          shift_end: null,
          total_hours: null,
          effective_hours: null,
          auto_close_reason: null,
          end_reminder_sent_at: null,
        },
      });
      console.log(`  ✓ ${t.employee_name}`);
      success++;
    } catch (e: any) {
      console.log(`  ✗ ${t.employee_name} — ${e?.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} reverted to active, ${failed} failed.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
