// What to actually DO about the cash flow.
//
// The forecast says what will happen. This says what can be changed, with the
// shekel figure attached to each move — because "you will be 40k short on the
// 9th" is only useful next to "here is the 23k you are sending to a savings
// fund while sitting in overdraft".
//
// Nothing here touches the forecast's numbers. Making the projection look
// healthier is not the goal and would be actively harmful; the goal is a
// healthier account.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { requirePageAccess } from '../lib/pagePermissions.js';
import { detectPatterns } from '../lib/cashPatterns.js';
import { computeCapitalForecast } from './capitalForecast.js';
import { parsePaymentTerms } from '../lib/paymentTerms.js';

const isAdmin = (user: any) => user?.role === 'owner' || user?.role === 'admin';
const dbx = () => prisma as any;
const n = (v: any) => (v == null ? 0 : Number(v));
const ils = (x: number) => `₪${Math.round(Math.abs(x)).toLocaleString()}`;

async function guard(user: any) {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdmin(user)) throw new Error('forbidden');
  await requirePageAccess(user, 'CashFlow');
}

export type CashAction = {
  key: string;
  title: string;
  detail: string;
  impact: number;          // shekels of liquidity this frees, 0 when unquantified
  impact_label: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  evidence: string;
};

registerFn('getCashflowActions', async ({ user, body }: any) => {
  await guard(user);
  const horizon = Math.min(180, Math.max(30, Number((body || {}).days) || 90));

  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT tx_date, amount, balance, category, description
     FROM "BankTransaction" ORDER BY tx_date`).catch(() => []);
  if (rows.length < 20) {
    return { has_data: false, reason: 'צריך ייבוא עו"ש כדי להציע פעולות', actions: [] };
  }

  const txs = rows.map((r: any) => ({
    date: String(r.tx_date).slice(0, 10),
    amount: n(r.amount),
    balance: r.balance == null ? null : n(r.balance),
    category: r.category || 'unknown',
    description: r.description || '',
  }));
  const patterns = detectPatterns(txs);
  const forecast = await computeCapitalForecast(horizon);
  const actions: CashAction[] = [];

  const byCat = (c: string) => patterns.find((p) => p.category === c);
  const lastBalance = [...txs].reverse().find((t) => t.balance != null)?.balance ?? 0;
  const creditLine = forecast?.credit_line || 0;

  // ── 1. money leaving for savings while the account is overdrawn ──────────
  // Paying overdraft interest on one side while putting cash into a fund on the
  // other is the cheapest thing on this list to fix: it needs a phone call, not
  // a change to the business.
  const savings = byCat('transfer_savings');
  if (savings && savings.dir === 'out' && savings.monthly_total > 500 && lastBalance < 0) {
    actions.push({
      key: 'savings_while_overdraft',
      title: 'אתה מפקיד לחיסכון בזמן שהחשבון במינוס',
      detail: `יוצאים ${ils(savings.monthly_total)} בחודש להשקעה/מט"ח, בזמן שהחשבון עומד על ${ils(lastBalance)} מינוס. אתה משלם ריבית על מסגרת כדי להחזיק כסף במקום אחר. עצירה זמנית מחזירה את הסכום הזה לנזילות מיידית.`,
      impact: savings.monthly_total,
      impact_label: `${ils(savings.monthly_total)} לחודש`,
      severity: 'high',
      evidence: savings.evidence,
    });
  }

  // ── 2. suppliers paid immediately ────────────────────────────────────────
  // Every supplier moved from immediate to net-30 hands back roughly a month of
  // that supplier's spend, once.
  const sup: any[] = await dbx().$queryRawUnsafe(
    `SELECT s.id, s.company_name, s.payment_terms, COALESCE(s.is_occasional,false) AS is_occasional,
            COALESCE(SUM(ABS(i.total_amount)),0) AS spend, COUNT(i.id)::int AS invoices
     FROM "Supplier" s
     LEFT JOIN "Invoice" i ON i.supplier_id = s.id
       AND i.invoice_date >= NOW() - INTERVAL '3 months'
       AND COALESCE(i.status,'') <> 'rejected'
     GROUP BY s.id, s.company_name, s.payment_terms, s.is_occasional`).catch(() => []);

  const immediate = sup
    .map((s: any) => ({
      name: s.company_name || 'ספק',
      terms: parsePaymentTerms(s.payment_terms, { occasional: s.is_occasional }),
      monthly: n(s.spend) / 3,
      invoices: Number(s.invoices) || 0,
    }))
    .filter((s) => s.invoices > 0 && s.monthly > 1000
      && (s.terms.kind === 'immediate' || (s.terms.kind === 'net_days' && s.terms.days <= 7)));

  if (immediate.length) {
    const total = immediate.reduce((t, s) => t + s.monthly, 0);
    const top = [...immediate].sort((a, b) => b.monthly - a.monthly).slice(0, 5);
    actions.push({
      key: 'short_supplier_terms',
      title: `${immediate.length} ספקים משולמים מיידית — כל אחד שיעבור לשוטף+30 משחרר חודש של תשלום`,
      detail: `הגדולים: ${top.map((s) => `${s.name} (${ils(s.monthly)}/חודש)`).join(' · ')}. מעבר לשוטף+30 לא מוזיל כלום — הוא דוחה את היציאה בחודש, וזה בדיוק מה שמרווח את התזרים.`,
      impact: total,
      impact_label: `עד ${ils(total)} חד-פעמי`,
      severity: total > 30000 ? 'high' : 'medium',
      evidence: `לפי החשבוניות ב-3 החודשים האחרונים`,
    });
  }

  // ── 3. the trough, and what sits just before it ──────────────────────────
  // The single most useful lever: which payment, if moved a week, lifts the
  // lowest point of the whole period.
  if (forecast?.has_data && forecast.min_point) {
    const minDate = forecast.min_point.date;
    const window = (forecast.days || []).filter((d: any) => d.date <= minDate
      && Date.parse(minDate) - Date.parse(d.date) <= 10 * 86400_000);
    const candidates = window.flatMap((d: any) =>
      (d.events || [])
        .filter((e: any) => e.amount < 0)
        // Payroll and tax cannot be rescheduled; suggesting it would be noise.
        .filter((e: any) => !/משכורת|מע"מ|מס הכנסה|ביטוח לאומי/.test(e.label))
        .map((e: any) => ({ date: d.date, label: e.label, amount: e.amount })));
    const biggest = candidates.sort((a: any, b: any) => a.amount - b.amount)[0];

    if (biggest && Math.abs(biggest.amount) > 2000) {
      const after = Math.round(forecast.min_point.balance + Math.abs(biggest.amount));
      actions.push({
        key: 'shift_payment',
        title: `דחיית תשלום אחד מרימה את הנקודה הנמוכה`,
        detail: `הנקודה הנמוכה שלך היא ${minDate} על ${ils(forecast.min_point.balance)}${forecast.min_point.balance < 0 ? ' מינוס' : ''}. אם "${biggest.label}" בסך ${ils(biggest.amount)} (${biggest.date}) יידחה לאחרי התאריך הזה — התחתית עולה ל-${ils(after)}${after < 0 ? ' מינוס' : ''}.`,
        impact: Math.abs(biggest.amount),
        impact_label: `${ils(biggest.amount)} בתחתית`,
        severity: forecast.min_point.balance < -creditLine ? 'critical' : 'medium',
        evidence: `מתוך צפי ${horizon} יום`,
      });
    }
  }

  // ── 4. running past the credit line ──────────────────────────────────────
  if (forecast?.first_beyond_credit) {
    actions.push({
      key: 'beyond_credit',
      title: `חריגה ממסגרת האשראי ב-${forecast.first_beyond_credit}`,
      detail: `המסגרת ${ils(creditLine)}. זה התאריך שצריך לעבוד לאחור ממנו — או להגדיל מסגרת מראש (זול יותר כשמבקשים לפני ולא אחרי), או להזיז יציאות מהשבוע שלפניו.`,
      impact: 0,
      impact_label: 'תאריך יעד',
      severity: 'critical',
      evidence: `לפי צפי ${horizon} יום`,
    });
  }

  // ── 5. invoices already overdue ──────────────────────────────────────────
  if (forecast?.overdue_invoices > 0) {
    actions.push({
      key: 'overdue',
      title: `${forecast.overdue_invoices} חשבוניות עברו את מועד התשלום`,
      detail: `סה"כ ${ils(forecast.overdue_amount)}. או שהן שולמו ולא סומנו — ואז השיוך האוטומטי יסגור את זה — או שהן באמת פתוחות, ואז הן יציאה שעומדת לקרות ולא נלקחת בחשבון.`,
      impact: forecast.overdue_amount,
      impact_label: ils(forecast.overdue_amount),
      severity: 'high',
      evidence: 'חשבוניות פתוחות שמועד התשלום שלהן עבר',
    });
  }

  // ── 6. how much of the forecast is guesswork ─────────────────────────────
  if ((forecast?.estimate_share || 0) > 25) {
    actions.push({
      key: 'scan_invoices',
      title: `${forecast.estimate_share}% מהיציאות בצפי הן הערכה, לא חשבונית`,
      detail: 'ככל שיותר חשבוניות סרוקות, הצפי מפסיק להיות ממוצע ומתחיל להיות תאריכים אמיתיים. זה גם מה שמאפשר לשיוך האוטומטי לזהות למי הלכו ההעברות.',
      impact: 0,
      impact_label: 'דיוק',
      severity: 'info',
      evidence: 'יחס בין חשבוניות ידועות להשלמה לפי קצב היסטורי',
    });
  }

  // ── 7. bank fees ─────────────────────────────────────────────────────────
  const fees = byCat('expense_fees');
  if (fees && fees.monthly_total > 800) {
    actions.push({
      key: 'bank_fees',
      title: `${ils(fees.monthly_total)} בחודש עמלות בנק וריבית`,
      detail: 'סכום בסדר גודל כזה מצדיק שיחת מיקוח מול הבנקאי — עמלות עו"ש עסקי כמעט תמיד ניתנות למשא ומתן, במיוחד מול היקף התנועות שלך.',
      impact: fees.monthly_total * 0.3,
      impact_label: `~${ils(fees.monthly_total * 0.3)} לחודש`,
      severity: 'medium',
      evidence: fees.evidence,
    });
  }

  const RANK = { critical: 0, high: 1, medium: 2, info: 3 };
  actions.sort((a, b) => (RANK[a.severity] - RANK[b.severity]) || (b.impact - a.impact));

  return {
    has_data: true,
    horizon,
    actions,
    total_impact: Math.round(actions.reduce((t, a) => t + a.impact, 0)),
    min_point: forecast?.min_point || null,
    first_beyond_credit: forecast?.first_beyond_credit || null,
  };
});

