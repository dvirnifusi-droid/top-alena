// Entity event triggers — ports of the Base44 "send Pushover / SMS when X
// happens" automations. Each trigger runs after a successful create/update
// in the generic /api/entities route, fire-and-forget so it never blocks the
// response. Missing optional fields are tolerated.
//
// PRINCIPLE: every push includes as much usable detail as the model exposes,
// so the manager can decide what to do without opening the app.

import { prisma } from '../db.js';
import { pushoverToAdmins, pushoverEventsOwners } from './pushover.js';
import { notifyEmployee } from './notifications.js';
import {
  alertNewEventLead,
  alertBadCustomerFeedback,
  alertCriticalIncident,
  alertLargeReservation,
  alertCashDiscrepancy,
} from './whatsappAlerts.js';

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

// ── helpers ──────────────────────────────────────────────────────────
const shortText = (s: any, n = 200) => String(s || '').slice(0, n);
const statusLabel = (s: any) =>
  s === 'approved' ? 'אושרה ✓' :
  s === 'rejected' ? 'נדחתה ✕' :
  s === 'pending'  ? 'ממתינה' :
  s === 'cancelled' ? 'בוטלה' :
  String(s || '-');
const shiftLabel = (t: any) =>
  t === 'lunch' ? 'צהריים ☀️' :
  t === 'dinner' ? 'ערב 🌙' :
  String(t || '-');
const fmtMoney = (n: any) =>
  (n == null || Number.isNaN(Number(n))) ? null : `₪${Number(n).toLocaleString('he-IL')}`;
const fmtDate = (v: any) => {
  if (!v) return '-';
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) {
      return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    }
  } catch {}
  return String(v).slice(0, 10);
};
const fmtTime = (v: any) => {
  if (!v) return '';
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return `${String(d.getUTCHours() + 3).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  } catch {}
  return String(v).slice(11, 16);
};
const sevLabel = (s: any) =>
  s === 'low' ? 'נמוכה 🟢' :
  s === 'medium' ? 'בינונית 🟡' :
  s === 'high' ? 'גבוהה 🟠' :
  s === 'critical' ? 'קריטית 🔴' :
  String(s || '-');
const join = (lines: (string | null | undefined)[]) => lines.filter(Boolean).join('\n');

// ─────────────────── Pushover (to admins) ───────────────────

// 1. Incident — every field that's set goes into the push
on('Incident', 'created', async (row) => {
  const lines = [
    row.incident_number ? `🔢 ${row.incident_number}` : null,
    row.category ? `🏷️ קטגוריה: ${row.category}` : null,
    `⚠️ חומרה: ${sevLabel(row.severity)}`,
    `📅 ${fmtDate(row.incident_date)} ${fmtTime(row.incident_date)}`.trim(),
    row.location ? `📍 ${row.location}` : null,
    row.reported_by ? `👤 דווח ע"י: ${row.reported_by}` : null,
    row.assigned_to ? `👮 הופנה ל: ${row.assigned_to}` : null,
    row.customer_reaction ? `🗣️ תגובת לקוח: ${shortText(row.customer_reaction, 80)}` : null,
    row.estimated_cost ? `💰 עלות מוערכת: ${fmtMoney(row.estimated_cost)}` : null,
    row.description ? `📝 ${shortText(row.description, 200)}` : null,
    row.follow_up_required ? '🔔 דורש מעקב' : null,
  ];
  await pushoverToAdmins(`🚨 תקרית חדשה: ${row.title || '—'}`, join(lines));
});

