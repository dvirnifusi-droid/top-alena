// ── Universal AI scanner ──────────────────────────────────────────────────
// Shared core for the "send anything → structured records" feature. Used by
//   • registerFn('aiScanContent') / registerFn('importScanned')  (app channel)
//   • the WhatsApp inbound webhook                                (owner texts a file)
//
// Two stages, always split so nothing is written without confirmation:
//   scanContent()   classify + parse → normalized preview rows. NEVER writes.
//   importScanned() takes (possibly owner-edited) rows → creates DB records.
//
// Vision + PDF are handled by invokeLLM (Anthropic document/image blocks).
import { invokeLLM } from './llm.js';
import { prisma } from '../db.js';
const db = prisma;
// The domains the scanner can parse-and-import. invoice/recipe are detected by
// the classifier but routed to their existing dedicated flows, so they have no
// parse spec here.
export const SCAN_PARSE_SPECS = {
    menu: {
        label: 'תפריט',
        rowsKey: 'items',
        prompt: `זהו תפריט מסעדה (אוכל / שתייה / קוקטיילים). חלץ רשימת פריטים מובנית.\n` +
            `שמור שמות פריטים בעברית בדיוק כפי שהם. זהה מחיר (מספר בלבד, בלי ₪) אם נראה, וקטגוריה אם אפשר.\n` +
            `קטגוריות אפשריות: מנות פתיחה, ראשונות, עיקריות, צמחוני, ילדים, קינוחים, שתייה קלה, יין, בירה, אלכוהול, קוקטיילים, חמים, אחר.`,
        schema: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { name: { type: 'string' }, price: { type: 'number' }, category: { type: 'string' }, description: { type: 'string' } },
                        required: ['name'],
                    },
                },
            },
        },
    },
    checklist: {
        label: 'צ׳קליסט',
        rowsKey: 'items',
        prompt: `זו רשימת משימות / צ׳קליסט תפעולי. חלץ כותרת קצרה לרשימה ואת הפריטים לפי הסדר.\n` +
            `כל פריט = משפט פעולה קצר וברור. אם מצוין סוג משמרת (בוקר/ערב/חמישי) — ציין ב-shift (morning/evening/thursday/all). אם מצוינת מחלקה — ציין ב-department (kitchen/bar/floor/managers).`,
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                shift: { type: 'string' },
                department: { type: 'string' },
                items: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
            },
        },
    },
    employees: {
        label: 'עובדים',
        rowsKey: 'employees',
        prompt: `זו רשימת עובדים. חלץ לכל עובד: שם מלא, טלפון (אם יש), תפקיד (אם יש), מחלקה (אם יש).\n` +
            `תפקידים אפשריים: מלצר, ברמן, טבח, שף, שוטף, מנהל משמרת, מנהל, מארחת, שליח, בריסטה. מחלקות: מטבח, בר, אולם, שירות, ניהול.`,
        schema: {
            type: 'object',
            properties: {
                employees: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { full_name: { type: 'string' }, phone: { type: 'string' }, role: { type: 'string' }, department: { type: 'string' } },
                        required: ['full_name'],
                    },
                },
            },
        },
    },
    suppliers: {
        label: 'ספקים',
        rowsKey: 'suppliers',
        prompt: `זו רשימת ספקים. חלץ לכל ספק: שם החברה, איש קשר, טלפון, אימייל, קטגוריה (אם מצוין).`,
        schema: {
            type: 'object',
            properties: {
                suppliers: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { company_name: { type: 'string' }, contact_person: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, category: { type: 'string' } },
                        required: ['company_name'],
                    },
                },
            },
        },
    },
    order_list: {
        label: 'רשימת הזמנות',
        rowsKey: 'items',
        prompt: `זו רשימת הזמנות / מוצרים לספק. חלץ שם לרשימה ואת הפריטים.\n` +
            `לכל פריט: שם מוצר, כמות (מספר), יחידת מידה (ק״ג / יח׳ / ליטר / ארגז וכו׳), ושם ספק אם מצוין.`,
        schema: {
            type: 'object',
            properties: {
                list_name: { type: 'string' },
                items: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { name: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' }, supplier: { type: 'string' } },
                        required: ['name'],
                    },
                },
            },
        },
    },
};
const KNOWN_TYPES = Object.keys(SCAN_PARSE_SPECS);
// Classify unknown input into one of the known domains (or invoice/recipe/unknown).
export async function classifyScanContent(fileUrls, text) {
    const options = [...KNOWN_TYPES, 'invoice', 'recipe'];
    const res = await invokeLLM({
        prompt: `אתה מסווג מסמכים במערכת ניהול מסעדה. סווג את התוכן לאחת מהקטגוריות:\n` +
            `${options.join(', ')} — או unknown אם לא ברור.\n` +
            (text ? `--- טקסט ---\n${text}\n` : `המסמך/התמונה מצורפים.\n`) +
            `החזר JSON: { type, confidence (מספר 0-1), preview_text (משפט קצר בעברית שמתאר מה ראית, כולל כמות פריטים משוערת) }`,
        fileUrls: fileUrls.length ? fileUrls : undefined,
        responseSchema: {
            type: 'object',
            properties: { type: { type: 'string' }, confidence: { type: 'number' }, preview_text: { type: 'string' } },
            required: ['type'],
        },
        maxOutputTokens: 500,
        _ctx: { fn_name: 'aiScanContent.classify' },
    });
    let type = String(res?.type || 'unknown').toLowerCase().trim();
    if (!options.includes(type))
        type = 'unknown';
    return { type, confidence: Number(res?.confidence ?? 0.5), preview_text: String(res?.preview_text || '') };
}
// Classify (unless hinted) and parse. Never writes.
export async function scanContent(opts) {
    const urls = (opts.fileUrls || []).filter(Boolean);
    const freeText = typeof opts.text === 'string' && opts.text.trim() ? opts.text.trim() : undefined;
    if (!urls.length && !freeText)
        throw new Error('file_url or text required');
    let classification, confidence, preview_text;
    const validHint = opts.hint && SCAN_PARSE_SPECS[opts.hint] ? opts.hint : null;
    if (validHint) {
        classification = validHint;
        confidence = 1;
        preview_text = '';
    }
    else {
        const c = await classifyScanContent(urls, freeText);
        classification = c.type;
        confidence = c.confidence;
        preview_text = c.preview_text;
    }
    const spec = SCAN_PARSE_SPECS[classification];
    if (!spec) {
        const hintMsg = classification === 'invoice'
            ? ' זו נראית חשבונית — השתמש בסורק החשבוניות בדשבורד.'
            : classification === 'recipe'
                ? ' זה נראה מתכון — השתמש בייבוא מתכונים.'
                : '';
        return { classification, confidence, label: null, parsed: null, count: 0, preview_text: (preview_text || 'לא זוהה סוג מסמך שהסורק יודע לייבא.') + hintMsg };
    }
    const parsed = await invokeLLM({
        prompt: `${spec.prompt}\n` + (freeText ? `--- טקסט ---\n${freeText}\n` : `המסמך/התמונה מצורפים.\n`) + `החזר JSON בלבד לפי הסכמה. אל תמציא פריטים שלא קיימים.`,
        fileUrls: urls.length ? urls : undefined,
        responseSchema: spec.schema,
        maxOutputTokens: 4096,
        _ctx: { fn_name: 'aiScanContent.parse' },
    });
    const rows = Array.isArray(parsed?.[spec.rowsKey]) ? parsed[spec.rowsKey] : [];
    return {
        classification,
        confidence,
        label: spec.label,
        parsed,
        count: rows.length,
        preview_text: preview_text || `${spec.label}: ${rows.length} פריטים`,
    };
}
const nowISO = () => new Date().toISOString();
const rid = (p) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const synthEmail = (p) => `${p}-${Math.random().toString(36).slice(2, 8)}@import.local`;
function mapDept(d) {
    const s = String(d || '').toLowerCase().trim();
    if (/kitchen|מטבח|טבח|שף|בישול/.test(s))
        return 'kitchen';
    if (/bar|בר|ברמן|בריסט/.test(s))
        return 'bar';
    if (/floor|אולם|שירות|מלצר|מארח|dining|service/.test(s))
        return 'floor';
    return null;
}
function mapSupplierCat(c) {
    const s = String(c || '').toLowerCase().trim();
    if (/service|שירות/.test(s))
        return 'services';
    if (/equip|ציוד/.test(s))
        return 'equipment';
    if (/cater|קייטר/.test(s))
        return 'catering';
    return 'materials';
}
export async function importScanned(classification, parsed) {
    switch (classification) {
        case 'menu': return importMenu(parsed);
        case 'checklist': return importChecklist(parsed);
        case 'employees': return importEmployees(parsed);
        case 'suppliers': return importSuppliers(parsed);
        case 'order_list': return importOrderList(parsed);
        default:
            throw new Error(`ייבוא לא נתמך עבור סוג "${classification}"`);
    }
}
async function importMenu(parsed) {
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    let created = 0, skipped = 0;
    for (const it of items) {
        const name = String(it?.name || '').trim();
        if (!name) {
            skipped++;
            continue;
        }
        await db.menuItem.create({
            data: {
                name: name.slice(0, 200),
                category: String(it?.category || 'כללי').trim().slice(0, 80) || 'כללי',
                price: Number(it?.price) || 0,
                description: it?.description ? String(it.description).slice(0, 500) : null,
                available: true,
                created_date: nowISO(),
                updated_date: nowISO(),
            },
        });
        created++;
    }
    return { created, skipped, label: 'תפריט', message: `נוספו ${created} מנות לתפריט${skipped ? ` (${skipped} דולגו)` : ''}.` };
}
async function importChecklist(parsed) {
    const raw = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = raw
        .map((it, i) => {
        const text = String(it?.text || it?.task || '').trim();
        if (!text)
            return null;
        return { id: rid('it'), order: i + 1, task: text, text, area: '', critical: false, is_required: false };
    })
        .filter(Boolean);
    if (!items.length)
        return { created: 0, skipped: 0, label: 'צ׳קליסט', message: 'לא נמצאו פריטים לצ׳קליסט.' };
    const validShift = new Set(['all', 'morning', 'evening', 'thursday']);
    const validDept = new Set(['floor', 'bar', 'kitchen', 'managers']);
    const shift = validShift.has(String(parsed?.shift)) ? String(parsed.shift) : 'all';
    const department = validDept.has(String(parsed?.department)) ? String(parsed.department) : null;
    await db.checklist.create({
        data: {
            title: String(parsed?.title || 'צ׳קליסט מיובא').trim().slice(0, 120),
            category: 'operational',
            frequency: 'daily',
            department,
            shift,
            color: 'orange',
            description: 'יובא בסריקה חכמה',
            items,
            status: 'active',
            created_date: nowISO(),
            updated_date: nowISO(),
        },
    });
    return { created: items.length, skipped: 0, label: 'צ׳קליסט', message: `נוצר צ׳קליסט "${parsed?.title || 'מיובא'}" עם ${items.length} פריטים.` };
}
async function importEmployees(parsed) {
    const rows = Array.isArray(parsed?.employees) ? parsed.employees : [];
    let created = 0, skipped = 0;
    for (const e of rows) {
        const full_name = String(e?.full_name || '').trim();
        if (!full_name) {
            skipped++;
            continue;
        }
        const phone = e?.phone ? String(e.phone).replace(/[^\d+]/g, '').slice(0, 20) : null;
        await db.employee.create({
            data: {
                full_name: full_name.slice(0, 120),
                email: e?.email ? String(e.email).toLowerCase().trim().slice(0, 120) : synthEmail('emp'),
                phone,
                role: String(e?.role || 'עובד/ת').trim().slice(0, 60) || 'עובד/ת',
                department: mapDept(e?.department),
                status: 'active',
                created_date: nowISO(),
                updated_date: nowISO(),
            },
        });
        created++;
    }
    return { created, skipped, label: 'עובדים', message: `נוספו ${created} עובדים${skipped ? ` (${skipped} דולגו)` : ''}. הרשאות כניסה מוגדרות בנפרד בדף העובדים.` };
}
async function importSuppliers(parsed) {
    const rows = Array.isArray(parsed?.suppliers) ? parsed.suppliers : [];
    let created = 0, skipped = 0;
    let seq = Date.now();
    for (const s of rows) {
        const company_name = String(s?.company_name || '').trim();
        if (!company_name) {
            skipped++;
            continue;
        }
        await db.supplier.create({
            data: {
                company_name: company_name.slice(0, 160),
                supplier_id: `SUP-${seq++}`,
                contact_person: String(s?.contact_person || 'לא ידוע').trim().slice(0, 120) || 'לא ידוע',
                email: s?.email ? String(s.email).toLowerCase().trim().slice(0, 120) : synthEmail('supplier'),
                phone: s?.phone ? String(s.phone).replace(/[^\d+\-() ]/g, '').slice(0, 40) : null,
                category: mapSupplierCat(s?.category),
                status: 'active',
                created_date: nowISO(),
                updated_date: nowISO(),
            },
        });
        created++;
    }
    return { created, skipped, label: 'ספקים', message: `נוספו ${created} ספקים${skipped ? ` (${skipped} דולגו)` : ''}.` };
}
// Order lists reuse the raw-SQL Prep subsystem (PrepList list_type='order' + PrepItem).
// CREATE IF NOT EXISTS is idempotent and matches ensurePrepItems() in load.ts.
let _prepTablesEnsured = false;
async function ensurePrepTables() {
    if (_prepTablesEnsured)
        return;
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PrepItem" (
       "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "category" TEXT, "unit" TEXT,
       "target" TEXT, "have" TEXT, "prep" TEXT,
       "to_prep" BOOLEAN NOT NULL DEFAULT false, "done" BOOLEAN NOT NULL DEFAULT false,
       "done_by" TEXT, "done_at" TIMESTAMP(3), "photo_url" TEXT, "note" TEXT,
       "list_id" TEXT, "sort" INTEGER NOT NULL DEFAULT 0,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PrepList" (
       "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL,
       "sort" INTEGER NOT NULL DEFAULT 0,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`);
    await db.$executeRawUnsafe(`ALTER TABLE "PrepList" ADD COLUMN IF NOT EXISTS "list_type" TEXT`).catch(() => { });
    await db.$executeRawUnsafe(`ALTER TABLE "PrepList" ADD COLUMN IF NOT EXISTS "par_locked" BOOLEAN NOT NULL DEFAULT true`).catch(() => { });
    _prepTablesEnsured = true;
}
async function importOrderList(parsed) {
    const rows = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = rows.filter((it) => String(it?.name || '').trim());
    if (!items.length)
        return { created: 0, skipped: 0, label: 'רשימת הזמנות', message: 'לא נמצאו פריטים ברשימה.' };
    await ensurePrepTables();
    const { randomUUID } = await import('node:crypto');
    const listId = randomUUID();
    const listName = String(parsed?.list_name || 'רשימת הזמנות מיובאת').trim().slice(0, 80) || 'רשימת הזמנות מיובאת';
    const mx = await db.$queryRawUnsafe(`SELECT COALESCE(MAX("sort"),0)+1 AS s FROM "PrepList"`).catch(() => [{ s: 0 }]);
    await db.$executeRawUnsafe(`INSERT INTO "PrepList" ("id","name","sort","list_type","updatedAt") VALUES ($1,$2,$3,'order',NOW())`, listId, listName, Number(mx[0]?.s) || 0);
    let sort = 0;
    for (const it of items) {
        await db.$executeRawUnsafe(`INSERT INTO "PrepItem" ("id","name","category","unit","target","have","to_prep","done","list_id","sort","updatedAt")
       VALUES ($1,$2,$3,$4,$5,'',false,false,$6,$7,NOW())`, randomUUID(), String(it?.name).trim().slice(0, 200), it?.supplier ? String(it.supplier).slice(0, 80) : null, it?.unit ? String(it.unit).slice(0, 40) : null, it?.qty != null ? String(it.qty).slice(0, 40) : '', listId, sort++);
    }
    return { created: items.length, skipped: rows.length - items.length, label: 'רשימת הזמנות', message: `נוצרה רשימת הזמנות "${listName}" עם ${items.length} פריטים.`, list_id: listId };
}
//# sourceMappingURL=aiScanner.js.map