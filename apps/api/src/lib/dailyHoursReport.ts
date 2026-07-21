// Daily staff-hours report — sent to admins via WhatsApp + Push + Email on the
// owner's schedule (Sun–Wed 01:00, Thu 03:30, Fri 17:00, Sat 02:00 Israel time).
//
// Content: every employee (ALL roles, not just tipped) with their actual hours
// for shifts that CLOSED since the previous report (rolling window), flagging
// outliers: a shift ≥10h, and anyone who was on the schedule but has no updated
// hours yet (tips not locked / no clock-out).
//
// Sources: actual hours from ShiftTracking (geofence clock-out + the tips-lock
// sync); the planned roster from WorkShift (to catch scheduled-but-missing).
//
// TZ-safe by construction: the schedule check computes Israel time itself, so it
// works regardless of the host/container clock — no crontab needed, an in-process
// timer (bootstrapped from load.ts) ticks every ~5min and fires once per slot.
import { prisma } from '../db.js';
import { sendWhatsApp } from './twilio.js';
import { notifyOwner } from './waTemplates.js';
import { pushoverToAdmins } from './pushover.js';
import { sendEmail } from './email.js';
import { reportRecipientPhones } from './whatsappPermissions.js';
import { isNotifEnabled, notifSlot } from './notificationSettings.js';

const db = prisma as any;
const TZ = 'Asia/Jerusalem';

// Israel wall-clock date/time parts for a given instant.
function ilParts(d: Date = new Date()) {
  const ymd = d.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
  const hm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const [hh, mm] = hm.split(':').map(n => parseInt(n, 10));
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat (from the YMD, stable)
  return { ymd, hh, mm, dow, minutes: hh * 60 + mm };
}

// Minutes to add to UTC to reach Israel time, for the given instant (IST/IDT).
function ilOffsetMin(d: Date): number {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
      .formatToParts(d).find(p => p.type === 'timeZoneName')?.value || 'GMT+3';
    const m = s.match(/GMT([+-]?\d{1,2})(?::(\d{2}))?/);
    if (!m) return 180;
    const h = parseInt(m[1], 10);
    return h * 60 + (h < 0 ? -1 : 1) * parseInt(m[2] || '0', 10);
  } catch { return 180; }
}

