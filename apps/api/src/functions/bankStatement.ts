// Bank statement (עו"ש) import + the actuals it unlocks.
//
// The owner uploads whatever the bank gives them; this stores the normalised
// transactions in an isolated table (created on demand, invisible to Prisma —
// prisma db push is forbidden on prod), keyed by a stable hash so re-uploading
// an overlapping period updates instead of duplicating.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { requirePageAccess } from '../lib/pagePermissions.js';
import {
  parseBankFile, parseBankStatement, summarize, CATEGORY_LABELS, categorize,
} from '../lib/bankStatement.js';
import { reconcile, type MatchInvoice, type MatchTx } from '../lib/bankMatch.js';
import { parsePaymentTerms, dueDateFor, ymd as ymdOf } from '../lib/paymentTerms.js';

const isAdmin = (user: any) => user?.role === 'owner' || user?.role === 'admin';
const dbx = () => prisma as any;

async function guard(user: any) {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdmin(user)) throw new Error('forbidden');
  await requirePageAccess(user, 'CashFlow');
}

// Isolated table: additive only, never touches an existing Prisma model.
async function ensureTable(): Promise<void> {
  await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BankTransaction" (
      id TEXT PRIMARY KEY,
      tx_date DATE NOT NULL,
      value_date DATE,
      description TEXT,
      counterparty TEXT,
      amount NUMERIC(14,2) NOT NULL,
      balance NUMERIC(14,2),
      reference TEXT,
      category TEXT,
      category_manual BOOLEAN DEFAULT false,
      bank TEXT,
      account TEXT,
      hash TEXT NOT NULL UNIQUE,
      created_date TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  await dbx().$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "BankTransaction_date_idx" ON "BankTransaction"(tx_date)`).catch(() => {});
  await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BankTxMatch" (
      id TEXT PRIMARY KEY,
      bank_tx_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      supplier_id TEXT,
      amount NUMERIC(14,2),
      method TEXT,
      confidence TEXT,
      manual BOOLEAN DEFAULT false,
      created_date TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (bank_tx_id, invoice_id)
    )`).catch(() => {});
  await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BankAccountInfo" (
      id TEXT PRIMARY KEY,
      bank TEXT,
      account TEXT,
      credit_line NUMERIC(14,2),
      closing_balance NUMERIC(14,2),
      as_of DATE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
}

/** Open invoices with a due date, ready for matching or forecasting. */
export async function loadOpenInvoices(): Promise<MatchInvoice[]> {
  const suppliers: any[] = await dbx().$queryRawUnsafe(
    `SELECT id, company_name, payment_terms, COALESCE(is_occasional,false) AS is_occasional
     FROM "Supplier"`).catch(() => []);
  const termsBy = new Map<string, any>();
  const nameBy = new Map<string, string>();
  for (const s of suppliers) {
    termsBy.set(String(s.id), parsePaymentTerms(s.payment_terms, { occasional: s.is_occasional }));
    nameBy.set(String(s.id), s.company_name || 'ספק');
  }

  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT id, supplier_id, invoice_date, total_amount,
            (CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='Invoice' AND column_name='due_date')
                  THEN due_date ELSE NULL END) AS due_date
     FROM "Invoice"
     WHERE COALESCE(status,'') <> 'rejected' AND supplier_id IS NOT NULL
       AND invoice_date >= NOW() - INTERVAL '18 months'`).catch(() => []);

  return rows.map((r: any) => {
    const sid = String(r.supplier_id);
    const invDate = new Date(r.invoice_date);
    const terms = termsBy.get(sid) || parsePaymentTerms(null);
    const due = r.due_date ? new Date(r.due_date) : dueDateFor(invDate, terms);
    return {
      id: String(r.id),
      supplier_id: sid,
      supplier_name: nameBy.get(sid) || 'ספק',
      amount: Math.abs(Number(r.total_amount) || 0),
      invoice_date: ymdOf(invDate),
      due_date: ymdOf(due),
    };
  }).filter((i) => i.amount > 0);
}

const rid = () => `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
const n = (v: any) => (v == null ? 0 : Number(v));

