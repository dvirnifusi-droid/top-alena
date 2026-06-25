// Weekly insights — sent Sunday 09:00 IL. Goal: highlight what changed
// week-over-week so the manager spots trends early. Each insight comes from
// a deterministic SQL pass; we DON'T let the LLM hallucinate numbers.
import { prisma } from '../db.js';
import { sendWhatsApp } from './twilio.js';

const TZ = 'Asia/Jerusalem';
function ymd(d: Date): string { return d.toLocaleDateString('en-CA', { timeZone: TZ }); }
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setUTCDate(c.getUTCDate() + n); return c; }

function adminPhones(): string[] {
  return (process.env.WHATSAPP_ADMIN_NUMBERS || '').split(',').map(s => s.trim()).filter(Boolean);
}

// ─── Insight builders ───────────────────────────────────────────────────────

async function insightSalesWoW(weekStart: string, weekEnd: string, prevStart: string, prevEnd: string): Promise<string | null> {
  try {
    const allOrders: any[] = await (prisma as any).beecommOrder.findMany({ orderBy: { date: 'desc' }, take: 5000 });
    const sum = (start: string, end: string) => allOrders
      .filter((o: any) => {
        const d = o.date instanceof Date ? o.date.toISOString().slice(0, 10) : String(o.date).slice(0, 10);
        return d >= start && d <= end;
      })
      .reduce((s, o: any) => s + Number(o.total_ils ?? o.total ?? o.amount ?? 0), 0);
    const thisWeek = sum(weekStart, weekEnd);
    const lastWeek = sum(prevStart, prevEnd);
    if (!thisWeek && !lastWeek) return null;
    const lines = [`השבוע: *₪${thisWeek.toLocaleString('he-IL')}*`];
    if (lastWeek) {
      const diff = thisWeek - lastWeek;
      const pct = Math.round((diff / lastWeek) * 100);
      const arrow = pct >= 0 ? '⬆️' : '⬇️';
      lines.push(`שבוע שעבר: ₪${lastWeek.toLocaleString('he-IL')}  ${arrow} ${pct >= 0 ? '+' : ''}${pct}%`);
    }
    return lines.join('\n');
  } catch { return null; }
}

async function insightLeadsConversion(weekStart: string, weekEnd: string): Promise<string | null> {
  try {
    const all: any[] = await (prisma as any).eventLead.findMany({ take: 1000, orderBy: { id: 'desc' } });
    const newThisWeek = all.filter((l: any) => {
      const d = l.created_date ? String(l.created_date).slice(0, 10) : '';
      return d >= weekStart && d <= weekEnd;
    });
    const wonThisWeek = all.filter((l: any) => {
      const d = l.updated_date ? String(l.updated_date).slice(0, 10) : '';
      return d >= weekStart && d <= weekEnd && l.status === 'won';
    });
    const lostThisWeek = all.filter((l: any) => {
      const d = l.updated_date ? String(l.updated_date).slice(0, 10) : '';
      return d >= weekStart && d <= weekEnd && l.status === 'lost';
    });
    if (!newThisWeek.length && !wonThisWeek.length && !lostThisWeek.length) return null;
    const closed = wonThisWeek.length + lostThisWeek.length;
    const conv = closed ? Math.round((wonThisWeek.length / closed) * 100) : 0;
    const parts = [`חדשים: *${newThisWeek.length}*`];
    if (wonThisWeek.length) parts.push(`✅ נסגרו: ${wonThisWeek.length}`);
    if (lostThisWeek.length) parts.push(`❌ אבדו: ${lostThisWeek.length}`);
    if (closed) parts.push(`🎯 אחוז סגירה: ${conv}%`);
    return parts.join(' · ');
  } catch { return null; }
}

async function insightTipsAvg(weekStart: string, weekEnd: string, prevStart: string, prevEnd: string): Promise<string | null> {
  try {
    const reports: any[] = await (prisma as any).tipReport.findMany({ orderBy: { date: 'desc' }, take: 200 });
    const inRange = (start: string, end: string) => reports.filter((r: any) => {
      const d = r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10);
      return d >= start && d <= end;
    });
    const thisR = inRange(weekStart, weekEnd);
    const prevR = inRange(prevStart, prevEnd);
    if (!thisR.length) return null;
    const sumTotal = (rs: any[]) => rs.reduce((s, r: any) => s + Number(r.total_tips_collected || 0), 0);
    const totalThis = sumTotal(thisR);
    const totalPrev = sumTotal(prevR);
    const lines = [`סה"כ השבוע: *₪${totalThis.toFixed(0)}* (${thisR.length} משמרות)`];
    if (totalPrev) {
      const pct = Math.round(((totalThis - totalPrev) / totalPrev) * 100);
      const arrow = pct >= 0 ? '⬆️' : '⬇️';
      lines.push(`שבוע שעבר: ₪${totalPrev.toFixed(0)}  ${arrow} ${pct >= 0 ? '+' : ''}${pct}%`);
    }
    return lines.join('\n');
  } catch { return null; }
}

