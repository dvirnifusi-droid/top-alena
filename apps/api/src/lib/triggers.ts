// Entity event triggers — ports of the Base44 "send Pushover / SMS when X
// happens" automations. Each trigger runs after a successful create/update
// in the generic /api/entities route, fire-and-forget so it never blocks the
// response. Missing optional fields are tolerated.

import { prisma } from '../db.js';
import { pushoverToAdmins } from './pushover.js';
import { notifyEmployee } from './notifications.js';

const db = prisma as any;

type Event = 'created' | 'updated';
type Handler = (row: any, prev?: any) => Promise<void>;

const handlers: Record<string, Partial<Record<Event, Handler[]>>> = {};
function on(model: string, event: Event, h: Handler) {
  if (!handlers[model]) handlers[model] = {};
  if (!handlers[model][event]) handlers[model][event] = [];
  handlers[model][event]!.push(h);
}

export async function fireTriggers(model: string, event: Event, row: any, prev?: any) {
  const list = handlers[model]?.[event] || [];
  for (const h of list) {
    try { await h(row, prev); }
    catch (e: any) { console.error(`[trigger] ${model}/${event}:`, e?.message); }
  }
}

const shortText = (s: any, n = 200) => String(s || '').slice(0, n);
const statusLabel = (s: any) =>
  s === 'approved' ? 'אושרה ✓' :
  s === 'rejected' ? 'נדחתה ✕' :
  s === 'pending'  ? 'ממתינה' :
  s === 'cancelled' ? 'בוטלה' :
  String(s || '-');

// ─────────────────── Pushover (to admins) ───────────────────

on('Incident', 'created', async (row) => {
  await pushoverToAdmins(
    `🚨 תקרית חדשה: ${row.title || '—'}`,
    `קטגוריה: ${row.category || '-'}\nחומרה: ${row.severity || '-'}\nתאריך: ${row.incident_date || '-'}\n${shortText(row.description)}`
  );
});

on('ChecklistExecution', 'updated', async (row, prev) => {
  // Only fire on transition into "completed"
  if (prev?.status === 'completed') return;
  if (row.status !== 'completed') return;
  // Count items that the executor flagged as failed/issue. The items live
  // in row.items (Json array) — each item typically has {status, label, notes}.
  const items: any[] = Array.isArray(row.items) ? row.items : [];
  const failed = items.filter((i) => i && (i.status === 'failed' || i.status === 'issue' || i.has_issue === true));
  const passed = items.filter((i) => i && (i.status === 'ok' || i.status === 'passed' || i.status === 'done'));
  const verdict = failed.length === 0 ? '✅ הכל תקין' : `⚠️ ${failed.length} בעיות`;
  const sample = failed.slice(0, 3).map((f) => `• ${f.label || f.name || '-'}${f.notes ? ` (${String(f.notes).slice(0, 40)})` : ''}`).join('\n');
  const body = [
    `${row.checklist_name || row.name || '—'} · ${row.completed_by_name || row.completed_by || row.created_by || '-'}`,
    `${passed.length} עברו · ${failed.length} נכשלו · ${verdict}`,
    sample,
  ].filter(Boolean).join('\n');
  await pushoverToAdmins(
    failed.length === 0 ? `✅ צ'קליסט הושלם — תקין` : `⚠️ צ'קליסט הושלם עם בעיות`,
    body,
  );
});

// New reservation through the public booking flow.
on('Reservation', 'created', async (row) => {
  const dateStr = (() => {
    try {
      const d = new Date(row.date);
      if (isNaN(d.getTime())) return String(row.date || '-').slice(0, 10);
      return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    } catch { return String(row.date || '-').slice(0, 10); }
  })();
  const occasion = row.special_occasion ? `\n🎉 ${row.special_occasion}` : '';
  const requests = row.special_requests ? `\n📝 ${String(row.special_requests).slice(0, 120)}` : '';
  await pushoverToAdmins(
    `📅 הזמנה חדשה — ${dateStr} ${row.time || ''}`.trim(),
    `👤 ${row.customer_name || '-'}${row.customer_phone ? ` · ${row.customer_phone}` : ''}\n👥 ${row.party_size || '-'} סועדים${occasion}${requests}`,
  );
});

