// Delivery-site analytics over a date range for the /DeliveryAnalytics page.
//
// Prefers the WP server-side rollup (/control/orders-summary — no 300-order cap);
// falls back to aggregating the raw /control/orders feed (capped at 300) when the
// plugin is older. Also computes previous-period deltas for each KPI. Owner-only
// (the caller gates).
import { prisma } from '../db.js';

const URL_KEY = 'ALENA_WP_CONTROL_URL';
const KEY_KEY = 'ALENA_WP_CONTROL_KEY';
const ISRAEL_TZ = 'Asia/Jerusalem';
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

async function secret(key: string): Promise<string> {
  try {
    const r = await prisma.integrationSecret.findFirst({ where: { key } });
    if (r?.value) return r.value;
  } catch { /* fall through to env */ }
  return process.env[key] || '';
}

function israelYMD(epochSec: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(epochSec * 1000));
}
function israelHour(epochSec: number): number {
  return parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', hour12: false }).format(new Date(epochSec * 1000)), 10);
}
function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + 'T12:00:00Z');
  const end = new Date(to + 'T12:00:00Z');
  let guard = 0;
  while (d <= end && guard < 400) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); guard++; }
  return out;
}
function addDaysYMD(ymd: string, n: number): string {
  const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

type Counters = {
  orders: number; revenue: number; pickup: number; delivery: number; cancelled: number;
  prep_sum: number; prep_n: number; ontime_num: number; ontime_den: number;
  returning: number; rating_sum: number; rating_n: number;
};
type DayAgg = { orders: number; revenue: number; acc: number; ontime: number };

function assembleTotals(c: Counters) {
  return {
    orders: c.orders,
    revenue: Math.round(c.revenue),
    avgOrder: c.orders ? Math.round(c.revenue / c.orders) : 0,
    avgPrep: c.prep_n ? Math.round(c.prep_sum / c.prep_n) : 0,
    onTimePct: c.ontime_den ? Math.round((c.ontime_num / c.ontime_den) * 100) : null,
    returningPct: c.orders ? Math.round((c.returning / c.orders) * 100) : 0,
    cancelPct: (c.orders + c.cancelled) ? Math.round((c.cancelled / (c.orders + c.cancelled)) * 100) : 0,
    pickup: c.pickup, delivery: c.delivery,
    ratingAvg: c.rating_n ? Math.round((c.rating_sum / c.rating_n) * 10) / 10 : null,
    ratingCount: c.rating_n,
  };
}
function buildByDay(dayMap: Record<string, DayAgg>, from: string, to: string) {
  const filled: Record<string, DayAgg> = {};
  eachDay(from, to).forEach((d) => { filled[d] = dayMap[d] || { orders: 0, revenue: 0, acc: 0, ontime: 0 }; });
  return Object.keys(filled).sort().map((d) => ({
    ymd: d, label: d.slice(5), orders: filled[d].orders, revenue: Math.round(filled[d].revenue),
    onTimePct: filled[d].acc ? Math.round((filled[d].ontime / filled[d].acc) * 100) : null,
  }));
}
function buildByHour(hourArr: number[]) {
  return hourArr.map((n, h) => ({ hour: h, label: String(h).padStart(2, '0'), orders: n || 0 }));
}
function topItemsFrom(map: Record<string, number>) {
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  const top = Object.entries(map).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 10);
  return { top, total };
}
function topCustomersFrom(list: Array<{ name: string; orders: number; spend: number }>) {
  return list.map((c) => ({ ...c, spend: Math.round(c.spend) })).sort((a, b) => b.spend - a.spend).slice(0, 6);
}

async function fetchSummary(base: string, key: string, from: string, to: string): Promise<any | null> {
  try {
    const qs = new URLSearchParams({ from, to });
    const res = await fetch(base + '/orders-summary?' + qs.toString() + '&_=' + Date.now(), { headers: { 'X-Alena-Control-Key': key } });
    if (!res.ok) return null; // 404 on older plugin → fall back
    const d: any = await res.json();
    return d && d.ok ? d : null;
  } catch { return null; }
}

async function fetchOrders(base: string, key: string, from: string, to: string): Promise<any[] | null> {
  try {
    const qs = new URLSearchParams({ from, to, status: 'all', limit: '300' });
    const res = await fetch(base + '/orders?' + qs.toString() + '&_=' + Date.now(), { headers: { 'X-Alena-Control-Key': key } });
    if (!res.ok) return null;
    const d: any = await res.json();
    return Array.isArray(d.orders) ? d.orders : [];
  } catch { return null; }
}

