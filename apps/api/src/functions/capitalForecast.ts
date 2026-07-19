// צפי הון — where the money actually lands, day by day.
//
// Built from three sources, in descending order of trust:
//   1. Real obligations   — open invoices with a due date from supplier terms.
//   2. Learned rhythms    — card clearing, payroll, tax, rent, read off the
//                           owner's own bank history rather than asked for.
//   3. Run-rate top-up    — where the invoices on file fall short of what the
//                           bank shows historically leaving for suppliers.
//
// The third source exists because under-forecasting outflow is the dangerous
// direction: a forecast that only counts the invoices already scanned would
// quietly promise money that is really already committed. It is labelled
// separately so the owner can see exactly how much of the forecast is estimate.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { requirePageAccess } from '../lib/pagePermissions.js';
import { detectPatterns, projectFromPatterns, type ProjectedEvent } from '../lib/cashPatterns.js';
import { loadOpenInvoices, getVatSettingRow } from './bankStatement.js';
import { dbDate } from '../lib/bankPersist.js';

const isAdmin = (user: any) => user?.role === 'owner' || user?.role === 'admin';
const dbx = () => prisma as any;
const DAY = 86400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: any) => (v == null ? 0 : Number(v));

// Suppliers get their dates from invoices, so their statistical pattern must be
// suppressed — counting both would bill the owner twice for the same shekel.
const SUPPLIER_CATS = new Set(['expense_supplier_transfer', 'expense_supplier_check']);

registerFn('getCapitalForecast', async ({ user, body }: any) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdmin(user)) throw new Error('forbidden');
  await requirePageAccess(user, 'CashFlow');
  return computeCapitalForecast(Number((body || {}).days) || 90);
});

