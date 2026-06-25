// Morning brief — daily 08:00 IL summary sent via WhatsApp to admin numbers.
// Numbers come from WHATSAPP_ADMIN_NUMBERS env (comma-separated). Each line of
// the brief is computed from real DB data (no LLM hallucination), and the
// brief is sent free-form (works inside the 24h Twilio session — owner is
// expected to text the bot at least daily; if not, we log a warning).
import { prisma } from '../db.js';
import { sendWhatsApp } from './twilio.js';

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
  const NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  try {
    const d = new Date(`${ymd}T12:00:00.000Z`);
    return NAMES[d.getDay()];
  } catch { return ''; }
}

function adminPhones(): string[] {
  const raw = process.env.WHATSAPP_ADMIN_NUMBERS || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// ── Brief sections ──────────────────────────────────────────────────────────

async function sectionTodayShift(today: string): Promise<string> {
  const all: any[] = await (prisma as any).workShift.findMany({ orderBy: { date: 'desc' }, take: 1500 });
  const todayShifts = all.filter((s) => {
    const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
    return d === today;
  });
  if (!todayShifts.length) return '⚠️ אין סידור מוגדר להיום!';
  const lunchN = todayShifts.filter((s: any) => s.shift_type === 'lunch').reduce((n: number, s: any) => n + (s.assigned_staff?.length || 0), 0);
  const dinnerN = todayShifts.filter((s: any) => s.shift_type === 'dinner').reduce((n: number, s: any) => n + (s.assigned_staff?.length || 0), 0);
  const flags = [];
  if (lunchN < 3) flags.push('⚠️ צהריים דליל מאוד');
  if (dinnerN < 5) flags.push('⚠️ ערב דליל');
  return `☀️ צהריים: *${lunchN}* · 🌙 ערב: *${dinnerN}*${flags.length ? '\n  ' + flags.join(' | ') : ''}`;
}

async function sectionYesterdayTips(yesterday: string): Promise<string | null> {
  const reports: any[] = await (prisma as any).tipReport.findMany({ orderBy: { date: 'desc' }, take: 20 });
  const matched = reports.filter((r) => {
    const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
    return d === yesterday;
  });
  if (!matched.length) return null;
  const tot = matched.reduce((n: number, r: any) => n + Number(r.total_tips_collected || 0), 0);
  const lunch = matched.find((r: any) => r.shift_type === 'lunch');
  const dinner = matched.find((r: any) => r.shift_type === 'dinner');
  const parts: string[] = [`סה"כ אתמול: *₪${tot.toFixed(0)}*`];
  if (lunch) parts.push(`צהריים ₪${Number(lunch.total_tips_collected || 0).toFixed(0)}`);
  if (dinner) parts.push(`ערב ₪${Number(dinner.total_tips_collected || 0).toFixed(0)}`);
  return parts.join(' · ');
}

async function sectionWaitingLeads(): Promise<string | null> {
  try {
    const leads: any[] = await (prisma as any).eventLead.findMany({
      where: { status: { in: ['pending', 'contacted', 'quoted'] } },
      take: 50,
    });
    if (!leads.length) return null;
    const pendingCount = leads.filter(l => l.status === 'pending').length;
    const quotedCount = leads.filter(l => l.status === 'quoted').length;
    // Anything pending for >24h is a flag
    const now = Date.now();
    const stale = leads.filter(l => {
      const created = l.created_date ? new Date(l.created_date).getTime() : 0;
      return l.status === 'pending' && (now - created) > 24 * 3600 * 1000;
    });
    const lines: string[] = [`לידים פתוחים: *${leads.length}*${pendingCount ? ` · ${pendingCount} ממתינים לטלפון` : ''}${quotedCount ? ` · ${quotedCount} בהצעת מחיר` : ''}`];
    if (stale.length) lines.push(`  🚨 ${stale.length} מחכים מעל 24h — עדיף לחזור היום`);
    return lines.join('\n');
  } catch { return null; }
}

async function sectionUnpaidInvoices(): Promise<string | null> {
  try {
    const inv: any[] = await (prisma as any).invoice.findMany({
      where: { payment_status: 'unpaid' },
      orderBy: { invoice_date: 'desc' },
      take: 200,
    });
    if (!inv.length) return null;
    const total = inv.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    return `חשבוניות לא שולמו: *${inv.length}* (₪${total.toLocaleString('he-IL')})`;
  } catch { return null; }
}

async function sectionMissingAvailability(): Promise<string | null> {
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
    if (!missing.length) return null;
    if (missing.length === emps.length) return null; // probably too early in the week, nobody submitted yet
    return `זמינות חסרה לשבוע הבא: *${missing.length}/${emps.length}* עובדים`;
  } catch { return null; }
}

// ── Top-level brief ────────────────────────────────────────────────────────

