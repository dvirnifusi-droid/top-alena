// Bank statement (עו"ש) import — one parser for every bank.
//
// Israeli banks each export a different shape, and half of them ship an HTML
// table with an .xls extension. Rather than write a parser per bank, this
// detects the CONTAINER (html / csv / xlsx) to get a grid of cells, then finds
// the columns by matching header synonyms — so a new bank usually needs no code,
// only another synonym. When headers are unrecognisable it falls back to
// inferring columns from the data itself.
//
// Everything downstream (cash-flow history, opening balance, invoice
// reconciliation) reads the normalised BankTx, never the bank's own format.
// ── container detection ────────────────────────────────────────────────────
const isHtml = (s) => /<table[\s>]/i.test(s) || /<html[\s>]/i.test(s);
/** Strip tags/entities/nbsp from one HTML cell. */
function cellText(html) {
    const t = html.replace(/<[^>]+>/g, ' ');
    return decodeEntities(t).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}
function decodeEntities(s) {
    return s
        .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}
function gridFromHtml(s) {
    const rows = [];
    for (const tr of s.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
        const cells = [];
        for (const td of tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []) {
            cells.push(cellText(td.replace(/^<t[dh][^>]*>/i, '').replace(/<\/t[dh]>$/i, '')));
        }
        if (cells.length)
            rows.push(cells);
    }
    return rows;
}
/** Split a delimited line, honouring quotes. Delimiter is sniffed per file. */
function splitLine(line, delim) {
    const out = [];
    let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (q && line[i + 1] === '"') {
                cur += '"';
                i++;
            }
            else
                q = !q;
        }
        else if (c === delim && !q) {
            out.push(cur);
            cur = '';
        }
        else
            cur += c;
    }
    out.push(cur);
    return out.map((x) => x.trim().replace(/^"|"$/g, ''));
}
function gridFromCsv(s) {
    const lines = s.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (!lines.length)
        return [];
    // Sniff the delimiter on the densest of the first lines — a header row alone
    // can be misleading when a bank pads it with empty columns.
    const sample = lines.slice(0, 15).join('\n');
    const counts = {
        ',': (sample.match(/,/g) || []).length,
        ';': (sample.match(/;/g) || []).length,
        '\t': (sample.match(/\t/g) || []).length,
        '|': (sample.match(/\|/g) || []).length,
    };
    const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return lines.map((l) => splitLine(l, delim));
}
// ── column identification ──────────────────────────────────────────────────
const SYN = {
    date: /^(תאריך|תאריך\s*עסקה|תאריך\s*פעולה|תאריך\s*התנועה|יום|date|transaction\s*date|posting\s*date)$/i,
    value_date: /^(תאריך\s*ערך|ערך|value\s*date)$/i,
    description: /^(תיאור|סוג\s*תנועה|סוג\s*פעולה|פרטים|תנועה|תיאור\s*פעולה|פירוט|description|details|narrative|memo)$/i,
    credit: /^(זכות|הפקדה|זיכוי|credit|deposit|in)$/i,
    debit: /^(חובה|משיכה|חיוב|debit|withdrawal|out)$/i,
    amount: /^(סכום|סכום\s*התנועה|amount|sum)$/i,
    balance: /^(יתרה|יתרה\s*בש"ח|יתרה\s*לאחר|balance|running\s*balance)$/i,
    reference: /^(אסמכתא|מס'?\s*אסמכתא|אסמכתה|reference|ref|confirmation)$/i,
};
function findHeader(grid) {
    // The header is the row that maps the most distinct fields — bank exports
    // routinely put titles, balances and disclaimers above it.
    let best = null;
    for (let r = 0; r < Math.min(grid.length, 60); r++) {
        const cols = {};
        grid[r].forEach((cell, i) => {
            const t = cell.replace(/\s+/g, ' ').trim();
            if (!t)
                return;
            for (const [key, re] of Object.entries(SYN)) {
                if (re.test(t) && cols[key] === undefined)
                    cols[key] = i;
            }
        });
        const score = Object.keys(cols).length;
        const usable = cols.date !== undefined
            && (cols.amount !== undefined || cols.credit !== undefined || cols.debit !== undefined);
        if (usable && (!best || score > best.score))
            best = { row: r, cols, score };
    }
    return best ? { row: best.row, cols: best.cols } : null;
}
// ── value parsing ──────────────────────────────────────────────────────────
const DATE_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/;
const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
/** Israeli exports are day-first; a 2-digit year belongs to this century. */
export function parseDate(raw) {
    const s = String(raw || '').trim();
    if (!s)
        return null;
    // Excel keeps dates as a serial number from 1899-12-30. Only plausible date
    // serials convert — an amount must never be mistaken for a date.
    if (/^\d{5}(\.\d+)?$/.test(s)) {
        const n = Number(s);
        if (n >= 20000 && n <= 60000) {
            const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400_000);
            return d.toISOString().slice(0, 10);
        }
    }
    const iso = s.match(ISO_RE);
    if (iso)
        return `${iso[1]}-${p2(iso[2])}-${p2(iso[3])}`;
    const m = s.match(DATE_RE);
    if (!m)
        return null;
    let [, d, mo, y] = m;
    let year = Number(y);
    if (y.length <= 2)
        year = 2000 + year;
    const dd = Number(d), mm = Number(mo);
    // A day > 12 in the first slot proves day-first; otherwise trust the
    // day-first convention rather than guessing per row (mixing the two inside
    // one file is how import bugs silently shift a whole month).
    if (dd > 31 || mm > 12)
        return null;
    return `${year}-${p2(mm)}-${p2(dd)}`;
}
const p2 = (n) => String(Number(n)).padStart(2, '0');
/** Money as printed by banks: 1,234.56 / (1,234.56) / 1.234,56 / ₪1,234 / -. */
export function parseAmount(raw) {
    let s = String(raw ?? '').trim();
    if (!s || s === '-' || s === '—')
        return 0;
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    s = s.replace(/[()₪$€\s]/g, '').replace(/[־–—]/g, '-').replace(/^-|-$/g, '');
    // European style "1.234,56" — comma as the decimal separator.
    if (/,\d{2}$/.test(s) && /\.\d{3}/.test(s))
        s = s.replace(/\./g, '').replace(',', '.');
    else
        s = s.replace(/,/g, '');
    const n = parseFloat(s);
    if (!Number.isFinite(n))
        return 0;
    return neg ? -Math.abs(n) : n;
}
// ── categorisation ─────────────────────────────────────────────────────────
// Rules run in order; first match wins. Direction matters — "אמריקן אקספרס"
// arriving is card income, leaving is the business paying its own card bill.
const RULES = [
    // Reversals first — "החזר חיוב" contains no clue about the original category,
    // and a later rule would happily misfile it.
    { re: /החזרת\s*זיכוי|החזר\s*חיוב|ע\.?\s*חיוב\s*מושך|סיבה\s*טכנית|ביטול\s*עסקה/i, inCat: 'refund_in', outCat: 'refund_out' },
    { re: /לאומי\s*קארד|ישראכרט|כרטיסי\s*אשראי|כ\.?א\.?ל|cal|מקס\s*איט|max\s*it|שב"?א|אמריקן\s*אקספרס|amex|דיינרס|מסטרקרד|mastercard|ויזה|visa|פועלים\s*אקספרס/i, inCat: 'income_card', outCat: 'expense_card' },
    { re: /קופת\s*סניף|הפקדת\s*מזומן|מזומן/i, inCat: 'income_cash', outCat: 'expense_cash' },
    { re: /פלאקסי|10\s*ביס|תן\s*ביס|סיבוס|cibus|goodi|גודי|וולט|wolt|ביי\s*מי|פאיימי|paybox|ביט|bit/i, inCat: 'income_delivery', outCat: 'expense_other' },
    { re: /משכורת|משכורות|שכר\s*עבודה|העברת\s*שכר|payroll|salary/i, outCat: 'expense_payroll' },
    { re: /מ\.?\s*ע\.?\s*מ|מע"?מ|מס\s*הכנסה|ביטוח\s*לאומי|רשות\s*המסים|ניכויים|מקדמות/i, outCat: 'expense_tax', inCat: 'income_tax_refund' },
    { re: /שכ"?ד|שכירות|דמי\s*שכירות|rent/i, outCat: 'expense_rent' },
    { re: /עירית|עיריי?ת|ארנונה|חשמל|חברת\s*החשמל|מי\s*|תאגיד\s*מים|בזק|פרטנר|סלקום|hot|יס\s|פלאפון/i, outCat: 'expense_utilities' },
    { re: /ביטוח|הראל|מגדל|כלל\s*ביטוח|הפניקס|מנורה|פנסיה|גמל|השתלמות/i, outCat: 'expense_insurance', inCat: 'income_other' },
    { re: /עמלת|עמלה|ריבית|דמי\s*הקצאת|דמי\s*ניהול|fee|commission/i, outCat: 'expense_fees', inCat: 'income_other' },
    { re: /הלוואה|החזר\s*הלוואה|משכנתא|loan/i, outCat: 'expense_loan' },
    { re: /קניית\s*מור|כספית\s*ניהול|קרן\s*נאמנות|ני"?ע|רכישת\s*מטח|ספוט\s*מטח/i, outCat: 'transfer_savings', inCat: 'transfer_savings' },
    { re: /פירעון\s*שיק|פרעון\s*שיק|שיק\s*שנפרע/i, outCat: 'expense_supplier_check' },
    { re: /הפקדת\s*שיק|החזר\s*שיק|שיק\s*טכני/i, inCat: 'income_check' },
    { re: /העברה\s*באינטרנט|העברה\s*ברשימה|העברה\s*לחשבון|העברה\s*בנקאית|זיכוי\s*-|זכוי\s*מ/i, inCat: 'income_transfer', outCat: 'expense_supplier_transfer' },
];
export function categorize(description, amount) {
    const d = String(description || '');
    for (const r of RULES) {
        if (!r.re.test(d))
            continue;
        const c = amount >= 0 ? r.inCat : r.outCat;
        if (c)
            return c;
    }
    // A named company that no rule caught is almost always a supplier being paid
    // (or a business customer paying in) — far more useful than "other".
    if (/בע"?מ|בעמ|ltd|inc\b/i.test(d)) {
        return amount >= 0 ? 'income_transfer' : 'expense_supplier_transfer';
    }
    return amount >= 0 ? 'income_other' : 'expense_other';
}
// Generic bank wording carries no counterparty — only a real name is worth
// keeping, because that is what gets matched against the supplier list.
const GENERIC = /^(העברה|פירעון|פרעון|הפקדת|משיכת|עמלת|עמלה|ריבית|זיכוי|זכוי|חיוב|מ\.?\s*ע\.?\s*מ|מס\s|תשלום\s*משכורות|רכישת|ספוט|דמי|החזר|ע\.)/;
export function extractCounterparty(description) {
    let d = String(description || '')
        .replace(/\((?:י|ד|ח|ע)\)\s*$/, '') // Mizrahi channel marker, e.g. "(י)"
        .replace(/\s+/g, ' ')
        .trim();
    if (!d || d.length < 3)
        return null;
    if (GENERIC.test(d))
        return null;
    return d;
}
/** Hebrew labels + direction, shared by every UI that shows a category. */
export const CATEGORY_LABELS = {
    income_card: { he: 'סליקת אשראי', dir: 'in' },
    income_cash: { he: 'הפקדת מזומן', dir: 'in' },
    income_delivery: { he: 'משלוחים / תווי אוכל', dir: 'in' },
    income_check: { he: 'שיקים שהופקדו', dir: 'in' },
    income_transfer: { he: 'העברות נכנסות', dir: 'in' },
    income_tax_refund: { he: 'החזרי מס', dir: 'in' },
    income_other: { he: 'הכנסה אחרת', dir: 'in' },
    expense_supplier_transfer: { he: 'ספקים — העברות', dir: 'out' },
    expense_supplier_check: { he: 'ספקים — שיקים', dir: 'out' },
    expense_payroll: { he: 'משכורות', dir: 'out' },
    expense_tax: { he: 'מיסים (מע"מ / מ"ה / ב"ל)', dir: 'out' },
    expense_rent: { he: 'שכירות', dir: 'out' },
    expense_utilities: { he: 'ארנונה / חשמל / תקשורת', dir: 'out' },
    expense_insurance: { he: 'ביטוח ופנסיה', dir: 'out' },
    expense_card: { he: 'תשלום כרטיס אשראי', dir: 'out' },
    expense_fees: { he: 'עמלות בנק וריבית', dir: 'out' },
    expense_loan: { he: 'הלוואות', dir: 'out' },
    expense_cash: { he: 'משיכת מזומן', dir: 'out' },
    expense_other: { he: 'הוצאה אחרת', dir: 'out' },
    transfer_savings: { he: 'העברה לחיסכון / מט"ח', dir: 'both' },
    refund_in: { he: 'זיכוי / החזר', dir: 'in' },
    refund_out: { he: 'ביטול זיכוי', dir: 'out' },
};
// ── header metadata ────────────────────────────────────────────────────────
// Only ever called on the rows ABOVE the transaction header. Scanning the whole
// file reads a counterparty name out of a transaction line ("זיכוי - בנק
// הפועלים") and confidently reports the wrong bank.
function detectBank(text, filename = '') {
    const t = text.slice(0, 4000) + ' ' + filename;
    if (/מזרחי|mizrahi|טפחות|accountactivity/i.test(t))
        return 'מזרחי טפחות';
    if (/הפועלים|poalim/i.test(t))
        return 'הפועלים';
    if (/לאומי|leumi/i.test(t))
        return 'לאומי';
    if (/דיסקונט|discount/i.test(t))
        return 'דיסקונט';
    if (/הבינלאומי|fibi/i.test(t))
        return 'הבינלאומי';
    if (/מרכנתיל/i.test(t))
        return 'מרכנתיל';
    if (/ירושלים/i.test(t))
        return 'ירושלים';
    if (/יהב/i.test(t))
        return 'יהב';
    if (/one\s*zero|וואן\s*זירו/i.test(t))
        return 'OneZero';
    return null;
}
function grab(text, re) {
    const m = text.match(re);
    return m ? m[1].trim() : null;
}
// ── main entry ─────────────────────────────────────────────────────────────
export function parseBankStatement(raw, filename = '') {
    const text = raw.replace(/^﻿/, '');
    const format = isHtml(text) ? 'html' : 'csv';
    return parseGrid(format === 'html' ? gridFromHtml(text) : gridFromCsv(text), format, filename);
}
/** Format-agnostic core: a grid of cells in, normalised transactions out. */
function parseGrid(grid, format, filename = '') {
    const warnings = [];
    if (!grid.length) {
        return { ok: false, format, bank: null, account: null, currency: 'ILS', closing_balance: null,
            credit_line: null, transactions: [], warnings: ['לא נמצאו שורות בקובץ'] };
    }
    const head = findHeader(grid);
    // Metadata lives above the transaction header — reading it from the whole
    // file picks values out of the transactions themselves.
    const headerRegion = grid.slice(0, head ? head.row : Math.min(grid.length, 20))
        .map((r) => r.join(' | ')).join('\n');
    const bank = detectBank(headerRegion, filename);
    const account = grab(headerRegion, /מספר\s*חשבון:?\s*\|?\s*([\d-]{5,})/)
        || grab(headerRegion, /account\s*(?:number)?:?\s*([\d-]{5,})/i);
    const closing = grab(headerRegion, /יתרה\s*(?:בחשבון|נוכחית|סופית)?:?\s*\|?\s*([\-\d,.]+)/);
    const creditLine = grab(headerRegion, /מסגרת\s*אשראי:?\s*\|?\s*([\-\d,.]+)/);
    if (!head) {
        return { ok: false, format, bank, account, currency: 'ILS', closing_balance: null,
            credit_line: null, transactions: [],
            warnings: ['לא זוהו כותרות עמודות (תאריך / זכות / חובה או סכום). ייתכן שזה פורמט בנק שעדיין לא נתמך.'] };
    }
    const { row: hRow, cols } = head;
    if (cols.description === undefined)
        warnings.push('לא נמצאה עמודת תיאור — הסיווג האוטומטי יהיה חלקי');
    const at = (r, i) => (i === undefined ? '' : (r[i] ?? ''));
    const seen = new Map();
    const txs = [];
    let skipped = 0;
    for (let r = hRow + 1; r < grid.length; r++) {
        const row = grid[r];
        const date = parseDate(at(row, cols.date));
        if (!date) {
            if (row.some((c) => c))
                skipped++;
            continue;
        }
        let amount = 0;
        if (cols.credit !== undefined || cols.debit !== undefined) {
            const cr = Math.abs(parseAmount(at(row, cols.credit)));
            const db = Math.abs(parseAmount(at(row, cols.debit)));
            amount = cr - db;
        }
        else {
            amount = parseAmount(at(row, cols.amount));
        }
        if (!amount)
            continue; // a zero row is a separator, not a transaction
        const description = at(row, cols.description).trim() || '(ללא תיאור)';
        const balRaw = at(row, cols.balance);
        const balance = balRaw && parseAmount(balRaw) !== 0 ? parseAmount(balRaw) : null;
        const reference = at(row, cols.reference).trim();
        const value_date = parseDate(at(row, cols.value_date)) || date;
        // Identical rows do occur (two invoices, same supplier, same day, same
        // amount) — an occurrence counter keeps them distinct so a re-import
        // neither drops nor duplicates them.
        const base = `${date}|${amount.toFixed(2)}|${reference}|${description}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        txs.push({
            date, value_date, description,
            counterparty: extractCounterparty(description),
            amount, balance, reference,
            category: categorize(description, amount),
            hash: `${base}|${n}`,
        });
    }
    if (skipped > 3)
        warnings.push(`${skipped} שורות דולגו (ללא תאריך תקין) — בדרך כלל כותרות וסיכומים`);
    if (!txs.length)
        warnings.push('לא נמצאו תנועות');
    txs.sort((a, b) => a.date.localeCompare(b.date));
    return {
        ok: txs.length > 0,
        format, bank, account, currency: 'ILS',
        closing_balance: closing ? parseAmount(closing) : null,
        credit_line: creditLine ? parseAmount(creditLine) : null,
        transactions: txs,
        warnings,
    };
}
// ── xlsx ───────────────────────────────────────────────────────────────────
const colIndex = (ref) => {
    const m = ref.match(/^([A-Z]+)/);
    if (!m)
        return 0;
    let n = 0;
    for (const ch of m[1])
        n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
};
/** Real .xlsx (a zip of XML). Parsed by hand — no spreadsheet dependency. */
async function gridFromXlsx(buf) {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    const sstXml = await zip.file('xl/sharedStrings.xml')?.async('string');
    const shared = [];
    if (sstXml) {
        for (const si of sstXml.match(/<si>[\s\S]*?<\/si>/g) || []) {
            // A string can be split across several <t> runs; concatenate them all.
            const parts = si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [];
            shared.push(decodeEntities(parts.map((p) => p.replace(/<[^>]+>/g, '')).join('')));
        }
    }
    const sheetName = Object.keys(zip.files)
        .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
    if (!sheetName)
        return [];
    const xml = await zip.file(sheetName).async('string');
    const grid = [];
    for (const rowXml of xml.match(/<row[\s\S]*?<\/row>/g) || []) {
        const cells = [];
        for (const c of rowXml.match(/<c[^>]*(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
            const ref = (c.match(/r="([A-Z]+\d+)"/) || [])[1] || '';
            const type = (c.match(/t="([^"]+)"/) || [])[1] || '';
            let val = '';
            if (type === 'inlineStr') {
                val = decodeEntities((c.match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1] || '').replace(/<[^>]+>/g, '');
            }
            else {
                const v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '';
                val = type === 's' ? (shared[Number(v)] ?? '') : decodeEntities(v);
            }
            const i = ref ? colIndex(ref) : cells.length;
            while (cells.length < i)
                cells.push('');
            cells[i] = String(val).trim();
        }
        grid.push(cells);
    }
    return grid;
}
/**
 * Entry point for an uploaded file of unknown type. Text formats go straight
 * through; a zip signature means real xlsx. Legacy binary .xls (BIFF) is the one
 * shape not handled — the caller is told to re-export rather than fed silence.
 */
export async function parseBankFile(buf, filename = '') {
    const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
    const isBiff = buf.length > 8 && buf[0] === 0xd0 && buf[1] === 0xcf;
    if (isBiff) {
        return { ok: false, format: 'xls-biff', bank: null, account: null, currency: 'ILS',
            closing_balance: null, credit_line: null, transactions: [],
            warnings: ['הקובץ בפורמט Excel ישן (97-2003). פתח אותו באקסל ושמור בתור xlsx או CSV, או ייצא מהבנק כ-CSV.'] };
    }
    if (isZip) {
        const grid = await gridFromXlsx(buf);
        return parseGrid(grid, 'xlsx', filename);
    }
    // Israeli banks still emit windows-1255; UTF-8 decoding it yields U+FFFD.
    let text = buf.toString('utf8');
    if ((text.match(/�/g) || []).length > 5) {
        try {
            text = new TextDecoder('windows-1255').decode(buf);
        }
        catch { /* keep utf8 */ }
    }
    return parseBankStatement(text, filename);
}
/** Roll transactions up per month and per category — the import summary. */
export function summarize(txs) {
    const months = new Map();
    const cats = new Map();
    for (const t of txs) {
        const mk = t.date.slice(0, 7);
        const m = months.get(mk) || { in: 0, out: 0, count: 0 };
        if (t.amount >= 0)
            m.in += t.amount;
        else
            m.out += -t.amount;
        m.count++;
        months.set(mk, m);
    }
    for (const t of txs) {
        const c = cats.get(t.category) || { total: 0, count: 0 };
        c.total += t.amount;
        c.count++;
        cats.set(t.category, c);
    }
    return {
        months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b))
            .map(([month, v]) => ({ month, in: Math.round(v.in), out: Math.round(v.out), net: Math.round(v.in - v.out), count: v.count })),
        categories: [...cats.entries()]
            .map(([category, v]) => ({
            category,
            label: CATEGORY_LABELS[category]?.he || category,
            total: Math.round(v.total), count: v.count,
        }))
            .sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
    };
}
//# sourceMappingURL=bankStatement.js.map