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
  await pushoverToAdmins(
    `✅ צ'קליסט הושלם`,
    `${row.checklist_name || row.name || '—'} · ${row.completed_by_name || row.completed_by || row.created_by || '-'}`
  );
});

on('TipReport', 'updated', async (row, prev) => {
  if (prev?.status === 'locked') return;
  if (row.status !== 'locked') return;
  await pushoverToAdmins(
    `💰 טיפים ננעלו`,
    `תאריך: ${row.date || row.shift_date || '-'} · סה"כ: ₪${row.total_tips ?? row.amount ?? '-'}`
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