// A YYYY-MM-DD + "HH:mm" Israel wall time -> the real UTC instant.
function wallToUtc(ymd: string, hhmm: string, addDays = 0): Date {
  const [hh, mm] = String(hhmm || '00:00').split(':').map(n => parseInt(n, 10) || 0);
  const base = new Date(`${ymd}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + addDays);
  const approx = new Date(base.getTime() + (hh * 60 + mm) * 60000);
  return new Date(approx.getTime() - ilOffsetMin(approx) * 60000);
}

// Send slot per Israel weekday (0=Sun). "HH:mm" local.
const SLOTS: Record<number, string> = {
  0: '01:00', 1: '01:00', 2: '01:00', 3: '01:00', // Sun–Wed
  4: '03:30', // Thu
  5: '17:00', // Fri
  6: '02:00', // Sat (motzash)
};

const DAY_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function fmtRange(since: Date, now: Date): string {
  const f = (d: Date) => new Intl.DateTimeFormat('he-IL', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${f(since)} → ${f(now)}`;
}

export type HoursRow = {
  employee_id: string;
  name: string;
  role: string;
  hours: number | null;      // actual effective hours, null when scheduled-but-missing
  shift_type: string | null;
  tracking_id: string | null;
  flags: string[];           // 'long' | 'missing'
};

// Build the report for shifts that closed in (since, now].
export async function buildDailyHoursReport(since: Date, now: Date = new Date()): Promise<{
  rows: HoursRow[]; text: string; html: string; count: number; totalHours: number; flagged: number;
}> {
  // Dates spanned by the window (Israel), for the WorkShift roster query.
  const sinceYMD = since.toLocaleDateString('en-CA', { timeZone: TZ });
  const nowYMD = now.toLocaleDateString('en-CA', { timeZone: TZ });
  const dateSet = new Set<string>([sinceYMD, nowYMD]);

  // ── Actual hours — ShiftTracking rows that CLOSED in the window ──
  const tracks: any[] = await db.shiftTracking.findMany({
    where: { shift_end: { gte: since, lte: now } },
    take: 500,
  }).catch(() => []);

  // ── Planned roster — WorkShift for the spanned dates whose shift already ended
  //    within the window (so we don't flag a shift that hasn't happened yet) ──
  const dayStart = new Date(`${sinceYMD}T00:00:00.000Z`); dayStart.setUTCDate(dayStart.getUTCDate() - 1);
  const dayEnd = new Date(`${nowYMD}T23:59:59.999Z`);
  const shifts: any[] = await db.workShift.findMany({
    where: { date: { gte: dayStart, lte: dayEnd } },
    take: 200,
  }).catch(() => []);

  const rowsById = new Map<string, HoursRow>();
  const actualByEmp = new Map<string, any>();
  const actualByName = new Map<string, any>();
  const normName = (s: any) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  for (const t of tracks) {
    const hrs = Number(t.total_hours ?? t.effective_hours) || 0;
    // Index by id AND by name. A clock-in recorded under a NAME but a null/other
    // employee_id (geofence / name-based clock — very common) must still count,
    // otherwise a scheduled employee who actually worked is falsely flagged
    // "no hours". Keep the largest closed row per key (double-shift merged view).
    if (t.employee_id) {
      const prev = actualByEmp.get(t.employee_id);
      if (!prev || hrs > (Number(prev.total_hours ?? prev.effective_hours) || 0)) actualByEmp.set(t.employee_id, t);
    }
    const nm = normName(t.employee_name);
    if (nm) {
      const prevN = actualByName.get(nm);
      if (!prevN || hrs > (Number(prevN.total_hours ?? prevN.effective_hours) || 0)) actualByName.set(nm, t);
    }
  }

  // Names + roles for everyone involved.
  const involvedIds = new Set<string>([...actualByEmp.keys()]);
  const rosterByEmp = new Map<string, { role: string; shift_type: string; ended: boolean }>();
  for (const ws of shifts) {
    const wsYMD = (ws.date instanceof Date ? ws.date.toISOString() : String(ws.date)).slice(0, 10);
    if (!dateSet.has(wsYMD)) continue;
    const endedAt = wallToUtc(wsYMD, ws.end_time || '23:59', (ws.end_time && ws.start_time && ws.end_time < ws.start_time) ? 1 : 0);
    const closedInWindow = endedAt.getTime() <= now.getTime() && endedAt.getTime() >= since.getTime();
    const staff = Array.isArray(ws.assigned_staff) ? ws.assigned_staff : [];
    for (const a of staff) {
      if (!a?.employee_id) continue;
      involvedIds.add(a.employee_id);
      if (closedInWindow && !rosterByEmp.has(a.employee_id)) {
        rosterByEmp.set(a.employee_id, { role: a.position || '', shift_type: ws.shift_type || '', ended: true });
      }
    }
  }

  const emps: any[] = involvedIds.size
    ? await db.employee.findMany({ where: { id: { in: [...involvedIds] } }, select: { id: true, full_name: true, role: true } }).catch(() => [])
    : [];
  const empById = new Map(emps.map(e => [e.id, e]));

  // Assemble one row per involved employee.
  for (const id of involvedIds) {
    const emp = empById.get(id);
    const roster = rosterByEmp.get(id);
    // Prefer the id match; fall back to an exact name match so a clock-in recorded
    // under this employee's name (but no/other id) is credited instead of flagged.
    let track = actualByEmp.get(id);
    if (!track) {
      const nm = normName(emp?.full_name);
      if (nm && actualByName.has(nm)) track = actualByName.get(nm);
    }
    const name = track?.employee_name || emp?.full_name || 'עובד';
    const role = roster?.role || emp?.role || '';
    const flags: string[] = [];
    let hours: number | null = null;
    let shift_type: string | null = roster?.shift_type || track?.shift_type || null;
    let tracking_id: string | null = null;
    if (track) {
      hours = Math.round((Number(track.total_hours ?? track.effective_hours) || 0) * 100) / 100;
      tracking_id = track.id;
      if (hours >= 10) flags.push('long');
    } else if (roster?.ended) {
      // Scheduled, shift is over, but no updated hours → the outlier the owner asked for.
      flags.push('missing');
    } else {
      continue; // scheduled but shift not over yet — not in scope this report
    }
    rowsById.set(id, { employee_id: id, name, role, hours, shift_type, tracking_id, flags });
  }

  const rows = [...rowsById.values()].sort((a, b) => (b.hours ?? -1) - (a.hours ?? -1));
  const totalHours = Math.round(rows.reduce((s, r) => s + (r.hours || 0), 0) * 100) / 100;
  const flagged = rows.filter(r => r.flags.length).length;

  // ── WhatsApp text ──
  const roleTag = (r: string) => (r ? ` _(${r})_` : '');
  const lines: string[] = [`🕐 *דוח שעות יומי*`, `_${fmtRange(since, now)}_`, ''];
  if (!rows.length) {
    lines.push('אין משמרות שנסגרו מאז הדוח הקודם.');
  } else {
    for (const r of rows) {
      if (r.hours == null) lines.push(`• ${r.name}${roleTag(r.role)} — ⚠️ בסידור, לא נמצאה החתמת שעון`);
      else lines.push(`• ${r.name}${roleTag(r.role)} — *${r.hours.toFixed(2)}* שע'${r.flags.includes('long') ? ' ⚠️ משמרת ארוכה' : ''}`);
    }
    lines.push('', `📊 סה"כ: *${rows.length}* עובדים · *${totalHours.toFixed(2)}* שעות${flagged ? ` · ⚠️ *${flagged}* חריגים` : ''}`);
  }
  lines.push('', '↩️ השב *"מאושר"* לאישור הדוח, או שלח תיקון (למשל: _"דני 6 שעות"_).');
  const text = lines.join('\n');

  // ── Email HTML ──
  const htmlRows = rows.map(r => {
    const flag = r.hours == null ? '<span style="color:#b45309">⚠️ אין שעות מעודכנות</span>'
      : r.flags.includes('long') ? '<span style="color:#b45309">⚠️ משמרת ארוכה</span>' : '';
    return `<tr><td style="padding:4px 8px">${r.name}</td><td style="padding:4px 8px;color:#6b7280">${r.role || ''}</td><td style="padding:4px 8px;text-align:center;font-weight:700">${r.hours == null ? '—' : r.hours.toFixed(2)}</td><td style="padding:4px 8px">${flag}</td></tr>`;
  }).join('');
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;color:#1f2937">
    <h2 style="color:#A04A2E">🕐 דוח שעות יומי</h2>
    <p style="color:#6b7280">${fmtRange(since, now)}</p>
    ${rows.length ? `<table style="border-collapse:collapse;width:100%"><thead><tr style="background:#F4ECD8"><th style="padding:6px 8px;text-align:right">עובד</th><th style="padding:6px 8px;text-align:right">תפקיד</th><th style="padding:6px 8px">שעות</th><th style="padding:6px 8px">חריג</th></tr></thead><tbody>${htmlRows}</tbody></table>
    <p style="margin-top:12px"><b>סה"כ:</b> ${rows.length} עובדים · ${totalHours.toFixed(2)} שעות${flagged ? ` · ${flagged} חריגים` : ''}</p>` : '<p>אין משמרות שנסגרו מאז הדוח הקודם.</p>'}
    <p style="color:#6b7280;font-size:13px">להשיב על הדוח — בוואטסאפ: "מאושר" או תיקון כמו "דני 6 שעות".</p>
  </div>`;

  return { rows, text, html, count: rows.length, totalHours, flagged };
}

// Recipients for email — admin/owner users with an email on file.
async function adminEmails(): Promise<string[]> {
  const users: any[] = await db.user.findMany({
    where: { role: { in: ['owner', 'admin', 'manager'] }, email: { not: null } },
    select: { email: true },
  }).catch(() => []);
  const set = new Set<string>(users.map(u => u.email).filter(Boolean));
  (process.env.DAILY_HOURS_REPORT_EMAILS || '').split(',').map(s => s.trim()).filter(Boolean).forEach(e => set.add(e));
  return [...set];
}

// Build + send on all three channels, then advance the cursor + snapshot.
export async function sendDailyHoursReport(opts: { force?: boolean } = {}): Promise<{
  ok: boolean; sent: { whatsapp: number; push: boolean; email: number }; count: number; flagged: number; skipped?: string;
}> {
  const now = new Date();
  const profile = await db.restaurantProfile.findFirst().catch(() => null);
  const since: Date = profile?.last_daily_hours_report_at
    ? new Date(profile.last_daily_hours_report_at)
    : new Date(now.getTime() - 26 * 3600 * 1000);

  const report = await buildDailyHoursReport(since, now);

  // WhatsApp → this tenant's own owner (env admins only on the alena platform
  // tenant). Prevents every tenant container from sending its report to the
  // shared admin number.
  const phones = await reportRecipientPhones();
  let waSent = 0;
  for (const p of phones) {
    // Owner report: template when approved (reaches the owner outside the 24h
    // window), SMS otherwise. Was free-form only — silently dropped if the owner
    // had not messaged the bot that day.
    try {
      const r = await notifyOwner(p, 'דוח שעות יומי', report.text, {
        link: `${process.env.PUBLIC_BASE_URL || 'https://topalena.com'}/LaborCost`,
      });
      if (r.sent) waSent++;
    } catch (e: any) { console.warn('[daily-hours] wa failed', { p, err: e?.message }); }
  }

  // Push → admins (short summary).
  let pushOk = false;
  try {
    const summary = report.count
      ? `${report.count} עובדים · ${report.totalHours.toFixed(1)} שע'${report.flagged ? ` · ${report.flagged} חריגים ⚠️` : ''}`
      : 'אין משמרות חדשות';
    await pushoverToAdmins('🕐 דוח שעות יומי', summary + '\nפרטים בוואטסאפ/מייל');
    pushOk = true;
  } catch (e: any) { console.warn('[daily-hours] push failed', e?.message); }

  // Email → admin/owner users.
  const emails = await adminEmails();
  let emailSent = 0;
  for (const to of emails) {
    try { await sendEmail({ to, subject: `🕐 דוח שעות יומי — ${now.toLocaleDateString('he-IL', { timeZone: TZ })}`, html: report.html, text: report.text }); emailSent++; }
    catch (e: any) { console.warn('[daily-hours] email failed', { to, err: e?.message }); }
  }

  // Advance the cursor so the next report covers only what's new, and stash the
  // snapshot for the WhatsApp approve/correct flow.
  if (profile?.id) {
    await db.restaurantProfile.update({
      where: { id: profile.id },
      data: { last_daily_hours_report_at: now, daily_hours_report_snapshot: { at: now.toISOString(), since: since.toISOString(), rows: report.rows } },
    }).catch((e: any) => console.warn('[daily-hours] cursor update failed', e?.message));
  }

  console.log('[daily-hours] sent', { wa: waSent, push: pushOk, email: emailSent, count: report.count, flagged: report.flagged });
  return { ok: true, sent: { whatsapp: waSent, push: pushOk, email: emailSent }, count: report.count, flagged: report.flagged };
}

