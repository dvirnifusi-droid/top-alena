// Real-time WhatsApp alerts for admin numbers. Hooks into the existing
// fireTriggers system (see triggers.ts). Each handler is fire-and-forget
// so a Twilio outage never blocks the originating create/update.
//
// Subscribers: WHATSAPP_ADMIN_NUMBERS env (same as morning brief / agent).
// Free-form sends — works inside the 24h session window. Owner is expected
// to text the bot daily; if not, alerts may silently drop. Twilio templates
// for proactive out-of-session sends are a separate (Meta-approved) flow.

import { sendWhatsApp } from './twilio.js';
import { prisma } from '../db.js';
import { notifyOwner } from './waTemplates.js';
import { reportRecipientPhones } from './whatsappPermissions.js';
import { isNotifEnabled, notifText } from './notificationSettings.js';

export async function broadcastToAdmins(text: string, title = 'התראה'): Promise<void> {
  const phones = await reportRecipientPhones();
  if (!phones.length) return;
  await Promise.all(phones.map(async (p) => {
    // Real-time alerts (new lead, bad review, critical incident, large booking)
    // are exactly the kind of proactive send that must reach the owner even when
    // no session is open. Template with SMS fallback.
    try { await notifyOwner(p, title, text); }
    catch (e: any) { console.warn('[whatsapp-alert] send failed', { phone: p, err: e?.message }); }
  }));
}

// ─── Alert builders ────────────────────────────────────────────────────────

export async function alertNewEventLead(row: any): Promise<void> {
  if (!(await isNotifEnabled('event_lead_alert'))) return;
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

export async function alertBadCustomerFeedback(row: any): Promise<void> {
  // Only fire for low ratings (1-3 stars) — high-star feedback is good news
  // and gets included in the morning brief, not a real-time push.
  const rating = Number(row.rating || row.overall_rating || 0);
  if (!rating || rating > 3) return;
  if (!(await isNotifEnabled('bad_review_alert'))) return;
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

export async function alertCriticalIncident(row: any): Promise<void> {
  // Only critical/high severity get a WhatsApp ping. Lower severity already
  // gets a Pushover via the existing trigger; doubling up would be spam.
  const sev = String(row.severity || '').toLowerCase();
  if (sev !== 'critical' && sev !== 'high') return;
  if (!(await isNotifEnabled('critical_incident_alert'))) return;
  const lines = [
    `${sev === 'critical' ? '🔴' : '🟠'} *אירוע ${sev === 'critical' ? 'קריטי' : 'חמור'}*`,
    row.category ? `🏷️ ${row.category}` : null,
    row.title ? `📝 ${row.title}` : null,
    row.description ? `💬 ${String(row.description).slice(0, 240)}` : null,
    row.reported_by ? `🙋 דווח ע"י: ${row.reported_by}` : null,
  ].filter(Boolean).join('\n');
  await broadcastToAdmins(lines);
}

export async function alertLargeReservation(row: any): Promise<void> {
  // Heads-up for 20+ guest reservations — usually walks in as a regular booking
  // but justifies a different staffing plan.
  const party = Number(row.party_size || row.guests || 0);
  if (party < 20) return;
  if (!(await isNotifEnabled('large_reservation_alert'))) return;
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

export async function alertCashDiscrepancy(row: any): Promise<void> {
  // ShiftEndReport.cash_diff sometimes lives under different field names
  // across older schemas. Read all known variants; alert if magnitude >₪200.
  const diff = Number(row.cash_diff ?? row.cash_difference ?? row.cash_variance ?? 0);
  if (!isFinite(diff) || Math.abs(diff) < 200) return;
  if (!(await isNotifEnabled('cash_discrepancy_alert'))) return;
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

export async function alertEmailInvoicesImported(count: number): Promise<void> {
  if (!(await isNotifEnabled('invoices_imported_alert'))) return;
  // Flag products the system isn't sure about — new / unmatched raw materials
  // from the just-imported invoices that need owner approval in the product tree.
  let reviewLine = '';
  try {
    const dbx = prisma as any;
    const norm = (s: any) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const ings: any[] = await dbx.$queryRawUnsafe(`SELECT name FROM "Ingredient"`).catch(() => []);
    const aliases: any[] = await dbx.$queryRawUnsafe(`SELECT alias FROM "IngredientAlias"`).catch(() => []);
    const known = new Set([...ings.map((i) => norm(i.name)), ...aliases.map((a) => norm(a.alias))]);
    const items: any[] = await dbx.$queryRawUnsafe(`SELECT DISTINCT product_name FROM "InvoiceItem" WHERE "createdAt" >= NOW() - INTERVAL '2 hours'`).catch(() => []);
    const unmatched = new Set(items.map((it) => norm(it.product_name)).filter((n) => n && !known.has(n)));
    if (unmatched.size > 0) reviewLine = `\n🆕 ${unmatched.size} מוצרים חדשים/לא-מזוהים — דורשים אישור בעץ המוצר (/Recipes).`;
  } catch { /* best-effort */ }
  const fallback = [
    `📬 *נקלטו ${count} חשבוניות חדשות מהמייל*`,
    'ממתינות לבדיקה ואישור בדף /Invoices.' + reviewLine,
  ].join('\n');
  await broadcastToAdmins(await notifText('invoices_imported_alert', fallback, { count }));
}

export async function alertEmailAccountDisconnected(email: string): Promise<void> {
  if (!(await isNotifEnabled('email_disconnected_alert'))) return;
  const fallback = [
    `⚠️ *תיבת המייל ${email} נותקה*`,
    'סיסמת האפליקציה בוטלה או השתנתה. חבר מחדש בדף /EmailInvoiceSettings.',
  ].join('\n');
  await broadcastToAdmins(await notifText('email_disconnected_alert', fallback, { email }));
}
