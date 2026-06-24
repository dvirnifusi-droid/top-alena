// WhatsApp invoice OCR — admin sends a photo/PDF, we run OCR + supplier match,
// reply with a structured draft. Confirmation flow (turn draft into a real
// Invoice row) lands in the next commit.
//
// Flow:
//   1. Twilio webhook sees NumMedia ≥ 1 from an admin number → calls
//      handleAdminInvoiceMedia(mediaUrl, mimeType).
//   2. We download the media using Twilio basic auth (the media URL is
//      protected; only callers with the SID/Token can read it).
//   3. Upload the file to our own MinIO so we own a permanent copy and the
//      Gemini-vision call can fetch it via the relative /api/files/<key> URL.
//   4. Call invokeLLM with an invoice-extraction prompt + schema.
//   5. Fuzzy-match supplier name to existing Supplier rows.
//   6. Return a human-readable draft string for the WhatsApp reply.
import { Readable } from 'node:stream';
import { invokeLLM } from './llm.js';
import { uploadStreamToS3 } from './storage.js';
import { prisma } from '../db.js';

async function downloadTwilioMedia(mediaUrl: string): Promise<{ mimeType: string; buf: Buffer }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('twilio_creds_missing');
  const creds = Buffer.from(`${sid}:${token}`).toString('base64');

  // Twilio media URL serves a 302 redirect to a signed S3 URL. node fetch's
  // default redirect:'follow' strips the Authorization header across hosts
  // (security feature), so we end up at the S3 URL with no auth and S3 returns
  // an XML/HTML access-denied page that Gemini Vision then interprets as
  // "this is a website, not an invoice". Follow the redirect manually:
  //   1) hit Twilio with auth, expect 302
  //   2) hit the Location URL (already signed, no auth needed)
  let currentUrl = mediaUrl;
  let currentHeaders: Record<string, string> = { Authorization: `Basic ${creds}` };
  for (let hops = 0; hops < 5; hops++) {
    const res = await fetch(currentUrl, { headers: currentHeaders, redirect: 'manual' });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) throw new Error(`media_redirect_${res.status}_no_location`);
      currentUrl = new URL(next, currentUrl).toString();
      // S3 signed URLs work without auth; drop the Twilio creds so we don't
      // accidentally trip cross-host header policies.
      currentHeaders = {};
      continue;
    }
    if (!res.ok) throw new Error(`media_fetch_${res.status}`);
    const mimeType = res.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await res.arrayBuffer());
    return { mimeType, buf };
  }
  throw new Error('media_redirect_too_many_hops');
}

const INVOICE_SCHEMA = {
  type: 'object',
  properties: {
    supplier_name: { type: 'string', description: 'שם הספק כפי שמופיע בחשבונית' },
    supplier_tax_id: { type: 'string', description: 'ח.פ. / עוסק מורשה (9 ספרות), אם מופיע' },
    invoice_number: { type: 'string', description: 'מספר החשבונית' },
    invoice_date: { type: 'string', description: 'תאריך החשבונית בפורמט YYYY-MM-DD' },
    due_date: { type: 'string', description: 'תאריך פירעון בפורמט YYYY-MM-DD, אם מופיע' },
    total_amount: { type: 'number', description: 'הסכום הסופי לתשלום (כולל מע"מ)' },
    vat_amount: { type: 'number', description: 'סכום מע"מ בנפרד, אם מופיע' },
    currency: { type: 'string', description: 'מטבע (ILS/USD/EUR). ברירת מחדל ILS' },
    category_guess: { type: 'string', description: 'קטגוריה משוערת: ירקות, בשר, אלכוהול, ניקיון, ציוד, שירותים, אחר' },
    confidence_notes: { type: 'string', description: 'הערות אם משהו לא ברור (חסר שדה / קושי קריאה)' },
  },
  required: ['supplier_name', 'total_amount'],
};

type ExtractedInvoice = {
  supplier_name: string;
  supplier_tax_id?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  total_amount: number;
  vat_amount?: number;
  currency?: string;
  category_guess?: string;
  confidence_notes?: string;
};

