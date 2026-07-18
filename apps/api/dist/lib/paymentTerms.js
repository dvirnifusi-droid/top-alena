// Supplier payment terms → an actual due DATE. Terms are free text in Hebrew
// ("שוטף+30", "מיידי", "שוטף 60"), so this normalises them once and everything
// downstream (supplier ledger, cash-flow forecast) shares one interpretation.
//
// Israeli convention: "שוטף+N" = net N days from the END of the invoice month,
// which is very different from N days from the invoice date — treating it as the
// latter puts every supplier outflow up to a month too early.
const HE_DIGITS = /(\d{1,3})/;
export function parsePaymentTerms(raw, opts = {}) {
    const s = String(raw || '').trim();
    const low = s.toLowerCase();
    // An occasional / one-off supplier is paid on the spot — no credit line.
    const occasional = !!opts.occasional
        || /מזדמן|חד\s*פעמי|one[\s-]?off|occasional/i.test(s);
    if (occasional || /מייד|מידי|immediate|cash|מזומן/i.test(low)) {
        return { kind: 'immediate', days: 0, label: 'מיידי', occasional: true };
    }
    const m = s.match(HE_DIGITS);
    const n = m ? Math.min(180, Math.max(0, parseInt(m[1], 10))) : NaN;
    // "שוטף" (current) means: settle at month end, then + N days.
    if (/שוטף|eom|end of month/i.test(low)) {
        const days = Number.isFinite(n) ? n : 0;
        return { kind: 'eom_plus', days, label: days ? `שוטף+${days}` : 'שוטף', occasional: false };
    }
    if (Number.isFinite(n)) {
        return { kind: 'net_days', days: n, label: `${n} ימים`, occasional: false };
    }
    // Nothing usable — assume immediate rather than inventing credit the owner
    // never agreed to; an optimistic guess here silently inflates the forecast.
    return { kind: 'immediate', days: 0, label: 'לא הוגדר (מיידי)', occasional: false };
}
function endOfMonth(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}
/** The date money actually leaves for an invoice issued on `invoiceDate`. */
export function dueDateFor(invoiceDate, terms) {
    const d = invoiceDate instanceof Date ? new Date(invoiceDate) : new Date(invoiceDate);
    if (isNaN(d.getTime()))
        return new Date();
    if (terms.kind === 'immediate')
        return d;
    if (terms.kind === 'net_days') {
        return new Date(d.getTime() + terms.days * 86400_000);
    }
    // eom_plus
    const eom = endOfMonth(d);
    return new Date(eom.getTime() + terms.days * 86400_000);
}
export const ymd = (d) => d.toISOString().slice(0, 10);
//# sourceMappingURL=paymentTerms.js.map