// TZ-safe scheduler tick — call every ~5 min. Fires once per slot (12h throttle).
export async function checkDailyHoursReportSchedule(): Promise<void> {
  try {
    if (!(await isNotifEnabled('daily_hours_report'))) return; // owner turned it off
    if (!(await reportRecipientPhones()).length) return; // no owner for this tenant → don't send
    const now = new Date();
    const { dow, minutes } = ilParts(now);
    const slot = await notifSlot('daily_hours_report', dow, SLOTS); // owner-editable per-weekday time
    if (!slot) return;
    const [sh, sm] = slot.split(':').map(n => parseInt(n, 10));
    const slotMin = sh * 60 + sm;
    // Fire only inside the 20-minute window after the slot.
    if (minutes < slotMin || minutes >= slotMin + 20) return;
    // Dedup: nothing sent in the last 12h (slots are ≥23h apart, so this is safe).
    const profile = await db.restaurantProfile.findFirst().catch(() => null);
    const last = profile?.last_daily_hours_report_at ? new Date(profile.last_daily_hours_report_at).getTime() : 0;
    if (last && now.getTime() - last < 12 * 3600 * 1000) return;
    await sendDailyHoursReport();
  } catch (e: any) {
    console.error('[daily-hours] schedule check failed', e?.message);
  }
}