/**
 * Import a statement. `content` is the file as base64 (any format) or raw text.
 * dry_run parses and reports without writing — the preview the UI shows before
 * the owner commits.
 */
registerFn('importBankStatement', async ({ user, body }: any) => {
  await guard(user);
  const b = (body || {}) as any;
  const filename = String(b.filename || '');
  const dryRun = b.dry_run === true;

  let parsed;
  if (b.content_base64) {
    parsed = await parseBankFile(Buffer.from(String(b.content_base64), 'base64'), filename);
  } else if (b.content) {
    parsed = parseBankStatement(String(b.content), filename);
  } else {
    throw new Error('no_content');
  }

  if (!parsed.ok) {
    return { ok: false, warnings: parsed.warnings, format: parsed.format, imported: 0, duplicates: 0 };
  }

  await ensureTable();

  // Which of these do we already hold? Compared by hash so an overlapping
  // re-export is recognised rather than double-counted.
  const hashes = parsed.transactions.map((t) => t.hash);
  const existing: any[] = hashes.length
    ? await dbx().$queryRawUnsafe(
        `SELECT hash FROM "BankTransaction" WHERE hash = ANY($1::text[])`, hashes).catch(() => [])
    : [];
  const have = new Set(existing.map((r: any) => String(r.hash)));
  const fresh = parsed.transactions.filter((t) => !have.has(t.hash));

  const summary = summarize(parsed.transactions);
  const preview = {
    ok: true,
    dry_run: dryRun,
    format: parsed.format,
    bank: parsed.bank,
    account: parsed.account,
    closing_balance: parsed.closing_balance,
    credit_line: parsed.credit_line,
    total: parsed.transactions.length,
    new: fresh.length,
    duplicates: parsed.transactions.length - fresh.length,
    from: parsed.transactions[0]?.date || null,
    to: parsed.transactions[parsed.transactions.length - 1]?.date || null,
    months: summary.months,
    categories: summary.categories,
    sample: fresh.slice(0, 12),
    warnings: parsed.warnings,
  };
  if (dryRun) return preview;

  let imported = 0;
  for (const t of fresh) {
    try {
      await dbx().$executeRawUnsafe(
        `INSERT INTO "BankTransaction"
           (id, tx_date, value_date, description, counterparty, amount, balance,
            reference, category, bank, account, hash)
         VALUES ($1,$2::date,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (hash) DO NOTHING`,
        rid(), t.date, t.value_date, t.description, t.counterparty, t.amount,
        t.balance, t.reference, t.category, parsed.bank, parsed.account, t.hash);
      imported++;
    } catch { /* one bad row must not abort the import */ }
  }

  // The credit line is what turns "negative balance" into "how much runway is
  // left before the bank stops honouring payments".
  if (parsed.credit_line != null || parsed.closing_balance != null) {
    await dbx().$executeRawUnsafe(`DELETE FROM "BankAccountInfo"`).catch(() => {});
    await dbx().$executeRawUnsafe(
      `INSERT INTO "BankAccountInfo" (id, bank, account, credit_line, closing_balance, as_of)
       VALUES ($1,$2,$3,$4,$5,$6::date)`,
      rid(), parsed.bank, parsed.account, parsed.credit_line, parsed.closing_balance,
      parsed.transactions[parsed.transactions.length - 1].date).catch(() => {});
  }

  // The statement's last known balance is the truest opening balance the
  // forecast can have — set it automatically so the owner never types it.
  let openingSet: { balance: number; date: string } | null = null;
  const lastWithBalance = [...parsed.transactions].reverse().find((t) => t.balance != null);
  const bal = parsed.closing_balance ?? lastWithBalance?.balance ?? null;
  if (bal != null) {
    const asOf = lastWithBalance?.date || parsed.transactions[parsed.transactions.length - 1].date;
    try {
      // Same record getCashFlowOpening reads, so the forecast picks it up with
      // no extra wiring.
      const date = new Date(`${asOf}T00:00:00.000Z`);
      const existing = await dbx().cashFlowSetting.findFirst().catch(() => null);
      if (existing) {
        await dbx().cashFlowSetting.update({
          where: { id: existing.id }, data: { opening_balance: bal, opening_date: date } });
      } else {
        await dbx().cashFlowSetting.create({ data: { opening_balance: bal, opening_date: date } });
      }
      openingSet = { balance: bal, date: asOf };
    } catch { /* opening balance is a bonus, not a reason to fail the import */ }
  }

  return { ...preview, dry_run: false, imported, opening_set: openingSet };
});