/**
 * Take the settings off the owner's hands: read the reporting rhythm straight
 * off the statement. Only fills what is not already configured — a value the
 * owner set by hand is never overwritten by a guess.
 */
registerFn('autoConfigureCashflow', async ({ user }: any) => {
  await guard(user);
  const applied: string[] = [];

  const vatRows: any[] = await dbx().$queryRawUnsafe(
    `SELECT tx_date FROM "BankTransaction"
     WHERE category = 'expense_vat' ORDER BY tx_date`).catch(() => []);
  const dates = vatRows.map((r: any) => String(r.tx_date).slice(0, 10));

  if (dates.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400_000);
    }
    gaps.sort((a, b) => a - b);
    const med = gaps[Math.floor(gaps.length / 2)];
    // Around a month apart means monthly filing; around two, bi-monthly.
    const period = med >= 45 ? 'bimonthly' : 'monthly';
    const doms = dates.map((d) => Number(d.slice(8, 10))).sort((a, b) => a - b);
    const day = doms[Math.floor(doms.length / 2)];

    const existing: any[] = await dbx().$queryRawUnsafe(
      `SELECT id FROM "CashFlowVatSetting" LIMIT 1`).catch(() => []);
    if (!existing.length) {
      await dbx().$executeRawUnsafe(
        `INSERT INTO "CashFlowVatSetting" (id, period, payment_day, amount_mode, enabled)
         VALUES ($1,$2,$3,'learned',true)`,
        `vat_${Date.now().toString(36)}`, period, Math.min(28, Math.max(1, day)));
      applied.push(`מע"מ: ${period === 'bimonthly' ? 'דו-חודשי' : 'חודשי'}, יום ${day} (לפי ${dates.length} תשלומים בעו"ש)`);
    }
  }

  const payRows: any[] = await dbx().$queryRawUnsafe(
    `SELECT tx_date FROM "BankTransaction"
     WHERE category = 'expense_payroll' ORDER BY tx_date`).catch(() => []);
  if (payRows.length >= 2) {
    const doms = payRows.map((r: any) => Number(String(r.tx_date).slice(8, 10))).sort((a, b) => a - b);
    const day = doms[Math.floor(doms.length / 2)];
    const cur: any[] = await dbx().$queryRawUnsafe(
      `SELECT payroll_day FROM "CashFlowPayrollSetting" LIMIT 1`).catch(() => []);
    if (!cur.length) {
      await dbx().$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "CashFlowPayrollSetting" (
           id TEXT PRIMARY KEY, payroll_day INT, enabled BOOLEAN DEFAULT true)`).catch(() => {});
      await dbx().$executeRawUnsafe(
        `INSERT INTO "CashFlowPayrollSetting" (id, payroll_day, enabled) VALUES ($1,$2,true)`,
        `pay_${Date.now().toString(36)}`, Math.min(28, Math.max(1, day))).catch(() => {});
      applied.push(`יום תשלום משכורות: ${day} (לפי ${payRows.length} תשלומים בעו"ש)`);
    }
  }

  return { ok: true, applied };
});
