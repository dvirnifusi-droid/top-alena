// Gap detection for supplier invoices. Two ideas:
//  1. Cadence monitor — learn each supplier's normal invoicing rhythm from
//     history and flag suppliers who are "overdue" (a likely lost/uncaptured
//     invoice), using only data we already have.
//  2. Weekly digest — surface pending-review invoices + this week's
//     un-fetchable emails (portal-login invoices) so gaps stay visible.
import { prisma } from '../db.js';
import { broadcastToAdmins } from './whatsappAlerts.js';
const DAY_MS = 24 * 3600 * 1000;
const MIN_INVOICES_FOR_CADENCE = 3; // need ≥2 intervals for a stable rhythm
const OVERDUE_FACTOR = 1.75; // overdue when gap > median * this…
const OVERDUE_MIN_DAYS = 10; // …and at least this many days (ignore daily suppliers noise)
const MAX_OVERDUE_LISTED = 12;
export function medianIntervalDays(datesAsc) {
    if (datesAsc.length < 2)
        return null;
    const gaps = [];
    for (let i = 1; i < datesAsc.length; i++) {
        gaps.push((datesAsc[i].getTime() - datesAsc[i - 1].getTime()) / DAY_MS);
    }
    gaps.sort((a, b) => a - b);
    const mid = Math.floor(gaps.length / 2);
    return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}
// Pure — flag suppliers whose latest invoice is older than their normal rhythm.
// Returns most-overdue first.
export function computeOverdueSuppliers(suppliers, now) {
    const out = [];
    for (const s of suppliers) {
        if (s.invoiceDates.length < MIN_INVOICES_FOR_CADENCE)
            continue;
        const dates = [...s.invoiceDates].sort((a, b) => a.getTime() - b.getTime());
        const median = medianIntervalDays(dates);
        if (median === null || median <= 0)
            continue;
        const last = dates[dates.length - 1];
        const daysSinceLast = (now.getTime() - last.getTime()) / DAY_MS;
        const threshold = Math.max(OVERDUE_MIN_DAYS, median * OVERDUE_FACTOR);
        if (daysSinceLast > threshold) {
            out.push({
                id: s.id,
                name: s.name,
                daysSinceLast: Math.round(daysSinceLast),
                medianDays: Math.round(median),
            });
        }
    }
    // Rank by how many "cycles" late (daysSinceLast / median), most overdue first.
    return out
        .sort((a, b) => (b.daysSinceLast / Math.max(1, b.medianDays)) - (a.daysSinceLast / Math.max(1, a.medianDays)))
        .slice(0, MAX_OVERDUE_LISTED);
}
export function buildGapsDigest(d) {
    const lines = ['🔍 *דוח פערים שבועי — חשבוניות*', ''];
    if (d.pendingReview > 0) {
        lines.push(`⏳ *${d.pendingReview} חשבוניות ממתינות לאישורך* בדף /Invoices`, '');
    }
    if (d.overdue.length > 0) {
        lines.push('📉 *ספקים שמאחרים* (בד"כ שולחים חשבונית ולא הגיעה):');
        for (const s of d.overdue) {
            lines.push(`• ${s.name} — ${s.daysSinceLast} ימים מאז האחרונה (בד"כ כל ~${s.medianDays})`);
        }
        lines.push('');
    }
    if (d.unfetchable.length > 0) {
        lines.push('🔗 *לא הצלחתי למשוך אוטומטית* (חשבונית מאחורי פורטל — הורד ידנית):');
        for (const u of d.unfetchable.slice(0, 8)) {
            lines.push(`• ${u.sender}: ${u.subject.slice(0, 60)}`);
        }
        lines.push('');
    }
    if (d.pendingReview === 0 && d.overdue.length === 0 && d.unfetchable.length === 0) {
        lines.push('✅ אין פערים ידועים — הכל נקלט ואושר.');
    }
    return lines.join('\n');
}
// DB-driven weekly job. Wired to POST /api/cron/invoice-gaps-digest.
export async function runInvoiceGapsDigest(opts = {}) {
    const now = new Date();
    const [invoices, suppliers, pendingReview, recentLogs] = await Promise.all([
        prisma.invoice.findMany({ where: { status: { not: 'rejected' } }, select: { supplier_id: true, invoice_date: true } }).catch(() => []),
        prisma.supplier.findMany({ select: { id: true, company_name: true } }).catch(() => []),
        prisma.invoice.count({ where: { source: 'email', status: 'pending_review' } }).catch(() => 0),
        // Emails that looked like invoices but couldn't be captured are logged with
        // outcome 'error' (the specific reason — link_no_pdf / no_invoice_extracted
        // / upload_failed — lives in the `error` column).
        prisma.emailMessageLog.findMany({
            where: { outcome: 'error', createdAt: { gte: new Date(now.getTime() - 7 * DAY_MS) } },
            select: { sender_email: true, subject: true },
        }).catch(() => []),
    ]);
    const nameById = new Map(suppliers.map((s) => [s.id, s.company_name]));
    const bySupplier = new Map();
    for (const inv of invoices) {
        if (!inv.supplier_id || !inv.invoice_date)
            continue;
        const arr = bySupplier.get(inv.supplier_id) || [];
        arr.push(new Date(inv.invoice_date));
        bySupplier.set(inv.supplier_id, arr);
    }
    const histories = [...bySupplier.entries()].map(([id, invoiceDates]) => ({
        id, name: nameById.get(id) || 'ספק', invoiceDates,
    }));
    const overdue = computeOverdueSuppliers(histories, now);
    const unfetchable = recentLogs
        .map(l => ({ sender: l.sender_email || '?', subject: l.subject || '' }))
        // de-dupe repeated vendor emails (e.g. 3× Meta receipts) by sender
        .filter((u, i, arr) => arr.findIndex(x => x.sender === u.sender) === i);
    const text = buildGapsDigest({ overdue, pendingReview, unfetchable });
    if (opts.send)
        await broadcastToAdmins(text).catch(() => { });
    return { text, overdue: overdue.length, pendingReview, unfetchable: unfetchable.length };
}
//# sourceMappingURL=invoiceGaps.js.map