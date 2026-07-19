// Credit-card statement (פירוט אשראי) — a different animal from a bank statement.
//
// A card statement has no running balance and no credit/debit split: every line
// is a charge. It carries two dates (when the purchase happened, when it hits
// the account) and two amounts (the purchase, and what is billed this cycle —
// they differ for instalments and foreign currency). Issuers also split the
// file by currency, one sheet per currency, so reading only the first sheet
// silently drops the whole foreign-currency spend.
//
// Crucially these charges are NOT extra money leaving the business. They are the
// itemisation of the monthly card payment that already appears in the bank
// statement. Treating them as additional outflows would double-count the lot,
// so they live in their own table and never touch BankTransaction.
import { parseAmount, parseDate } from './bankStatement.js';
const SYN = {
    billing_date: /^(תאריך\s*חיוב|תאריך\s*החיוב|מועד\s*חיוב|billing\s*date|charge\s*date)$/i,
    transaction_date: /^(תאריך\s*(ה)?עסקה|תאריך\s*רכישה|תאריך\s*ביצוע|transaction\s*date|purchase\s*date)$/i,
    merchant: /^(בית\s*(ה)?עסק|שם\s*בית\s*העסק|בית עסק|תיאור|שם\s*עסק|merchant|description|business)$/i,
    deal_amount: /^(סכום\s*(ה)?עסקה|סכום\s*מקורי|סכום\s*רכישה|original\s*amount|transaction\s*amount)$/i,
    charged_amount: /^(סכום\s*(ה)?חיוב|סכום\s*לחיוב|לחיוב|סכום\s*בשקלים|charge(d)?\s*amount|billed)$/i,
};
function findHeader(grid) {
    for (let r = 0; r < Math.min(grid.length, 30); r++) {
        const cols = {};
        grid[r].forEach((cell, i) => {
            const t = String(cell || '').replace(/\s+/g, ' ').trim();
            if (!t)
                return;
            for (const [key, re] of Object.entries(SYN)) {
                if (re.test(t) && cols[key] === undefined)
                    cols[key] = i;
            }
        });
        // A merchant column plus something chargeable is the minimum that makes
        // this a card statement rather than any other spreadsheet with dates.
        if (cols.merchant !== undefined
            && (cols.charged_amount !== undefined || cols.deal_amount !== undefined)
            && (cols.billing_date !== undefined || cols.transaction_date !== undefined)) {
            return { row: r, cols };
        }
    }
    return null;
}
/** Currency from the issuer's sheet name — they split one sheet per currency. */
function currencyOf(sheetName) {
    const s = String(sheetName || '');
    if (/דולר|usd|\$/i.test(s))
        return 'USD';
    if (/אירו|euro|eur|€/i.test(s))
        return 'EUR';
    if (/שקל|ils|₪/i.test(s))
        return 'ILS';
    return 'ILS';
}
/** Parse one sheet's grid. Sheets that are not charge tables yield nothing. */
export function parseCardGrid(grid, sheetName) {
    const head = findHeader(grid);
    if (!head)
        return [];
    const { row: hRow, cols } = head;
    const currency = currencyOf(sheetName);
    const at = (r, i) => (i === undefined ? '' : (r[i] ?? ''));
    const seen = new Map();
    const out = [];
    for (let r = hRow + 1; r < grid.length; r++) {
        const row = grid[r];
        const billing = parseDate(at(row, cols.billing_date));
        const txn = parseDate(at(row, cols.transaction_date));
        if (!billing && !txn)
            continue;
        const merchant = String(at(row, cols.merchant) || '').trim();
        if (!merchant)
            continue;
        const charged = Math.abs(parseAmount(at(row, cols.charged_amount)));
        const deal = Math.abs(parseAmount(at(row, cols.deal_amount)));
        // Card issuers list zero-value administrative lines (card fee headers, VAT
        // notes). They are not charges and would clutter the merchant breakdown.
        if (!charged && !deal)
            continue;
        const billing_date = billing || txn;
        const transaction_date = txn || billing;
        const base = `${currency}|${billing_date}|${transaction_date}|${merchant}|${(charged || deal).toFixed(2)}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        out.push({
            billing_date,
            transaction_date,
            merchant,
            deal_amount: deal || charged,
            charged_amount: charged || deal,
            currency,
            hash: `${base}|${n}`,
        });
    }
    return out;
}
/** Roll charges up per merchant — what is actually inside the card payment. */
export function summarizeCard(charges) {
    const byMerchant = new Map();
    const byMonth = new Map();
    for (const c of charges) {
        const k = `${c.currency}|${c.merchant}`;
        const m = byMerchant.get(k) || { total: 0, count: 0, currency: c.currency };
        m.total += c.charged_amount;
        m.count++;
        byMerchant.set(k, m);
        if (c.currency === 'ILS') {
            const mk = c.billing_date.slice(0, 7);
            byMonth.set(mk, (byMonth.get(mk) || 0) + c.charged_amount);
        }
    }
    return {
        merchants: [...byMerchant.entries()]
            .map(([k, v]) => ({ merchant: k.split('|')[1], currency: v.currency, total: Math.round(v.total), count: v.count }))
            .sort((a, b) => b.total - a.total),
        months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
            .map(([month, total]) => ({ month, total: Math.round(total) })),
        totals: [...new Set(charges.map((c) => c.currency))].map((cur) => ({
            currency: cur,
            total: Math.round(charges.filter((c) => c.currency === cur).reduce((s, c) => s + c.charged_amount, 0)),
            count: charges.filter((c) => c.currency === cur).length,
        })),
    };
}
/**
 * Fuzzy merchant → supplier match. Card issuers truncate the merchant name to a
 * fixed width ("משקאות דודיק סחר ושי", "עודד דניאל בע\"מ ביקו"), so an exact
 * comparison finds nothing; this matches on the longest shared prefix of words.
 */
export function matchMerchantsToSuppliers(merchants, suppliers) {
    const norm = (s) => String(s || '')
        .replace(/["'`׳״]/g, '')
        .replace(/\bבע"?מ\b|\bבעמ\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    const out = [];
    for (const m of merchants) {
        const mn = norm(m.merchant);
        if (mn.length < 4)
            continue;
        let best = null;
        for (const s of suppliers) {
            const sn = norm(s.name);
            if (sn.length < 4)
                continue;
            // Truncation means one is a prefix of the other far more often than they
            // are equal — require a decent overlap so short generic words don't match.
            const shorter = mn.length <= sn.length ? mn : sn;
            const longer = mn.length <= sn.length ? sn : mn;
            let score = 0;
            if (longer.startsWith(shorter))
                score = shorter.length;
            else if (longer.includes(shorter))
                score = shorter.length - 1;
            if (score >= 6 && (!best || score > best.score))
                best = { s, score };
        }
        if (best) {
            out.push({ merchant: m.merchant, total: m.total, supplier_id: best.s.id, supplier_name: best.s.name });
        }
    }
    return out.sort((a, b) => b.total - a.total);
}
/**
 * Parse an uploaded card statement. Reads EVERY sheet — issuers put each
 * currency on its own — and merges the charges.
 */
