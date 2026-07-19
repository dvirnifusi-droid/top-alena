// The cash-flow register — the artefact everything else was built on top of and
// nobody had actually built.
//
// One chronological table: every movement backwards and forwards, a running
// balance down the side, and a settled / not-yet-settled flag on each row. The
// owner's own spreadsheet is exactly this, and the reason they kept maintaining
// it by hand is that no chart answers "what leaves on the 15th, and did we pay
// it".
//
// Past rows are facts from the bank. Future rows are obligations and learned
// rhythms. Manual rows are the things only the owner knows are coming.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { requirePageAccess } from '../lib/pagePermissions.js';
import { computeCapitalForecast } from './capitalForecast.js';
import { dbDate } from '../lib/bankPersist.js';
import { CATEGORY_LABELS } from '../lib/bankStatement.js';

const isAdmin = (user: any) => user?.role === 'owner' || user?.role === 'admin';
const dbx = () => prisma as any;
const n = (v: any) => (v == null ? 0 : Number(v));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function guard(user: any) {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdmin(user)) throw new Error('forbidden');
  await requirePageAccess(user, 'CashFlow');
}

async function ensureManualTable(): Promise<void> {
  await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CashFlowManualRow" (
      id TEXT PRIMARY KEY,
      row_date DATE NOT NULL,
      category TEXT,
      name TEXT NOT NULL,
      amount_out NUMERIC(14,2) DEFAULT 0,
      amount_in NUMERIC(14,2) DEFAULT 0,
      note TEXT,
      settled BOOLEAN DEFAULT false,
      created_date TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
  await dbx().$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "CashFlowManualRow_date_idx" ON "CashFlowManualRow"(row_date)`).catch(() => {});
  // Forecast rows are derived — recomputed from patterns and invoices on every
  // load, so they exist nowhere to be edited. Edits are stored separately,
  // keyed by the row's ORIGINAL date and label, and reapplied on each build.
  await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "CashFlowRowOverride" (
      row_key TEXT PRIMARY KEY,
      new_date DATE,
      new_name TEXT,
      new_out NUMERIC(14,2),
      new_in NUMERIC(14,2),
      settled BOOLEAN DEFAULT false,
      hidden BOOLEAN DEFAULT false,
      note TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
}

/** Stable identity for a derived row: what it was before any edit. */
const rowKey = (date: string, label: string) => `${date}|${label}`;

type Row = {
  id: string;
  date: string;
  category: string;
  name: string;
  out: number;
  in: number;
  balance: number;
  settled: boolean;
  source: 'bank' | 'invoice' | 'pattern' | 'manual';
  note: string | null;
  editable: boolean;
};

const TAX = 'מיסים';
const SUPPLIERS = 'ספקים';
const PAYROLL = 'שכר';

function futureCategory(label: string): string {
  if (label.startsWith('חשבונית') || label.startsWith(SUPPLIERS)) return SUPPLIERS;
  if (label.includes('מע') || label.includes('מס הכנסה') || label.includes('ביטוח לאומי')) return TAX;
  if (label.includes('משכורת')) return PAYROLL;
  return label || 'אחר';
}

registerFn('getCashFlowRegister', async ({ user, body }: any) => {
  await guard(user);
  await ensureManualTable();
  const b = (body || {}) as any;
  const back = Math.min(365, Math.max(0, Number(b.days_back ?? 60)));
  const fwd = Math.min(365, Math.max(7, Number(b.days_forward) || 90));

  const today = ymd(new Date());
  const fromKey = ymd(new Date(Date.now() - back * 86400_000));
  const toKey = ymd(new Date(Date.now() + fwd * 86400_000));

  // ── the past: what the bank actually did ────────────────────────────────
  const bankRows: any[] = await dbx().$queryRawUnsafe(
    `SELECT id, tx_date, description, counterparty, amount, balance, category
     FROM "BankTransaction" WHERE tx_date >= $1::date ORDER BY tx_date, id`, fromKey)
    .catch(() => []);

  const past: Row[] = bankRows.map((r: any) => {
    const amt = n(r.amount);
    return {
      id: `bank_${r.id}`,
      date: dbDate(r.tx_date),
      category: CATEGORY_LABELS[r.category]?.he || 'אחר',
      name: r.counterparty || r.description || '—',
      out: amt < 0 ? -amt : 0,
      in: amt > 0 ? amt : 0,
      balance: 0,
      settled: true,                       // it left the account; it is a fact
      source: 'bank' as const,
      note: null,
      editable: false,
      // The bank names almost nothing. A row with no counterparty can be
      // labelled by the owner, once, and it sticks.
      taggable: !r.counterparty && amt < 0,
      named: !!r.counterparty,
    } as any;
  });

  // ── the future: obligations and learned rhythms ─────────────────────────
  // Categories with no discernible rhythm get spread as an even daily trickle,
  // which is right for the balance and useless in a register: it buries the
  // dated obligations that matter under hundreds of ₪700 fragments. Those
  // fragments are merged into one line per day per direction, so a real payment
  // on the 15th is visible instead of drowned.
  const f = await computeCapitalForecast(fwd);
  const future: Row[] = [];
  const DRIP = 'פריסה יומית';
  if (f?.has_data) {
    for (const day of f.days || []) {
      let dripOut = 0, dripIn = 0;
      for (const [i, e] of (day.events || []).entries()) {
        const amt = n(e.amount);
        if (Math.abs(amt) < 1) continue;
        const label = String(e.label || 'תנועה');
        if (label.includes(DRIP)) {
          if (amt < 0) dripOut += -amt; else dripIn += amt;
          continue;
        }
        future.push({
          id: `fc_${day.date}_${i}`,
          date: day.date,
          category: futureCategory(label),
          name: label,
          out: amt < 0 ? -amt : 0,
          in: amt > 0 ? amt : 0,
          balance: 0,
          settled: false,
          source: String(e.source || '').includes('חשבונית') ? 'invoice' as const : 'pattern' as const,
          note: e.source || null,
          editable: false,
        });
      }
      if (dripOut >= 1 || dripIn >= 1) {
        future.push({
          id: `fc_${day.date}_drip`,
          date: day.date,
          category: 'שוטף',
          name: 'הוצאות והכנסות שוטפות (ממוצע יומי)',
          out: dripOut, in: dripIn, balance: 0,
          settled: false,
          source: 'pattern' as const,
          note: 'קטגוריות ללא דפוס קבוע, נפרסות כממוצע יומי',
          editable: false,
        });
      }
    }
  }

  // ── apply the owner's edits to the derived rows ─────────────────────────
  const ovRows: any[] = await dbx().$queryRawUnsafe(
    `SELECT row_key, new_date, new_name, new_out, new_in, settled, hidden, note
     FROM "CashFlowRowOverride"`).catch(() => []);
  const ov = new Map<string, any>(ovRows.map((r: any) => [String(r.row_key), r]));

  const futureEdited: Row[] = [];
  // Hidden rows are reported back, not silently dropped: a one-way delete on a
  // row the owner might have hidden by mistake is a trap, and the forecast has
  // no other way to tell them the row still exists underneath.
  const hiddenRows: { key: string; date: string; name: string; out: number; in: number }[] = [];
  for (const r of future) {
    const key = rowKey(r.date, r.name);
    const o = ov.get(key);
    if (!o) { futureEdited.push({ ...r, id: key, editable: true }); continue; }
    if (o.hidden === true) {
      hiddenRows.push({ key, date: r.date, name: r.name, out: Math.round(r.out), in: Math.round(r.in) });
      continue;
    }
    futureEdited.push({
      ...r,
      id: key,
      date: o.new_date ? dbDate(o.new_date) : r.date,
      name: o.new_name || r.name,
      out: o.new_out == null ? r.out : n(o.new_out),
      in: o.new_in == null ? r.in : n(o.new_in),
      // Marking a projected row settled means it already happened. It must stop
      // counting forward, or the real payment arriving in the next statement
      // import would be charged a second time.
      settled: o.settled === true,
      note: o.note || r.note,
      edited: true,
      editable: true,
    } as any);
  }

  // ── manual rows: the things only the owner knows ────────────────────────
  const manualRows: any[] = await dbx().$queryRawUnsafe(
    `SELECT id, row_date, category, name, amount_out, amount_in, note, settled
     FROM "CashFlowManualRow" WHERE row_date >= $1::date ORDER BY row_date`, fromKey)
    .catch(() => []);
  const manual: Row[] = manualRows.map((r: any) => ({
    id: `man_${r.id}`,
    date: dbDate(r.row_date),
    category: r.category || 'אחר',
    name: r.name,
    out: n(r.amount_out),
    in: n(r.amount_in),
    balance: 0,
    settled: r.settled === true,
    source: 'manual' as const,
    note: r.note || null,
    editable: true,
  }));

  // ── one chronological series with a running balance ─────────────────────
  const all = [...past, ...manual, ...futureEdited]
    .filter((r) => r.date >= fromKey && r.date <= toKey)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Anchor on the last balance the bank actually printed, then walk outwards.
  // Running the balance from an assumed zero would make every historical row
  // disagree with the statement the owner can check it against.
  const anchorRow = [...bankRows].reverse().find((r: any) => r.balance != null);
  const anchorDate = anchorRow ? dbDate(anchorRow.tx_date) : today;
  const anchorBal = anchorRow ? n(anchorRow.balance) : 0;

  // Backwards from the anchor: each earlier row's balance is the later one minus
  // that row's own movement.
  let bal = anchorBal;
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].date > anchorDate) continue;
    all[i].balance = bal;
    bal = bal - all[i].in + all[i].out;
  }
  // Forwards from the anchor.
  bal = anchorBal;
  for (const r of all) {
    if (r.date <= anchorDate) continue;
    // A future row the owner marked as already settled is history the bank will
    // report on its own; counting it here as well would double it.
    if (!(r.source !== 'bank' && r.settled)) bal = bal + r.in - r.out;
    r.balance = bal;
  }

  const unsettled = all.filter((r) => !r.settled);
  return {
    ok: true,
    anchor: { date: anchorDate, balance: Math.round(anchorBal) },
    credit_line: f?.credit_line || 0,
    today,
    rows: all.map((r) => ({
      ...r,
      out: Math.round(r.out),
      in: Math.round(r.in),
      balance: Math.round(r.balance),
    })),
    hidden: hiddenRows,
    totals: {
      settled: all.length - unsettled.length,
      unsettled: unsettled.length,
      future_out: Math.round(unsettled.reduce((t, r) => t + r.out, 0)),
      future_in: Math.round(unsettled.reduce((t, r) => t + r.in, 0)),
    },
  };
});

/** A row only the owner knows about — a cheque written, a payment promised. */
registerFn('addCashFlowRow', async ({ user, body }: any) => {
  await guard(user);
  await ensureManualTable();
  const b = (body || {}) as any;
  const date = String(b.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid_date');
  const name = String(b.name || '').trim().slice(0, 120);
  if (!name) throw new Error('name_required');
  const id = `mr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await dbx().$executeRawUnsafe(
    `INSERT INTO "CashFlowManualRow"
       (id, row_date, category, name, amount_out, amount_in, note, settled)
     VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8)`,
    id, date, String(b.category || 'אחר').slice(0, 40), name,
    Math.abs(Number(b.out) || 0), Math.abs(Number(b.in) || 0),
    b.note ? String(b.note).slice(0, 200) : null, b.settled === true);
  return { ok: true, id };
});