// 2. Checklist completed — detailed breakdown with up to 3 failed items
on('ChecklistExecution', 'updated', async (row, prev) => {
  if (prev?.status === 'completed') return;
  if (row.status !== 'completed') return;
  // results is the JSON output; some flows use `items`. Handle both.
  const items: any[] = Array.isArray(row.results)
    ? row.results
    : Array.isArray(row.items) ? row.items : [];
  const failed = items.filter((i) => i && (i.status === 'failed' || i.status === 'issue' || i.has_issue === true));
  const passed = items.filter((i) => i && (i.status === 'ok' || i.status === 'passed' || i.status === 'done'));
  const verdict = failed.length === 0 ? '✅ הכל תקין' : `⚠️ ${failed.length} בעיות`;
  const failedSample = failed.slice(0, 3).map((f) =>
    `• ${f.label || f.name || '-'}${f.notes ? ` (${shortText(f.notes, 50)})` : ''}`,
  ).join('\n');
  const score = row.overall_score != null ? `📊 ציון כולל: ${row.overall_score}` : null;
  const duration = row.completion_time_minutes ? `⏱️ זמן השלמה: ${row.completion_time_minutes} דק'` : null;
  await pushoverToAdmins(
    failed.length === 0 ? `✅ צ'קליסט הושלם — תקין` : `⚠️ צ'קליסט הושלם עם בעיות`,
    join([
      `${row.checklist_name || row.name || '—'} · ${row.executed_by_name || row.completed_by_name || row.created_by || '-'}`,
      `${passed.length} עברו · ${failed.length} נכשלו · ${verdict}`,
      score, duration,
      failed.length ? '— בעיות:' : null,
      failedSample,
      row.approving_manager_name ? `👤 אישר: ${row.approving_manager_name}` : null,
      row.notes ? `📝 ${shortText(row.notes, 100)}` : null,
      row.follow_up_required ? '🔔 דורש מעקב' : null,
    ]),
  );
});

// 3. New reservation through the public booking flow
on('Reservation', 'created', async (row) => {
  const lines = [
    `👤 ${row.customer_name || '-'}${row.customer_phone ? ` · ${row.customer_phone}` : ''}`,
    `📅 ${fmtDate(row.date)} · 🕐 ${row.time || '-'}${row.reservation_end_time ? `-${row.reservation_end_time}` : ''}`,
    `👥 ${row.party_size || '-'} סועדים`,
    row.table_preference ? `🪑 העדפת שולחן: ${row.table_preference}` : null,
    row.special_occasion ? `🎉 ${row.special_occasion}` : null,
    row.special_requests ? `📝 ${shortText(row.special_requests, 120)}` : null,
    row.status && row.status !== 'pending' ? `סטטוס: ${statusLabel(row.status)}` : null,
  ];
  await pushoverToAdmins(
    `📅 הזמנה חדשה — ${fmtDate(row.date)} ${row.time || ''}`.trim(),
    join(lines),
  );
});

// 4. Customer survey — branches positive vs negative (≤ 3 stars = negative)
on('CustomerFeedback', 'created', async (row) => {
  const rating = Number(row.rating ?? 0);
  const isNegative = rating > 0 && rating <= 3;
  const stars = '⭐'.repeat(Math.max(0, Math.min(5, rating)));
  const lines = [
    `${row.customer_name || 'לקוח אנונימי'}${row.customer_phone ? ` · ${row.customer_phone}` : ''}`,
    `${stars} ${rating}/5`,
    row.food_rating != null ? `🍽️ אוכל: ${row.food_rating}/5` : null,
    row.service_rating != null ? `🛎️ שירות: ${row.service_rating}/5` : null,
    row.table_number ? `🪑 שולחן ${row.table_number}` : null,
    row.party_size ? `👥 ${row.party_size} סועדים` : null,
    row.visit_date ? `📅 ביקור: ${fmtDate(row.visit_date)}` : null,
    row.comments ? `💬 ${shortText(row.comments, 140)}` : null,
    row.incident_created ? '🚨 נפתחה תקרית מהמשוב' : null,
    row.was_redirected_to_google ? '🌐 הופנה לביקורת ב-Google' : null,
  ];
  await pushoverToAdmins(
    isNegative ? `🚨 משוב לקוח שלילי (${rating}/5)` : `⭐ משוב לקוח חיובי (${rating}/5)`,
    join(lines),
  );
});

// 5. Tip lock — full financial breakdown
on('TipReport', 'updated', async (row, prev) => {
  if (prev?.status === 'locked') return;
  if (row.status !== 'locked') return;
  const total = row.total_tips_collected ?? row.total_tips ?? row.amount;
  const lines = [
    `📅 ${fmtDate(row.date || row.shift_date)} · ${shiftLabel(row.shift_type)}`,
    total != null ? `💵 סה"כ נאסף: ${fmtMoney(total)}` : null,
    row.total_meal_amount && Number(row.total_meal_amount) > 0 ? `🍽️ ארוחות עובדים: ${fmtMoney(row.total_meal_amount)}` : null,
    row.runner_deduction && Number(row.runner_deduction) > 0 ? `🏃 ניכוי ראנר: ${fmtMoney(row.runner_deduction)}` : null,
    row.restaurant_deduction && Number(row.restaurant_deduction) > 0 ? `🏠 ניכוי מסעדה: ${fmtMoney(row.restaurant_deduction)}` : null,
    row.net_tips_for_distribution != null ? `✨ לחלוקה: ${fmtMoney(row.net_tips_for_distribution)}` : null,
    row.tip_per_hour != null ? `⏱️ טיפ לשעה: ${fmtMoney(row.tip_per_hour)}` : null,
    row.locked_by ? `🔒 ננעל ע"י: ${row.locked_by}` : null,
    row.notes ? `📝 ${shortText(row.notes, 100)}` : null,
  ];
  await pushoverToAdmins(
    `💰 טיפים ננעלו — ${shiftLabel(row.shift_type)} ${fmtDate(row.date || row.shift_date)}`,
    join(lines),
  );
});

