// Business forecasts — deterministic, server-side, built ONLY on data the
// restaurant actually produces (verified sources 2026-07-17):
//   demand history  → BeecommHistoricalDay (real POS days; DailySales is empty)
//   cash flow       → CashFlowEntry + RecurringCost + unpaid Invoices + POS weekday averages
//   no-shows        → Reservation history per phone
//   labor cost      → WorkShift assignments × EmployeePay rates vs expected revenue
//   price drift     → InvoiceItem unit prices over time (email/WhatsApp invoice import)
//   event demand    → EventLead funnel + EventBooking pipeline
// No LLM calls here — numbers first; the UI can narrate.

import { prisma } from '../db.js';

const db = prisma as any;
const q = async (sql: string, ...params: any[]): Promise<any[]> => {
  try { return await db.$queryRawUnsafe(sql, ...params); } catch (e: any) { console.warn('[forecast]', String(e?.message || '').slice(0, 120)); return []; }
};

const DAY = 86_400_000;
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const ilTodayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const weekdayOf = (dateStr: string) => new Date(`${dateStr}T12:00:00Z`).getUTCDay();
const round = (n: number) => Math.round(n);

// ── 1. demand history (feeds the existing multi-day prediction) ─────────────
export async function getDemandHistory(days = 60): Promise<any[]> {
  const rows = await q(
    `SELECT date, diners, orders_count, net_total FROM "BeecommHistoricalDay"
     ORDER BY date DESC LIMIT ${Math.min(Number(days) || 60, 180)}`);
  if (rows.length) {
    return rows.map((r: any) => ({
      date: r.date,
      covers: r.diners ?? null,
      orders: r.orders_count ?? null,
      revenue: r.net_total != null ? round(r.net_total) : null,
      day_type: weekdayOf(String(r.date)),
    }));
  }
  // fallback — legacy manual table
  const legacy = await q(`SELECT date, covers, total_revenue FROM "DailySales" ORDER BY date DESC LIMIT 60`);
  return legacy.map((r: any) => ({
    date: String(r.date).slice(0, 10), covers: r.covers, revenue: r.total_revenue,
    day_type: weekdayOf(String(r.date).slice(0, 10)),
  }));
}

// avg net revenue per weekday over the last 56 POS days
async function weekdayRevenueAverages(): Promise<Record<number, number>> {
  const rows = await q(`SELECT date, net_total FROM "BeecommHistoricalDay" ORDER BY date DESC LIMIT 56`);
  const sums: Record<number, { t: number; n: number }> = {};
  for (const r of rows) {
    if (r.net_total == null) continue;
    const wd = weekdayOf(String(r.date));
    if (!sums[wd]) sums[wd] = { t: 0, n: 0 };
    sums[wd].t += Number(r.net_total); sums[wd].n++;
  }
  const out: Record<number, number> = {};
  for (const [wd, s] of Object.entries(sums)) out[Number(wd)] = round(s.t / Math.max(1, s.n));
  return out;
}

