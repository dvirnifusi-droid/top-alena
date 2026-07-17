// Personal performance report — sent on demand ('דוח') or weekly.
// Shows the admin: tasks completed this week, events attended, leads they
// touched, decisions made, plus a 'what's left' section so nothing slips.
import { prisma } from '../db.js';
const TZ = 'Asia/Jerusalem';
function ymd(d) { return d.toLocaleDateString('en-CA', { timeZone: TZ }); }
function addDays(d, n) { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; }
export async function buildPersonalReport(fromPhone, days = 7) {
    const since = addDays(new Date(), -days);
    const sinceIso = since.toISOString();
    // 1. Tasks completed this week (status=task_done, contact_phone=user)
    const doneTasks = await prisma.whatsAppMessage.findMany({
        where: {
            status: 'task_done', contact_phone: fromPhone,
            created_at: { gte: since },
        },
        take: 200,
    }).catch(() => []);
    // 2. Open tasks still pending
    const openTasks = await prisma.whatsAppMessage.findMany({
        where: { status: 'open_task', contact_phone: fromPhone, is_read: false },
        take: 200,
    }).catch(() => []);
    // 3. Events that already happened this week
    const eventsDone = await prisma.whatsAppMessage.findMany({
        where: { status: 'event_done', contact_phone: fromPhone, created_at: { gte: since } },
        take: 200,
    }).catch(() => []);
    // 4. Upcoming scheduled events
    const eventsUpcoming = await prisma.whatsAppMessage.findMany({
        where: { status: 'scheduled_event', contact_phone: fromPhone, is_read: false },
        take: 100,
    }).catch(() => []);
    // 5. Lead stage transitions in window (look for status updates via WhatsApp action confirms)
    let leadsTouched = 0;
    try {
        const leads = await prisma.eventLead.findMany({
            where: { updated_date: { gte: sinceIso } },
            take: 200,
        });
        leadsTouched = leads.length;
    }
    catch { /* ignore */ }
    // 6. Invoices marked paid in window
    let invoicesPaid = 0;
    try {
        const invs = await prisma.invoice.findMany({
            where: { payment_status: 'paid', updatedAt: { gte: since } },
            take: 200,
        });
        invoicesPaid = invs.length;
    }
    catch { /* ignore */ }
    const lines = [
        `📊 *הדוח האישי שלך — ${days} ימים אחרונים*`,
        '',
        `✅ משימות שסיימת: *${doneTasks.length}*`,
        `🗓 פגישות שעברו: *${eventsDone.length}*`,
        `🎯 לידים שטיפלת בהם: *${leadsTouched}*`,
        `💰 חשבוניות שאישרת תשלום: *${invoicesPaid}*`,
        '',
        `📌 *מה נותר לעשות:*`,
        `  ✅ ${openTasks.length} משימות פתוחות`,
        `  🗓 ${eventsUpcoming.length} פגישות עתידיות`,
    ];
    // Top 5 open tasks
    if (openTasks.length) {
        lines.push('', '*משימות בולטות:*');
        for (const t of openTasks.slice(0, 5)) {
            const title = t.raw?.title || t.body || '?';
            lines.push(`  • ${title}`);
        }
        if (openTasks.length > 5)
            lines.push(`  …ועוד ${openTasks.length - 5}`);
    }
    // Next 3 upcoming events
    if (eventsUpcoming.length) {
        lines.push('', '*הפגישות הבאות:*');
        const sorted = eventsUpcoming
            .map((e) => ({ ...e, ts: new Date(e.raw?.event_at || 0).getTime() }))
            .filter((e) => e.ts > Date.now())
            .sort((a, b) => a.ts - b.ts)
            .slice(0, 3);
        for (const e of sorted) {
            const title = e.raw?.title || '?';
            const at = new Date(e.raw?.event_at).toLocaleString('he-IL', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
            lines.push(`  • ${at} · ${title}`);
        }
    }
    // Comparison + nudge
    if (doneTasks.length === 0 && openTasks.length > 0) {
        lines.push('', '_💪 השבוע לא סימנת אף משימה כבוצעה. שלח "סיים <שם>" כשתסיים._');
    }
    else if (doneTasks.length >= 5) {
        lines.push('', '_🔥 שבוע פרודוקטיבי. כל הכבוד!_');
    }
    return lines.join('\n');
}
//# sourceMappingURL=personalReport.js.map