// 6. Shift end report — full financial + operational summary
on('ShiftEndReport', 'created', async (row) => {
  const lines = [
    `📅 ${fmtDate(row.shift_date)} · ${shiftLabel(row.shift_type)}`,
    `👤 מנהל: ${row.manager_name || '-'}`,
    row.shift_start_time && row.shift_end_time ? `🕐 ${row.shift_start_time}-${row.shift_end_time}` : null,
    row.total_revenue != null ? `💰 הכנסות: ${fmtMoney(row.total_revenue)}` : null,
    row.total_credit_card != null ? `💳 אשראי: ${fmtMoney(row.total_credit_card)}` : null,
    row.total_cash != null ? `💵 מזומן: ${fmtMoney(row.total_cash)}` : null,
    row.total_credit_card_tips != null ? `🪙 טיפים באשראי: ${fmtMoney(row.total_credit_card_tips)}` : null,
    row.tip_per_hour_waiter != null ? `⏱️ טיפ לשעה למלצר: ${fmtMoney(row.tip_per_hour_waiter)}` : null,
    row.total_dine_in_guests != null ? `👥 סועדים: ${row.total_dine_in_guests}${row.avg_spend_dine_in != null ? ` (ממוצע ${fmtMoney(row.avg_spend_dine_in)})` : ''}` : null,
    row.total_takeaway_amount != null && Number(row.total_takeaway_amount) > 0 ? `🥡 טייק-אווי: ${fmtMoney(row.total_takeaway_amount)}` : null,
    row.canceled_orders_count ? `❌ ביטולים: ${row.canceled_orders_count} (${fmtMoney(row.canceled_items_value || 0)})` : null,
    row.total_item_discounts_value ? `🎫 הנחות: ${fmtMoney(row.total_item_discounts_value)}` : null,
    row.overall_rating != null ? `⭐ דירוג כללי: ${row.overall_rating}/5` : null,
    row.z_report_number ? `📄 Z: ${row.z_report_number}` : null,
    row.inventory_issues ? `📦 ${shortText(row.inventory_issues, 80)}` : null,
    row.customer_feedback ? `💬 ${shortText(row.customer_feedback, 80)}` : null,
  ];
  await pushoverToAdmins(`📋 דוח סיום משמרת — ${shiftLabel(row.shift_type)} ${fmtDate(row.shift_date)}`, join(lines));
});

// 7. Availability submission
on('EmployeeAvailability', 'created', async (row) => {
  const typeLabel =
    row.availability_type === 'available' ? '✅ פנוי/ה' :
    row.availability_type === 'unavailable' ? '❌ לא פנוי/ה' :
    row.availability_type === 'partial' ? '⏰ פנוי/ה חלקית' :
    row.availability_type === 'preferred_off' ? '🙏 מעדיף/ה לא' :
    row.availability_type || '-';
  const shiftPref =
    row.shift_preference === 'lunch' ? 'צהריים' :
    row.shift_preference === 'dinner' ? 'ערב' :
    row.shift_preference === 'both' ? 'שתיהן' :
    row.shift_preference;
  const lines = [
    `👤 ${row.employee_name || '-'}`,
    `📅 ${fmtDate(row.date)}`,
    `סטטוס: ${typeLabel}`,
    shiftPref ? `🕐 משמרת מועדפת: ${shiftPref}` : null,
    row.available_from || row.available_until ? `⏱️ שעות: ${row.available_from || ''}${row.available_until ? `-${row.available_until}` : ''}` : null,
    row.department ? `🏢 מחלקה: ${row.department}` : null,
    Array.isArray(row.positions) && row.positions.length ? `🎯 תפקידים: ${row.positions.join(', ')}` : null,
    row.reason ? `📝 ${shortText(row.reason, 100)}` : null,
  ];
  await pushoverToAdmins(`📅 הגשת זמינות — ${row.employee_name || '-'}`, join(lines));
});

