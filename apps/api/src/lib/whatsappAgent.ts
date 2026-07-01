// WhatsApp admin agent — routes inbound messages from owner/manager phones to
// READ-only commands and replies with a free-form WhatsApp message (works
// inside the 24h session window which the inbound message itself opens).
//
// Hard rules baked into this file:
//  • Only numbers in WHATSAPP_ADMIN_NUMBERS env get routed here.
//  • READ commands only — no entity writes from inbound text. Write actions
//    (assign staff, send contract, etc.) come in a later commit with a
//    two-step confirmation flow.
//  • Returns null when the message isn't a recognized command, so the regular
//    inbox-archival flow continues to handle it.
import { prisma } from '../db.js';
import { buildTodayOverview, listOpenTasks } from './whatsappCalendar.js';
import { buildConsentUrl, isGoogleConnected } from './googleSync.js';
import { buildMorningBrief, buildEndOfDayBrief } from './morningBrief.js';
import { buildPersonalReport } from './personalReport.js';

// Strip 'whatsapp:+972...' / '+972...' / '0532...' down to a digit-only
// canonical form so we can match against the env allowlist regardless of
// how the user typed it.
function canonicalizePhone(raw: string): string {
  if (!raw) return '';
  let s = String(raw).replace(/^whatsapp:/i, '').replace(/[^\d]/g, '');
  if (s.startsWith('972')) s = '0' + s.slice(3);
  return s;
}

function adminAllowlist(): Set<string> {
  const raw = process.env.WHATSAPP_ADMIN_NUMBERS || '';
  return new Set(raw.split(',').map(s => canonicalizePhone(s.trim())).filter(Boolean));
}

export function isWhatsAppAdmin(fromPhone: string): boolean {
  const list = adminAllowlist();
  return list.has(canonicalizePhone(fromPhone));
}

