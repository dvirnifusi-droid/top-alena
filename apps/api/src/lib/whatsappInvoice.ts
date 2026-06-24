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
  const res = await fetch(mediaUrl, { headers: { Authorization: `Basic ${creds}` } });
  if (!res.ok) throw new Error(`media_fetch_${res.status}`);
  const mimeType = res.headers.get('content-type') || 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());
  return { mimeType, buf };
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

// Top-level handler. Returns reply text for the WhatsApp message.
export async function handleAdminInvoiceMedia(mediaUrl: string): Promise<string> {
  let extracted: ExtractedInvoice | null = null;
  let storedUrl: string | null = null;
  try {
    // 1. Download from Twilio
    const { mimeType, buf } = await downloadTwilioMedia(mediaUrl);
    // 2. Upload to our own storage (so we keep a permanent copy + get a relative URL Gemini can fetch)
    const ext = mimeType.startsWith('image/') ? '.' + (mimeType.split('/')[1] || 'jpg') : mimeType === 'application/pdf' ? '.pdf' : '.bin';
    const stream = Readable.from(buf);
    const { url } = await uploadStreamToS3(`whatsapp-invoice${ext}`, mimeType, stream);
    storedUrl = url;
    // 3. OCR + extract
    extracted = (await invokeLLM({
      prompt: [
        'אתה מנתח חשבוניות לעסק מסעדה ישראלי. הקובץ המצורף הוא חשבונית מספק.',
        'חלץ את השדות לפי הסכמה. תאריכים בפורמט YYYY-MM-DD. סכומים כמספרים (בלי ₪ או פסיקים).',
        'אם שדה אינו קיים בחשבונית — השמט אותו במקום להמציא ערך.',
        'קטגוריה משוערת: ירקות, פירות, בשר, דגים, חלב וביצים, יבש (קמח/אורז/וכו), משקאות, אלכוהול, ניקיון, ציוד מטבח, שירותים (חשבונאות, ביטוח, שכירות), אחר.',
      ].join('\n'),
      fileUrls: [url],
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
  lines.push('💾 הקובץ נשמר. *אישור מלא + יצירת רשומה ב-Invoices יבוא בקומיט הבא* (בינתיים זו תצוגה מקדימה).');
  return lines.join('\n');
}