/** Everything the cash-flow history view needs, from real bank movement. */
registerFn('getBankSummary', async ({ user, body }: any) => {
  await guard(user);
  await ensureTable();
  const months = Math.min(36, Math.max(1, Number((body || {}).months) || 6));
  const since = new Date(Date.now() - months * 31 * 86400_000).toISOString().slice(0, 10);

  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT tx_date, description, counterparty, amount, balance, category
     FROM "BankTransaction" WHERE tx_date >= $1::date ORDER BY tx_date`, since).catch(() => []);

  if (!rows.length) {
    return { has_data: false, months: [], categories: [], transactions: 0,
      from: null, to: null, latest_balance: null, weekly: [] };
  }

  const txs = rows.map((r: any) => ({
    date: String(r.tx_date).slice(0, 10),
    description: r.description || '',
    counterparty: r.counterparty || null,
    amount: n(r.amount),
    balance: r.balance == null ? null : n(r.balance),
    category: r.category || 'unknown',
    value_date: String(r.tx_date).slice(0, 10),
    reference: '', hash: '',
  }));
  const s = summarize(txs as any);

  // Weekly net movement — the shape the owner actually reads a cash flow in.
  const weeks = new Map<string, { in: number; out: number }>();
  for (const t of txs) {
    const d = new Date(t.date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());       // week starts Sunday (IL)
    const k = d.toISOString().slice(0, 10);
    const w = weeks.get(k) || { in: 0, out: 0 };
    if (t.amount >= 0) w.in += t.amount; else w.out += -t.amount;
    weeks.set(k, w);
  }

  const lastBal = [...txs].reverse().find((t) => t.balance != null);
  return {
    has_data: true,
    transactions: txs.length,
    from: txs[0].date,
    to: txs[txs.length - 1].date,
    latest_balance: lastBal?.balance ?? null,
    latest_balance_date: lastBal?.date ?? null,
    months: s.months,
    categories: s.categories,
    weekly: [...weeks.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({ week, in: Math.round(v.in), out: Math.round(v.out), net: Math.round(v.in - v.out) })),
  };
});

registerFn('listBankTransactions', async ({ user, body }: any) => {
  await guard(user);
  await ensureTable();
  const b = (body || {}) as any;
  const limit = Math.min(500, Math.max(1, Number(b.limit) || 200));
  const where: string[] = [];
  const args: any[] = [];
  if (b.from) { args.push(String(b.from)); where.push(`tx_date >= $${args.length}::date`); }
  if (b.to) { args.push(String(b.to)); where.push(`tx_date <= $${args.length}::date`); }
  if (b.category) { args.push(String(b.category)); where.push(`category = $${args.length}`); }
  if (b.q) { args.push(`%${String(b.q)}%`); where.push(`(description ILIKE $${args.length} OR counterparty ILIKE $${args.length})`); }
  args.push(limit);

  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT id, tx_date, description, counterparty, amount, balance, reference,
            category, COALESCE(category_manual,false) AS category_manual
     FROM "BankTransaction"
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY tx_date DESC, id DESC LIMIT $${args.length}`, ...args).catch(() => []);

  return {
    transactions: rows.map((r: any) => ({
      id: r.id,
      date: String(r.tx_date).slice(0, 10),
      description: r.description,
      counterparty: r.counterparty,
      amount: n(r.amount),
      balance: r.balance == null ? null : n(r.balance),
      reference: r.reference,
      category: r.category,
      category_label: CATEGORY_LABELS[r.category]?.he || r.category,
      manual: !!r.category_manual,
    })),
    labels: Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ key: k, label: v.he, dir: v.dir })),
  };
});

