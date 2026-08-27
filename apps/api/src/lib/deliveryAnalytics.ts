// Delivery-site analytics over a date range for the /DeliveryAnalytics page.
// Server-side aggregation of the same WP orders feed the DeliveryOrders screen
// uses, bucketed by day / hour / item / customer. Owner-only (the caller gates).
import { prisma } from '../db.js';

const URL_KEY = 'ALENA_WP_CONTROL_URL';
const KEY_KEY = 'ALENA_WP_CONTROL_KEY';
const ISRAEL_TZ = 'Asia/Jerusalem';

async function secret(key: string): Promise<string> {
  try {
    const r = await prisma.integrationSecret.findFirst({ where: { key } });
    if (r?.value) return r.value;
  } catch { /* fall through to env */ }
  return process.env[key] || '';
}

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

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

export async function buildDeliveryAnalytics(fromYmd: string, toYmd: string): Promise<any | null> {
  const url = await secret(URL_KEY);
  const key = await secret(KEY_KEY);
  if (!url || !key) return null;
  const base = url.replace(/\/settings.*$/, '');
  const qs = new URLSearchParams({ from: fromYmd, to: toYmd, status: 'all', limit: '300' });
  let orders: any[] = [];
  try {
    const res = await fetch(base + '/orders?' + qs.toString() + '&_=' + Date.now(), { headers: { 'X-Alena-Control-Key': key } });
    if (!res.ok) return null;
    const data: any = await res.json();
    orders = Array.isArray(data.orders) ? data.orders : [];
  } catch { return null; }

  const capped = orders.length >= 300; // hit the feed's per-request cap
  const live = orders.filter((o) => o.status !== 'cancelled');
  const cancelled = orders.length - live.length;
  const revenue = live.reduce((s, o) => s + (Number(o.total) || 0), 0);

  const preps = live.filter((o) => Number(o.prep_minutes) > 0).map((o) => Number(o.prep_minutes));
  const avgPrep = preps.length ? Math.round(preps.reduce((a, b) => a + b, 0) / preps.length) : 0;
  const acc = orders.filter((o) => o.status === 'completed' && Number(o.ready_at) > 0 && Number(o.completed_at) > 0);
  const onTime = acc.filter((o) => Number(o.completed_at) <= Number(o.ready_at) + 120).length;
  const onTimePct = acc.length ? Math.round((onTime / acc.length) * 100) : null;

  const pickup = live.filter((o) => o.fulfillment === 'pickup').length;
  const delivery = live.length - pickup;
  const returning = live.filter((o) => Number(o.customer_orders) >= 2).length;

  const rated = orders.filter((o) => Number(o.rating) > 0);
  const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rated.forEach((o) => { const r = Math.max(1, Math.min(5, Number(o.rating))); ratingDist[r]++; });
  const ratingAvg = rated.length ? Math.round((rated.reduce((s, o) => s + Number(o.rating), 0) / rated.length) * 10) / 10 : null;

  // By day (all days in range, zero-filled).
  const dayMap: Record<string, { orders: number; revenue: number; acc: number; onTime: number }> = {};
  eachDay(fromYmd, toYmd).forEach((d) => { dayMap[d] = { orders: 0, revenue: 0, acc: 0, onTime: 0 }; });
  live.forEach((o) => {
    if (!o.created) return;
    const d = israelYMD(Number(o.created));
    if (!dayMap[d]) dayMap[d] = { orders: 0, revenue: 0, acc: 0, onTime: 0 };
    dayMap[d].orders++; dayMap[d].revenue += Number(o.total) || 0;
  });
  acc.forEach((o) => {
    const d = israelYMD(Number(o.created));
    if (dayMap[d]) { dayMap[d].acc++; if (Number(o.completed_at) <= Number(o.ready_at) + 120) dayMap[d].onTime++; }
  });
  const byDay = Object.keys(dayMap).sort().map((d) => ({
    ymd: d, label: d.slice(5), orders: dayMap[d].orders, revenue: Math.round(dayMap[d].revenue),
    onTimePct: dayMap[d].acc ? Math.round((dayMap[d].onTime / dayMap[d].acc) * 100) : null,
  }));

  // By hour (0–23).
  const hourCnt: number[] = new Array(24).fill(0);
  live.forEach((o) => { if (o.created) hourCnt[israelHour(Number(o.created))]++; });
  const byHour = hourCnt.map((n, h) => ({ hour: h, label: String(h).padStart(2, '0'), orders: n }));

  // Top items.
  const itemQty: Record<string, number> = {};
  live.forEach((o) => (o.items || []).forEach((it: any) => { const n = String(it.name || '').trim(); if (n) itemQty[n] = (itemQty[n] || 0) + (Number(it.qty) || 1); }));
  const totalItemQty = Object.values(itemQty).reduce((a, b) => a + b, 0);
  const topItems = Object.entries(itemQty).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 10);

  // Top customers (by phone; name from the order).
  const custMap: Record<string, { name: string; orders: number; spend: number }> = {};
  live.forEach((o) => {
    const p = String(o.phone || '').trim(); if (!p) return;
    if (!custMap[p]) custMap[p] = { name: String(o.customer || '').trim() || p, orders: 0, spend: 0 };
    custMap[p].orders++; custMap[p].spend += Number(o.total) || 0;
  });
  const topCustomers = Object.values(custMap).map((c) => ({ ...c, spend: Math.round(c.spend) })).sort((a, b) => b.spend - a.spend).slice(0, 6);

  const totals = {
    orders: live.length,
    revenue: Math.round(revenue),
    avgOrder: live.length ? Math.round(revenue / live.length) : 0,
    avgPrep,
    onTimePct,
    returningPct: live.length ? Math.round((returning / live.length) * 100) : 0,
    cancelPct: orders.length ? Math.round((cancelled / orders.length) * 100) : 0,
    pickup, delivery,
    ratingAvg, ratingCount: rated.length,
  };

  // ---- Automatic insights: turn the aggregates into actionable advice ----
  const insights: Array<{ icon: string; tone: 'good' | 'warn' | 'tip'; text: string }> = [];
  const pad = (n: number) => String(n).padStart(2, '0');
  if (live.length >= 5) {
    // Peak hour.
    const peak = byHour.reduce((a, b) => (b.orders > a.orders ? b : a), { hour: -1, orders: 0 } as any);
    if (peak.orders >= 3) insights.push({ icon: '🔝', tone: 'tip', text: `שעת השיא היא ${pad(peak.hour)}:00–${pad((peak.hour + 1) % 24)}:00 (${peak.orders} הזמנות) — ודאו כיסוי מטבח ושליחים סביבה` });

    // Best / worst weekday (averaged across the range).
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
  if (onTimePct != null && acc.length >= 4) {
    if (onTimePct < 60) insights.push({ icon: '⏱️', tone: 'warn', text: `רק ${onTimePct}% מההזמנות הגיעו בזמן שהובטח — זמני ההכנה אולי אופטימיים מדי, שקלו להאריך` });
    else if (onTimePct >= 90) insights.push({ icon: '✅', tone: 'good', text: `${onTimePct}% מההזמנות בזמן — עמידה מצוינת בהבטחה ללקוח` });
  }
  if (totals.cancelPct > 8 && orders.length >= 8) insights.push({ icon: '⚠️', tone: 'warn', text: `${totals.cancelPct}% ביטולים — בדקו זמינות מנות, שעות פעילות ואזורי משלוח` });
  if (live.length >= 10) {
    if (totals.returningPct >= 40) insights.push({ icon: '👑', tone: 'good', text: `${totals.returningPct}% מההזמנות מלקוחות חוזרים — נאמנות גבוהה` });
    else if (totals.returningPct < 20) insights.push({ icon: '💡', tone: 'tip', text: `רק ${totals.returningPct}% לקוחות חוזרים — שקלו הטבת-חזרה או מועדון` });
    const pk = Math.round((pickup / live.length) * 100);
    if (pk >= 60) insights.push({ icon: '🛵', tone: 'tip', text: `${pk}% מההזמנות איסוף עצמי — קידום משלוח יכול להגדיל את הסל` });
  }
  if (totalItemQty > 0 && topItems[0]) {
    const share = Math.round((topItems[0].qty / totalItemQty) * 100);
    if (share >= 30) insights.push({ icon: '🍽️', tone: 'tip', text: `"${topItems[0].name}" לבד ${share}% מהמנות — תלות גבוהה, שקלו לקדם מנות נוספות` });
  }
  if (ratingAvg != null && rated.length >= 3 && ratingAvg < 4) insights.push({ icon: '⭐', tone: 'warn', text: `דירוג ממוצע ${ratingAvg} — עברו על התלונות האחרונות בעמוד ההזמנות` });
  // Order: warnings first (act now), then tips, then positives; cap at 5.
  const order = { warn: 0, tip: 1, good: 2 };
  insights.sort((a, b) => order[a.tone] - order[b.tone]);
  const insightsTop = insights.slice(0, 5);

  return {
    range: { from: fromYmd, to: toYmd },
    capped,
    totals,
    insights: insightsTop,
    byDay, byHour, topItems, topCustomers, ratingDist,
  };
}
