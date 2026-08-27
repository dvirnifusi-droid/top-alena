// End-of-day WhatsApp report for the alenabepita.co.il delivery site.
//
// Two ways it reaches the owner:
//   1. A compact section appended to the nightly end-of-day brief (23:30 IL) —
//      only when the delivery site is connected, so non-delivery tenants never
//      see it. Zero new scheduler.
//   2. On demand from the app ("📊 שלח לי סיכום היום"), as a dedicated message.
//
// Both build on the same live orders feed the DeliveryOrders screen uses.
import { prisma } from '../db.js';
import { notifyOwner } from './waTemplates.js';
import { reportRecipientPhones } from './whatsappPermissions.js';
import { topDeliveryInsight } from './deliveryAnalytics.js';

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

/** Today's date (YYYY-MM-DD) in Israel time. */
export function israelToday(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // en-CA gives YYYY-MM-DD
}

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
function israelDayName(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00+02:00');
  return HE_DAYS[d.getDay()] || '';
}

export interface DeliveryStats {
  ymd: string;
  total: number;        // orders that count (not cancelled)
  cancelled: number;
  revenue: number;
  pickup: number;
  delivery: number;
  avgPrep: number;      // minutes, 0 if none
  onTimePct: number | null;
  ratingCount: number;
  ratingAvg: number | null;
  ratingLow: number;    // ≤ 3 stars
  returning: number;    // customers with ≥ 2 lifetime orders
  peakHour: string | null;
  peakCount: number;
  topItem: string | null;
  topItemQty: number;
}

/** Pull the day's orders from the WP bridge and aggregate. null = not connected. */
export async function buildDeliveryStats(ymd?: string): Promise<DeliveryStats | null> {
  const url = await secret(URL_KEY);
  const key = await secret(KEY_KEY);
  if (!url || !key) return null;
  const base = url.replace(/\/settings.*$/, '');
  const day = ymd || israelToday();
  const qs = new URLSearchParams({ from: day, to: day, status: 'all', limit: '300' });
  const bust = '&_=' + Date.now();
  let orders: any[] = [];
  try {
    const res = await fetch(base + '/orders?' + qs.toString() + bust, { headers: { 'X-Alena-Control-Key': key } });
    if (!res.ok) return null;
    const data: any = await res.json();
    orders = Array.isArray(data.orders) ? data.orders : [];
  } catch { return null; }

  const live = orders.filter((o) => o.status !== 'cancelled');
  const cancelled = orders.filter((o) => o.status === 'cancelled').length;
  const revenue = live.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const pickup = live.filter((o) => o.fulfillment === 'pickup').length;
  const delivery = live.length - pickup;

  const preps = live.filter((o) => Number(o.prep_minutes) > 0).map((o) => Number(o.prep_minutes));
  const avgPrep = preps.length ? Math.round(preps.reduce((a, b) => a + b, 0) / preps.length) : 0;

  const acc = orders.filter((o) => o.status === 'completed' && Number(o.ready_at) > 0 && Number(o.completed_at) > 0);
  const onTime = acc.filter((o) => Number(o.completed_at) <= Number(o.ready_at) + 120).length;
  const onTimePct = acc.length ? Math.round((onTime / acc.length) * 100) : null;

  const rated = orders.filter((o) => Number(o.rating) > 0);
  const ratingCount = rated.length;
  const ratingAvg = ratingCount ? Math.round((rated.reduce((s, o) => s + Number(o.rating), 0) / ratingCount) * 10) / 10 : null;
  const ratingLow = rated.filter((o) => Number(o.rating) <= 3).length;

  const returning = live.filter((o) => Number(o.customer_orders) >= 2).length;

  // Busiest hour (Israel) by created timestamp.
  const hourBuckets: Record<number, number> = {};
  live.forEach((o) => {
    if (!o.created) return;
    const h = parseInt(new Intl.DateTimeFormat('en-GB', { timeZone: ISRAEL_TZ, hour: '2-digit', hour12: false }).format(new Date(Number(o.created) * 1000)), 10);
    hourBuckets[h] = (hourBuckets[h] || 0) + 1;
  });
  let peakHour: string | null = null; let peakCount = 0;
  Object.entries(hourBuckets).forEach(([h, n]) => { if (n > peakCount) { peakCount = n; const hh = Number(h); peakHour = `${String(hh).padStart(2, '0')}:00–${String((hh + 1) % 24).padStart(2, '0')}:00`; } });

  // Top item by quantity.
  const itemQty: Record<string, number> = {};
  live.forEach((o) => (o.items || []).forEach((it: any) => { const n = String(it.name || '').trim(); if (n) itemQty[n] = (itemQty[n] || 0) + (Number(it.qty) || 1); }));
  let topItem: string | null = null; let topItemQty = 0;
  Object.entries(itemQty).forEach(([n, q]) => { if (q > topItemQty) { topItemQty = q; topItem = n; } });

  return { ymd: day, total: live.length, cancelled, revenue, pickup, delivery, avgPrep, onTimePct, ratingCount, ratingAvg, ratingLow, returning, peakHour, peakCount, topItem, topItemQty };
}