export async function buildMorningBrief(): Promise<string> {
  const today = israelYMD();
  const yesterday = israelYMD(addDays(new Date(), -1));
  const todayName = israelDayName(today);
  const [todayShift, tips, leads, invoices, availMissing] = await Promise.all([
    sectionTodayShift(today),
    sectionYesterdayTips(yesterday),
    sectionWaitingLeads(),
    sectionUnpaidInvoices(),
    sectionMissingAvailability(),
  ]);

  const lines: string[] = [
    `🌅 *סיכום בוקר — ${todayName} ${today}*`,
    '',
    `📅 *סידור היום*`,
    todayShift,
  ];
  if (tips) { lines.push('', '💰 *טיפים אתמול*', tips); }
  if (leads) { lines.push('', '🎯 *לידים*', leads); }
  if (invoices) { lines.push('', '🧾 *חשבוניות*', invoices); }
  if (availMissing) { lines.push('', '👥 *זמינות*', availMissing); }
  lines.push('', '_שלח/י "עזרה" לרשימת פקודות. בוקר טוב 🌿_');
  return lines.join('\n');
}

// ─── End-of-day brief (sent at 23:30) ──────────────────────────────────────

async function eodSales(today: string): Promise<string | null> {
  try {
    const orders: any[] = await (prisma as any).beecommOrder.findMany({
      where: { OR: [{ date: today as any }, { created_date: today as any }] },
      take: 1000,
    }).catch(() => []);
    if (!orders.length) return null;
    const total = orders.reduce((s, o: any) => s + Number(o.total_ils ?? o.total ?? o.amount ?? 0), 0);
    // Average over last 4 same-DOW
    const allOrders: any[] = await (prisma as any).beecommOrder.findMany({
      orderBy: { date: 'desc' }, take: 5000,
    }).catch(() => []);
    const todayDow = new Date(`${today}T12:00:00Z`).getDay();
    const byDate: Record<string, number> = {};
    for (const o of allOrders) {
      const d = o.date instanceof Date ? o.date.toISOString().slice(0, 10) : String(o.date).slice(0, 10);
      if (d && d !== today && new Date(`${d}T12:00:00Z`).getDay() === todayDow) {
        byDate[d] = (byDate[d] || 0) + Number(o.total_ils ?? o.total ?? o.amount ?? 0);
      }
    }
    const samples = Object.values(byDate).slice(0, 4);
    const avg = samples.length ? samples.reduce((s, n) => s + n, 0) / samples.length : 0;
    const lines = [`הזמנות: *${orders.length}* · סה"כ: *₪${total.toLocaleString('he-IL')}*`];
    if (avg > 0) {
      const diffPct = Math.round(((total - avg) / avg) * 100);
      const arrow = diffPct >= 0 ? '⬆️' : '⬇️';
      lines.push(`${arrow} ${diffPct >= 0 ? '+' : ''}${diffPct}% מול ממוצע ${samples.length} ${samples.length === 1 ? 'שבוע' : 'שבועות'} אחורה (אותו יום)`);
    }
    return lines.join('\n');
  } catch { return null; }
}

async function eodTips(today: string): Promise<string | null> {
  const reports: any[] = await (prisma as any).tipReport.findMany({ orderBy: { date: 'desc' }, take: 30 });
  const matched = reports.filter((r) => {
    const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
    return d === today;
  });
  if (!matched.length) return null;
  const totalTips = matched.reduce((n: number, r: any) => n + Number(r.total_tips_collected || 0), 0);
  const netDistr = matched.reduce((n: number, r: any) => n + Number(r.net_tips_for_distribution || 0), 0);
  const mgrCut = totalTips * 0.05;
  const lines = [
    `נאסף: *₪${totalTips.toFixed(0)}*`,
    `לחלוקה למלצרים: ₪${netDistr.toFixed(0)} · למנהל משמרת (5%): ₪${mgrCut.toFixed(0)}`,
  ];
  const locked = matched.filter((r: any) => r.status === 'locked').length;
  if (locked < matched.length) lines.push(`⚠️ ${matched.length - locked} דוחות עוד בטיוטה`);
  return lines.join('\n');
}

async function eodIncidentsToday(today: string): Promise<string | null> {
  try {
    const all: any[] = await (prisma as any).incident.findMany({ orderBy: { id: 'desc' }, take: 100 });
    const matched = all.filter((i: any) => {
      const d = i.created_date ? String(i.created_date).slice(0, 10) : (i.createdAt ? new Date(i.createdAt).toISOString().slice(0, 10) : '');
      return d === today;
    });
    if (!matched.length) return null;
    const sevCount = matched.reduce((m: any, i: any) => { const s = String(i.severity || 'low'); m[s] = (m[s] || 0) + 1; return m; }, {});
    const parts = Object.entries(sevCount).map(([s, n]) => `${s}: ${n}`);
    return `${matched.length} אירועים דווחו (${parts.join(' · ')})`;
  } catch { return null; }
}

