// Shared invoice extraction — used by both the WhatsApp flow (whatsappInvoice.ts)
// and the email import cron (emailInvoiceScan.ts).
import { invokeLLM } from './llm.js';
import { prisma } from '../db.js';

export const INVOICE_EXTRACTION_SCHEMA = {
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
    category_guess: { type: 'string', description: 'קטגוריה משוערת: ירקות, פירות, בשר, דגים, חלב וביצים, יבש (קמח/אורז/וכו), משקאות, אלכוהול, ניקיון, ציוד מטבח, שירותים (חשבונאות, ביטוח, שכירות), אחר' },
    confidence_notes: { type: 'string', description: 'הערות אם משהו לא ברור (חסר שדה / קושי קריאה)' },
    line_items: {
      type: 'array',
      description: 'שורות הפריטים בחשבונית. השמט אם אין פירוט שורות.',
      items: {
        type: 'object',
        properties: {
          product_name: { type: 'string', description: 'שם הפריט' },
          quantity: { type: 'number', description: 'כמות' },
          unit: { type: 'string', description: 'יחידת מידה (ק"ג, יח\', ליטר...)' },
          unit_price: { type: 'number', description: 'מחיר ליחידה לפני מע"מ אם מפורט, אחרת המחיר בשורה' },
        },
        required: ['product_name'],
      },
    },
  },
  required: ['supplier_name', 'total_amount'],
};

export type ExtractedLineItem = {
  product_name: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
};

export type ExtractedInvoice = {
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
  line_items?: ExtractedLineItem[];
};

// Levenshtein-light normalized similarity — used for supplier and inventory fuzzy matching.
export function normalizeForMatch(s: string): string {
  return String(s || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
export function similarity(a: string, b: string): number {
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

export async function fuzzyFindSupplier(name: string, taxId?: string): Promise<{ match?: any; confidence: number }> {
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

// OCR + structured extraction. fileUrl MUST be the internal /api/files/<key>
// form (see whatsappInvoice.ts comments — the public URL serves SPA HTML).
export async function extractInvoiceFromFile(fileUrl: string): Promise<ExtractedInvoice> {
  return (await invokeLLM({
    prompt: [
      'אתה מנתח חשבוניות לעסק מסעדה ישראלי. הקובץ המצורף הוא חשבונית מספק.',
      'חלץ את השדות לפי הסכמה. תאריכים בפורמט YYYY-MM-DD. סכומים כמספרים (בלי ₪ או פסיקים).',
      'אם שדה אינו קיים בחשבונית — השמט אותו במקום להמציא ערך.',
      'חלץ גם את שורות הפריטים (line_items) אם קיימות בחשבונית.',
      'קטגוריה משוערת: ירקות, פירות, בשר, דגים, חלב וביצים, יבש (קמח/אורז/וכו), משקאות, אלכוהול, ניקיון, ציוד מטבח, שירותים (חשבונאות, ביטוח, שכירות), אחר.',
    ].join('\n'),
    fileUrls: [fileUrl],
    responseSchema: INVOICE_EXTRACTION_SCHEMA,
    maxOutputTokens: 4000,
  })) as ExtractedInvoice;
}

// Bundle-aware extraction for the email scanner: one file can contain SEVERAL
// invoices (a "מרכזת" — consolidated statement with multiple invoices, or a
// multi-page PDF where each page is a separate invoice). Returns every invoice
// found; entries missing the required fields are dropped.
const INVOICE_BUNDLE_SCHEMA = {
  type: 'object',
  properties: {
    invoices: {
      type: 'array',
      description: 'כל החשבוניות שנמצאו בקובץ, כל אחת בנפרד',
      items: INVOICE_EXTRACTION_SCHEMA,
    },
  },
  required: ['invoices'],
};

export async function extractInvoicesFromFile(fileUrl: string): Promise<ExtractedInvoice[]> {
  const res: any = await invokeLLM({
    prompt: [
      'אתה מנתח חשבוניות לעסק מסעדה ישראלי. הקובץ המצורף מכיל חשבונית אחת או יותר.',
      'שים לב: קובץ אחד יכול להכיל כמה חשבוניות (מרכזת / קובץ מאוחד / כמה עמודים) — החזר כל חשבונית כרשומה נפרדת במערך invoices.',
      'חלץ את השדות לפי הסכמה. תאריכים בפורמט YYYY-MM-DD. סכומים כמספרים (בלי ₪ או פסיקים).',
      'אם שדה אינו קיים בחשבונית — השמט אותו במקום להמציא ערך.',
      'חלץ גם את שורות הפריטים (line_items) של כל חשבונית אם קיימות.',
      'קטגוריה משוערת: ירקות, פירות, בשר, דגים, חלב וביצים, יבש (קמח/אורז/וכו), משקאות, אלכוהול, ניקיון, ציוד מטבח, שירותים (חשבונאות, ביטוח, שכירות), אחר.',
    ].join('\n'),
    fileUrls: [fileUrl],
    responseSchema: INVOICE_BUNDLE_SCHEMA,
    maxOutputTokens: 8000,
  });
  const list: any[] = Array.isArray(res?.invoices) ? res.invoices : [];
  return list.filter(x => x && x.supplier_name && x.total_amount) as ExtractedInvoice[];
}

// ── Inventory matching ──────────────────────────────────────────────────────

export type InventoryMatch = {
  action: 'add_existing' | 'create_new';
  inventory_item_id?: string;
  via?: 'alias' | 'fuzzy';
};

// Inventory-specific similarity: like similarity(), but the substring
// shortcut only applies when the two names have comparable token counts.
// Prevents a generic inventory item ("קמח") from swallowing every
// "קמח <something>" invoice line at 0.92.
function inventorySimilarity(a: string, b: string): number {
  const A = normalizeForMatch(a);
  const B = normalizeForMatch(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const At = A.split(' ').filter(w => w.length >= 2);
  const Bt = B.split(' ').filter(w => w.length >= 2);
  const substr = A.includes(B) || B.includes(A);
  if (substr && Math.abs(At.length - Bt.length) <= 1) return 0.92;
  const setA = new Set(At), setB = new Set(Bt);
  if (!setA.size || !setB.size) return 0;
  const inter = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return inter / union;
}

// Pure — testable without DB. Alias hit wins; else best fuzzy >= 0.75; else create_new.
export function matchInventoryItem(
  productName: string,
  aliases: Array<{ alias_name: string; inventory_item_id: string }>,
  inventoryItems: Array<{ id: string; item_name: string }>,
): InventoryMatch {
  const norm = normalizeForMatch(productName);
  const alias = aliases.find(a => a.alias_name === norm);
  if (alias) return { action: 'add_existing', inventory_item_id: alias.inventory_item_id, via: 'alias' };
  let best: { id: string; sim: number } | null = null;
  for (const it of inventoryItems) {
    const sim = inventorySimilarity(productName, it.item_name);
    if (!best || sim > best.sim) best = { id: it.id, sim };
  }
  if (best && best.sim >= 0.75) return { action: 'add_existing', inventory_item_id: best.id, via: 'fuzzy' };
  return { action: 'create_new' };
}

// DB wrapper used by the scan job.
export async function suggestInventoryAction(productName: string): Promise<InventoryMatch> {
  const [aliases, items] = await Promise.all([
    (prisma as any).productAlias.findMany({ take: 2000 }).catch(() => []),
    (prisma as any).inventory.findMany({ take: 2000, select: { id: true, item_name: true } }).catch(() => []),
  ]);
  return matchInventoryItem(productName, aliases, items);
}