// Date helpers — everything is in Asia/Jerusalem because owner thinks in
// local time and shifts are stored with date strings anchored to local-noon.
const ISRAEL_TZ = 'Asia/Jerusalem';
function israelYMD(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA', { timeZone: ISRAEL_TZ });
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
function israelDayName(ymd: string): string {
  const NAMES = ['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];
  try {
    const d = new Date(`${ymd}T12:00:00.000Z`);
    return NAMES[d.getDay()];
  } catch { return ''; }
}

// ── Commands ────────────────────────────────────────────────────────────────

async function cmdHelp(): Promise<string> {
  return [
    '👋 אני העוזר של עלינא ב-WhatsApp. הפקודות שלי:',
    '',
    '📋 *מה היום* — האירועים, המשימות והסידור שלך להיום',
    '✅ *משימות* — רשימת המשימות הפתוחות שלך',
    '🌅 *סיכום בוקר* — כל המידע הבוקרי + משפט מוטיבציה',
    '🌙 *סיכום יום* — סיכום סוף-יום (מכירות, טיפים, מחר)',
    '🔗 *חבר גוגל* — חיבור Google Calendar + Tasks (פעם אחת)',
    '📅 *סידור היום* — מי משובץ היום',
    '📅 *סידור מחר* — מי משובץ מחר',
    '📅 *סידור שבוע* — סיכום השבוע',
    '💰 *טיפים* — דוח טיפים של המשמרת האחרונה',
    '💰 *הכנסות* — הכנסות היום',
    '🎯 *לידים* — אירועים שמחכים שתחזור אליהם',
    '👥 *זמינות חסרים* — מי לא הגיש זמינות לשבוע הבא',
    '❓ *עזרה* — להציג את הרשימה שוב',
    '',
    '💡 בעתיד אוכל גם לבצע פעולות (החלפת מלצרים, אישור חוזים) — תמיד עם אישור שלך לפני.',
  ].join('\n');
}

async function cmdScheduleForDate(targetYMD: string): Promise<string> {
  const dayName = israelDayName(targetYMD);
  // WorkShift.date is a DateTime — fetch a wide window and slice client-side.
  const allShifts: any[] = await (prisma as any).workShift.findMany({
    orderBy: { date: 'desc' },
    take: 2000,
  });
  const shifts = allShifts.filter((s) => {
    const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
    return d === targetYMD;
  });
  if (!shifts.length) {
    return `📅 *${dayName} ${targetYMD}* — אין משמרות מוגדרות.`;
  }
  const lines = [`📅 *סידור ${dayName} ${targetYMD}*`];
  for (const shiftType of ['lunch', 'dinner']) {
    const label = shiftType === 'lunch' ? '☀️ צהריים' : '🌙 ערב';
    const matching = shifts.filter((s: any) => s.shift_type === shiftType);
    if (!matching.length) { lines.push(`\n${label}: _אין_`); continue; }
    const allStaff = matching.flatMap((s: any) => s.assigned_staff || []);
    if (!allStaff.length) { lines.push(`\n${label}: _ריק_`); continue; }
    lines.push(`\n${label} (${allStaff.length}):`);
    // Group by position
    const byPos: Record<string, string[]> = {};
    for (const a of allStaff) {
      const pos = a.position || 'ללא תפקיד';
      (byPos[pos] = byPos[pos] || []).push(`${a.employee_name}${a.start_time ? ` (${a.start_time}-${a.end_time || '?'})` : ''}`);
    }
    for (const [pos, names] of Object.entries(byPos)) {
      lines.push(`  *${pos}*: ${names.join(' · ')}`);
    }
  }
  return lines.join('\n');
}

async function cmdScheduleToday(): Promise<string> {
  return cmdScheduleForDate(israelYMD());
}

async function cmdScheduleTomorrow(): Promise<string> {
  return cmdScheduleForDate(israelYMD(addDays(new Date(), 1)));
}

async function cmdScheduleWeek(): Promise<string> {
  const today = new Date();
  const startYMD = israelYMD(today);
  // Sunday of current week:
  const dow = today.getDay();
  const sunday = addDays(today, -dow);
  const days = Array.from({ length: 7 }, (_, i) => israelYMD(addDays(sunday, i)));
  const allShifts: any[] = await (prisma as any).workShift.findMany({
    orderBy: { date: 'desc' },
    take: 2000,
  });
  const lines = [`📅 *סיכום שבועי* (${days[0]} → ${days[6]})`];
  for (const d of days) {
    const dayShifts = allShifts.filter((s) => {
      const sd = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
      return sd === d;
    });
    const lunchN = dayShifts.filter((s: any) => s.shift_type === 'lunch').reduce((n: number, s: any) => n + (s.assigned_staff?.length || 0), 0);
    const dinnerN = dayShifts.filter((s: any) => s.shift_type === 'dinner').reduce((n: number, s: any) => n + (s.assigned_staff?.length || 0), 0);
    const flag = d === startYMD ? ' ⬅️ היום' : '';
    lines.push(`*${israelDayName(d)} ${d.slice(5)}*  ☀️ ${lunchN}  🌙 ${dinnerN}${flag}`);
  }
  return lines.join('\n');
}

async function cmdTips(): Promise<string> {
  // Most recent TipReport. The TipReport.date is DateTime — sort desc, take 1.
  const recent: any = await (prisma as any).tipReport.findFirst({
    orderBy: { date: 'desc' },
  });
  if (!recent) return '💰 אין דוחות טיפים שמורים.';
  const dateStr = recent.date instanceof Date ? recent.date.toISOString().slice(0, 10) : String(recent.date).slice(0, 10);
  const shiftLabel = recent.shift_type === 'lunch' ? '☀️ צהריים' : '🌙 ערב';
  const tot = Number(recent.total_tips_collected || 0);
  const restCut = Number(recent.restaurant_deduction || 0);
  const runnerCut = Number(recent.runner_deduction || 0);
  const mgrCut = Math.round(tot * 0.05 * 100) / 100; // derived (no DB col)
  const net = Number(recent.net_tips_for_distribution || 0);
  const perHour = Number(recent.tip_per_hour || 0);
  return [
    `💰 *דוח טיפים — ${israelDayName(dateStr)} ${dateStr} · ${shiftLabel}*`,
    `סה"כ נאסף: *₪${tot.toFixed(0)}*`,
    `הפרשה למסעדה: ₪${restCut.toFixed(0)}`,
    `הפרשה לראנרים: ₪${runnerCut.toFixed(0)}`,
    `הפרשה למנהל משמרת (5%): ₪${mgrCut.toFixed(0)}`,
    `קופה לחלוקה: *₪${net.toFixed(0)}*`,
    `טיפ לשעה: *₪${perHour.toFixed(0)}*`,
    `סטטוס: ${recent.status === 'locked' ? '🔒 נעול' : '📝 טיוטה'}`,
  ].join('\n');
}

async function cmdIncomeToday(): Promise<string> {
  const today = israelYMD();
  // Try Reservation + BeecommOrder revenue. Both have date / created_date fields.
  // Best-effort: sum any 'total_ils' / 'total' / 'amount' fields on rows from today.
  // Falls back to a friendly "not available" if entities aren't there.
  try {
    const orders: any[] = await (prisma as any).beecommOrder.findMany({
      where: { OR: [{ date: today as any }, { created_date: today as any }] },
      take: 500,
    }).catch(() => []);
    const total = orders.reduce((sum: number, o: any) => sum + (Number(o.total_ils ?? o.total ?? o.amount ?? 0)), 0);
    const count = orders.length;
    return `💰 *הכנסות ${today}* (${israelDayName(today)})\nהזמנות: *${count}*\nסה"כ: *₪${total.toFixed(0)}*\n\n💡 כולל הזמנות BeeComm בלבד. הזמנות שולחן + טיפים יחושבו בנפרד.`;
  } catch (e: any) {
    return `💰 הכנסות ${today} — לא מצאתי נתונים מתאימים (${e?.message || 'unknown'}).`;
  }
}

async function cmdLeadsWaiting(): Promise<string> {
  // EventLeads with status='pending' OR 'contacted' OR 'quoted' (the manager
  // workflow stages we set up earlier today). Sort by created_date desc.
  try {
    const leads: any[] = await (prisma as any).eventLead.findMany({
      where: { status: { in: ['pending', 'contacted', 'quoted'] } },
      orderBy: { id: 'desc' },
      take: 10,
    });
    if (!leads.length) return '🎯 אין לידים פתוחים. כל הכבוד! 🌿';
    const lines = [`🎯 *לידים שמחכים לחזרה* (${leads.length})`];
    for (const l of leads) {
      const stageLabel = { pending: '🟠 לטלפון', contacted: '📞 דיברנו', quoted: '💰 הצעה' }[l.status as string] || l.status;
      lines.push(`\n*${l.contact_name || 'ללא שם'}* · 📞 ${l.contact_phone || '—'}\n  ${stageLabel} · ${l.event_date || '?'} · 👥 ${l.guest_count || '?'}${l.event_type ? ` · ${l.event_type}` : ''}`);
    }
    return lines.join('\n');
  } catch (e: any) {
    return `🎯 בעיה בקריאת לידים (${e?.message || 'unknown'}).`;
  }
}

async function cmdMissingAvailability(): Promise<string> {
  // Active employees who didn't submit an EmployeeAvailability row for any of
  // the 7 days of next week.
  try {
    const today = new Date();
    const dow = today.getDay();
    const nextSun = addDays(today, 7 - dow);
    const days = Array.from({ length: 7 }, (_, i) => israelYMD(addDays(nextSun, i)));
    const [emps, avails] = await Promise.all([
      (prisma as any).employee.findMany({ where: { status: 'active' }, take: 500 }),
      (prisma as any).employeeAvailability.findMany({ take: 5000 }),
    ]);
    const submittedByEmp = new Set<string>();
    for (const a of avails) {
      const d = a.date instanceof Date ? a.date.toISOString().slice(0, 10) : String(a.date).slice(0, 10);
      if (days.includes(d)) submittedByEmp.add(a.employee_id);
    }
    const missing = emps.filter((e: any) => !submittedByEmp.has(e.id));
    if (!missing.length) return '✅ כל העובדים הפעילים הגישו זמינות לשבוע הבא.';
    return `👥 *חסרי זמינות שבוע הבא* (${missing.length}/${emps.length}):\n${missing.map((e: any) => `• ${e.full_name}${e.phone ? ` (${e.phone})` : ''}`).join('\n')}`;
  } catch (e: any) {
    return `👥 לא הצלחתי לחשב — ${e?.message || 'unknown'}.`;
  }
}

// ── Router ──────────────────────────────────────────────────────────────────

async function cmdBuildScheduleNow(): Promise<string> {
  // Dynamic import — the fn lives in load.ts to avoid a circular dep.
  const { runWeeklyScheduleBuild } = await import('../functions/load.js');
  const res: any = await runWeeklyScheduleBuild({ force: true });
  if (res?.skipped) return `⚠️ הבנייה דילגה: ${res.reason || 'לא ידוע'}`;
  const lines: string[] = [`📋 *סידור נבנה*`];
  lines.push(`✅ ${res.createdShifts || 0} משמרות · ${res.assignmentCount || 0} שיבוצים`);
  if (Array.isArray(res.missing) && res.missing.length) {
    lines.push(`⚠️ לא הגישו זמינות: ${res.missing.join(', ')}`);
  }
  if (Array.isArray(res.insights) && res.insights.length) {
    lines.push('', '💡 *תובנות:*');
    for (const i of res.insights) lines.push(`  • ${i}`);
  }
  const base = process.env.APP_BASE_URL || 'https://topalena.com';
  lines.push('', `🔗 לאישור/עריכה: ${base}/WorkScheduling`);
  return lines.join('\n');
}

// Recognized phrases → handler.
// IMPORTANT: don't use \b in JS regex with Hebrew — Hebrew letters aren't
// "word chars" by default, so /^עזרה\b/ matches nothing. Use (?:\s|$|[.,!?])
// as an explicit end-of-token guard, or rely on the leading anchor + length.
const END = '(?:\\s|$|[.,!?])';
const COMMAND_MATCHERS: Array<{ test: (s: string) => boolean; run: () => Promise<string> }> = [
  { test: (s) => new RegExp(`^(עזרה|help|פקודות)${END}`, 'i').test(s), run: cmdHelp },
  { test: (s) => /^סידור\s+(היום|today)/i.test(s), run: cmdScheduleToday },
  { test: (s) => /^סידור\s+(מחר|tomorrow)/i.test(s), run: cmdScheduleTomorrow },
  { test: (s) => /^סידור\s+(שבוע|השבוע|week)/i.test(s), run: cmdScheduleWeek },
  { test: (s) => new RegExp(`^סידור${END}`, 'i').test(s), run: cmdScheduleToday }, // bare "סידור" → today
  { test: (s) => new RegExp(`^טיפים${END}`, 'i').test(s), run: cmdTips },
  { test: (s) => new RegExp(`^הכנסות${END}`, 'i').test(s), run: cmdIncomeToday },
  { test: (s) => new RegExp(`^לידים${END}`, 'i').test(s), run: cmdLeadsWaiting },
  { test: (s) => new RegExp(`^זמינות(\\s+חסרים)?${END}`, 'i').test(s), run: cmdMissingAvailability },
  // Manual trigger for the weekly schedule builder — bypasses the Tue 16:00
  // cron gate. Kicks off the same LLM flow, returns the summary.
  { test: (s) => /^(בנה|תבנה)\s+(סידור|לוז)/i.test(s), run: cmdBuildScheduleNow },
];

// Personal-context matchers (need fromPhone to scope by user).
const PERSONAL_MATCHERS: Array<{ test: (s: string) => boolean; run: (phone: string) => Promise<string> }> = [
  {
    test: (s) => new RegExp(`^(חבר\\s+גוגל|connect\\s+google|google\\s+connect|חבר\\s+יומן)${END}`, 'i').test(s),
    run: async (p) => {
      const connected = await isGoogleConnected(p);
      const url = buildConsentUrl(p);
      if (connected) {
        return [
          '✅ Google כבר מחובר.',
          '',
          'אם תרצה להתחבר מחדש (משתמש אחר / חידוש הרשאות):',
          url,
        ].join('\n');
      }
      return [
        '🔗 *חיבור Google Calendar + Tasks*',
        '',
        'לחץ על הקישור הבא, אשר את ההרשאות, וחזור הנה:',
        url,
        '',
        '_אחרי החיבור, כל אירוע/משימה שתוסיף בוואטסאפ יסתנכרן אוטומטית. אירועים שתוסיף ביומן יגיעו כתזכורות בוואטסאפ._',
      ].join('\n');
    },
  },
  {
    test: (s) => new RegExp(`^(סיכום\\s+בוקר|בוקר\\s+טוב|brief)${END}`, 'i').test(s),
    run: (p) => buildMorningBrief(p),
  },
  {
    test: (s) => new RegExp(`^(סיכום\\s+יום|סיכום\\s+סוף\\s+יום|eod)${END}`, 'i').test(s),
    run: (p) => buildEndOfDayBrief(p),
  },
  {
    test: (s) => new RegExp(`^(מה\\s+היום|מה\\s+התכנון|התכנון\\s+היום|לוז)${END}`, 'i').test(s),
    run: (p) => buildTodayOverview(p),
  },
  {
    test: (s) => new RegExp(`^(משימות|טאסקים|tasks)${END}`, 'i').test(s),
    run: async (p) => {
      const tasks = await listOpenTasks(p);
      if (!tasks.length) return '✅ אין משימות פתוחות.';
      const lines = [`✅ *משימות פתוחות* (${tasks.length}):`];
      for (const t of tasks.slice(0, 20)) lines.push(`  • ${t.title}  _(id: ${t.id.slice(-6)})_`);
      if (tasks.length > 20) lines.push(`  ...ועוד ${tasks.length - 20}`);
      lines.push('', '_לסימון כבוצע: "סיים <שם או id>"_');
      return lines.join('\n');
    },
  },
];

// Returns reply text if the message matched an admin command, or null otherwise.
export async function tryHandleAdminCommand(
  fromPhone: string,
  body: string,
): Promise<string | null> {
  if (!isWhatsAppAdmin(fromPhone)) return null;
  const trimmed = (body || '').trim();
  if (!trimmed) return null;
  for (const { test, run } of COMMAND_MATCHERS) {
    if (test(trimmed)) {
      try { return await run(); }
      catch (e: any) { return `⚠️ שגיאה בעיבוד הפקודה: ${e?.message || 'unknown'}`; }
    }
  }
  for (const { test, run } of PERSONAL_MATCHERS) {
    if (test(trimmed)) {
      try { return await run(fromPhone); }
      catch (e: any) { return `⚠️ שגיאה: ${e?.message || 'unknown'}`; }
    }
  }
  // Admin sent text we don't recognize — be helpful, suggest "עזרה".
  return `🤔 לא הבנתי את הפקודה. שלח/י *עזרה* לרשימת פקודות.`;
}