/** The forecast itself, callable from other server code (recommendations). */
export async function computeCapitalForecast(daysIn: number): Promise<any> {
  const horizon = Math.min(180, Math.max(14, Number(daysIn) || 90));

  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT tx_date, amount, balance, category, description
     FROM "BankTransaction" ORDER BY tx_date`).catch(() => []);

  if (rows.length < 20) {
    return {
      has_data: false,
      reason: 'צריך ייבוא עו"ש (רצוי 3 חודשים ומעלה) כדי לבנות צפי אמין',
      transactions: rows.length,
    };
  }

  const txs = rows.map((r: any) => ({
    date: dbDate(r.tx_date),
    amount: n(r.amount),
    balance: r.balance == null ? null : n(r.balance),
    category: r.category || 'unknown',
  }));

  // ── where we start from ──────────────────────────────────────────────────
  // The last printed balance is ground truth; anything the bank recorded after
  // it still has to be added, or the forecast starts from a stale number.
  const lastBal = [...txs].reverse().find((t) => t.balance != null);
  const anchorDate = lastBal?.date || txs[txs.length - 1].date;
  const after = txs.filter((t) => t.date > anchorDate).reduce((s, t) => s + t.amount, 0);
  const opening = (lastBal?.balance ?? 0) + after;

  const info: any[] = await dbx().$queryRawUnsafe(
    `SELECT credit_line FROM "BankAccountInfo" ORDER BY updated_at DESC LIMIT 1`).catch(() => []);
  const creditLine = Math.abs(n(info[0]?.credit_line)) || 0;

  // ── learned rhythms ──────────────────────────────────────────────────────
  const patterns = detectPatterns(txs);
  const today = new Date(`${ymd(new Date())}T00:00:00.000Z`);
  const start = new Date(Math.max(today.getTime(), Date.parse(anchorDate)));
  const end = new Date(start.getTime() + horizon * DAY);

  // VAT gets scheduled explicitly when the owner has told us the period, so its
  // learned (and erratic) pattern must be suppressed to avoid paying it twice.
  const vat = await getVatSettingRow();
  const skip = new Set(SUPPLIER_CATS);
  if (vat.enabled) skip.add('expense_vat');

  const events: ProjectedEvent[] = projectFromPatterns(patterns, start, end, skip);

  if (vat.enabled) {
    const vatPattern = patterns.find((p) => p.category === 'expense_vat');
    const perMonth = vat.amount_mode === 'fixed' && vat.fixed_amount
      ? vat.fixed_amount
      : (vatPattern?.monthly_total || 0);
    // A bi-monthly filer pays one period's worth, i.e. two months of VAT.
    const perPayment = vat.period === 'bimonthly' ? perMonth * 2 : perMonth;

    if (perPayment > 0) {
      let y = start.getUTCFullYear(), m = start.getUTCMonth();
      for (let i = 0; i < 24; i++) {
        // Israeli bi-monthly periods are fixed by law (Jan-Feb, Mar-Apr, ...)
        // and each is paid the month after it closes — so payments always fall
        // in an odd month. This is the statutory calendar, not a preference.
        const isPaymentMonth = vat.period === 'monthly' || (m % 2 === 0);
        if (isPaymentMonth) {
          const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
          const d = new Date(Date.UTC(y, m, Math.min(vat.payment_day, last)));
          if (d > end) break;
          if (d > start) {
            const periodLabel = vat.period === 'bimonthly' ? 'דו-חודשי' : 'חודשי';
            events.push({
              date: ymd(d), amount: -perPayment, label: 'מע"מ',
              category: 'expense_vat',
              source: `דיווח ${periodLabel}, תשלום ב-${vat.payment_day} לחודש · ${
                vat.amount_mode === 'fixed' ? 'סכום שהוגדר ידנית' : 'הערכה לפי ממוצע התשלומים בעו"ש'}`,
              confidence: vat.amount_mode === 'fixed' ? 'high' : 'medium',
            });
          }
        }
        m += 1;
        if (m > 11) { y += 1; m = 0; }
      }
    }
  }

  // ── real obligations ─────────────────────────────────────────────────────
  const matched: any[] = await dbx().$queryRawUnsafe(
    `SELECT DISTINCT invoice_id FROM "BankTxMatch"`).catch(() => []);
  const paid = new Set(matched.map((r: any) => String(r.invoice_id)));

  // A supplier settled on the company card is already inside the monthly card
  // payment the bank shows. Scheduling their invoices as separate transfers on
  // top of it would bill the owner twice for the same purchase.
  const allOpen = (await loadOpenInvoices()).filter((i) => !paid.has(i.id));
  const cardCovered = allOpen.filter((i: any) => i.paid_by_card);
  const invoices = allOpen.filter((i: any) => !i.paid_by_card);
  const startKey = ymd(start), endKey = ymd(end);

  // How long past due before "unpaid" stops being believable. A business that
  // pays its suppliers does not have a three-month-old invoice still open — that
  // is a record-keeping gap, and projecting it as cash about to leave produces a
  // terrifying and false forecast. Before supplier terms are entered EVERY
  // invoice defaults to "immediate", so without this guard the entire scanned
  // history lands as one imaginary outflow on day one.
  const STALE_DAYS = 45;
  const staleKey = ymd(new Date(start.getTime() - STALE_DAYS * DAY));

  let overdueTotal = 0;
  let staleTotal = 0;
  const overdue: any[] = [];
  const stale: any[] = [];
  for (const inv of invoices) {
    if (inv.due_date < staleKey) {
      // Almost certainly already paid and never marked. Reported so the owner
      // can reconcile it, but kept out of the cash projection.
      staleTotal += inv.amount;
      stale.push(inv);
      continue;
    }
    if (inv.due_date < startKey) {
      // Recently past due and still unpaid — it has not left the account, so it
      // is a real claim on tomorrow's cash, not history.
      overdueTotal += inv.amount;
      overdue.push(inv);
      continue;
    }
    if (inv.due_date > endKey) continue;
    events.push({
      date: inv.due_date, amount: -inv.amount,
      label: `חשבונית — ${inv.supplier_name}`,
      category: 'expense_supplier_invoice',
      source: `חשבונית מ-${inv.invoice_date} לפי תנאי התשלום של הספק`,
      confidence: 'high',
    });
  }
  if (overdueTotal > 0) {
    events.push({
      date: ymd(new Date(start.getTime() + DAY)),
      amount: -overdueTotal,
      label: `חשבוניות באיחור (${overdue.length})`,
      category: 'expense_supplier_invoice',
      source: 'חשבונות שמועד התשלום שלהם עבר וטרם שולמו — מוצגים כיציאה מיידית',
      confidence: 'medium',
    });
  }

  // ── run-rate top-up ──────────────────────────────────────────────────────
  // How much the bank says suppliers cost per month, vs how much the invoices
  // on file account for. The shortfall is real spending we simply have no
  // invoice for yet.
  const supplierRunRate = patterns
    .filter((p) => SUPPLIER_CATS.has(p.category))
    .reduce((s, p) => s + p.monthly_total, 0);

  const invoiceByMonth = new Map<string, number>();
  for (const e of events) {
    if (e.category !== 'expense_supplier_invoice') continue;
    const k = e.date.slice(0, 7);
    invoiceByMonth.set(k, (invoiceByMonth.get(k) || 0) + Math.abs(e.amount));
  }

  let topUpTotal = 0;
  if (supplierRunRate > 0) {
    for (let d = new Date(start); d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      const k = ymd(d).slice(0, 7);
      const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      const from = new Date(Math.max(monthStart.getTime(), start.getTime() + DAY));
      const to = new Date(Math.min(monthEnd.getTime(), end.getTime()));
      const daysInWindow = Math.round((to.getTime() - from.getTime()) / DAY) + 1;
      if (daysInWindow <= 0) continue;

      // Only the covered slice of the month counts, so a part-month at either
      // end of the horizon is not charged a whole month of supplier spend.
      const expected = supplierRunRate * (daysInWindow / monthEnd.getUTCDate());
      const known = invoiceByMonth.get(k) || 0;
      const gap = expected - known;
      if (gap <= 100) continue;

      const perDay = gap / daysInWindow;
      topUpTotal += gap;
      for (let x = new Date(from); x <= to; x = new Date(x.getTime() + DAY)) {
        events.push({
          date: ymd(x), amount: -perDay,
          label: 'ספקים — השלמה להערכה',
          category: 'expense_supplier_estimate',
          source: `לפי העו"ש ספקים עולים ${Math.round(supplierRunRate).toLocaleString()} ₪ בחודש; החשבוניות שבמערכת מכסות ${Math.round(known).toLocaleString()} ₪ מהחודש הזה`,
          confidence: 'low',
        });
      }
    }
  }

  // ── daily series ─────────────────────────────────────────────────────────
  const byDay = new Map<string, ProjectedEvent[]>();
  for (const e of events) {
    if (e.date <= ymd(start) || e.date > endKey) continue;
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date)!.push(e);
  }

  const days: any[] = [];
  let balance = opening;
  let minPoint = { date: ymd(start), balance: opening };
  let firstNegative: string | null = null;
  let firstBeyondCredit: string | null = null;

  for (let d = new Date(start.getTime() + DAY); d <= end; d = new Date(d.getTime() + DAY)) {
    const key = ymd(d);
    const list = byDay.get(key) || [];
    const inSum = list.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
    const outSum = list.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
    balance += inSum - outSum;

    if (balance < minPoint.balance) minPoint = { date: key, balance };
    if (firstNegative === null && balance < 0) firstNegative = key;
    if (firstBeyondCredit === null && creditLine > 0 && balance < -creditLine) firstBeyondCredit = key;

    days.push({
      date: key,
      in: Math.round(inSum),
      out: Math.round(outSum),
      net: Math.round(inSum - outSum),
      balance: Math.round(balance),
      events: list
        .filter((e) => Math.abs(e.amount) >= 50)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
        .slice(0, 6)
        .map((e) => ({ label: e.label, amount: Math.round(e.amount), source: e.source, confidence: e.confidence })),
    });
  }

  // ── drivers ──────────────────────────────────────────────────────────────
  const agg = new Map<string, { label: string; total: number }>();
  for (const e of events) {
    if (e.date <= ymd(start) || e.date > endKey) continue;
    const k = e.category;
    const cur = agg.get(k) || { label: e.label.replace(/\s*\(.*\)$/, ''), total: 0 };
    cur.total += e.amount;
    agg.set(k, cur);
  }
  const drivers = [...agg.entries()]
    .map(([category, v]) => ({ category, label: v.label, total: Math.round(v.total) }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const totalIn = days.reduce((s, d) => s + d.in, 0);
  const totalOut = days.reduce((s, d) => s + d.out, 0);

  const warnings: string[] = [];
  if (topUpTotal > 0) {
    warnings.push(`${Math.round(topUpTotal).toLocaleString()} ₪ מהצפי הם הערכה לפי הרגלי העבר ולא חשבוניות בפועל — סרוק חשבוניות כדי לדייק`);
  }
  const lowConf = patterns.filter((p) => p.confidence === 'low');
  if (lowConf.length) {
    warnings.push(`${lowConf.length} קטגוריות ללא דפוס ברור (${lowConf.slice(0, 3).map((p) => p.label).join(', ')}) — נפרסו כממוצע יומי`);
  }
  if (stale.length) {
    warnings.push(`${stale.length} חשבוניות (${Math.round(staleTotal).toLocaleString()} ₪) פתוחות מעל ${STALE_DAYS} יום — לא נכללות בצפי כי כמעט בוודאות שולמו ולא סומנו. הזן תנאי תשלום לספקים והרץ שיוך תשלומים.`);
  }
  const ageDays = Math.round((Date.now() - Date.parse(anchorDate)) / DAY);
  if (ageDays > 7) {
    warnings.push(`העו"ש מעודכן ל-${anchorDate} (לפני ${ageDays} ימים) — ייבא ייצוא עדכני לדיוק מלא`);
  }

  return {
    has_data: true,
    horizon,
    opening: { balance: Math.round(opening), date: anchorDate, age_days: ageDays },
    credit_line: creditLine,
    closing: { balance: Math.round(balance), date: endKey },
    total_in: Math.round(totalIn),
    total_out: Math.round(totalOut),
    net: Math.round(totalIn - totalOut),
    min_point: { date: minPoint.date, balance: Math.round(minPoint.balance) },
    first_negative: firstNegative,
    first_beyond_credit: firstBeyondCredit,
    days,
    drivers,
    patterns,
    vat: { enabled: vat.enabled, period: vat.period, payment_day: vat.payment_day },
    estimate_share: totalOut > 0 ? Math.round((topUpTotal / totalOut) * 100) : 0,
    known_invoices: invoices.filter((i) => i.due_date >= startKey && i.due_date <= endKey).length,
    overdue_invoices: overdue.length,
    overdue_amount: Math.round(overdueTotal),
    stale_invoices: stale.length,
    stale_amount: Math.round(staleTotal),
    card_covered_invoices: cardCovered.length,
    card_covered_amount: Math.round(cardCovered.reduce((t: number, i: any) => t + i.amount, 0)),
    warnings,
  };
}