// 8. Clock-in
on('ShiftTracking', 'created', async (row) => {
  const t = fmtTime(row.shift_start);
  const ilHour = (new Date(row.shift_start || Date.now()).getUTCHours() + 3) % 24;
  const typ = ilHour < 16 ? 'lunch' : 'dinner';
  const lines = [
    `👤 ${row.employee_name || '-'}`,
    `🕐 שעת כניסה: ${t || '-'}`,
    `📅 ${fmtDate(row.date || row.shift_start)} · ${shiftLabel(typ)}`,
    row.last_lat && row.last_lng ? `📍 ${Number(row.last_lat).toFixed(4)}, ${Number(row.last_lng).toFixed(4)}` : null,
    row.status && row.status !== 'active' ? `סטטוס: ${row.status}` : null,
  ];
  await pushoverToAdmins(`⏰ כניסה למשמרת — ${row.employee_name || '-'}`, join(lines));
});

// 9. Overtime — only fires when crossing 10h
on('ShiftTracking', 'updated', async (row, prev) => {
  const newHours = Number(row.total_hours ?? 0);
  const prevHours = Number(prev?.total_hours ?? 0);
  if (newHours > 10 && prevHours <= 10) {
    const lines = [
      `👤 ${row.employee_name || '-'}`,
      `⏱️ סה"כ ${newHours.toFixed(1)} שעות עבודה`,
      row.effective_hours != null ? `✨ אפקטיביות: ${Number(row.effective_hours).toFixed(1)} שעות` : null,
      row.total_break_minutes ? `☕ הפסקות: ${row.total_break_minutes} דק'` : null,
      row.shift_start ? `🕐 התחיל ב-${fmtTime(row.shift_start)}` : null,
      row.had_meal ? `🍽️ אכל: ${row.meal_details || 'כן'}` : null,
    ];
    await pushoverToAdmins(`⚠️ חריגה בשעות משמרת — ${row.employee_name || '-'}`, join(lines));
  }
  // Geofence auto-close transition
  if (prev?.status !== 'auto_closed' && row.status === 'auto_closed') {
    const lines = [
      `👤 ${row.employee_name || '-'}`,
      `📅 ${fmtDate(row.date)} · ${fmtTime(row.shift_start)}-${fmtTime(row.shift_end)}`,
      row.auto_close_reason ? `📍 סיבה: ${row.auto_close_reason}` : null,
      row.total_hours != null ? `⏱️ סה"כ ${Number(row.total_hours).toFixed(1)} שעות` : null,
    ];
    await pushoverToAdmins(`🚪 משמרת נסגרה אוטומטית — ${row.employee_name || '-'}`, join(lines));
  }
});

// 10. Brief published
on('DailyBrief', 'updated', async (row, prev) => {
  if (prev?.published === true) return;
  if (row.published !== true && row.status !== 'published') return;
  const lines = [
    `📅 ${fmtDate(row.date)} · ${shiftLabel(row.shift_type)}`,
    `👤 מנהל: ${row.created_by_name || '-'}`,
    row.sales_focus ? `💰 דגש מכירה: ${shortText(row.sales_focus, 80)}` : null,
    row.service_focus ? `🛎️ דגש שירות: ${shortText(row.service_focus, 80)}` : null,
    row.operational_focus ? `🏭 דגש תפעולי: ${shortText(row.operational_focus, 80)}` : null,
    row.story_of_the_day ? `🎯 סיפור היום: ${shortText(row.story_of_the_day, 80)}` : null,
  ];
  await pushoverToAdmins(`📢 תדריך פורסם — ${shiftLabel(row.shift_type)} ${fmtDate(row.date)}`, join(lines));
});

// 11. Shift swap request
on('ShiftSwapRequest', 'created', async (row) => {
  const lines = [
    `👤 ${row.requester_name || '-'}${row.target_name ? ` ↔️ ${row.target_name}` : ' מבקש/ת להחליף'}`,
    `📅 ${fmtDate(row.shift_date)} · ${shiftLabel(row.shift_type)}`,
    row.position ? `🎯 תפקיד: ${row.position}` : null,
    row.start_time || row.end_time ? `🕐 ${row.start_time || ''}${row.end_time ? `-${row.end_time}` : ''}` : null,
    row.message ? `📝 ${shortText(row.message, 120)}` : null,
  ];
  await pushoverToAdmins(`🔄 בקשת החלפת משמרת`, join(lines));
});

