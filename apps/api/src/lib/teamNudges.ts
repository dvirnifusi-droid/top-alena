// Team nudges — the "always-awake operations manager" over WhatsApp.
// Personal 1:1 reminders to exactly the employees who need them (never a
// group blast): availability not submitted, scheduled-but-not-clocked-in,
// shift checklist incomplete — plus an owner broadcast tool resolver.
//
// Design rules:
// - Every nudge is deduped via a WhatsAppMessage log row (status='nudge',
//   raw.dedup_key) so a 5-min timer tick never double-sends.
// - Dual channel: WhatsApp (free-form; delivers within a 24h session) + web
//   push (notifyEmployee) as backup for employees without an open session.
// - Owner gets a summary of every batch through reportRecipientPhones().
// - NO clock-based state resets (owner rule) — nudges are deadline reminders
//   only; they change nothing.
// - Default-enabled on the flagship tenant only; other tenants opt in via
//   RestaurantProfile.team_nudges (JSONB) so no owner is surprised.

import { prisma } from '../db.js';
import { sendWhatsApp } from './twilio.js';
import { notifyEmployee } from './notifications.js';
import { reportRecipientPhones } from './whatsappPermissions.js';

const db = prisma as any;

const APP_BASE = () =>
  (process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || `https://${process.env.TENANT_SLUG || 'topalena'}.topalena.com`).replace(/\/$/, '');

// ── config ──────────────────────────────────────────────────────────────────
export type NudgeConfig = {
  enabled: boolean;
  availability: { enabled: boolean; days: number[]; hour: number }; // IL weekday (0=Sun) + hour to remind non-submitters
  clockin: { enabled: boolean; delay_min: number };                 // minutes after shift start before nudging
  checklist: { enabled: boolean; morning_hour: number; evening_hour: number }; // completion checkpoints
};

const DEFAULTS: NudgeConfig = {
  enabled: (process.env.TENANT_SLUG || 'alena') === 'alena',
  availability: { enabled: true, days: [3, 4], hour: 10 }, // Wed + Thu 10:00
  clockin: { enabled: true, delay_min: 35 },
  checklist: { enabled: true, morning_hour: 11, evening_hour: 19 },
};

export async function getNudgeConfig(): Promise<NudgeConfig> {
  try {
    const rows: any[] = await db.$queryRawUnsafe(`SELECT team_nudges FROM "RestaurantProfile" LIMIT 1`);
    const o = rows[0]?.team_nudges;
    if (o && typeof o === 'object') {
      return {
        enabled: o.enabled ?? DEFAULTS.enabled,
        availability: { ...DEFAULTS.availability, ...(o.availability || {}) },
        clockin: { ...DEFAULTS.clockin, ...(o.clockin || {}) },
        checklist: { ...DEFAULTS.checklist, ...(o.checklist || {}) },
      };
    }
  } catch { /* column may not exist yet — defaults */ }
  return DEFAULTS;
}

// ── helpers ─────────────────────────────────────────────────────────────────
const ilParts = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    dateStr: `${get('year')}-${get('month')}-${get('day')}`,
    day: wd < 0 ? new Date().getDay() : wd,
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
  };
};

const norm = (s: any) => String(s || '').trim().toLowerCase();
const digits = (p: any) => String(p || '').replace(/\D/g, '');