// ── 2. 7-day cash flow projection ───────────────────────────────────────────
export async function forecastCashFlow(): Promise<any> {
  const todayStr = ilTodayStr();
  const start = new Date(`${todayStr}T00:00:00Z`);
  const revByWd = await weekdayRevenueAverages();

  const [planned, recurring, openInv] = await Promise.all([
    q(`SELECT date, type, category, source, description, amount FROM "CashFlowEntry"
       WHERE status IN ('planned') AND date >= $1::date AND date < $1::date + INTERVAL '7 days'`, todayStr),
    q(`SELECT name, amount, day_of_month, category FROM "RecurringCost" WHERE active = true`),
    // every not-yet-paid invoice + its scheduled due date (net-30 etc.)
    q(`SELECT i.id, i.total_amount, i.due_date, i.payment_status,
              COALESCE(i.supplier_name_override, s.company_name) AS supplier
       FROM "Invoice" i LEFT JOIN "Supplier" s ON s.id = i.supplier_id
       WHERE COALESCE(i.payment_status,'unpaid') <> 'paid'`),
  ]);
  const windowEnd = new Date(start.getTime() + 7 * DAY);
  const invByDay: Record<string, any[]> = {};
  const scheduledBeyond: any[] = [];
  let unpaidNoDate = 0, unpaidNoDateCount = 0;
  for (const inv of openInv) {
    const amt = Number(inv.total_amount || 0);
    if (inv.due_date) {
      const dd = ymd(new Date(inv.due_date));
      const t = new Date(inv.due_date).getTime();
      if (t >= start.getTime() && t < windowEnd.getTime()) { (invByDay[dd] ||= []).push(inv); }
      else if (t >= windowEnd.getTime()) scheduledBeyond.push({ date: dd, supplier: inv.supplier, amount: round(amt) });
      // due in the past & still unpaid → treat as due today (overdue)
      else if (t < start.getTime()) { (invByDay[todayStr] ||= []).push({ ...inv, _overdue: true }); }
    } else { unpaidNoDate += amt; unpaidNoDateCount++; }
  }

  const days: any[] = [];
  let weekIn = 0, weekOut = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * DAY);
    const ds = ymd(d);
    const wd = d.getUTCDay();
    const dom = d.getUTCDate();
    const outItems: any[] = [];
    let expIn = revByWd[wd] || 0;
    let expOut = 0;
    for (const p of planned) {
      if (String(p.date).slice(0, 10) !== ds) continue;
      const amt = Number(p.amount || 0);
      if (p.type === 'income') expIn += amt;
      else { expOut += amt; outItems.push({ name: p.source || p.description || p.category, amount: round(amt) }); }
    }
    for (const rc of recurring) {
      if (Number(rc.day_of_month) === dom) { expOut += Number(rc.amount || 0); outItems.push({ name: `${rc.name} (קבוע)`, amount: round(Number(rc.amount || 0)) }); }
    }
    for (const inv of (invByDay[ds] || [])) {
      const amt = Number(inv.total_amount || 0);
      expOut += amt;
      outItems.push({ name: `${inv.supplier || 'ספק'}${inv._overdue ? ' (חוב עבר)' : ' (חשבונית)'}`, amount: round(amt) });
    }
    weekIn += expIn; weekOut += expOut;
    days.push({
      date: ds, weekday: HE_DAYS[wd],
      expected_in: round(expIn), expected_out: round(expOut), net: round(expIn - expOut),
      out_items: outItems.slice(0, 8),
    });
  }
  const beyondTotal = scheduledBeyond.reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
  const alerts: string[] = [];
  for (const d of days) if (d.net < 0) alerts.push(`⚠️ ${d.weekday} ${d.date}: צפי שלילי של ₪${Math.abs(d.net).toLocaleString()}`);
  if (unpaidNoDateCount > 0) alerts.push(`📄 ${unpaidNoDateCount} חשבוניות לא משולמות בסך ₪${round(unpaidNoDate).toLocaleString()} עדיין בלי תאריך תשלום — קבע להן "ישולם בתאריך" כדי שייכנסו לתזרים`);

  return {
    days,
    week: { expected_in: round(weekIn), expected_out: round(weekOut), net: round(weekIn - weekOut) },
    unpaid_no_date: { count: unpaidNoDateCount, total: round(unpaidNoDate) },
    scheduled_beyond: { count: scheduledBeyond.length, total: round(beyondTotal), items: scheduledBeyond.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12) },
    alerts,
    based_on: `ממוצעי הכנסה לפי יום-בשבוע מ-56 ימי קופה אחרונים + ${planned.length} תנועות מתוכננות + ${recurring.length} הוצאות קבועות + חשבוניות משובצות לפי תאריך תשלום`,
  };
}