// 12. Leave request created
on('LeaveRequest', 'created', async (row) => {
  const days = (() => {
    try {
      const s = new Date(row.start_date), e = new Date(row.end_date);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
      }
    } catch {}
    return null;
  })();
  const lines = [
    `👤 ${row.employee_name || '-'}`,
    `🌴 סוג: ${row.leave_type || '-'}`,
    `📅 ${fmtDate(row.start_date)} → ${fmtDate(row.end_date)}${days ? ` (${days} ימים)` : ''}`,
    row.reason ? `📝 סיבה: ${shortText(row.reason, 120)}` : null,
  ];
  await pushoverToAdmins(`🌴 בקשת חופשה חדשה — ${row.employee_name || '-'}`, join(lines));
});

// 13. Leave status update
on('LeaveRequest', 'updated', async (row, prev) => {
  if (prev?.status === row.status) return;
  const lines = [
    `👤 ${row.employee_name || '-'}`,
    `🌴 ${row.leave_type || ''} · ${fmtDate(row.start_date)} → ${fmtDate(row.end_date)}`,
    `סטטוס: ${statusLabel(row.status)}`,
    row.manager_notes ? `📝 ${shortText(row.manager_notes, 120)}` : null,
  ];
  await pushoverToAdmins(`🌴 עדכון סטטוס חופשה`, join(lines));
});

// 14. NEW: Interview scheduled
on('Interview', 'created', async (row) => {
  const typeLabel =
    row.type === 'menu_exam' ? 'בחינת תפריט' :
    row.type === 'initial' ? 'ראיון ראשוני' :
    row.type === 'second' ? 'ראיון שני' :
    row.type || 'ראיון';
  const lines = [
    `👤 ${row.candidate_name || '-'}${row.candidate_phone ? ` · ${row.candidate_phone}` : ''}`,
    `📅 ${fmtDate(row.scheduled_date)} · 🕐 ${row.scheduled_time || '-'}`,
    row.duration_minutes ? `⏱️ ${row.duration_minutes} דק'` : null,
    `🎯 ${typeLabel}`,
    row.notes ? `📝 ${shortText(row.notes, 120)}` : null,
  ];
  await pushoverToAdmins(`📅 ראיון חדש נקבע — ${row.candidate_name || '-'}`, join(lines));
});

// 15. NEW: Job candidate intake — every new candidate triggers a push so
// nothing slips. (intakeJobCandidate function itself pushes only for high
// scores; this guarantees coverage for any creation path.)
//
// IMPORTANT: skip placeholder rows that the partial-save creates before the
// user has actually answered anything ("מועמד בתהליך" with no phone). They
// get upserted as real candidates later when phone/role arrive; we don't want
// a push for every chat-window-open.
on('JobCandidate', 'created', async (row) => {
  const isPlaceholder =
    (!row.full_name || row.full_name === 'מועמד בתהליך' || row.full_name === 'מועמד אנונימי') &&
    !row.phone;
  if (isPlaceholder) return;
  const scoreEmoji =
    row.score == null ? '❓' :
    row.score >= 80 ? '🟢' :
    row.score >= 50 ? '🟡' : '🔴';
  const lines = [
    `👤 ${row.full_name || '-'}${row.age ? ` · ${row.age}` : ''}${row.city ? ` · ${row.city}` : ''}`,
    row.phone ? `📱 ${row.phone}` : null,
    row.role_applied ? `💼 תפקיד: ${row.role_applied}` : null,
    row.experience ? `📚 ניסיון: ${shortText(row.experience, 100)}` : null,
    row.shifts_per_week ? `📅 ${row.shifts_per_week} משמרות/שבוע` : null,
    row.weekend_availability ? '✅ זמין/ה לסופ"ש' : '❌ לא זמין/ה לסופ"ש',
    row.start_date ? `🗓️ תחילת עבודה: ${row.start_date}` : null,
    row.kashrut_capable ? '✡️ מסוגל/ת לכשרות' : null,
    row.source ? `📥 מקור: ${row.source}` : null,
    row.score != null ? `${scoreEmoji} ציון: ${row.score}/100` : null,
    row.ai_summary ? `🤖 ${shortText(row.ai_summary, 140)}` : null,
  ];
  await pushoverToAdmins(`🎯 מועמד גיוס חדש — ${row.full_name || '-'}`, join(lines));
});