// Customer survey landed — separate templates for positive vs negative
// (rating <= 3 is treated as negative so the manager knows to call them back).
on('CustomerFeedback', 'created', async (row) => {
  const rating = Number(row.rating ?? 0);
  const isNegative = rating > 0 && rating <= 3;
  const stars = '⭐'.repeat(Math.max(0, Math.min(5, rating)));
  const food = row.food_rating != null ? `🍽️ אוכל: ${row.food_rating}/5` : null;
  const service = row.service_rating != null ? `🛎️ שירות: ${row.service_rating}/5` : null;
  const tableInfo = row.table_number ? `🪑 שולחן ${row.table_number}` : null;
  const comment = row.comments ? `💬 ${String(row.comments).slice(0, 140)}` : null;
  const lines = [
    `${row.customer_name || 'לקוח אנונימי'}${row.customer_phone ? ` · ${row.customer_phone}` : ''}`,
    `${stars} ${rating}/5`,
    food, service, tableInfo, comment,
  ].filter(Boolean).join('\n');
  await pushoverToAdmins(
    isNegative ? `🚨 משוב לקוח שלילי (${rating}/5)` : `⭐ משוב לקוח חיובי (${rating}/5)`,
    lines,
  );
});

on('TipReport', 'updated', async (row, prev) => {
  if (prev?.status === 'locked') return;
  if (row.status !== 'locked') return;
  // Format date as DD/MM/YYYY (Israel locale) — date column is DateTime,
  // arrives as ISO string. Fall back to raw value if parse fails.
  const dateRaw = row.date || row.shift_date || '';
  let dateStr = String(dateRaw).slice(0, 10);
  try {
    const d = new Date(dateRaw);
    if (!isNaN(d.getTime())) {
      dateStr = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }
  } catch { /* keep slice */ }
  const shiftLabel =
    row.shift_type === 'lunch' ? 'צהריים ☀️' :
    row.shift_type === 'dinner' ? 'ערב 🌙' :
    (row.shift_type || '-');
  const fmt = (n: any) => (n == null || Number.isNaN(Number(n))) ? '-' : `₪${Number(n).toLocaleString('he-IL')}`;
  const total = row.total_tips_collected ?? row.total_tips ?? row.amount;
  const net = row.net_tips_for_distribution;
  const perHour = row.tip_per_hour;
  const meal = row.total_meal_amount;
  const runner = row.runner_deduction;
  const house = row.restaurant_deduction;
  const lines = [
    `📅 ${dateStr} · ${shiftLabel}`,
    `💵 סה"כ נאסף: ${fmt(total)}`,
  ];
  if (meal != null && Number(meal) > 0) lines.push(`🍽️ ארוחות עובדים: ${fmt(meal)}`);
  if (runner != null && Number(runner) > 0) lines.push(`🏃 ניכוי ראנר: ${fmt(runner)}`);
  if (house != null && Number(house) > 0) lines.push(`🏠 ניכוי מסעדה: ${fmt(house)}`);
  if (net != null) lines.push(`✨ לחלוקה: ${fmt(net)}`);
  if (perHour != null) lines.push(`⏱️ טיפ לשעה: ${fmt(perHour)}`);
  await pushoverToAdmins(
    `💰 טיפים ננעלו — ${shiftLabel} ${dateStr}`,
    lines.join('\n'),
  );
});

on('ShiftEndReport', 'created', async (row) => {
  await pushoverToAdmins(
    `📋 דוח סיום משמרת`,
    `${row.shift_date || '-'} · ${row.shift_type === 'lunch' ? 'צהריים' : 'ערב'} · מנהל: ${row.manager_name || '-'}\nהכנסות: ₪${row.total_revenue ?? '-'}`
  );
});