// Counters-only aggregation of the raw feed (for the fallback previous period).
function countersFromOrders(orders: any[]): Counters {
  const live = orders.filter((o) => o.status !== 'cancelled');
  const acc = orders.filter((o) => o.status === 'completed' && Number(o.ready_at) > 0 && Number(o.completed_at) > 0);
  const rated = orders.filter((o) => Number(o.rating) > 0);
  return {
    orders: live.length,
    revenue: live.reduce((s, o) => s + (Number(o.total) || 0), 0),
    pickup: live.filter((o) => o.fulfillment === 'pickup').length,
    delivery: live.filter((o) => o.fulfillment !== 'pickup').length,
    cancelled: orders.length - live.length,
    prep_sum: live.reduce((s, o) => s + (Number(o.prep_minutes) > 0 ? Number(o.prep_minutes) : 0), 0),
    prep_n: live.filter((o) => Number(o.prep_minutes) > 0).length,
    ontime_num: acc.filter((o) => Number(o.completed_at) <= Number(o.ready_at) + 120).length,
    ontime_den: acc.length,
    returning: live.filter((o) => Number(o.customer_orders) >= 2).length,
    rating_sum: rated.reduce((s, o) => s + Number(o.rating), 0),
    rating_n: rated.length,
  };
}

function computeInsights(totals: any, byDay: any[], byHour: any[], topItems: any[], totalItemQty: number, accDen: number): Array<{ icon: string; tone: string; text: string }> {
  const insights: Array<{ icon: string; tone: string; text: string }> = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  if (totals.orders >= 5) {
    const peak = byHour.reduce((a, b) => (b.orders > a.orders ? b : a), { hour: -1, orders: 0 });
    if (peak.orders >= 3) insights.push({ icon: '🔝', tone: 'tip', text: `שעת השיא היא ${pad(peak.hour)}:00–${pad((peak.hour + 1) % 24)}:00 (${peak.orders} הזמנות) — ודאו כיסוי מטבח ושליחים סביבה` });
    const wd: Record<number, { o: number; days: number }> = {};
    byDay.forEach((d) => { const w = new Date(d.ymd + 'T12:00:00Z').getUTCDay(); (wd[w] = wd[w] || { o: 0, days: 0 }); wd[w].o += d.orders; wd[w].days++; });
    const wdArr = Object.entries(wd).filter(([, v]) => v.days > 0).map(([w, v]) => ({ w: Number(w), avg: v.o / v.days }));
    if (wdArr.length >= 3) {
      const best = wdArr.reduce((a, b) => (b.avg > a.avg ? b : a));
      const worst = wdArr.reduce((a, b) => (b.avg < a.avg ? b : a));
      if (best.avg > 0) insights.push({ icon: '📈', tone: 'good', text: `יום ${HE_DAYS[best.w]} הכי חזק (≈${Math.round(best.avg)} הזמנות ליום)` });
      if (worst.avg < best.avg * 0.6) insights.push({ icon: '💡', tone: 'tip', text: `יום ${HE_DAYS[worst.w]} הכי חלש (≈${Math.round(worst.avg)}) — שקלו מבצע ייעודי ליום ${HE_DAYS[worst.w]}` });
    }
  }
  if (totals.onTimePct != null && accDen >= 4) {
    if (totals.onTimePct < 60) insights.push({ icon: '⏱️', tone: 'warn', text: `רק ${totals.onTimePct}% מההזמנות הגיעו בזמן שהובטח — זמני ההכנה אולי אופטימיים מדי, שקלו להאריך` });
    else if (totals.onTimePct >= 90) insights.push({ icon: '✅', tone: 'good', text: `${totals.onTimePct}% מההזמנות בזמן — עמידה מצוינת בהבטחה ללקוח` });
  }
  if (totals.cancelPct > 8 && totals.orders >= 8) insights.push({ icon: '⚠️', tone: 'warn', text: `${totals.cancelPct}% ביטולים — בדקו זמינות מנות, שעות פעילות ואזורי משלוח` });
  if (totals.orders >= 10) {
    if (totals.returningPct >= 40) insights.push({ icon: '👑', tone: 'good', text: `${totals.returningPct}% מההזמנות מלקוחות חוזרים — נאמנות גבוהה` });
    else if (totals.returningPct < 20) insights.push({ icon: '💡', tone: 'tip', text: `רק ${totals.returningPct}% לקוחות חוזרים — שקלו הטבת-חזרה או מועדון` });
    const pk = Math.round((totals.pickup / totals.orders) * 100);
    if (pk >= 60) insights.push({ icon: '🛵', tone: 'tip', text: `${pk}% מההזמנות איסוף עצמי — קידום משלוח יכול להגדיל את הסל` });
  }
  if (totalItemQty > 0 && topItems[0]) {
    const share = Math.round((topItems[0].qty / totalItemQty) * 100);
    if (share >= 30) insights.push({ icon: '🍽️', tone: 'tip', text: `"${topItems[0].name}" לבד ${share}% מהמנות — תלות גבוהה, שקלו לקדם מנות נוספות` });
  }
  if (totals.ratingAvg != null && totals.ratingCount >= 3 && totals.ratingAvg < 4) insights.push({ icon: '⭐', tone: 'warn', text: `דירוג ממוצע ${totals.ratingAvg} — עברו על התלונות האחרונות בעמוד ההזמנות` });
  const order: Record<string, number> = { warn: 0, tip: 1, good: 2 };
  insights.sort((a, b) => order[a.tone] - order[b.tone]);
  return insights.slice(0, 5);
}