async function alreadySent(dedupKey: string): Promise<boolean> {
  try {
    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT id FROM "WhatsAppMessage" WHERE status='nudge' AND raw->>'dedup_key' = $1 LIMIT 1`, dedupKey);
    return !!rows[0];
  } catch { return false; }
}

async function logNudge(contactPhone: string, body: string, dedupKey: string, kind: string) {
  try {
    await db.$executeRawUnsafe(
      `INSERT INTO "WhatsAppMessage" ("id","direction","from_phone","to_phone","contact_phone","body","status","raw","created_at")
       VALUES (gen_random_uuid()::text,'outbound','system',$1,$1,$2,'nudge',$3::jsonb,NOW())`,
      contactPhone, body, JSON.stringify({ kind, dedup_key: dedupKey }),
    );
  } catch (e: any) { console.warn('[nudge] log failed:', e?.message); }
}

async function sendNudge(emp: { id?: string; full_name?: string; phone?: string }, body: string, dedupKey: string, kind: string): Promise<boolean> {
  if (!emp.phone) return false;
  let sent = false;
  try { const r: any = await sendWhatsApp(emp.phone, body); sent = !r?.skipped; } catch { /* fall through to push */ }
  try { await notifyEmployee(emp.id, 'תזכורת מההנהלה 📢', body.slice(0, 180)); } catch { /* best-effort */ }
  await logNudge(digits(emp.phone), body, dedupKey, kind);
  return sent;
}

async function ownerSummary(text: string) {
  try {
    const phones = await reportRecipientPhones();
    for (const p of phones) { try { await sendWhatsApp(p, text); } catch { /* per-phone best-effort */ } }
  } catch (e: any) { console.warn('[nudge] owner summary failed:', e?.message); }
}

async function activeEmployees(): Promise<any[]> {
  try { return await db.$queryRawUnsafe(`SELECT id, full_name, phone, department, role FROM "Employee" WHERE status='active'`); }
  catch { return []; }
}

const staffMatches = (emp: any, a: any) =>
  (a?.employee_id && String(a.employee_id) === String(emp.id)) ||
  (a?.id && String(a.id) === String(emp.id)) ||
  ((a?.name || a?.employee_name || a?.full_name) && norm(a.name || a.employee_name || a.full_name) === norm(emp.full_name));

// ── nudge 1: availability not submitted ────────────────────────────────────
async function checkAvailability(cfg: NudgeConfig) {
  if (cfg.availability.enabled === false) return;
  const now = ilParts();
  if (!cfg.availability.days.includes(now.day) || now.hour !== cfg.availability.hour) return;

  // next week window (Sunday-based, IL)
  const base = new Date(`${now.dateStr}T12:00:00Z`);
  const daysToSunday = (7 - now.day) % 7 || 7;
  const start = new Date(base.getTime() + daysToSunday * 86_400_000);
  const end = new Date(start.getTime() + 7 * 86_400_000);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const batchKey = `avail_${startStr}_d${now.day}`;
  if (await alreadySent(batchKey)) return;
  await logNudge('system', `batch ${batchKey}`, batchKey, 'availability_batch');

  const [emps, submitted]: [any[], any[]] = await Promise.all([
    activeEmployees(),
    db.$queryRawUnsafe(
      `SELECT DISTINCT employee_id, employee_name FROM "EmployeeAvailability" WHERE date >= $1::date AND date < $2::date`,
      startStr, endStr,
    ).catch(() => []),
  ]);
  const submittedIds = new Set(submitted.map((s: any) => String(s.employee_id)));
  const submittedNames = new Set(submitted.map((s: any) => norm(s.employee_name)));
  const missing = emps.filter((e) => e.phone && !submittedIds.has(String(e.id)) && !submittedNames.has(norm(e.full_name)));
  if (!missing.length) { await ownerSummary(`✅ תזכורת זמינות: כל העובדים כבר הגישו לשבוע ${startStr}. אין למי להזכיר.`); return; }

  let sent = 0;
  for (const emp of missing) {
    const first = String(emp.full_name || '').split(' ')[0] || 'היי';
    const body =
      `היי ${first} 👋\n` +
      `תזכורת מההנהלה — עדיין לא הגשת זמינות לשבוע הבא (${start.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}-${new Date(end.getTime() - 86_400_000).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}).\n` +
      `בלי הגשה אי אפשר לשבץ אותך 🙏\n` +
      `🔗 ${APP_BASE()}/EmployeeAvailability`;
    if (await sendNudge(emp, body, `${batchKey}_${emp.id}`, 'availability')) sent++;
  }
  await ownerSummary(`📣 תזכורת זמינות לשבוע ${startStr}: נשלחה ל-${sent}/${missing.length} עובדים שטרם הגישו:\n${missing.slice(0, 15).map((e) => `• ${e.full_name}`).join('\n')}`);
}

// ── nudge 2: scheduled but not clocked in ──────────────────────────────────
async function checkClockIn(cfg: NudgeConfig) {
  if (cfg.clockin.enabled === false) return;
  const now = ilParts();
  const nowMin = now.hour * 60 + now.minute;
  const shifts: any[] = await db.$queryRawUnsafe(
    `SELECT id, start_time, shift_type, assigned_staff FROM "WorkShift" WHERE date::date = $1::date`, now.dateStr,
  ).catch(() => []);
  if (!shifts.length) return;

  const [emps, todayTracking]: [any[], any[]] = await Promise.all([
    activeEmployees(),
    db.$queryRawUnsafe(
      `SELECT employee_id, employee_name FROM "ShiftTracking" WHERE shift_start::date = $1::date`, now.dateStr,
    ).catch(() => []),
  ]);
  const clockedIds = new Set(todayTracking.map((t: any) => String(t.employee_id)));
  const clockedNames = new Set(todayTracking.map((t: any) => norm(t.employee_name)));

  const nudged: string[] = [];
  for (const ws of shifts) {
    if (!ws.start_time || !/^\d{2}:\d{2}/.test(String(ws.start_time))) continue;
    const [hh, mm] = String(ws.start_time).slice(0, 5).split(':').map(Number);
    const startMin = hh * 60 + mm;
    const lateBy = nowMin - startMin;
    // only inside the (delay, delay+90min) window — old shifts stay quiet
    if (lateBy < cfg.clockin.delay_min || lateBy > cfg.clockin.delay_min + 90) continue;

    const staff = Array.isArray(ws.assigned_staff) ? ws.assigned_staff : [];
    for (const a of staff) {
      const emp = emps.find((e) => staffMatches(e, a));
      if (!emp?.phone) continue;
      if (clockedIds.has(String(emp.id)) || clockedNames.has(norm(emp.full_name))) continue;
      const key = `clockin_${now.dateStr}_${ws.id}_${emp.id}`;
      if (await alreadySent(key)) continue;
      const first = String(emp.full_name || '').split(' ')[0] || 'היי';
      const body =
        `היי ${first} 👋\n` +
        `שים/י לב — את/ה משובץ/ת למשמרת שהתחילה ב-${String(ws.start_time).slice(0, 5)} ועדיין אין החתמת כניסה.\n` +
        `אם את/ה כבר פה — תחתום/י עכשיו 🙏 ואם יש בעיה, עדכנו את המנהל.\n` +
        `🔗 ${APP_BASE()}/EmployeeHome`;
      if (await sendNudge(emp, body, key, 'clockin')) nudged.push(`${emp.full_name} (${String(ws.start_time).slice(0, 5)})`);
    }
  }
  if (nudged.length) await ownerSummary(`⏰ נשלחו תזכורות החתמת כניסה:\n${nudged.map((n) => `• ${n}`).join('\n')}`);
}

// ── nudge 3: shift checklist incomplete at checkpoint ──────────────────────
async function checkChecklists(cfg: NudgeConfig) {
  if (cfg.checklist.enabled === false) return;
  const now = ilParts();
  let slot: 'morning' | 'evening' | null = null;
  if (now.hour === cfg.checklist.morning_hour) slot = 'morning';
  else if (now.hour === cfg.checklist.evening_hour) slot = 'evening';
  if (!slot) return;

  const batchKey = `ck_${now.dateStr}_${slot}`;
  if (await alreadySent(batchKey)) return;
  await logNudge('system', `batch ${batchKey}`, batchKey, 'checklist_batch');

  const wanted = slot === 'morning' ? ['morning', 'all'] : now.day === 4 ? ['evening', 'thursday', 'all'] : ['evening', 'all'];
  const checklists: any[] = await db.$queryRawUnsafe(
    `SELECT id, title, shift, items FROM "Checklist" WHERE status='active'`,
  ).catch(() => []);
  const relevant = checklists.filter((c) => wanted.includes(String(c.shift || 'all')));
  if (!relevant.length) return;

  const incomplete: Array<{ title: string; done: number; total: number }> = [];
  for (const cl of relevant) {
    const total = Array.isArray(cl.items) ? cl.items.length : 0;
    if (!total) continue;
    const runs: any[] = await db.$queryRawUnsafe(
      `SELECT results FROM "ChecklistExecution"
       WHERE checklist_id = $1 AND id LIKE 'live\\_%'
         AND COALESCE(status,'in_progress') NOT IN ('completed','requires_attention')
       ORDER BY "createdAt" DESC LIMIT 1`, cl.id,
    ).catch(() => []);
    // completed today already? then it's done — skip
    const doneToday: any[] = await db.$queryRawUnsafe(
      `SELECT id FROM "ChecklistExecution"
       WHERE checklist_id = $1 AND status IN ('completed','requires_attention') AND "updatedAt"::date = $2::date LIMIT 1`,
      cl.id, now.dateStr,
    ).catch(() => []);
    if (doneToday[0]) continue;
    const res = runs[0]?.results && typeof runs[0].results === 'object' && !Array.isArray(runs[0].results) ? runs[0].results : {};
    const done = Object.values(res).filter((v: any) => v?.checked).length;
    if (done < total) incomplete.push({ title: cl.title, done, total });
  }
  if (!incomplete.length) return;

  // nudge whoever is clocked-in right now (they're the ones on shift)
  const onShift: any[] = await db.$queryRawUnsafe(
    `SELECT employee_id, employee_name FROM "ShiftTracking"
     WHERE shift_start::date = $1::date AND shift_end IS NULL`, now.dateStr,
  ).catch(() => []);
  const emps = await activeEmployees();
  const recipients: any[] = [];
  for (const t of onShift) {
    const emp = emps.find((e) => String(e.id) === String(t.employee_id) || norm(e.full_name) === norm(t.employee_name));
    if (emp?.phone && !recipients.some((r) => r.id === emp.id)) recipients.push(emp);
  }
  const list = incomplete.map((c) => `• ${c.title} — ${c.done}/${c.total} בוצעו`).join('\n');
  let sent = 0;
  for (const emp of recipients.slice(0, 8)) {
    const first = String(emp.full_name || '').split(' ')[0] || 'היי';
    const body = `היי ${first} 👋\nתזכורת מההנהלה — יש צ'קליסטים שעוד לא הושלמו למשמרת:\n${list}\n🔗 ${APP_BASE()}/Checklists`;
    if (await sendNudge(emp, body, `${batchKey}_${emp.id}`, 'checklist')) sent++;
  }
  await ownerSummary(`📋 צ'קליסטים לא הושלמו (${slot === 'morning' ? 'בוקר' : 'ערב'}):\n${list}\n${sent ? `נשלחה תזכורת ל-${sent} עובדים במשמרת.` : 'אין עובדים מוחתמים כרגע — לא נשלחו תזכורות.'}`);
}