/** Full dedicated WhatsApp message. Optional `tip` (from the 7-day insight). */
export function formatDeliveryReport(s: DeliveryStats, tip?: string | null): string {
  const nis = (n: number) => '₪' + Math.round(n).toLocaleString('en-US');
  const lines: string[] = [
    `🛵 *דוח משלוחים — יום ${israelDayName(s.ymd)} ${s.ymd}*`,
    '',
  ];
  if (s.total === 0 && s.cancelled === 0) {
    lines.push('אין הזמנות היום עדיין.');
    if (tip) lines.push('', `💡 *טיפ:* ${tip}`);
    return lines.join('\n');
  }
  lines.push(`📦 הזמנות: ${s.total}${s.cancelled ? ` (❌ ${s.cancelled} ביטולים)` : ''}`);
  lines.push(`💰 מחזור: ${nis(s.revenue)}`);
  lines.push(`🥡 איסוף ${s.pickup} · 🛵 משלוח ${s.delivery}`);
  if (s.avgPrep) lines.push(`⏱ זמן הכנה ממוצע: ${s.avgPrep} דק׳${s.onTimePct !== null ? ` · ${s.onTimePct}% בזמן` : ''}`);
  if (s.ratingCount) lines.push(`⭐ דירוגים: ${s.ratingCount} (ממוצע ${s.ratingAvg})${s.ratingLow ? ` · ⚠️ ${s.ratingLow} נמוכים` : ''}`);
  if (s.returning) lines.push(`👑 לקוחות חוזרים: ${s.returning} מתוך ${s.total}`);
  if (s.peakHour) lines.push(`🔝 שעת שיא: ${s.peakHour} (${s.peakCount})`);
  if (s.topItem) lines.push(`🍽 מנה מובילה: ${s.topItem} ×${s.topItemQty}`);
  if (tip) lines.push('', `💡 *טיפ:* ${tip}`);
  lines.push('', '_עבודה יפה 🌿_');
  return lines.join('\n');
}

/** Full dedicated report text WITH the 7-day top insight appended. */
export async function buildDeliveryReportText(ymd?: string): Promise<{ text: string; stats: DeliveryStats } | null> {
  const s = await buildDeliveryStats(ymd);
  if (!s) return null;
  let tip: string | null = null;
  try { const t = await topDeliveryInsight(s.ymd); tip = t?.text || null; } catch { /* insight optional */ }
  return { text: formatDeliveryReport(s, tip), stats: s };
}

/** Compact 3-line section for the nightly end-of-day brief. null when quiet / not connected. */
export async function deliveryEodSection(ymd?: string): Promise<string | null> {
  const s = await buildDeliveryStats(ymd);
  if (!s || (s.total === 0 && s.cancelled === 0)) return null;
  const nis = (n: number) => '₪' + Math.round(n).toLocaleString('en-US');
  const parts = [`📦 ${s.total} הזמנות · ${nis(s.revenue)}`, `🥡 ${s.pickup} · 🛵 ${s.delivery}`];
  if (s.avgPrep) parts.push(`⏱ ${s.avgPrep}׳${s.onTimePct !== null ? ` · ${s.onTimePct}% בזמן` : ''}`);
  if (s.ratingCount) parts.push(`⭐ ${s.ratingAvg} (${s.ratingCount})`);
  try { const tip = await topDeliveryInsight(s.ymd); if (tip) parts.push(`💡 ${tip.text}`); } catch { /* insight optional */ }
  return parts.join('\n');
}

/** Build + send the dedicated report to the owner(s). */
export async function sendDeliveryDailyReport(ymd?: string): Promise<{ ok: boolean; sent: number; failed: number; text?: string; error?: string }> {
  const built = await buildDeliveryReportText(ymd);
  if (!built) return { ok: false, sent: 0, failed: 0, error: 'not_connected' };
  const text = built.text;
  const phones = await reportRecipientPhones();
  if (!phones.length) return { ok: false, sent: 0, failed: 0, text, error: 'no_recipient' };
  let sent = 0; let failed = 0;
  for (const phone of phones) {
    try { const r = await notifyOwner(phone, 'דוח משלוחים', text, { brand: 'עלינא' }); if (r.sent) sent++; else failed++; }
    catch { failed++; }
  }
  return { ok: sent > 0, sent, failed, text };
}