async function insightNoShows(weekStart: string, weekEnd: string): Promise<string | null> {
  try {
    // Best-effort: assignments in week vs ShiftTracking clock-ins.
    const shifts: any[] = await (prisma as any).workShift.findMany({ orderBy: { date: 'desc' }, take: 1500 });
    const wks = shifts.filter((s: any) => {
      const d = s.date instanceof Date ? s.date.toISOString().slice(0, 10) : String(s.date).slice(0, 10);
      return d >= weekStart && d <= weekEnd;
    });
    if (!wks.length) return null;
    const expected = wks.flatMap((s: any) => (s.assigned_staff || []).map((a: any) => ({ employee_id: a.employee_id, date: (s.date instanceof Date ? s.date.toISOString().slice(0,10) : String(s.date).slice(0,10)) })));
    if (!expected.length) return null;
    const tracks: any[] = await (prisma as any).shiftTracking.findMany({ orderBy: { shift_start: 'desc' }, take: 1000 }).catch(() => []);
    const tracked = new Set(tracks.map((t: any) => {
      const d = typeof t.date === 'string' ? t.date.slice(0,10) : (t.date ? new Date(t.date).toISOString().slice(0,10) : '');
      return `${t.employee_id}|${d}`;
    }));
    const noShows = expected.filter((e: any) => {
      // Only count past days (today's are still ongoing)
      const today = ymd(new Date());
      return e.date < today && !tracked.has(`${e.employee_id}|${e.date}`);
    });
    if (!noShows.length) return null;
    return `${noShows.length} שיבוצים בלי clock-in השבוע (לבדוק)`;
  } catch { return null; }
}

async function insightUnpaidGrowing(): Promise<string | null> {
  try {
    const unpaid: any[] = await (prisma as any).invoice.findMany({
      where: { payment_status: 'unpaid' },
      take: 500,
    });
    if (unpaid.length < 3) return null;
    const total = unpaid.reduce((s, i) => s + Number(i.total_amount || 0), 0);
    return `${unpaid.length} חשבוניות פתוחות בסך *₪${total.toLocaleString('he-IL')}*`;
  } catch { return null; }
}

// ─── Top-level brief ───────────────────────────────────────────────────────

export async function buildWeeklyInsights(): Promise<string> {
  // Week = Sun→Sat. We send Sunday morning, summarizing the JUST-ENDED week.
  const now = new Date();
  // Last week's Sunday → Saturday
  const todayDow = now.getDay();
  const lastSat = addDays(now, -1 - todayDow); // yesterday if today=Sunday
  const lastSun = addDays(lastSat, -6);
  const prevSat = addDays(lastSun, -1);
  const prevSun = addDays(prevSat, -6);
  const w0 = ymd(lastSun), w1 = ymd(lastSat);
  const p0 = ymd(prevSun), p1 = ymd(prevSat);
  const [sales, leads, tips, noshows, unpaid] = await Promise.all([
    insightSalesWoW(w0, w1, p0, p1),
    insightLeadsConversion(w0, w1),
    insightTipsAvg(w0, w1, p0, p1),
    insightNoShows(w0, w1),
    insightUnpaidGrowing(),
  ]);
  const lines: string[] = [
    `📊 *סיכום שבועי — ${w0} → ${w1}*`,
    '',
  ];
  if (sales) { lines.push('💰 *מכירות*', sales, ''); }
  if (tips) { lines.push('💸 *טיפים*', tips, ''); }
  if (leads) { lines.push('🎯 *לידים*', leads, ''); }
  if (noshows) { lines.push('🚷 *לא נכנסו לשעון*', noshows, ''); }
  if (unpaid) { lines.push('🧾 *חשבוניות פתוחות*', unpaid, ''); }
  lines.push('_שבוע טוב 🌿_');
  return lines.join('\n');
}

export async function sendWeeklyInsights(): Promise<{ sent: number; failed: number; details: Array<{ phone: string; ok: boolean; error?: string }> }> {
  const phones = adminPhones();
  if (!phones.length) return { sent: 0, failed: 0, details: [] };
  const text = await buildWeeklyInsights();
  const results: Array<{ phone: string; ok: boolean; error?: string }> = [];
  for (const phone of phones) {
    try { await sendWhatsApp(phone, text); results.push({ phone, ok: true }); }
    catch (e: any) { results.push({ phone, ok: false, error: e?.message || 'unknown' }); console.warn('[weekly] send failed', { phone, err: e?.message }); }
  }
  return { sent: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, details: results };
}