/** Manual re-categorisation. A manual choice is sticky — re-imports never undo it. */
registerFn('setBankTxCategory', async ({ user, body }: any) => {
  await guard(user);
  await ensureTable();
  const b = (body || {}) as any;
  const id = String(b.id || '');
  const category = String(b.category || '');
  if (!id || !CATEGORY_LABELS[category]) throw new Error('bad_request');
  await dbx().$executeRawUnsafe(
    `UPDATE "BankTransaction" SET category=$2, category_manual=true WHERE id=$1`, id, category);
  return { ok: true, id, category, label: CATEGORY_LABELS[category].he };
});

// ── reconciliation ─────────────────────────────────────────────────────────

/**
 * Match anonymous supplier outflows to invoices. dry_run reports what it would
 * do; applying stores the match and writes the supplier's name onto the bank
 * transaction. It deliberately does NOT mark invoices paid — that is an
 * accounting record, and a matching heuristic has no business rewriting it.
 */
registerFn('reconcileBankTransactions', async ({ user, body }: any) => {
  await guard(user);
  await ensureTable();
  const b = (body || {}) as any;
  const apply = b.apply === true;
  const minConf = String(b.min_confidence || 'medium');
  const rank: Record<string, number> = { low: 0, medium: 1, high: 2 };

  // Only outflows that carry no counterparty are worth matching — a named one
  // already tells us who was paid.
  const txRows: any[] = await dbx().$queryRawUnsafe(
    `SELECT b.id, b.tx_date, b.amount, b.description
     FROM "BankTransaction" b
     WHERE b.amount < 0
       AND (b.counterparty IS NULL OR b.counterparty = '')
       AND b.category IN ('expense_supplier_transfer','expense_supplier_check')
       AND NOT EXISTS (SELECT 1 FROM "BankTxMatch" m WHERE m.bank_tx_id = b.id)
     ORDER BY b.tx_date`).catch(() => []);

  const txs: MatchTx[] = txRows.map((r: any) => ({
    id: String(r.id), date: String(r.tx_date).slice(0, 10),
    amount: Number(r.amount), description: r.description || '',
  }));

  // Invoices already attributed to some other payment are out of the running.
  const takenRows: any[] = await dbx().$queryRawUnsafe(
    `SELECT invoice_id FROM "BankTxMatch"`).catch(() => []);
  const taken = new Set(takenRows.map((r: any) => String(r.invoice_id)));
  const invoices = (await loadOpenInvoices()).filter((i) => !taken.has(i.id));

  const res = reconcile(txs, invoices);
  const accepted = res.matches.filter((m) => rank[m.confidence] >= (rank[minConf] ?? 1));

  let stored = 0;
  if (apply) {
    for (const m of accepted) {
      for (const invId of m.invoice_ids) {
        try {
          await dbx().$executeRawUnsafe(
            `INSERT INTO "BankTxMatch"
               (id, bank_tx_id, invoice_id, supplier_id, amount, method, confidence)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (bank_tx_id, invoice_id) DO NOTHING`,
            rid(), m.bank_tx_id, invId, m.supplier_id, Math.abs(m.bank_amount), m.method, m.confidence);
        } catch { /* skip the row, keep the run */ }
      }
      await dbx().$executeRawUnsafe(
        `UPDATE "BankTransaction" SET counterparty=$2 WHERE id=$1 AND (counterparty IS NULL OR counterparty='')`,
        m.bank_tx_id, m.supplier_name).catch(() => {});
      stored++;
    }
  }

  const sum = (xs: any[], f: (x: any) => number) => Math.round(xs.reduce((n, x) => n + f(x), 0));
  return {
    ok: true,
    applied: apply,
    stored,
    candidates: txs.length,
    open_invoices: invoices.length,
    matched: accepted.length,
    matched_amount: sum(accepted, (m) => Math.abs(m.bank_amount)),
    unmatched_tx: res.unmatched_tx.length,
    unmatched_amount: sum(res.unmatched_tx, (t) => Math.abs(t.amount)),
    by_confidence: {
      high: accepted.filter((m) => m.confidence === 'high').length,
      medium: accepted.filter((m) => m.confidence === 'medium').length,
      low: accepted.filter((m) => m.confidence === 'low').length,
    },
    matches: accepted.slice(0, 60),
    // The biggest unexplained payments — where the owner's attention is worth most.
    top_unmatched: [...res.unmatched_tx]
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 15)
      .map((t) => ({ id: t.id, date: t.date, amount: t.amount, description: t.description })),
  };
});

