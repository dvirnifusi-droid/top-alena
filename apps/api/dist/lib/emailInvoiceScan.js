// Cron job: pull invoices from connected mailboxes into pending_review
// Invoices. Called every 10 min from /api/cron/email-invoice-scan.
import { parseBankFile } from './bankStatement.js';
import { persistStatement, looksLikeStatement } from './bankPersist.js';
import { Readable } from 'node:stream';
import { prisma } from '../db.js';
import { invokeLLM } from './llm.js';
import { uploadStreamToS3 } from './storage.js';
import { fetchNewMessages, isAuthError } from './emailFetch.js';
import { decideMessageAction, looksLikeInvoice } from './emailInvoiceRules.js';
import { extractInvoicesFromFile, fuzzyFindSupplier, matchInventoryItem } from './invoiceExtraction.js';
import { extractInvoiceLinks, isSafePublicUrl } from './invoiceLinks.js';
import { alertEmailInvoicesImported, alertEmailAccountDisconnected } from './whatsappAlerts.js';
const FIRST_RUN_LOOKBACK_MS = 30 * 24 * 3600 * 1000; // backfill 30 days on first connect
const OVERLAP_MS = 24 * 3600 * 1000; // IMAP SINCE is day-granular; overlap + dedupe-by-Message-ID
// Most operationally sensitive numbers in this file: raising CLASSIFY_* discards
// real invoices; lowering SUPPLIER_* attaches invoices to the wrong supplier.
const CLASSIFY_CONFIDENCE_THRESHOLD = 0.7;
const SUPPLIER_MATCH_CONFIDENCE_THRESHOLD = 0.9;
// Cron can fire while a slow run (LLM-heavy backfill) is still going; overlapping
// scans double-create suppliers since Supplier has no unique constraint.
let scanning = false;
const CLASSIFY_SCHEMA = {
    type: 'object',
    properties: {
        is_invoice: { type: 'boolean', description: 'האם המייל מכיל חשבונית או קבלה עבור העסק' },
        confidence: { type: 'number', description: '0-1' },
    },
    required: ['is_invoice', 'confidence'],
};
// Broad by owner instruction: ANY business invoice/receipt counts — goods,
// marketing, software, hosting, utilities — not only food suppliers.
async function classifyEmail(msg) {
    const res = await invokeLLM({
        prompt: [
            'לפניך פרטי מייל שהתקבל בתיבת הדואר של עסק (מסעדה). קבע האם המייל מכיל חשבונית או קבלה',
            'עבור העסק — חשבונית מס, חשבונית עסקה או קבלה — מכל סוג ספק או שירות:',
            'סחורה, שיווק ופרסום, תוכנה, אחסון, חשמל, תקשורת, שליחויות וכו\'.',
            'ניוזלטרים, פרסומות, הצעות מחיר, אישורי הזמנה ותזכורות תשלום ללא חשבונית — אינם חשבונית.',
            `שולח: ${msg.sender}`,
            `נושא: ${msg.subject}`,
            `קבצים מצורפים: ${msg.attachments.map(a => a.filename).join(', ')}`,
            `תחילת גוף המייל: ${msg.snippet}`,
        ].join('\n'),
        responseSchema: CLASSIFY_SCHEMA,
        maxOutputTokens: 200,
    });
    return { is_invoice: !!res?.is_invoice, confidence: Number(res?.confidence) || 0 };
}
const MAX_LINK_PDF_BYTES = 15 * 1024 * 1024;
// Follow an invoice link and return the PDF bytes, or null if it isn't a PDF /
// isn't reachable / is unsafe. Re-checks safety on every redirect hop.
async function fetchPdfFromUrl(startUrl) {
    let url = startUrl;
    for (let hop = 0; hop < 5; hop++) {
        if (!isSafePublicUrl(url))
            return null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000);
        let res;
        try {
            res = await fetch(url, {
                redirect: 'manual',
                signal: controller.signal,
                headers: { 'User-Agent': 'TopAlenaInvoiceBot/1.0' },
            });
        }
        catch {
            clearTimeout(timer);
            return null;
        }
        clearTimeout(timer);
        if (res.status >= 300 && res.status < 400) {
            const loc = res.headers.get('location');
            if (!loc)
                return null;
            url = new URL(loc, url).toString();
            continue;
        }
        if (!res.ok)
            return null;
        const len = Number(res.headers.get('content-length') || '0');
        if (len && len > MAX_LINK_PDF_BYTES)
            return null;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        let buf;
        try {
            buf = Buffer.from(await res.arrayBuffer());
        }
        catch {
            return null;
        }
        if (buf.length === 0 || buf.length > MAX_LINK_PDF_BYTES)
            return null;
        const isPdf = ct.includes('application/pdf') || buf.subarray(0, 5).toString('latin1') === '%PDF-';
        return isPdf ? buf : null;
    }
    return null;
}
// Create rows for every invoice extracted from one file (a file may be a
// bundle/מרכזת with several). Shared by the attachment path and the link path.
async function importInvoicesFromFile(invoices, storedUrl, ctx, state, results) {
    const { msg, acct, aliases, inventoryItems } = ctx;
    for (const extracted of invoices) {
        // Supplier: reuse existing high-confidence match, else create pending_approval.
        const { match, confidence } = await fuzzyFindSupplier(extracted.supplier_name, extracted.supplier_tax_id);
        let supplierId;
        let supplierWasCreated = false;
        if (match && confidence >= SUPPLIER_MATCH_CONFIDENCE_THRESHOLD) {
            supplierId = match.id;
        }
        else {
            const sup = await prisma.supplier.create({
                data: {
                    company_name: String(extracted.supplier_name).slice(0, 200),
                    supplier_id: String(extracted.supplier_tax_id || '').slice(0, 30),
                    contact_person: '',
                    email: msg.sender || '',
                    phone: '',
                    category: String(extracted.category_guess || 'אחר').slice(0, 60),
                    status: 'pending_approval',
                },
            });
            supplierId = sup.id;
            supplierWasCreated = true;
        }
        // Duplicate guard: same supplier + invoice number (catches the
        // WhatsApp-scanned copy and re-processed messages too).
        if (extracted.invoice_number) {
            const dupe = await prisma.invoice.findFirst({
                where: { supplier_id: supplierId, invoice_number: String(extracted.invoice_number) },
            }).catch(() => null);
            if (dupe) {
                if (supplierWasCreated)
                    await prisma.supplier.delete({ where: { id: supplierId } }).catch(() => { });
                state.sawDuplicate = true;
                results.skipped++;
                continue;
            }
        }
        // First invoice of the whole message keeps the plain Message-ID (so an
        // exact re-scan dedupes on it); the rest get a unique suffix.
        const emailKey = state.usedPlainKey ? `${msg.messageId}#${state.seq}` : msg.messageId;
        const isoOk = typeof extracted.invoice_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(extracted.invoice_date);
        let invoice;
        try {
            invoice = await prisma.invoice.create({
                data: {
                    supplier_id: supplierId,
                    invoice_number: String(extracted.invoice_number || '').slice(0, 60) || null,
                    invoice_date: isoOk ? new Date(`${extracted.invoice_date}T00:00:00.000Z`) : new Date(),
                    total_amount: Number(extracted.total_amount) || 0,
                    file_url: storedUrl,
                    status: 'pending_review',
                    payment_status: 'unpaid',
                    source: 'email',
                    email_message_id: emailKey,
                    email_account: acct.email,
                    email_sender: msg.sender || null,
                },
            });
        }
        catch (e) {
            // P2002 on email_message_id — already imported in a previous run; skip.
            if (e?.code === 'P2002') {
                if (supplierWasCreated)
                    await prisma.supplier.delete({ where: { id: supplierId } }).catch(() => { });
                state.sawDuplicate = true;
                if (!state.usedPlainKey)
                    state.usedPlainKey = true;
                else
                    state.seq++;
                continue;
            }
            throw e;
        }
        if (!state.usedPlainKey)
            state.usedPlainKey = true;
        else
            state.seq++;
        for (const li of extracted.line_items || []) {
            if (!li.product_name)
                continue;
            const suggestion = matchInventoryItem(li.product_name, aliases, inventoryItems);
            await prisma.invoiceItem.create({
                data: {
                    invoice_id: invoice.id,
                    product_name: String(li.product_name).slice(0, 200),
                    quantity: Number(li.quantity) || 1,
                    unit_price: Number(li.unit_price) || 0,
                    unit: li.unit ? String(li.unit).slice(0, 30) : null,
                    inventory_action: suggestion.action,
                    inventory_item_id: suggestion.inventory_item_id || null,
                },
            }).catch(() => { });
        }
        state.importedIds.push(invoice.id);
        results.imported++;
    }
}
const SHEET_EXT = /\.(xls|xlsx|csv|txt|htm|html)$/i;
/**
 * Try every spreadsheet-ish attachment as a bank statement. Returns the import
 * result on success, or null when this message is not a statement — in which
 * case the caller carries on with the normal invoice path.
 */