// ── owner broadcast (used by the WhatsApp agent tool) ───────────────────────
export async function resolveBroadcastRecipients(audience: string, department?: string): Promise<any[]> {
  const emps = (await activeEmployees()).filter((e) => e.phone);
  if (audience === 'department' && department) {
    const d = norm(department);
    return emps.filter((e) => norm(e.department).includes(d) || norm(e.role).includes(d));
  }
  if (audience === 'tonight' || audience === 'today') {
    const now = ilParts();
    const shifts: any[] = await db.$queryRawUnsafe(
      `SELECT assigned_staff FROM "WorkShift" WHERE date::date = $1::date`, now.dateStr,
    ).catch(() => []);
    const out: any[] = [];
    for (const ws of shifts) {
      const staff = Array.isArray(ws.assigned_staff) ? ws.assigned_staff : [];
      for (const a of staff) {
        const emp = emps.find((e) => staffMatches(e, a));
        if (emp && !out.some((o) => o.id === emp.id)) out.push(emp);
      }
    }
    return out;
  }
  return emps;
}

export async function sendTeamBroadcast(message: string, audience: string, department?: string): Promise<{ sent: number; total: number; names: string[] }> {
  const recipients = await resolveBroadcastRecipients(audience, department);
  let sent = 0;
  const stamp = Date.now();
  for (const emp of recipients) {
    const body = `📢 הודעה מההנהלה:\n${message}`;
    if (await sendNudge(emp, body, `broadcast_${stamp}_${emp.id}`, 'broadcast')) sent++;
  }
  return { sent, total: recipients.length, names: recipients.map((r) => String(r.full_name)) };
}

// ── timer entry point (called every ~5 min from load.ts) ───────────────────
export async function checkTeamNudges() {
  const cfg = await getNudgeConfig();
  if (!cfg.enabled) return;
  try { await checkAvailability(cfg); } catch (e: any) { console.error('[nudge] availability:', e?.message); }
  try { await checkClockIn(cfg); } catch (e: any) { console.error('[nudge] clockin:', e?.message); }
  try { await checkChecklists(cfg); } catch (e: any) { console.error('[nudge] checklist:', e?.message); }
}