export async function parseCardFile(buf, filename = '') {
    const warnings = [];
    const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
    if (!isZip) {
        return { ok: false, charges: [], currencies: [], from: null, to: null,
            warnings: ['פירוט אשראי נתמך כרגע רק בפורמט xlsx. ייצא מחדש מאתר חברת האשראי.'] };
    }
    const { xlsxSheets } = await import('./bankStatement.js');
    const sheets = await xlsxSheets(buf);
    const charges = [];
    let sheetsParsed = 0;
    for (const sh of sheets) {
        const rows = parseCardGrid(sh.grid, sh.name);
        if (rows.length)
            sheetsParsed++;
        charges.push(...rows);
    }
    if (!charges.length) {
        return { ok: false, charges: [], currencies: [], from: null, to: null,
            warnings: ['לא זוהו חיובים. ודא שהקובץ הוא פירוט אשראי ולא דוח אחר.'] };
    }
    if (sheets.length > 1 && sheetsParsed < sheets.length) {
        // Usually an empty currency sheet, which is fine — say so rather than let
        // the owner wonder whether something was dropped.
        warnings.push(`${sheets.length - sheetsParsed} גיליונות ללא חיובים (בדרך כלל מטבע שלא היה בו שימוש)`);
    }
    charges.sort((a, b) => a.billing_date.localeCompare(b.billing_date));
    return {
        ok: true,
        charges,
        currencies: [...new Set(charges.map((c) => c.currency))],
        from: charges[0].billing_date,
        to: charges[charges.length - 1].billing_date,
        warnings,
    };
}
//# sourceMappingURL=cardStatement.js.map