/** What has already been attributed, per supplier. */
registerFn('getReconciliationSummary', async ({ user }: any) => {
  await guard(user);
  await ensureTable();
  // A batch match stores one row per invoice, all carrying the same payment
  // amount — so the payment total must be summed over DISTINCT bank
  // transactions, while the invoice count is the row count.
  const rows: any[] = await dbx().$queryRawUnsafe(
    `WITH payments AS (
       SELECT DISTINCT bank_tx_id, supplier_id, amount FROM "BankTxMatch"
     ), inv AS (
       SELECT supplier_id, COUNT(*)::int AS invoices FROM "BankTxMatch" GROUP BY supplier_id
     )
     SELECT p.supplier_id, s.company_name,
            COUNT(*)::int AS payments, SUM(p.amount) AS total,
            COALESCE(MAX(inv.invoices), 0) AS invoices
     FROM payments p
     LEFT JOIN "Supplier" s ON s.id = p.supplier_id
     LEFT JOIN inv ON inv.supplier_id = p.supplier_id
     GROUP BY p.supplier_id, s.company_name
     ORDER BY total DESC NULLS LAST`).catch(() => []);
  return {
    suppliers: rows.map((r: any) => ({
      supplier_id: r.supplier_id, name: r.company_name || 'לא ידוע',
      payments: Number(r.payments) || 0, invoices: Number(r.invoices) || 0,
      total: Math.round(n(r.total)),
    })),
  };
});

/** Undo a match the owner disagrees with. */
registerFn('unmatchBankTx', async ({ user, body }: any) => {
  await guard(user);
  await ensureTable();
  const id = String((body || {}).bank_tx_id || '');
  if (!id) throw new Error('bad_request');
  await dbx().$executeRawUnsafe(`DELETE FROM "BankTxMatch" WHERE bank_tx_id=$1`, id);
  await dbx().$executeRawUnsafe(`UPDATE "BankTransaction" SET counterparty=NULL WHERE id=$1`, id);
  return { ok: true };
});

/**
 * Re-run the rules over everything the owner has not hand-categorised. Lets a
 * rule improvement reach data that was imported before it existed.
 */
registerFn('recategorizeBankTransactions', async ({ user }: any) => {
  await guard(user);
  await ensureTable();
  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT id, description, amount, category FROM "BankTransaction"
     WHERE COALESCE(category_manual,false) = false`).catch(() => []);
  let changed = 0;
  for (const r of rows) {
    const next = categorize(r.description || '', n(r.amount));
    if (next === r.category) continue;
    await dbx().$executeRawUnsafe(`UPDATE "BankTransaction" SET category=$2 WHERE id=$1`, r.id, next)
      .catch(() => {});
    changed++;
  }
  return { ok: true, scanned: rows.length, changed };
});