// Levenshtein-light normalized similarity for fuzzy supplier match.
function normalizeForMatch(s: string): string {
  return String(s || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
function similarity(a: string, b: string): number {
  const A = normalizeForMatch(a);
  const B = normalizeForMatch(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.92;
  // Token-overlap as a quick proxy for full Levenshtein:
  const At = new Set(A.split(' ').filter(w => w.length >= 2));
  const Bt = new Set(B.split(' ').filter(w => w.length >= 2));
  if (!At.size || !Bt.size) return 0;
  const inter = [...At].filter(t => Bt.has(t)).length;
  const union = new Set([...At, ...Bt]).size;
  return inter / union;
}

async function fuzzyFindSupplier(name: string, taxId?: string): Promise<{ match?: any; confidence: number }> {
  // Exact tax-id match wins immediately.
  if (taxId) {
    const exact = await (prisma as any).supplier.findFirst({ where: { supplier_id: String(taxId).trim() } }).catch(() => null);
    if (exact) return { match: exact, confidence: 1 };
  }
  const all: any[] = await (prisma as any).supplier.findMany({ take: 500 }).catch(() => []);
  let best: { sup: any; sim: number } | null = null;
  for (const s of all) {
    const sim = similarity(name, s.company_name);
    if (!best || sim > best.sim) best = { sup: s, sim };
  }
  if (!best || best.sim < 0.5) return { confidence: 0 };
  return { match: best.sup, confidence: best.sim };
}

// Internal: store the parsed draft on a WhatsAppMessage outbound row so the
// next admin reply (אישור/ביטול) can find it. Keeps us off schema migrations.
// We treat is_read=false as "not yet acted upon".
async function storePendingInvoice(fromPhone: string, payload: any, previewText: string): Promise<void> {
  await (prisma as any).whatsAppMessage.create({
    data: {
      twilio_sid: null,
      direction: 'outbound',
      from_phone: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+system',
      to_phone: fromPhone,
      contact_phone: fromPhone,
      body: previewText,
      num_media: 0,
      status: 'pending_confirmation',
      raw: { pending_invoice: payload } as any,
      is_read: false,
    },
  }).catch(() => {});
}

// Confirmation-side handler. Returns reply text if the admin message looks like
// an approval/cancellation of the most recent pending invoice (within 15 min).
// Returns null otherwise so the regular command router runs.
export async function tryConfirmPendingInvoice(
  fromPhone: string,
  body: string,
): Promise<string | null> {
  const trimmed = (body || '').trim();
  if (!trimmed) return null;
  const isApprove = /^(אישור|אשר|כן|מאשר|מאשרת|ok|yes)\s*[.!]?$/i.test(trimmed);
  const isCancel = /^(ביטול|ביטל|בטל|בטלי|לא|no|cancel)\s*[.!]?$/i.test(trimmed);
  if (!isApprove && !isCancel) return null;

  // Find most recent unread outbound with pending_invoice from <15 min ago.
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const pending: any = await (prisma as any).whatsAppMessage.findFirst({
    where: {
      direction: 'outbound',
      contact_phone: fromPhone,
      status: 'pending_confirmation',
      is_read: false,
      createdAt: { gte: since },
    },
    orderBy: { id: 'desc' },
  }).catch(() => null);
  if (!pending) return null; // no pending draft, let the command router try
  const draft = (pending.raw as any)?.pending_invoice;
  if (!draft) return null;

  // Mark as consumed regardless of branch so re-sending אישור doesn't double-create.
  await (prisma as any).whatsAppMessage.update({ where: { id: pending.id }, data: { is_read: true } }).catch(() => {});

  if (isCancel) {
    return '✋ ביטלתי. החשבונית לא נשמרה במערכת.\n(הקובץ נשאר ב-MinIO ל-30 יום אם תרצה לשחזר.)';
  }

  // === APPROVE — create Invoice row (and Supplier if needed) ===
  try {
    const ex = draft.extracted || {};
    let supplierId: string | null = draft.matched_supplier_id || null;
    let supplierName: string | null = draft.matched_supplier_name || null;
    let supplierCreated = false;
    if (!supplierId) {
      // Create a new Supplier with minimal fields. Owner can flesh it out later
      // in /Suppliers UI. tax_id goes into the supplier_id column (legacy name).
      const newSup: any = await (prisma as any).supplier.create({
        data: {
          company_name: String(ex.supplier_name || '').slice(0, 200) || 'ספק לא זוהה',
          supplier_id: String(ex.supplier_tax_id || '').slice(0, 30),
          contact_person: '',
          email: '',
          phone: '',
          category: String(ex.category_guess || 'אחר').slice(0, 60),
          status: 'pending_approval',
        },
      });
      supplierId = newSup.id;
      supplierName = newSup.company_name;
      supplierCreated = true;
    }

    // Parse invoice_date (YYYY-MM-DD) safely; fall back to today.
    const isoOk = typeof ex.invoice_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ex.invoice_date);
    const invoiceDate = isoOk ? new Date(`${ex.invoice_date}T00:00:00.000Z`) : new Date();

    const created = await (prisma as any).invoice.create({
      data: {
        supplier_id: supplierId!,
        invoice_number: String(ex.invoice_number || '').slice(0, 60) || null,
        invoice_date: invoiceDate,
        total_amount: Number(ex.total_amount) || 0,
        file_url: draft.stored_url || null,
        status: 'pending_review',
        payment_status: 'unpaid',
      },
    });

    const lines = ['✅ *החשבונית נשמרה במערכת*', ''];
    lines.push(`🆔 מזהה: ${created.id.slice(-8)}`);
    if (supplierCreated) {
      lines.push(`🆕 נוצר ספק חדש: *${supplierName}* (סטטוס: ממתין לאישור — תוכל להשלים פרטים ב-/Suppliers)`);
    } else {
      lines.push(`🏢 ספק: ${supplierName}`);
    }
    lines.push(`💰 ${(created.total_amount as number).toLocaleString('he-IL')} ₪`);
    lines.push(`📅 ${created.invoice_date.toISOString().slice(0, 10)}`);
    lines.push('');
    lines.push('🔗 לראיה ועריכה — דף /Invoices באפליקציה.');
    return lines.join('\n');
  } catch (e: any) {
    return `❌ שמירה נכשלה: ${e?.message || 'unknown'}\nהמידע המקורי לא אבד — שלח את התמונה שוב כדי לנסות מחדש.`;
  }
}

// Top-level handler. Returns reply text for the WhatsApp message.
export async function handleAdminInvoiceMedia(mediaUrl: string, fromPhone?: string): Promise<string> {
  let extracted: ExtractedInvoice | null = null;
  let storedUrl: string | null = null;
  try {
    // 1. Download from Twilio
    const { mimeType, buf } = await downloadTwilioMedia(mediaUrl);
    // 2. Upload to our own storage (so we keep a permanent copy + get a key Gemini can fetch)
    const ext = mimeType.startsWith('image/') ? '.' + (mimeType.split('/')[1] || 'jpg') : mimeType === 'application/pdf' ? '.pdf' : '.bin';
    const stream = Readable.from(buf);
    const { key, url } = await uploadStreamToS3(`whatsapp-invoice${ext}`, mimeType, stream);
    storedUrl = url;
    // 3. OCR + extract.
    // Pass the INTERNAL /api/files/<key> URL — not the public S3_PUBLIC_URL.
    // fetchFileAsBase64 inside invokeLLM has a fast-path for /api/files/* that
    // reads bytes directly from MinIO via the s3 client. The public URL would
    // make it do a real HTTP fetch back through Caddy, which on this stack
    // serves the SPA HTML for unmatched paths → Gemini gets HTML, says
    // "this is a website, not an invoice". The byte content is fine either
    // way; the issue was purely the URL routing.
    const internalUrl = `/api/files/${key}`;
    extracted = (await invokeLLM({
      prompt: [
        'אתה מנתח חשבוניות לעסק מסעדה ישראלי. הקובץ המצורף הוא חשבונית מספק.',
        'חלץ את השדות לפי הסכמה. תאריכים בפורמט YYYY-MM-DD. סכומים כמספרים (בלי ₪ או פסיקים).',
        'אם שדה אינו קיים בחשבונית — השמט אותו במקום להמציא ערך.',
        'קטגוריה משוערת: ירקות, פירות, בשר, דגים, חלב וביצים, יבש (קמח/אורז/וכו), משקאות, אלכוהול, ניקיון, ציוד מטבח, שירותים (חשבונאות, ביטוח, שכירות), אחר.',
      ].join('\n'),
      fileUrls: [internalUrl],
      responseSchema: INVOICE_SCHEMA,
      maxOutputTokens: 2000,
    })) as ExtractedInvoice;
  } catch (e: any) {
    return `❌ לא הצלחתי לעבד את הקובץ: ${e?.message || 'unknown'}\n\nנסה שוב או שלח מספר בפנים בידנית.`;
  }

  if (!extracted?.supplier_name || !extracted?.total_amount) {
    return [
      '🤔 חילצתי משהו אבל לא הצלחתי לזהות את הספק או את הסכום בבירור.',
      extracted ? '\nמה שכן זיהיתי:' : '',
      extracted ? '```' + JSON.stringify(extracted, null, 2).slice(0, 400) + '```' : '',
      '\nאפשר לנסות שוב עם תמונה ברורה יותר?',
    ].filter(Boolean).join('\n');
  }

  // 4. Supplier match
  const { match: supplier, confidence } = await fuzzyFindSupplier(extracted.supplier_name, extracted.supplier_tax_id);

  // 5. Build reply
  const lines = ['📄 *נמצאה חשבונית*', ''];
  if (supplier && confidence >= 0.9) {
    lines.push(`🏢 ספק: *${supplier.company_name}* ✓ (זוהה במערכת)`);
  } else if (supplier && confidence >= 0.5) {
    lines.push(`🏢 ספק: *${extracted.supplier_name}*`);
    lines.push(`   _ייתכן שזה: ${supplier.company_name} (${Math.round(confidence * 100)}% התאמה)_`);
  } else {
    lines.push(`🏢 ספק: *${extracted.supplier_name}* ⚠️ (לא קיים במערכת — ייווצר חדש בעת אישור)`);
  }
  if (extracted.supplier_tax_id) lines.push(`🆔 ח.פ.: ${extracted.supplier_tax_id}`);
  if (extracted.invoice_number) lines.push(`#️⃣ חשבונית: ${extracted.invoice_number}`);
  if (extracted.invoice_date) lines.push(`📅 תאריך: ${extracted.invoice_date}`);
  if (extracted.due_date) lines.push(`💳 פירעון: ${extracted.due_date}`);
  const currency = extracted.currency && extracted.currency !== 'ILS' ? ` ${extracted.currency}` : ' ₪';
  lines.push(`💰 *סה"כ: ${extracted.total_amount.toLocaleString('he-IL')}${currency}*`);
  if (extracted.vat_amount) lines.push(`   (מע"מ: ${extracted.vat_amount.toLocaleString('he-IL')}${currency})`);
  if (extracted.category_guess) lines.push(`🏷️ קטגוריה משוערת: ${extracted.category_guess}`);
  if (extracted.confidence_notes) lines.push(`\n⚠️ ${extracted.confidence_notes}`);
  lines.push('');
  lines.push('✅ ענה *אישור* כדי לשמור ב-Invoices');
  lines.push('❌ ענה *ביטול* כדי לא לשמור');
  lines.push('_(תקף ל-15 דקות)_');
  const previewText = lines.join('\n');

  // 6. Store draft so the next admin "אישור"/"ביטול" can act on it
  if (fromPhone) {
    const matchedHighConfidence = supplier && confidence >= 0.9;
    await storePendingInvoice(fromPhone, {
      extracted,
      stored_url: storedUrl,
      matched_supplier_id: matchedHighConfidence ? supplier.id : null,
      matched_supplier_name: matchedHighConfidence ? supplier.company_name : null,
      match_confidence: confidence,
    }, previewText);
  }
  return previewText;
}