on('EmployeeAvailability', 'created', async (row) => {
  await pushoverToAdmins(
    `📅 הגשת זמינות`,
    `${row.employee_name || '-'} · ${row.date || '-'} · ${row.availability_type || '-'}`
  );
});

on('ShiftTracking', 'created', async (row) => {
  const t = String(row.shift_start || '').slice(11, 16);
  await pushoverToAdmins(
    `⏰ כניסה למשמרת`,
    `${row.employee_name || '-'} · שעת כניסה: ${t || '-'}`
  );
});

on('ShiftTracking', 'updated', async (row, prev) => {
  // Overtime: crossed the 10h mark
  const newHours = Number(row.total_hours ?? 0);
  const prevHours = Number(prev?.total_hours ?? 0);
  if (newHours > 10 && prevHours <= 10) {
    await pushoverToAdmins(
      `⚠️ חריגה בשעות משמרת`,
      `${row.employee_name || '-'} · סה"כ ${newHours.toFixed(1)} שעות`
    );
  }
});

on('DailyBrief', 'updated', async (row, prev) => {
  if (prev?.published === true) return;
  if (row.published !== true && row.status !== 'published') return;
  await pushoverToAdmins(
    `📢 תדריך פורסם`,
    `${row.title || row.date || 'תדריך יומי'}`
  );
});

on('ShiftSwapRequest', 'created', async (row) => {
  await pushoverToAdmins(
    `🔄 בקשת החלפת משמרת`,
    `${row.requester_name || '-'} מבקש/ת להחליף משמרת בתאריך ${row.original_date || row.shift_date || '-'}`
  );
});

on('LeaveRequest', 'created', async (row) => {
  await pushoverToAdmins(
    `🌴 בקשת חופשה חדשה`,
    `${row.employee_name || '-'} · ${row.start_date || '-'} → ${row.end_date || '-'}\nסיבה: ${shortText(row.reason, 120) || '-'}`
  );
});

on('LeaveRequest', 'updated', async (row, prev) => {
  if (prev?.status === row.status) return;
  await pushoverToAdmins(
    `🌴 עדכון סטטוס חופשה`,
    `${row.employee_name || '-'} · ${statusLabel(row.status)}`
  );
});

// ─────────────────── Web Push (to the affected employee, free) ──────
// Uses the same Employee.push_subscription the staff page already populates.
// No SMS, no Twilio cost. Employees who haven't enabled notifications simply
// won't receive these — they'll still see updates when they open the app.

on('LeaveRequest', 'updated', async (row, prev) => {
  if (prev?.status === row.status) return;
  await notifyEmployee(
    row.employee_id,
    `🌴 בקשת החופשה ${statusLabel(row.status)}`,
    `${row.start_date || ''}${row.end_date ? `–${row.end_date}` : ''}`,
    '/LeaveRequests',
  );
});

on('WorkShift', 'created', async (row) => {
  const staff = Array.isArray(row.assigned_staff) ? row.assigned_staff : [];
  for (const s of staff) {
    if (!s?.employee_id) continue;
    const body = `${row.date || ''}${s.start_time ? ` · ${s.start_time}-${s.end_time || ''}` : ''}${s.position ? ` · ${s.position}` : ''}`;
    await notifyEmployee(s.employee_id, '📅 שובצת למשמרת חדשה', body, '/WorkScheduling');
  }
});

on('ShiftSwapRequest', 'updated', async (row, prev) => {
  if (prev?.status === row.status) return;
  await notifyEmployee(
    row.requester_id,
    `🔄 בקשת ההחלפה ${statusLabel(row.status)}`,
    `המשמרת בתאריך ${row.original_date || row.shift_date || '-'}`,
    '/EmployeeHome',
  );
});

console.log('[triggers] registered for:', Object.keys(handlers).join(', '));
