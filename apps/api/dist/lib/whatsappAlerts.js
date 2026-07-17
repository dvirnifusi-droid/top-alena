// Real-time WhatsApp alerts for admin numbers. Hooks into the existing
// fireTriggers system (see triggers.ts). Each handler is fire-and-forget
// so a Twilio outage never blocks the originating create/update.
//
// Subscribers: WHATSAPP_ADMIN_NUMBERS env (same as morning brief / agent).
// Free-form sends — works inside the 24h session window. Owner is expected
// to text the bot daily; if not, alerts may silently drop. Twilio templates
// for proactive out-of-session sends are a separate (Meta-approved) flow.
import { sendWhatsApp } from './twilio.js';
import { reportRecipientPhones } from './whatsappPermissions.js';
export async function broadcastToAdmins(text) {
    const phones = await reportRecipientPhones();
    if (!phones.length)
        return;
    await Promise.all(phones.map(async (p) => {
        try {
            await sendWhatsApp(p, text);
        }
        catch (e) {
            console.warn('[whatsapp-alert] send failed', { phone: p, err: e?.message });
        }
    }));
}
// ─── Alert builders ────────────────────────────────────────────────────────
export async function alertNewEventLead(row) {
    // Triggered on EventLead.created (Dana finishes a chat). We send a short
    // call-to-action so the manager can ring back fast — leads >24h stale
    // drop conversion 4x per our brief logic.
    const lines = [
        '🎯 *ליד אירוע חדש*',
        `👤 ${row.contact_name || 'ללא שם'}`,
        row.contact_phone ? `📞 ${row.contact_phone}` : null,
        row.event_date ? `📅 ${row.event_date}` : null,
        row.event_type ? `🎉 ${row.event_type}` : null,
        row.guest_count ? `👥 ${row.guest_count} אורחים` : null,
        row.budget_per_person ? `💰 ₪${row.budget_per_person}/סועד` : null,
        row.source ? `📥 מקור: ${row.source}` : null,
        '',
        '_ענה "ליד ' + (row.contact_name || row.contact_phone || '?') + ' התקשרתי" אחרי השיחה._',
    ].filter(Boolean).join('\n');
    await broadcastToAdmins(lines);
}
export async function alertBadCustomerFeedback(row) {
    // Only fire for low ratings (1-3 stars) — high-star feedback is good news
    // and gets included in the morning brief, not a real-time push.
    const rating = Number(row.rating || row.overall_rating || 0);
    if (!rating || rating > 3)
        return;
    const lines = [
        `👎 *ביקורת חדשה ${rating}/5*`,
        row.customer_name ? `👤 ${row.customer_name}` : null,
        row.customer_phone ? `📞 ${row.customer_phone}` : null,
        row.comment ? `💬 "${String(row.comment).slice(0, 200)}"` : null,
        row.shift_type ? `🍽 ${row.shift_type === 'lunch' ? 'צהריים' : 'ערב'}` : null,
        '',
        '_שווה לחזור ללקוח לפני שיכתוב ביקורת ב-Google._',
    ].filter(Boolean).join('\n');
    await broadcastToAdmins(lines);
}
export async function alertCriticalIncident(row) {
    // Only critical/high severity get a WhatsApp ping. Lower severity already
    // gets a Pushover via the existing trigger; doubling up would be spam.
    const sev = String(row.severity || '').toLowerCase();
    if (sev !== 'critical' && sev !== 'high')
        return;
    const lines = [
        `${sev === 'critical' ? '🔴' : '🟠'} *אירוע ${sev === 'critical' ? 'קריטי' : 'חמור'}*`,
        row.category ? `🏷️ ${row.category}` : null,
        row.title ? `📝 ${row.title}` : null,
        row.description ? `💬 ${String(row.description).slice(0, 240)}` : null,
        row.reported_by ? `🙋 דווח ע"י: ${row.reported_by}` : null,
    ].filter(Boolean).join('\n');
    await broadcastToAdmins(lines);
}
export async function alertLargeReservation(row) {
    // Heads-up for 20+ guest reservations — usually walks in as a regular booking
    // but justifies a different staffing plan.
    const party = Number(row.party_size || row.guests || 0);
    if (party < 20)
        return;
    const lines = [
        `📅 *הזמנה גדולה — ${party} סועדים*`,
        row.customer_name ? `👤 ${row.customer_name}` : null,
        row.customer_phone ? `📞 ${row.customer_phone}` : null,
        row.date ? `🗓 ${String(row.date).slice(0, 10)}` : null,
        row.time ? `🕒 ${row.time}` : null,
        row.notes ? `📝 ${String(row.notes).slice(0, 150)}` : null,
        '',
        '_שווה לוודא איוש מספיק למשמרת הזו._',
    ].filter(Boolean).join('\n');
    await broadcastToAdmins(lines);
}
export async function alertCashDiscrepancy(row) {
    // ShiftEndReport.cash_diff sometimes lives under different field names
    // across older schemas. Read all known variants; alert if magnitude >₪200.
    const diff = Number(row.cash_diff ?? row.cash_difference ?? row.cash_variance ?? 0);
    if (!isFinite(diff) || Math.abs(diff) < 200)
        return;
    const sign = diff > 0 ? '➕' : '➖';
    const lines = [
        `${sign} *פער קופה: ₪${Math.abs(diff).toLocaleString('he-IL')}*`,
        row.date ? `📅 ${String(row.date).slice(0, 10)}` : null,
        row.shift_type ? `🍽 ${row.shift_type === 'lunch' ? 'צהריים' : 'ערב'}` : null,
        row.closed_by ? `👤 סגר: ${row.closed_by}` : null,
        diff > 0 ? '_עודף — בדוק קופה._' : '_חוסר — שווה בירור עם הצוות._',
    ].filter(Boolean).join('\n');
    await broadcastToAdmins(lines);
}
export async function alertEmailInvoicesImported(count) {
    await broadcastToAdmins([
        `📬 *נקלטו ${count} חשבוניות חדשות מהמייל*`,
        'ממתינות לבדיקה ואישור בדף /Invoices.',
    ].join('\n'));
}
export async function alertEmailAccountDisconnected(email) {
    await broadcastToAdmins([
        `⚠️ *תיבת המייל ${email} נותקה*`,
        'סיסמת האפליקציה בוטלה או השתנתה. חבר מחדש בדף /EmailInvoiceSettings.',
    ].join('\n'));
}
//# sourceMappingURL=whatsappAlerts.js.map