async function tryImportStatement(msg) {
    for (const att of msg.attachments) {
        if (!SHEET_EXT.test(att.filename || ''))
            continue;
        try {
            const parsed = await parseBankFile(att.content, att.filename);
            if (!looksLikeStatement(parsed))
                continue;
            const res = await persistStatement(parsed);
            return { imported: res.imported };
        }
        catch { /* not a statement — fall through to the invoice path */ }
    }
    return null;
}
async function processMessage(acct, msg, results) {
    const log = (outcome, extra = {}) => prisma.emailMessageLog.create({
        data: {
            message_id: msg.messageId,
            account_email: acct.email,
            sender_email: msg.sender || null,
            subject: msg.subject.slice(0, 200) || null,
            outcome,
            ...extra,
        },
    }).catch(() => { });
    // Bank statement first. Decided by parsing the file, not by its name or
    // sender — a statement can arrive from any address with any subject, and a
    // supplier price list can be called "statement.xls". If it parses as a
    // statement it is one, and it must not also be treated as an invoice.
    const statementResult = await tryImportStatement(msg);
    if (statementResult) {
        await log('bank_statement', { imported: statementResult.imported });
        return;
    }
    const rule = msg.sender
        ? await prisma.emailSenderRule.findUnique({ where: { sender_email: msg.sender } }).catch(() => null)
        : null;
    const hasAttachment = msg.attachments.length > 0;
    // Fast path (owner's rule): anything explicitly labeled invoice/receipt in
    // the subject or an attachment filename is treated as an invoice email
    // without asking the LLM — this also covers link-based invoices that arrive
    // with no usable attachment.
    const labeled = looksLikeInvoice(msg.subject, msg.attachments.map(a => a.filename));
    const action = decideMessageAction(rule, hasAttachment);
    if (action === 'skip_blocked') {
        await log('blocked');
        return;
    }
    if (action === 'skip_no_attachment') {
        // No attachment: only worth pursuing (via body links) if it's labeled an
        // invoice. Unlabeled no-attachment mail is almost never an invoice.
        if (!labeled) {
            await log('no_attachment');
            return;
        }
    }
    else if (action === 'classify' && !labeled) {
        const cls = await classifyEmail(msg).catch(() => ({ is_invoice: false, confidence: 0 }));
        if (!cls.is_invoice || cls.confidence < CLASSIFY_CONFIDENCE_THRESHOLD) {
            await log('not_invoice');
            return;
        }
    }
    // Past this point we believe the email is an invoice (allow-listed sender,
    // explicitly labeled, or classified yes).
    // Fetch alias + inventory tables once per message instead of per line item.
    const [aliases, inventoryItems] = await Promise.all([
        prisma.productAlias.findMany({ take: 2000 }).catch(() => []),
        prisma.inventory.findMany({ take: 2000, select: { id: true, item_name: true } }).catch(() => []),
    ]);
    const ctx = { msg, acct, aliases, inventoryItems };
    const state = { importedIds: [], sawDuplicate: false, usedPlainKey: false, seq: 1 };
    let lastError = null;
    // 1) Attachments — each may be a bundle/מרכזת with several invoices.
    for (const att of msg.attachments) {
        const ext = att.contentType === 'application/pdf' ? '.pdf' : '.' + (att.contentType.split('/')[1] || 'jpg');
        let storedUrl;
        try {
            const { key } = await uploadStreamToS3(`email-invoice${ext}`, att.contentType, Readable.from(att.content));
            storedUrl = `/api/files/${key}`;
        }
        catch (e) {
            lastError = `upload_failed: ${String(e?.message || e).slice(0, 200)}`;
            continue;
        }
        let invoicesInFile;
        try {
            invoicesInFile = await extractInvoicesFromFile(storedUrl);
        }
        catch {
            try {
                invoicesInFile = await extractInvoicesFromFile(storedUrl);
            } // one retry
            catch (e2) {
                lastError = String(e2?.message || e2).slice(0, 200);
                continue;
            }
        }
        await importInvoicesFromFile(invoicesInFile, storedUrl, ctx, state, results);
    }
    // 2) Link fallback — if the attachments produced nothing (or there were
    // none), the invoice may live behind a link in the email body.
    if (state.importedIds.length === 0 && !state.sawDuplicate) {
        const links = extractInvoiceLinks(msg.html, msg.text);
        for (const link of links) {
            const pdf = await fetchPdfFromUrl(link).catch(() => null);
            if (!pdf)
                continue;
            let storedUrl;
            try {
                const { key } = await uploadStreamToS3('email-invoice-link.pdf', 'application/pdf', Readable.from(pdf));
                storedUrl = `/api/files/${key}`;
            }
            catch (e) {
                lastError = `upload_failed: ${String(e?.message || e).slice(0, 200)}`;
                continue;
            }
            let invoicesInFile;
            try {
                invoicesInFile = await extractInvoicesFromFile(storedUrl);
            }
            catch (e2) {
                lastError = String(e2?.message || e2).slice(0, 200);
                continue;
            }
            await importInvoicesFromFile(invoicesInFile, storedUrl, ctx, state, results);
            if (state.importedIds.length > 0)
                break; // got it — don't chase more links
        }
    }
    if (state.importedIds.length > 0) {
        await log('imported', { invoice_id: state.importedIds[0] });
    }
    else if (state.sawDuplicate) {
        await log('duplicate');
    }
    else {
        await log('error', { error: lastError || (labeled && !hasAttachment ? 'link_no_pdf' : 'no_invoice_extracted') });
        results.errors++;
    }
}
// opts.backfillDays forces a one-time historical sweep: every account is
// searched from (now − backfillDays) regardless of its saved cursor. Used to
// pull invoices from further back than the default 30-day first-run window.
export async function scanEmailInvoices(opts = {}) {
    if (scanning) {
        console.warn('[email-invoice-scan] previous scan still running, skipping');
        return { imported: 0, skipped: 0, errors: 0, accounts: 0 };
    }
    scanning = true;
    try {
        const accounts = await prisma.emailAccount.findMany({ where: { status: 'active' } }).catch(() => []);
        const results = { imported: 0, skipped: 0, errors: 0, accounts: accounts.length };
        const scanStart = new Date();
        for (const acct of accounts) {
            try {
                // Manager-chosen start date (from the settings screen) overrides the saved
                // cursor for a one-off historical sweep; the log-based dedupe stops any
                // already-imported message from being re-created.
                const explicitSince = opts.sinceDate ? new Date(opts.sinceDate) : null;
                const since = (explicitSince && !isNaN(explicitSince.getTime()))
                    ? explicitSince
                    : opts.backfillDays
                        ? new Date(scanStart.getTime() - opts.backfillDays * 24 * 3600 * 1000)
                        : acct.last_checked_at
                            ? new Date(new Date(acct.last_checked_at).getTime() - OVERLAP_MS)
                            : new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);
                // A transient failure (LLM/S3 blip) shouldn't drop the invoice forever: keep
                // recent 'error' rows OUT of `known` so they're re-fetched and retried for a
                // bounded window, after which they're treated as permanently known (no
                // infinite retry on a genuinely-unparseable email).
                const errorRetryWindow = new Date(Date.now() - 3 * 24 * 3600 * 1000);
                const knownRows = await prisma.emailMessageLog.findMany({
                    where: {
                        account_email: acct.email,
                        NOT: { outcome: 'error', createdAt: { gte: errorRetryWindow } },
                    },
                    select: { message_id: true },
                }).catch(() => []);
                const known = new Set(knownRows.map(r => r.message_id));
                const { messages, capped } = await fetchNewMessages(acct, since, known);
                for (const msg of messages) {
                    try {
                        await processMessage(acct, msg, results);
                    }
                    catch (e) {
                        results.errors++;
                        console.warn('[email-invoice-scan] message failed', { mid: msg.messageId, err: e?.message });
                        // Write to EmailMessageLog so this message enters `known` and is never retried forever.
                        const isDupe = e?.code === 'P2002' && String(e?.meta?.target || '').includes('email_message_id');
                        await prisma.emailMessageLog.create({
                            data: {
                                message_id: msg.messageId,
                                account_email: acct.email,
                                sender_email: msg.sender || null,
                                subject: msg.subject?.slice(0, 200) || null,
                                outcome: isDupe ? 'duplicate' : 'error',
                                error: isDupe ? null : String(e?.message || e).slice(0, 300),
                            },
                        }).catch((logErr) => {
                            console.error('[email-invoice-scan] FAILED to write message log', { mid: msg.messageId, logErr: logErr?.message });
                        });
                    }
                }
                // Only advance the scan cursor when the whole window was consumed.
                // A capped batch means unprocessed messages remain in the middle of
                // the window — advancing would skip them forever; the log-based dedupe
                // makes re-covering the window cheap on the next run.
                await prisma.emailAccount.update({
                    where: { id: acct.id },
                    data: { ...(capped ? {} : { last_checked_at: scanStart }), last_error: null },
                });
            }
            catch (e) {
                results.errors++;
                if (isAuthError(e)) {
                    await prisma.emailAccount.update({
                        where: { id: acct.id },
                        data: { status: 'disconnected', last_error: String(e?.message || e).slice(0, 300) },
                    }).catch(() => { });
                    await alertEmailAccountDisconnected(acct.email).catch(() => { });
                }
                else {
                    await prisma.emailAccount.update({
                        where: { id: acct.id },
                        data: { last_error: String(e?.message || e).slice(0, 300) },
                    }).catch(() => { });
                    console.warn('[email-invoice-scan] account failed', { email: acct.email, err: e?.message });
                }
            }
        }
        if (results.imported > 0)
            await alertEmailInvoicesImported(results.imported).catch(() => { });
        return results;
    }
    finally {
        scanning = false;
    }
}
//# sourceMappingURL=emailInvoiceScan.js.map