async function eodLeadsClosed(today: string): Promise<string | null> {
  try {
    const all: any[] = await (prisma as any).eventLead.findMany({ orderBy: { id: 'desc' }, take: 200 });
    const closedToday = all.filter((l: any) => {
      const d = l.updated_date ? String(l.updated_date).slice(0, 10) : '';
      return d === today && (l.status === 'won' || l.status === 'lost');
    });
    const newToday = all.filter((l: any) => {
      const d = l.created_date ? String(l.created_date).slice(0, 10) : '';
      return d === today;
    });
    if (!closedToday.length && !newToday.length) return null;
    const won = closedToday.filter((l: any) => l.status === 'won').length;
    const lost = closedToday.filter((l: any) => l.status === 'lost').length;
    const parts: string[] = [];
    if (newToday.length) parts.push(`חדשים: *${newToday.length}*`);
    if (won) parts.push(`✅ נסגרו: ${won}`);
    if (lost) parts.push(`❌ לא רלוונטיים: ${lost}`);
    return parts.join(' · ');
  } catch { return null; }
}

async function eodTomorrowPreview(tomorrow: string): Promise<string> {
  const all: any[] = await (prisma as any).workShift.findMany({ orderBy: { date: 'desc' }, take: 1500 });
  const tShifts = all.filter((s: any) => {
    const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
    return d === tomorrow;
  });
  const lunchN = tShifts.filter((s: any) => s.shift_type === 'lunch').reduce((n: number, s: any) => n + (s.assigned_staff?.length || 0), 0);
  const dinnerN = tShifts.filter((s: any) => s.shift_type === 'dinner').reduce((n: number, s: any) => n + (s.assigned_staff?.length || 0), 0);
  if (!lunchN && !dinnerN) return '⚠️ אין סידור למחר!';
  return `☀️ צהריים: ${lunchN} · 🌙 ערב: ${dinnerN}`;
}

export async function buildEndOfDayBrief(): Promise<string> {
  const today = israelYMD();
  const tomorrow = israelYMD(addDays(new Date(), 1));
  const todayName = israelDayName(today);
  const tomorrowName = israelDayName(tomorrow);
  const [sales, tips, incidents, leads, tomorrowPrev] = await Promise.all([
    eodSales(today),
    eodTips(today),
    eodIncidentsToday(today),
    eodLeadsClosed(today),
    eodTomorrowPreview(tomorrow),
  ]);
  const lines: string[] = [
    `🌙 *סיכום יום — ${todayName} ${today}*`,
    '',
  ];
  if (sales) { lines.push(`💰 *מכירות*`, sales, ''); }
  if (tips) { lines.push(`💸 *טיפים*`, tips, ''); }
  if (leads) { lines.push(`🎯 *לידים*`, leads, ''); }
  if (incidents) { lines.push(`🚨 *אירועים*`, incidents, ''); }
  lines.push(`📅 *מחר (${tomorrowName})*`, tomorrowPrev, '');
  lines.push('_לילה טוב 🌿_');
  return lines.join('\n');
}

export async function sendEndOfDayBrief(): Promise<{ sent: number; failed: number; details: Array<{ phone: string; ok: boolean; error?: string }> }> {
  const phones = adminPhones();
  if (!phones.length) { console.warn('[eod-brief] no admin phones'); return { sent: 0, failed: 0, details: [] }; }
  const text = await buildEndOfDayBrief();
  const results: Array<{ phone: string; ok: boolean; error?: string }> = [];
  for (const phone of phones) {
    try { await sendWhatsApp(phone, text); results.push({ phone, ok: true }); }
    catch (e: any) { results.push({ phone, ok: false, error: e?.message || 'unknown' }); console.warn('[eod-brief] send failed', { phone, err: e?.message }); }
  }
  return { sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, details: results };
}

// Send the brief to all admins. Returns per-recipient delivery status.
export async function sendMorningBrief(): Promise<{ sent: number; failed: number; details: Array<{ phone: string; ok: boolean; error?: string }> }> {
  const phones = adminPhones();
  if (!phones.length) {
    console.warn('[morning-brief] no admin phones configured; skipping');
    return { sent: 0, failed: 0, details: [] };
  }
  const text = await buildMorningBrief();
  const results: Array<{ phone: string; ok: boolean; error?: string }> = [];
  for (const phone of phones) {
    try {
      await sendWhatsApp(phone, text);
      results.push({ phone, ok: true });
    } catch (e: any) {
      console.warn('[morning-brief] send failed', { phone, err: e?.message });
      results.push({ phone, ok: false, error: e?.message || 'unknown' });
    }
  }
  return {
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    details: results,
  };
}