// 16. NEW: Event booking — fires on key status transitions
on('EventBooking', 'updated', async (row, prev) => {
  const approvalChanged = prev?.approval_status !== row.approval_status;
  const statusChanged = prev?.status !== row.status;
  if (!approvalChanged && !statusChanged) return;

  const baseLines = [
    `👤 ${row.customer_name || '-'}${row.customer_phone ? ` · ${row.customer_phone}` : ''}`,
    `📅 ${fmtDate(row.event_date)} · 🕐 ${row.event_time || '-'}`,
    `👥 ${row.guest_count || '-'} אורחים`,
    row.hours_window ? `⏰ חלון: ${row.hours_window}` : null,
    row.selected_menu?.name ? `🍽️ תפריט: ${row.selected_menu.name}` : null,
    row.subtotal_ils != null ? `📊 סאב-טוטל: ${fmtMoney(row.subtotal_ils)}` : null,
    row.discount_pct ? `🎫 הנחה: ${row.discount_pct}%` : null,
    row.total_ils != null ? `💰 סה"כ: ${fmtMoney(row.total_ils)}` : null,
    row.deposit_amount_ils != null ? `💳 מקדמה: ${fmtMoney(row.deposit_amount_ils)}` : null,
    row.short_notice ? '⚡ same-day!' : null,
    row.notes ? `📝 ${shortText(row.notes, 100)}` : null,
  ];

  if (approvalChanged && row.approval_status === 'approved') {
    await pushoverEventsOwners(
      row.short_notice ? `⚡ אירוע same-day נסגר!` : `🎉 אירוע נסגר — אישר ע"י מנהל`,
      join([...baseLines, row.approval_notes ? `📝 הערות: ${shortText(row.approval_notes, 100)}` : null]),
    );
    return;
  }
  if (approvalChanged && row.approval_status === 'rejected') {
    await pushoverEventsOwners(
      `❌ אירוע נדחה ע"י מנהל`,
      join([...baseLines, row.approval_notes ? `📝 סיבה: ${shortText(row.approval_notes, 120)}` : null]),
    );
    return;
  }
  // First time we see a confirmed status (lead became a booking)
  if (statusChanged && (row.status === 'confirmed' || row.status === 'pending_manager_callback')) {
    await pushoverEventsOwners(
      row.status === 'pending_manager_callback'
        ? `🎯 אירוע נסגר — התקשר ללקוח`
        : `🎉 אירוע אושר`,
      join(baseLines),
    );
  }
});

// 17. NEW: Event booking created (initial booking record)
on('EventBooking', 'created', async (row) => {
  const lines = [
    `👤 ${row.customer_name || '-'}${row.customer_phone ? ` · ${row.customer_phone}` : ''}`,
    `📅 ${fmtDate(row.event_date)} · 🕐 ${row.event_time || '-'}`,
    `👥 ${row.guest_count || '-'} אורחים`,
    row.total_ils != null ? `💰 סה"כ: ${fmtMoney(row.total_ils)}` : null,
    row.deposit_amount_ils != null ? `💳 מקדמה: ${fmtMoney(row.deposit_amount_ils)}` : null,
    row.source ? `📥 מקור: ${row.source}` : null,
    row.short_notice ? '⚡ same-day!' : null,
  ];
  await pushoverEventsOwners(`📋 הזמנת אירוע נוצרה — ${row.customer_name || '-'}`, join(lines));
});

// ─────────────────── Web Push (to the affected employee, free) ──────
// Uses the same Employee.push_subscription the staff page already populates.

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

// ─────────────────── WhatsApp alerts (admin numbers, real-time) ─────
// All handlers are fire-and-forget so a Twilio outage never affects the
// originating create/update. Builders live in lib/whatsappAlerts.ts.

on('EventLead', 'created', async (row) => {
  // Only fire when Dana already pulled at least a phone — avoids noisy
  // alerts on the very first message ("היי" before name/phone collected).
  if (!row?.contact_phone) return;
  await alertNewEventLead(row);
});

on('CustomerFeedback', 'created', async (row) => { await alertBadCustomerFeedback(row); });
on('Incident',         'created', async (row) => { await alertCriticalIncident(row); });
on('Reservation',      'created', async (row) => { await alertLargeReservation(row); });
on('ShiftEndReport',   'created', async (row) => { await alertCashDiscrepancy(row); });

console.log('[triggers] registered for:', Object.keys(handlers).join(', '));