// ── 3. reservation no-show risk ─────────────────────────────────────────────
export async function predictNoShows(): Promise<any> {
  const todayStr = ilTodayStr();
  const [history, upcoming] = await Promise.all([
    q(`SELECT customer_phone, status FROM "Reservation"
       WHERE date < $1::date AND date > $1::date - INTERVAL '365 days' AND customer_phone IS NOT NULL`, todayStr),
    q(`SELECT id, customer_name, customer_phone, date, time, party_size, status, source FROM "Reservation"
       WHERE date >= $1::date AND date < $1::date + INTERVAL '7 days'
         AND COALESCE(status,'pending') NOT IN ('cancelled','no_show','completed','seated')
       ORDER BY date, time`, todayStr),
  ]);

  const digits = (p: any) => String(p || '').replace(/\D/g, '');
  const byPhone: Record<string, { total: number; bad: number; cancelled: number }> = {};
  for (const h of history) {
    const p = digits(h.customer_phone); if (!p) continue;
    if (!byPhone[p]) byPhone[p] = { total: 0, bad: 0, cancelled: 0 };
    byPhone[p].total++;
    if (String(h.status) === 'no_show') byPhone[p].bad++;
    else if (String(h.status) === 'cancelled') byPhone[p].cancelled++;
  }

  const scored = upcoming.map((r: any) => {
    const p = digits(r.customer_phone);
    const h = p ? byPhone[p] : undefined;
    let risk = 10; const reasons: string[] = [];
    if (h?.bad) { risk += Math.min(45, h.bad * 30); reasons.push(`${h.bad} אי-הגעות בעבר`); }
    if (h && h.cancelled >= 2) { risk += 15; reasons.push(`${h.cancelled} ביטולים בעבר`); }
    if (!h) {
      const wd = weekdayOf(String(r.date).slice(0, 10));
      if (wd === 5 || wd === 6) { risk += 12; reasons.push('לקוח חדש בסופ"ש'); } else reasons.push('לקוח ללא היסטוריה');
      risk += 5;
    }
    if (Number(r.party_size) >= 6) { risk += 12; reasons.push(`שולחן גדול (${r.party_size})`); }
    if (String(r.status || 'pending') === 'pending') { risk += 10; reasons.push('טרם אושרה'); }
    return {
      date: String(r.date).slice(0, 10), time: r.time, name: r.customer_name,
      phone: r.customer_phone, party_size: r.party_size,
      risk: Math.min(95, risk), reasons,
    };
  }).sort((a: any, b: any) => b.risk - a.risk);

  const high = scored.filter((s: any) => s.risk >= 50);
  return {
    upcoming_count: upcoming.length,
    high_risk: high.slice(0, 20),
    summary: high.length
      ? `${high.length} הזמנות בסיכון גבוה מתוך ${upcoming.length} בשבוע הקרוב — שווה שיחת אישור יום לפני`
      : `אין הזמנות בסיכון גבוה מתוך ${upcoming.length} בשבוע הקרוב`,
    based_on: `${history.length} הזמנות עבר (שנה אחורה) לפי טלפון`,
  };
}