registerFn('updateCashFlowRow', async ({ user, body }: any) => {
  await guard(user);
  await ensureManualTable();
  const b = (body || {}) as any;
  const id = String(b.id || '').replace(/^man_/, '');
  if (!id) throw new Error('id_required');
  if (b.delete === true) {
    await dbx().$executeRawUnsafe(`DELETE FROM "CashFlowManualRow" WHERE id = $1`, id);
    return { ok: true, deleted: true };
  }
  if (b.settled !== undefined) {
    await dbx().$executeRawUnsafe(
      `UPDATE "CashFlowManualRow" SET settled = $2 WHERE id = $1`, id, b.settled === true);
  }
  return { ok: true };
});

/**
 * Edit a derived (forecast) row. The row itself is recomputed on every load, so
 * the edit is stored against its original date+label and reapplied each time.
 * Clearing every field removes the override and the row returns to what the
 * data says.
 */
registerFn('setCashFlowRowOverride', async ({ user, body }: any) => {
  await guard(user);
  await ensureManualTable();
  const b = (body || {}) as any;
  const key = String(b.key || '');
  if (!key.includes('|')) throw new Error('key_required');

  if (b.reset === true) {
    await dbx().$executeRawUnsafe(`DELETE FROM "CashFlowRowOverride" WHERE row_key = $1`, key);
    return { ok: true, reset: true };
  }

  const newDate = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date || '')) ? String(b.date) : null;
  await dbx().$executeRawUnsafe(
    `INSERT INTO "CashFlowRowOverride"
       (row_key, new_date, new_name, new_out, new_in, settled, hidden, note, updated_at)
     VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (row_key) DO UPDATE SET
       new_date = EXCLUDED.new_date, new_name = EXCLUDED.new_name,
       new_out = EXCLUDED.new_out, new_in = EXCLUDED.new_in,
       settled = EXCLUDED.settled, hidden = EXCLUDED.hidden,
       note = EXCLUDED.note, updated_at = NOW()`,
    key, newDate,
    b.name ? String(b.name).slice(0, 120) : null,
    b.out === undefined || b.out === null || b.out === '' ? null : Math.abs(Number(b.out) || 0),
    b.in === undefined || b.in === null || b.in === '' ? null : Math.abs(Number(b.in) || 0),
    b.settled === true, b.hidden === true,
    b.note ? String(b.note).slice(0, 200) : null);
  return { ok: true };
});

