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