function buildDeltas(cur: any, prev: any) {
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : (a > 0 ? 100 : null));
  const pt = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);
  return {
    orders: pct(cur.orders, prev.orders),
    revenue: pct(cur.revenue, prev.revenue),
    avgOrder: pct(cur.avgOrder, prev.avgOrder),
    onTimePct: pt(cur.onTimePct, prev.onTimePct),
    returningPct: pt(cur.returningPct, prev.returningPct),
    cancelPct: pt(cur.cancelPct, prev.cancelPct),
  };
}

export async function buildDeliveryAnalytics(fromYmd: string, toYmd: string): Promise<any | null> {
  const url = await secret(URL_KEY);
  const key = await secret(KEY_KEY);
  if (!url || !key) return null;
  const base = url.replace(/\/settings.*$/, '');

  // Previous period = the equal-length window immediately before [from,to].
  const span = eachDay(fromYmd, toYmd).length;
  const prevTo = addDaysYMD(fromYmd, -1);
  const prevFrom = addDaysYMD(prevTo, -(span - 1));

  let totals: any; let byDay: any[]; let byHour: any[]; let topItems: any[]; let topCustomers: any[];
  let ratingDist: any; let totalItemQty = 0; let accDen = 0; let capped = false; let prevTotals: any = null;

  const summary = await fetchSummary(base, key, fromYmd, toYmd);
  if (summary) {
    const c: Counters = summary.totals;
    totals = assembleTotals(c);
    accDen = c.ontime_den;
    byDay = buildByDay(summary.by_day || {}, fromYmd, toYmd);
    byHour = buildByHour(summary.by_hour || []);
    const ti = topItemsFrom(summary.items || {}); topItems = ti.top; totalItemQty = ti.total;
    topCustomers = topCustomersFrom(Object.values(summary.customers || {}));
    ratingDist = summary.ratings || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    const prevSummary = await fetchSummary(base, key, prevFrom, prevTo);
    if (prevSummary) prevTotals = assembleTotals(prevSummary.totals);
  } else {
    // Fallback: raw feed (capped at 300).
    const orders = await fetchOrders(base, key, fromYmd, toYmd);
    if (!orders) return null;
    capped = orders.length >= 300;
    const live = orders.filter((o) => o.status !== 'cancelled');
    const c = countersFromOrders(orders);
    totals = assembleTotals(c); accDen = c.ontime_den;
    const dayMap: Record<string, DayAgg> = {};
    live.forEach((o) => { if (!o.created) return; const d = israelYMD(Number(o.created)); (dayMap[d] = dayMap[d] || { orders: 0, revenue: 0, acc: 0, ontime: 0 }); dayMap[d].orders++; dayMap[d].revenue += Number(o.total) || 0; });
    orders.filter((o) => o.status === 'completed' && Number(o.ready_at) > 0 && Number(o.completed_at) > 0).forEach((o) => { const d = israelYMD(Number(o.created)); if (dayMap[d]) { dayMap[d].acc++; if (Number(o.completed_at) <= Number(o.ready_at) + 120) dayMap[d].ontime++; } });
    byDay = buildByDay(dayMap, fromYmd, toYmd);
    const hourArr = new Array(24).fill(0);
    live.forEach((o) => { if (o.created) hourArr[israelHour(Number(o.created))]++; });
    byHour = buildByHour(hourArr);
    const itemMap: Record<string, number> = {};
    live.forEach((o) => (o.items || []).forEach((it: any) => { const n = String(it.name || '').trim(); if (n) itemMap[n] = (itemMap[n] || 0) + (Number(it.qty) || 1); }));
    const ti = topItemsFrom(itemMap); topItems = ti.top; totalItemQty = ti.total;
    const custMap: Record<string, { name: string; orders: number; spend: number }> = {};
    live.forEach((o) => { const p = String(o.phone || '').trim(); if (!p) return; (custMap[p] = custMap[p] || { name: String(o.customer || '').trim() || p, orders: 0, spend: 0 }); custMap[p].orders++; custMap[p].spend += Number(o.total) || 0; });
    topCustomers = topCustomersFrom(Object.values(custMap));
    ratingDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    orders.filter((o) => Number(o.rating) > 0).forEach((o) => { const r = Math.max(1, Math.min(5, Number(o.rating))); ratingDist[r]++; });
    const prevOrders = await fetchOrders(base, key, prevFrom, prevTo);
    if (prevOrders) prevTotals = assembleTotals(countersFromOrders(prevOrders));
  }

  const insights = computeInsights(totals, byDay, byHour, topItems, totalItemQty, accDen);
  const deltas = prevTotals ? buildDeltas(totals, prevTotals) : null;

  return {
    range: { from: fromYmd, to: toYmd },
    prevRange: { from: prevFrom, to: prevTo },
    capped, totals, deltas, insights, byDay, byHour, topItems, topCustomers, ratingDist,
  };
}
