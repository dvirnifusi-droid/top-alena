// Cron job: pull invoices from connected mailboxes into pending_review
// Invoices. Called every 10 min from /api/cron/email-invoice-scan.
import { Readable } from 'node:stream';
import { prisma } from '../db.js';
import { invokeLLM } from './llm.js';
import { uploadStreamToS3 } from './storage.js';
import { fetchNewMessages, isAuthError, type FetchedEmail } from './emailFetch.js';
import { decideMessageAction, looksLikeInvoice } from './emailInvoiceRules.js';
import { extractInvoiceFromFile, fuzzyFindSupplier, matchInventoryItem } from './invoiceExtraction.js';
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
async function classifyEmail(msg: FetchedEmail): Promise<{ is_invoice: boolean; confidence: number }> {
  const res: any = await invokeLLM({
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

type ScanResults = { imported: number; skipped: number; errors: number; accounts: number };

async function processMessage(acct: { email: string }, msg: FetchedEmail, results: ScanResults): Promise<void> {
  const log = (outcome: string, extra: Record<string, unknown> = {}) =>
    (prisma as any).emailMessageLog.create({
      data: {
        message_id: msg.messageId,
        account_email: acct.email,
        sender_email: msg.sender || null,
        subject: msg.subject.slice(0, 200) || null,
        outcome,
        ...extra,
      },
    }).catch(() => {});

  const rule = msg.sender
    ? await (prisma as any).emailSenderRule.findUnique({ where: { sender_email: msg.sender } }).catch(() => null)
    : null;

  const action = decideMessageAction(rule, msg.attachments.length > 0);
  if (action === 'skip_blocked') { await log('blocked'); return; }
  if (action === 'skip_no_attachment') { await log('no_attachment'); return; }

  if (action === 'classify') {
    // Fast path (owner's rule): anything explicitly labeled invoice/receipt in
    // the subject or attachment filename imports without asking the LLM.
    const labeled = looksLikeInvoice(msg.subject, msg.attachments.map(a => a.filename));
    if (!labeled) {
      const cls = await classifyEmail(msg).catch(() => ({ is_invoice: false, confidence: 0 }));
      if (!cls.is_invoice || cls.confidence < CLASSIFY_CONFIDENCE_THRESHOLD) { await log('not_invoice'); return; }
    }
  }

  // Largest allowed attachment is almost always the invoice itself.
  const att = [...msg.attachments].sort((a, b) => b.content.length - a.content.length)[0];
  const ext = att.contentType === 'application/pdf' ? '.pdf' : '.' + (att.contentType.split('/')[1] || 'jpg');
  const { key } = await uploadStreamToS3(`email-invoice${ext}`, att.contentType, Readable.from(att.content));
  const storedUrl = `/api/files/${key}`;

  let extracted;
  try {
    extracted = await extractInvoiceFromFile(storedUrl);
  } catch {
    try { extracted = await extractInvoiceFromFile(storedUrl); } // one retry
    catch (e2: any) { await log('error', { error: String(e2?.message || e2).slice(0, 300) }); results.errors++; return; }
  }
  if (!extracted?.supplier_name || !extracted?.total_amount) {
    await log('error', { error: 'extract_incomplete' }); results.errors++; return;
  }

  // Supplier: reuse existing high-confidence match, else create pending_approval.
  const { match, confidence } = await fuzzyFindSupplier(extracted.supplier_name, extracted.supplier_tax_id);
  let supplierId: string;
  let supplierWasCreated = false;
  if (match && confidence >= SUPPLIER_MATCH_CONFIDENCE_THRESHOLD) {
    supplierId = match.id;
  } else {
    const sup = await (prisma as any).supplier.create({
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

  // Duplicate guard: same supplier + invoice number (catches the WhatsApp-scanned copy too).
  if (extracted.invoice_number) {
    const dupe = await (prisma as any).invoice.findFirst({
      where: { supplier_id: supplierId, invoice_number: String(extracted.invoice_number) },
    }).catch(() => null);
    if (dupe) {
      if (supplierWasCreated) {
        await (prisma as any).supplier.delete({ where: { id: supplierId } }).catch(() => {});
      }
      await log('duplicate', { invoice_id: dupe.id });
      results.skipped++;
      return;
    }
  }

  const isoOk = typeof extracted.invoice_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(extracted.invoice_date);
  const invoice = await (prisma as any).invoice.create({
    data: {
      supplier_id: supplierId,
      invoice_number: String(extracted.invoice_number || '').slice(0, 60) || null,
      invoice_date: isoOk ? new Date(`${extracted.invoice_date}T00:00:00.000Z`) : new Date(),
      total_amount: Number(extracted.total_amount) || 0,
      file_url: storedUrl,
      status: 'pending_review',
      payment_status: 'unpaid',
      source: 'email',
      email_message_id: msg.messageId,
      email_account: acct.email,
      email_sender: msg.sender || null,
    },
  });

  // Fetch alias + inventory tables once per invoice instead of once per line item.
  const [aliases, inventoryItems] = await Promise.all([
    (prisma as any).productAlias.findMany({ take: 2000 }).catch(() => []),
    (prisma as any).inventory.findMany({ take: 2000, select: { id: true, item_name: true } }).catch(() => []),
  ]);

  for (const li of extracted.line_items || []) {
    if (!li.product_name) continue;
    const suggestion = matchInventoryItem(li.product_name, aliases, inventoryItems);
    await (prisma as any).invoiceItem.create({
      data: {
        invoice_id: invoice.id,
        product_name: String(li.product_name).slice(0, 200),
        quantity: Number(li.quantity) || 1,
        unit_price: Number(li.unit_price) || 0,
        unit: li.unit ? String(li.unit).slice(0, 30) : null,
        inventory_action: suggestion.action,
        inventory_item_id: suggestion.inventory_item_id || null,
      },
    }).catch(() => {});
  }

  await log('imported', { invoice_id: invoice.id });
  results.imported++;
}

export async function scanEmailInvoices(): Promise<ScanResults> {
  if (scanning) {
    console.warn('[email-invoice-scan] previous scan still running, skipping');
    return { imported: 0, skipped: 0, errors: 0, accounts: 0 };
  }
  scanning = true;
  try {
    const accounts: any[] = await (prisma as any).emailAccount.findMany({ where: { status: 'active' } }).catch(() => []);
    const results: ScanResults = { imported: 0, skipped: 0, errors: 0, accounts: accounts.length };
    const scanStart = new Date();

    for (const acct of accounts) {
      try {
        const since = acct.last_checked_at
          ? new Date(new Date(acct.last_checked_at).getTime() - OVERLAP_MS)
          : new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);
        const knownRows: any[] = await (prisma as any).emailMessageLog.findMany({
          where: { account_email: acct.email },
          select: { message_id: true },
        }).catch(() => []);
        const known = new Set<string>(knownRows.map(r => r.message_id));

        const { messages, capped } = await fetchNewMessages(acct, since, known);
        for (const msg of messages) {
          try { await processMessage(acct, msg, results); }
          catch (e: any) {
            results.errors++;
            console.warn('[email-invoice-scan] message failed', { mid: msg.messageId, err: e?.message });
            // Write to EmailMessageLog so this message enters `known` and is never retried forever.
            const isDupe = e?.code === 'P2002' && String(e?.meta?.target || '').includes('email_message_id');
            await (prisma as any).emailMessageLog.create({
              data: {
                message_id: msg.messageId,
                account_email: acct.email,
                sender_email: msg.sender || null,
                subject: msg.subject?.slice(0, 200) || null,
                outcome: isDupe ? 'duplicate' : 'error',
                error: isDupe ? null : String(e?.message || e).slice(0, 300),
              },
            }).catch((logErr: any) => {
              console.error('[email-invoice-scan] FAILED to write message log', { mid: msg.messageId, logErr: logErr?.message });
            });
          }
        }
        // Only advance the scan cursor when the whole window was consumed.
        // A capped batch means unprocessed messages remain in the middle of
        // the window — advancing would skip them forever; the log-based dedupe
        // makes re-covering the window cheap on the next run.
        await (prisma as any).emailAccount.update({
          where: { id: acct.id },
          data: { ...(capped ? {} : { last_checked_at: scanStart }), last_error: null },
        });
      } catch (e: any) {
        results.errors++;
        if (isAuthError(e)) {
          await (prisma as any).emailAccount.update({
            where: { id: acct.id },
            data: { status: 'disconnected', last_error: String(e?.message || e).slice(0, 300) },
          }).catch(() => {});
          await alertEmailAccountDisconnected(acct.email).catch(() => {});
        } else {
          await (prisma as any).emailAccount.update({
            where: { id: acct.id },
            data: { last_error: String(e?.message || e).slice(0, 300) },
          }).catch(() => {});
          console.warn('[email-invoice-scan] account failed', { email: acct.email, err: e?.message });
        }
      }
    }

    if (results.imported > 0) await alertEmailInvoicesImported(results.imported).catch(() => {});
    return results;
  } finally {
    scanning = false;
  }
}
