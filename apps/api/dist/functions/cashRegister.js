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
const isAdmin = (user) => user?.role === 'owner' || user?.role === 'admin';
const dbx = () => prisma;
const n = (v) => (v == null ? 0 : Number(v));
const ymd = (d) => d.toISOString().slice(0, 10);
async function guard(user) {
    if (!user?.id)
        throw new Error('unauthorized');
    if (!isAdmin(user))
        throw new Error('forbidden');
    await requirePageAccess(user, 'CashFlow');
}
async function ensureManualTable() {
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
    )`).catch(() => { });
    await dbx().$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CashFlowManualRow_date_idx" ON "CashFlowManualRow"(row_date)`).catch(() => { });
}
const TAX = 'מיסים';
const SUPPLIERS = 'ספקים';
const PAYROLL = 'שכר';
function futureCategory(label) {
    if (label.startsWith('חשבונית') || label.startsWith(SUPPLIERS))
        return SUPPLIERS;
    if (label.includes('מע') || label.includes('מס הכנסה') || label.includes('ביטוח לאומי'))
        return TAX;
    if (label.includes('משכורת'))
        return PAYROLL;
    return label || 'אחר';
}
registerFn('getCashFlowRegister', async ({ user, body }) => {
    await guard(user);
    await ensureManualTable();
    const b = (body || {});
    const back = Math.min(365, Math.max(0, Number(b.days_back ?? 60)));
    const fwd = Math.min(365, Math.max(7, Number(b.days_forward) || 90));
    const today = ymd(new Date());
    const fromKey = ymd(new Date(Date.now() - back * 86400_000));
    const toKey = ymd(new Date(Date.now() + fwd * 86400_000));
    // ── the past: what the bank actually did ────────────────────────────────
    const bankRows = await dbx().$queryRawUnsafe(`SELECT id, tx_date, description, counterparty, amount, balance, category
     FROM "BankTransaction" WHERE tx_date >= $1::date ORDER BY tx_date, id`, fromKey)
        .catch(() => []);
    const past = bankRows.map((r) => {
        const amt = n(r.amount);
        return {
            id: `bank_${r.id}`,
            date: dbDate(r.tx_date),
            category: CATEGORY_LABELS[r.category]?.he || 'אחר',
            name: r.counterparty || r.description || '—',
            out: amt < 0 ? -amt : 0,
            in: amt > 0 ? amt : 0,
            balance: 0,
            settled: true, // it left the account; it is a fact
            source: 'bank',
            note: null,
            editable: false,
        };
    });
    // ── the future: obligations and learned rhythms ─────────────────────────
    // Categories with no discernible rhythm get spread as an even daily trickle,
    // which is right for the balance and useless in a register: it buries the
    // dated obligations that matter under hundreds of ₪700 fragments. Those
    // fragments are merged into one line per day per direction, so a real payment
    // on the 15th is visible instead of drowned.
    const f = await computeCapitalForecast(fwd);
    const future = [];
    const DRIP = 'פריסה יומית';
    if (f?.has_data) {
        for (const day of f.days || []) {
            let dripOut = 0, dripIn = 0;
            for (const [i, e] of (day.events || []).entries()) {
                const amt = n(e.amount);
                if (Math.abs(amt) < 1)
                    continue;
                const label = String(e.label || 'תנועה');
                if (label.includes(DRIP)) {
                    if (amt < 0)
                        dripOut += -amt;
                    else
                        dripIn += amt;
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
                    source: String(e.source || '').includes('חשבונית') ? 'invoice' : 'pattern',
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
                    source: 'pattern',
                    note: 'קטגוריות ללא דפוס קבוע, נפרסות כממוצע יומי',
                    editable: false,
                });
            }
        }
    }
    // ── manual rows: the things only the owner knows ────────────────────────
    const manualRows = await dbx().$queryRawUnsafe(`SELECT id, row_date, category, name, amount_out, amount_in, note, settled
     FROM "CashFlowManualRow" WHERE row_date >= $1::date ORDER BY row_date`, fromKey)
        .catch(() => []);
    const manual = manualRows.map((r) => ({
        id: `man_${r.id}`,
        date: dbDate(r.row_date),
        category: r.category || 'אחר',
        name: r.name,
        out: n(r.amount_out),
        in: n(r.amount_in),
        balance: 0,
        settled: r.settled === true,
        source: 'manual',
        note: r.note || null,
        editable: true,
    }));
    // ── one chronological series with a running balance ─────────────────────
    const all = [...past, ...manual, ...future]
        .filter((r) => r.date >= fromKey && r.date <= toKey)
        .sort((a, b) => a.date.localeCompare(b.date));
    // Anchor on the last balance the bank actually printed, then walk outwards.
    // Running the balance from an assumed zero would make every historical row
    // disagree with the statement the owner can check it against.
    const anchorRow = [...bankRows].reverse().find((r) => r.balance != null);
    const anchorDate = anchorRow ? dbDate(anchorRow.tx_date) : today;
    const anchorBal = anchorRow ? n(anchorRow.balance) : 0;
    // Backwards from the anchor: each earlier row's balance is the later one minus
    // that row's own movement.
    let bal = anchorBal;
    for (let i = all.length - 1; i >= 0; i--) {
        if (all[i].date > anchorDate)
            continue;
        all[i].balance = bal;
        bal = bal - all[i].in + all[i].out;
    }
    // Forwards from the anchor.
    bal = anchorBal;
    for (const r of all) {
        if (r.date <= anchorDate)
            continue;
        bal = bal + r.in - r.out;
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
        totals: {
            settled: all.length - unsettled.length,
            unsettled: unsettled.length,
            future_out: Math.round(unsettled.reduce((t, r) => t + r.out, 0)),
            future_in: Math.round(unsettled.reduce((t, r) => t + r.in, 0)),
        },
    };
});
/** A row only the owner knows about — a cheque written, a payment promised. */
registerFn('addCashFlowRow', async ({ user, body }) => {
    await guard(user);
    await ensureManualTable();
    const b = (body || {});
    const date = String(b.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error('invalid_date');
    const name = String(b.name || '').trim().slice(0, 120);
    if (!name)
        throw new Error('name_required');
    const id = `mr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await dbx().$executeRawUnsafe(`INSERT INTO "CashFlowManualRow"
       (id, row_date, category, name, amount_out, amount_in, note, settled)
     VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8)`, id, date, String(b.category || 'אחר').slice(0, 40), name, Math.abs(Number(b.out) || 0), Math.abs(Number(b.in) || 0), b.note ? String(b.note).slice(0, 200) : null, b.settled === true);
    return { ok: true, id };
});
registerFn('updateCashFlowRow', async ({ user, body }) => {
    await guard(user);
    await ensureManualTable();
    const b = (body || {});
    const id = String(b.id || '').replace(/^man_/, '');
    if (!id)
        throw new Error('id_required');
    if (b.delete === true) {
        await dbx().$executeRawUnsafe(`DELETE FROM "CashFlowManualRow" WHERE id = $1`, id);
        return { ok: true, deleted: true };
    }
    if (b.settled !== undefined) {
        await dbx().$executeRawUnsafe(`UPDATE "CashFlowManualRow" SET settled = $2 WHERE id = $1`, id, b.settled === true);
    }
    return { ok: true };
});
//# sourceMappingURL=cashRegister.js.map