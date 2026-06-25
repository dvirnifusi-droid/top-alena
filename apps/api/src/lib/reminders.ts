// Reminder dispatcher — called by cron every minute. Scans WhatsAppMessage
// rows with status='scheduled_reminder' + is_read=false, sends any whose
// deliver_at is now-or-past, marks consumed.

import { prisma } from '../db.js';
import { sendWhatsApp } from './twilio.js';

export async function dispatchDueReminders(): Promise<{ sent: number; failed: number; checked: number }> {
  const due: any[] = await (prisma as any).whatsAppMessage.findMany({
    where: { status: 'scheduled_reminder', is_read: false },
    take: 200,
  }).catch(() => []);
  const now = Date.now();
  let sent = 0; let failed = 0;
  for (const row of due) {
    const at = (row.raw as any)?.deliver_at;
    if (!at) continue;
    const t = new Date(at).getTime();
    if (isNaN(t) || t > now) continue; // future — leave for later
    const text = String(row.body || `⏰ תזכורת: ${(row.raw as any)?.remind_text || ''}`).trim();
    const target = (row.raw as any)?.target_phone || row.to_phone;
    if (!target || target === 'self') continue;
    try {
      await sendWhatsApp(target, text);
      await (prisma as any).whatsAppMessage.update({
        where: { id: row.id },
        data: { is_read: true, status: 'reminder_sent' },
      });
      sent++;
    } catch (e: any) {
      failed++;
      console.warn('[reminder] send failed', { id: row.id, err: e?.message });
    }
  }
  return { sent, failed, checked: due.length };
}
