// Storing a parsed statement, shared by every route it can arrive through:
// the upload button, a scheduled email from the bank, or a file sent to the
// WhatsApp agent. Keeping the writes in one place means an automatic import and
// a manual one cannot drift apart — same dedupe, same opening balance, same
// account info.
import { prisma } from '../db.js';
const dbx = () => prisma;
const rid = () => `bt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
export async function ensureBankTables() {
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
    )`).catch(() => { });
    await dbx().$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BankTransaction_date_idx" ON "BankTransaction"(tx_date)`).catch(() => { });
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
    )`).catch(() => { });
    await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "BankAccountInfo" (
      id TEXT PRIMARY KEY,
      bank TEXT,
      account TEXT,
      credit_line NUMERIC(14,2),
      closing_balance NUMERIC(14,2),
      as_of DATE,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => { });
}
/** Which of these transactions we do not already hold, compared by hash. */
export async function freshTransactions(parsed) {
    const hashes = parsed.transactions.map((t) => t.hash);
    if (!hashes.length)
        return [];
    const existing = await dbx().$queryRawUnsafe(`SELECT hash FROM "BankTransaction" WHERE hash = ANY($1::text[])`, hashes).catch(() => []);
    const have = new Set(existing.map((r) => String(r.hash)));
    return parsed.transactions.filter((t) => !have.has(t.hash));
}
export async function persistStatement(parsed) {
    await ensureBankTables();
    const fresh = await freshTransactions(parsed);
    let imported = 0;
    for (const t of fresh) {
        try {
            await dbx().$executeRawUnsafe(`INSERT INTO "BankTransaction"
           (id, tx_date, value_date, description, counterparty, amount, balance,
            reference, category, bank, account, hash)
         VALUES ($1,$2::date,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (hash) DO NOTHING`, rid(), t.date, t.value_date, t.description, t.counterparty, t.amount, t.balance, t.reference, t.category, parsed.bank, parsed.account, t.hash);
            imported++;
        }
        catch { /* one bad row must not abort the import */ }
    }
    const last = parsed.transactions[parsed.transactions.length - 1];
    if (parsed.credit_line != null || parsed.closing_balance != null) {
        await dbx().$executeRawUnsafe(`DELETE FROM "BankAccountInfo"`).catch(() => { });
        await dbx().$executeRawUnsafe(`INSERT INTO "BankAccountInfo" (id, bank, account, credit_line, closing_balance, as_of)
       VALUES ($1,$2,$3,$4,$5,$6::date)`, rid(), parsed.bank, parsed.account, parsed.credit_line, parsed.closing_balance, last.date)
            .catch(() => { });
    }
    // The statement's last known balance is the truest opening balance the
    // forecast can have — set it so the owner never types it.
    let opening_set = null;
    const lastWithBalance = [...parsed.transactions].reverse().find((t) => t.balance != null);
    const bal = parsed.closing_balance ?? lastWithBalance?.balance ?? null;
    if (bal != null) {
        const asOf = lastWithBalance?.date || last.date;
        try {
            const date = new Date(`${asOf}T00:00:00.000Z`);
            const existing = await dbx().cashFlowSetting.findFirst().catch(() => null);
            if (existing) {
                await dbx().cashFlowSetting.update({
                    where: { id: existing.id }, data: { opening_balance: bal, opening_date: date }
                });
            }
            else {
                await dbx().cashFlowSetting.create({ data: { opening_balance: bal, opening_date: date } });
            }
            opening_set = { balance: bal, date: asOf };
        }
        catch { /* opening balance is a bonus, not a reason to fail the import */ }
    }
    return { imported, duplicates: parsed.transactions.length - fresh.length, opening_set };
}
/**
 * Is this attachment actually a bank statement? Decided by parsing it, not by
 * its filename — a supplier's price list can be called "statement.xls" and a
 * real export can be called anything. Deliberately strict, because the cost of
 * a false positive is junk transactions polluting the owner's cash flow.
 */
export function looksLikeStatement(parsed) {
    if (!parsed.ok || parsed.transactions.length < 5)
        return false;
    const distinctDates = new Set(parsed.transactions.map((t) => t.date));
    if (distinctDates.size < 3)
        return false;
    // A real statement spans time; a price list or order sheet does not.
    const dates = [...distinctDates].sort();
    const spanDays = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / 86400_000;
    return spanDays >= 5;
}
//# sourceMappingURL=bankPersist.js.map