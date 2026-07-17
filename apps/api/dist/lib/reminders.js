// Reminder dispatcher — called by cron every minute. Scans WhatsAppMessage
// rows with status='scheduled_reminder' + is_read=false, sends any whose
// deliver_at is now-or-past, marks consumed.
// Also fans out to the calendar dispatcher (events + wake alarms) so a
// single crontab entry handles all the minute-tick work.
import { prisma } from '../db.js';
import { sendWhatsApp } from './twilio.js';
import { dispatchCalendarNotifications } from './whatsappCalendar.js';
export async function dispatchDueReminders() {
    const due = await prisma.whatsAppMessage.findMany({
        where: { status: 'scheduled_reminder', is_read: false },
        take: 200,
    }).catch(() => []);
    const now = Date.now();
    let sent = 0;
    let failed = 0;
    for (const row of due) {
        const at = row.raw?.deliver_at;
        if (!at)
            continue;
        const t = new Date(at).getTime();
        if (isNaN(t) || t > now)
            continue; // future — leave for later
        const text = String(row.body || `⏰ תזכורת: ${row.raw?.remind_text || ''}`).trim();
        const target = row.raw?.target_phone || row.to_phone;
        if (!target || target === 'self')
            continue;
        try {
            await sendWhatsApp(target, text);
            await prisma.whatsAppMessage.update({
                where: { id: row.id },
                data: { is_read: true, status: 'reminder_sent' },
            });
            sent++;
        }
        catch (e) {
            failed++;
            console.warn('[reminder] send failed', { id: row.id, err: e?.message });
        }
    }
    // Calendar dispatch (events + wake alarms) — independent, runs in parallel
    // and never blocks reminders. Errors logged but never surface as failure.
    let calendar = null;
    try {
        calendar = await dispatchCalendarNotifications();
    }
    catch (e) {
        console.warn('[reminder] calendar dispatch crashed:', e?.message);
    }
    return { sent, failed, checked: due.length, calendar };
}
//# sourceMappingURL=reminders.js.map