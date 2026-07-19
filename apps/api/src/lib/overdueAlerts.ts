// "Something needs paying and has not been paid" — the alert the owner asked
// for.
//
// Two things qualify, and they are different: an invoice whose payment date has
// passed, and one falling due in the next few days. The first is already late;
// the second is the one worth knowing about, because it can still be paid on
// time. Both go out in a single message, because two notifications about the
// same suppliers on the same morning is how alerts get muted.
import { prisma } from '../db.js';
import { broadcastToAdmins } from './whatsappAlerts.js';
import { pushoverToAdmins } from './pushover.js';
import { parsePaymentTerms, dueDateFor, ymd } from './paymentTerms.js';

const dbx = () => prisma as any;
const ils = (n: number) => `₪${Math.round(Math.abs(n)).toLocaleString()}`;

const SOON_DAYS = 5;

export async function runOverduePaymentAlerts(opts: { dryRun?: boolean } = {}) {
  const suppliers: any[] = await dbx().$queryRawUnsafe(
    `SELECT id, company_name, payment_terms, COALESCE(is_occasional,false) AS is_occasional
     FROM "Supplier"`).catch(() => []);
  const termsBy = new Map<string, any>();
  const nameBy = new Map<string, string>();
  for (const s of suppliers) {
    termsBy.set(String(s.id), parsePaymentTerms(s.payment_terms, { occasional: s.is_occasional }));
    nameBy.set(String(s.id), s.company_name || 'ספק');
  }

  // Invoices the reconciliation already tied to a real bank payment are settled
  // whatever their status column says, so they must not be chased.
  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT i.id, i.supplier_id, i.invoice_date, i.total_amount,
            (CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='Invoice' AND column_name='due_date')
                  THEN i.due_date ELSE NULL END) AS due_date
     FROM "Invoice" i
     WHERE COALESCE(i.status,'') <> 'rejected'
       AND COALESCE(i.payment_status,'') <> 'paid'
       AND i.supplier_id IS NOT NULL
       AND i.invoice_date >= NOW() - INTERVAL '120 days'
       AND NOT EXISTS (SELECT 1 FROM "BankTxMatch" m WHERE m.invoice_id = i.id)`)
    .catch(() => []);

  const today = ymd(new Date());
  const soonKey = ymd(new Date(Date.now() + SOON_DAYS * 86400_000));
  // Anything older than this is a bookkeeping gap, not a live debt — the same
  // threshold the forecast uses, so the alert and the forecast agree.
  const staleKey = ymd(new Date(Date.now() - 45 * 86400_000));

  const late: any[] = [];
  const soon: any[] = [];
  for (const r of rows) {
    const sid = String(r.supplier_id);
    const invDate = new Date(r.invoice_date);
    const due = r.due_date ? new Date(r.due_date) : dueDateFor(invDate, termsBy.get(sid) || parsePaymentTerms(null));
    const dueKey = ymd(due);
    const amount = Math.abs(Number(r.total_amount) || 0);
    if (!amount) continue;
    const item = { name: nameBy.get(sid) || 'ספק', amount, dueKey };
    if (dueKey < staleKey) continue;
    if (dueKey < today) late.push(item);
    else if (dueKey <= soonKey) soon.push(item);
  }

  if (!late.length && !soon.length) {
    return { ok: true, late: 0, soon: 0, sent: false };
  }

  const byName = (list: any[]) => {
    const m = new Map<string, number>();
    for (const x of list) m.set(x.name, (m.get(x.name) || 0) + x.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const lines: string[] = ['💰 תשלומים לספקים'];
  if (late.length) {
    const t = late.reduce((s, x) => s + x.amount, 0);
    lines.push('', `🔴 באיחור — ${late.length} חשבוניות · ${ils(t)}`);
    for (const [name, amt] of byName(late).slice(0, 8)) lines.push(`   • ${name} — ${ils(amt)}`);
    if (byName(late).length > 8) lines.push(`   ועוד ${byName(late).length - 8} ספקים`);
  }
  if (soon.length) {
    const t = soon.reduce((s, x) => s + x.amount, 0);
    lines.push('', `🟡 לתשלום ב-${SOON_DAYS} הימים הקרובים — ${soon.length} חשבוניות · ${ils(t)}`);
    for (const [name, amt] of byName(soon).slice(0, 8)) lines.push(`   • ${name} — ${ils(amt)}`);
  }
  lines.push('', 'לפרטים: topalena.com/CashFlow');

  const text = lines.join('\n');
  if (opts.dryRun) return { ok: true, late: late.length, soon: soon.length, sent: false, preview: text };

  await broadcastToAdmins(text).catch(() => {});
  await pushoverToAdmins('תשלומים לספקים', text).catch(() => {});
  return { ok: true, late: late.length, soon: soon.length, sent: true };
}