/**
 * Name a bank movement. Israeli banks send supplier payments with no
 * counterparty at all — just "העברה באינטרנט" — so reconciliation names what it
 * can match to an invoice and the rest stays anonymous. This lets the owner say
 * who it was, once, and have it stick.
 */
registerFn('setBankTxCounterparty', async ({ user, body }: any) => {
  await guard(user);
  const b = (body || {}) as any;
  const id = String(b.id || '').replace(/^bank_/, '');
  if (!id) throw new Error('id_required');
  const name = b.counterparty == null ? null : String(b.counterparty).trim().slice(0, 120) || null;
  await dbx().$executeRawUnsafe(
    `UPDATE "BankTransaction" SET counterparty = $2 WHERE id = $1`, id, name);
  return { ok: true, id, counterparty: name };
});

/** Supplier names, for the tagging dropdown. */
registerFn('listSupplierNames', async ({ user }: any) => {
  await guard(user);
  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT id, company_name FROM "Supplier" WHERE company_name IS NOT NULL ORDER BY company_name`)
    .catch(() => []);
  return { suppliers: rows.map((r: any) => ({ id: String(r.id), name: r.company_name })) };
});

/**
 * How much of the money coming in should be held back for VAT.
 *
 * The owner asked for 18% of every shekel of income. That is the headline VAT
 * rate, but it is not what a business owes: output VAT is reduced by the input
 * VAT on everything purchased, so reserving the full rate on gross income puts
 * aside far more than will ever be paid. Both figures are returned — the rate
 * they asked for, and what their own payment history says — so the choice is
 * made with the gap visible rather than discovered at the end of a quarter.
 */
registerFn('getVatReserve', async ({ user, body }: any) => {
  await guard(user);
  const months = Math.min(12, Math.max(1, Number((body || {}).months) || 3));
  const since = new Date(Date.now() - months * 31 * 86400_000).toISOString().slice(0, 10);

  const inc: any[] = await dbx().$queryRawUnsafe(
    `SELECT COALESCE(SUM(amount),0)::float AS total
     FROM "BankTransaction"
     WHERE amount > 0 AND tx_date >= $1::date
       AND category IN ('income_card','income_cash','income_delivery','income_transfer','income_check')`,
    since).catch(() => []);
  const income = Number(inc[0]?.total) || 0;

  const paid: any[] = await dbx().$queryRawUnsafe(
    `SELECT COALESCE(SUM(ABS(amount)),0)::float AS total, COUNT(*)::int AS c
     FROM "BankTransaction" WHERE category = 'expense_vat' AND tx_date >= $1::date`,
    since).catch(() => []);
  const vatPaid = Number(paid[0]?.total) || 0;

  const RATE = 0.18;
  const effective = income > 0 ? vatPaid / income : 0;

  return {
    months,
    income: Math.round(income),
    vat_paid: Math.round(vatPaid),
    // What they asked for.
    at_headline_rate: Math.round(income * RATE),
    headline_rate: RATE,
    // What their own history implies, which is the number that will actually be
    // needed unless the business changes shape.
    effective_rate: Math.round(effective * 1000) / 10,
    at_effective_rate: Math.round(income * effective),
    // Per shekel of income, from here on.
    reserve_per_1000_headline: Math.round(1000 * RATE),
    reserve_per_1000_effective: Math.round(1000 * effective),
  };
});

/** Run the overdue-payment alert now. dry_run returns the message unsent. */
registerFn('testOverduePaymentAlert', async ({ user, body }: any) => {
  await guard(user);
  const { runOverduePaymentAlerts } = await import('../lib/overdueAlerts.js');
  return runOverduePaymentAlerts({ dryRun: (body || {}).dry_run !== false });
});

/**
 * What we owe suppliers right now — "כמה אנחנו פתוחים בחוץ".
 *
 * Split by how real each bucket is: money genuinely coming due, money already
 * late, and invoices so old they are almost certainly a bookkeeping gap. Lumping
 * them into one number would overstate the debt by the size of the gap.
 */
registerFn('getAccountsPayable', async ({ user }: any) => {
  await guard(user);
  const { loadOpenInvoices } = await import('./bankStatement.js');
  const matched: any[] = await dbx().$queryRawUnsafe(
    `SELECT DISTINCT invoice_id FROM "BankTxMatch"`).catch(() => []);
  const paid = new Set(matched.map((r: any) => String(r.invoice_id)));
  const open = (await loadOpenInvoices()).filter((i: any) => !paid.has(i.id));

  const today = ymd(new Date());
  const staleKey = ymd(new Date(Date.now() - 45 * 86400_000));
  const sum = (xs: any[]) => Math.round(xs.reduce((t, i) => t + i.amount, 0));

  const upcoming = open.filter((i: any) => i.due_date >= today);
  const late = open.filter((i: any) => i.due_date >= staleKey && i.due_date < today);
  const stale = open.filter((i: any) => i.due_date < staleKey);

  const bySupplier = new Map<string, { name: string; total: number; count: number; late: number }>();
  for (const i of open as any[]) {
    const e = bySupplier.get(i.supplier_id) || { name: i.supplier_name, total: 0, count: 0, late: 0 };
    e.total += i.amount; e.count++;
    if (i.due_date < today && i.due_date >= staleKey) e.late += i.amount;
    bySupplier.set(i.supplier_id, e);
  }

  return {
    total: sum(open),
    count: open.length,
    suppliers: bySupplier.size,
    buckets: {
      upcoming: { count: upcoming.length, total: sum(upcoming) },
      late: { count: late.length, total: sum(late) },
      stale: { count: stale.length, total: sum(stale) },
    },
    top: [...bySupplier.values()]
      .sort((a, b) => b.total - a.total).slice(0, 12)
      .map((s) => ({ ...s, total: Math.round(s.total), late: Math.round(s.late) })),
  };
});

// ── Hebrew calendar ────────────────────────────────────────────────────────

registerFn('syncHolidayCalendar', async ({ user, body }: any) => {
  await guard(user);
  const { syncHolidayCalendar } = await import('../lib/hebrewCalendar.js');
  const y = new Date().getUTCFullYear();
  const years = [y, y + 1];
  let added = 0, total = 0;
  for (const year of years) {
    const r = await syncHolidayCalendar(Number((body || {}).year) || year);
    added += r.added; total = r.total;
    if ((body || {}).year) break;
  }
  return { ok: true, added, total, years };
});

registerFn('getHolidayCalendar', async ({ user, body }: any) => {
  await guard(user);
  const { loadHolidays } = await import('../lib/hebrewCalendar.js');
  const b = (body || {}) as any;
  const from = b.from || ymd(new Date(Date.now() - 30 * 86400_000));
  const to = b.to || ymd(new Date(Date.now() + 365 * 86400_000));
  const m = await loadHolidays(from, to);
  return {
    holidays: [...m.values()].sort((a, b2) => a.date.localeCompare(b2.date)),
    count: m.size,
  };
});

/** The owner's correction for one date. Their number always wins over the seed. */
registerFn('setHolidayFactor', async ({ user, body }: any) => {
  await guard(user);
  const b = (body || {}) as any;
  const date = String(b.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid_date');
  const factor = Math.max(0, Math.min(5, Number(b.revenue_factor)));
  if (!Number.isFinite(factor)) throw new Error('invalid_factor');
  await dbx().$executeRawUnsafe(
    `UPDATE "HolidayCalendar"
     SET revenue_factor = $2, closed = $3, edited = true, updated_at = NOW()
     WHERE holiday_date = $1::date`,
    date, factor, b.closed === true || factor === 0);
  return { ok: true, date, revenue_factor: factor };
});

// ── insights ───────────────────────────────────────────────────────────────

registerFn('getCashInsights', async ({ user }: any) => {
  await guard(user);
  const { buildCashInsights } = await import('../lib/cashInsights.js');
  const insights = await buildCashInsights();
  return { insights, count: insights.length };
});