// ── 4. projected labor cost % for the coming week ──────────────────────────
export async function forecastLaborCost(): Promise<any> {
  const todayStr = ilTodayStr();
  const [shifts, pays, emps] = await Promise.all([
    q(`SELECT id, date, shift_type, start_time, end_time, assigned_staff FROM "WorkShift"
       WHERE date >= $1::date AND date < $1::date + INTERVAL '7 days' ORDER BY date`, todayStr),
    q(`SELECT employee_id, pay_type, hourly_rate, monthly_salary, employer_pct FROM "EmployeePay"`),
    q(`SELECT id, full_name, role FROM "Employee"`),
  ]);
  const revByWd = await weekdayRevenueAverages();
  const payByEmp: Record<string, any> = {};
  for (const p of pays) payByEmp[String(p.employee_id)] = p;

  // ESTIMATE FALLBACK — same rule as /LaborCost and the schedule: an employee
  // with no personal rate is costed at their POSITION's hourly rate. Without
  // this the dashboard KPI kept saying "צריך תעריפי שכר" while the schedule
  // already showed a real number from the very same data.
  const positions = await q(
    `SELECT position_name, hourly_rate FROM "WorkPosition" WHERE hourly_rate IS NOT NULL AND hourly_rate > 0`);
  const normP = (x: any) => String(x || '').replace(/[\s"'׳״־\-/\|,.]+/g, '').toLowerCase();
  const posRate: Record<string, number> = {};
  for (const p of positions) posRate[normP(p.position_name)] = Number(p.hourly_rate);
  for (const e of emps) {
    const id = String(e.id);
    const cur = payByEmp[id];
    if (cur && cur.hourly_rate != null && Number(cur.hourly_rate) > 0) continue;
    if (cur && cur.pay_type && cur.pay_type !== 'hourly') continue;
    const r = posRate[normP(e.role)];
    if (!r) continue;
    payByEmp[id] = { ...(cur || {}), pay_type: 'hourly', hourly_rate: r, estimated: true };
  }
  const nameToId: Record<string, string> = {};
  for (const e of emps) nameToId[String(e.full_name || '').trim().toLowerCase()] = String(e.id);

  const shiftHours = (ws: any) => {
    const parse = (t: any) => { const m = String(t || '').match(/^(\d{2}):(\d{2})/); return m ? Number(m[1]) + Number(m[2]) / 60 : null; };
    const a = parse(ws.start_time), b = parse(ws.end_time);
    if (a == null || b == null) return 6; // sensible default shift length
    return b > a ? b - a : b + 24 - a;
  };

  const byDate: Record<string, { cost: number; hours: number; staff: number; missing: Set<string> }> = {};
  for (const ws of shifts) {
    const ds = String(ws.date).slice(0, 10);
    if (!byDate[ds]) byDate[ds] = { cost: 0, hours: 0, staff: 0, missing: new Set() };
    const hours = shiftHours(ws);
    const staff = Array.isArray(ws.assigned_staff) ? ws.assigned_staff : [];
    for (const a of staff) {
      const id = String(a?.employee_id || a?.id || nameToId[String(a?.name || a?.employee_name || '').trim().toLowerCase()] || '');
      byDate[ds].staff++;
      byDate[ds].hours += hours;
      const pay = id ? payByEmp[id] : null;
      if (!pay) { byDate[ds].missing.add(String(a?.name || a?.employee_name || id || '?')); continue; }
      let hourly = Number(pay.hourly_rate || 0);
      if (!hourly && pay.pay_type === 'monthly' && pay.monthly_salary) hourly = Number(pay.monthly_salary) / 182;
      const employerFactor = 1 + (Number(pay.employer_pct || 0) / 100);
      byDate[ds].cost += hours * hourly * employerFactor;
    }
  }

  const days = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([ds, v]) => {
    const wd = weekdayOf(ds);
    const rev = revByWd[wd] || 0;
    return {
      date: ds, weekday: HE_DAYS[wd], staff: v.staff, hours: Math.round(v.hours),
      cost: round(v.cost), expected_revenue: rev,
      labor_pct: rev > 0 ? Math.round((v.cost / rev) * 100) : null,
      missing_rates: [...v.missing],
    };
  });
  const totCost = days.reduce((a, d) => a + d.cost, 0);
  const totRev = days.reduce((a, d) => a + d.expected_revenue, 0);
  const flags = days.filter((d) => d.labor_pct != null && d.labor_pct > 32).map((d) => `⚠️ ${d.weekday}: עלות עבודה ${d.labor_pct}% מהצפי`);
  const missingAll = new Set(days.flatMap((d) => d.missing_rates));
  return {
    days,
    week: { cost: round(totCost), expected_revenue: round(totRev), labor_pct: totRev > 0 ? Math.round((totCost / totRev) * 100) : null },
    flags,
    missing_rates: [...missingAll],
    based_on: `שיבוצי השבוע (${shifts.length} משמרות) × תעריפי שכר + ממוצעי הכנסה לפי יום-בשבוע מהקופה`,
  };
}

// ── 5. supplier price drift ─────────────────────────────────────────────────
export async function detectSupplierPriceDrift(): Promise<any> {
  const rows = await q(
    `SELECT ii.product_name, ii.unit_price, ii.quantity, i.invoice_date, s.name AS supplier
     FROM "InvoiceItem" ii
     JOIN "Invoice" i ON i.id = ii.invoice_id
     LEFT JOIN "Supplier" s ON s.id = i.supplier_id
     WHERE i.invoice_date > NOW() - INTERVAL '180 days' AND ii.unit_price > 0
     ORDER BY i.invoice_date`);
  const groups: Record<string, any[]> = {};
  for (const r of rows) {
    const key = String(r.product_name || '').trim().toLowerCase();
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  const cutoff = Date.now() - 30 * DAY;
  const median = (ns: number[]) => { const s = [...ns].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const items: any[] = [];
  for (const [, g] of Object.entries(groups)) {
    if (g.length < 3) continue;
    const old = g.filter((r) => new Date(r.invoice_date).getTime() <= cutoff).map((r) => Number(r.unit_price));
    const recent = g.filter((r) => new Date(r.invoice_date).getTime() > cutoff);
    if (old.length < 2 || !recent.length) continue;
    const oldMed = median(old);
    const recentAvg = recent.reduce((a, r) => a + Number(r.unit_price), 0) / recent.length;
    if (oldMed <= 0) continue;
    const drift = ((recentAvg - oldMed) / oldMed) * 100;
    if (drift < 5) continue;
    const recentQty = recent.reduce((a, r) => a + Number(r.quantity || 0), 0);
    const last = g[g.length - 1];
    items.push({
      product: last.product_name, supplier: last.supplier || '—',
      old_median: Math.round(oldMed * 100) / 100,
      recent_avg: Math.round(recentAvg * 100) / 100,
      drift_pct: Math.round(drift),
      extra_cost_30d: round((recentAvg - oldMed) * recentQty),
      purchases: g.length,
    });
  }
  items.sort((a, b) => b.drift_pct - a.drift_pct);
  const totalExtra = items.reduce((a, i) => a + Math.max(0, i.extra_cost_30d), 0);
  return {
    items: items.slice(0, 25),
    summary: items.length
      ? `${items.length} מוצרים התייקרו ≥5% — תוספת עלות מוערכת של ₪${round(totalExtra).toLocaleString()} בחודש האחרון`
      : 'לא זוהתה התייקרות מהותית (או שאין מספיק חשבוניות סרוקות)',
    based_on: `${rows.length} שורות מחשבוניות ספקים (180 יום)`,
  };
}

// ── 6. private-event demand forecast ────────────────────────────────────────
export async function forecastEventDemand(): Promise<any> {
  const [leads, bookings] = await Promise.all([
    q(`SELECT id, status, guest_count, "createdAt" FROM "EventLead" WHERE "createdAt" > NOW() - INTERVAL '180 days'`),
    q(`SELECT lead_id, event_date, guest_count, total_ils, deposit_amount_ils FROM "EventBooking"`),
  ]);
  const monthOf = (d: any) => String(new Date(d).toISOString()).slice(0, 7);
  const months: Record<string, { leads: number; booked: number }> = {};
  const bookedLeadIds = new Set(bookings.map((b: any) => String(b.lead_id || '')));
  for (const l of leads) {
    const m = monthOf(l.createdAt);
    if (!months[m]) months[m] = { leads: 0, booked: 0 };
    months[m].leads++;
    if (bookedLeadIds.has(String(l.id)) || ['booked', 'won', 'closed'].includes(String(l.status || ''))) months[m].booked++;
  }
  const monthly = Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({
    month: m, leads: v.leads, booked: v.booked,
    conversion_pct: v.leads ? Math.round((v.booked / v.leads) * 100) : 0,
  }));
  const todayStr = ilTodayStr();
  const upcoming = bookings.filter((b: any) => String(b.event_date) >= todayStr);
  const upcomingRevenue = upcoming.reduce((a: number, b: any) => a + Number(b.total_ils || 0), 0);
  const last2 = monthly.slice(-2);
  const avgLeads = last2.length ? last2.reduce((a, m) => a + m.leads, 0) / last2.length : 0;
  const avgConv = last2.length ? last2.reduce((a, m) => a + m.conversion_pct, 0) / last2.length : 0;
  return {
    monthly,
    upcoming: { count: upcoming.length, guests: upcoming.reduce((a: number, b: any) => a + Number(b.guest_count || 0), 0), revenue: round(upcomingRevenue) },
    projection: {
      next_month_leads: Math.round(avgLeads),
      next_month_bookings: Math.round((avgLeads * avgConv) / 100),
      note: avgLeads ? `לפי קצב הלידים של החודשיים האחרונים (${Math.round(avgLeads)}/חודש, המרה ${Math.round(avgConv)}%)` : 'אין מספיק לידים לחיזוי',
    },
    based_on: `${leads.length} לידים (180 יום) + ${bookings.length} אירועים סגורים`,
  };
}
