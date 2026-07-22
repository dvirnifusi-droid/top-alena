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
// The domains the scanner can parse-and-import. invoice is detected by the
// classifier but routed to the dedicated invoice OCR flow, so it has no spec here.
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
    recipe: {
        label: 'מתכון',
        rowsKey: 'ingredients',
        prompt: `זהו מתכון מטבח. חלץ בצורה מובנית:\n` +
            `- name: שם המתכון / ההכנה.\n` +
            `- kind: "PREP" אם זו הכנת בסיס (רכיב שנכנס למנות אחרות — טחינה גולמית / רוטב / מיץ / בצק), או "DISH" אם זו מנה מוגמרת שמוגשת ללקוח.\n` +
            `- yield_qty + yield_unit: כמה יוצא מהמתכון (למשל 5 ק״ג, 20 מנות). אם לא מצוין — yield_qty=1.\n` +
            `- ingredients: לכל רכיב name (שם חומר גלם בעברית), qty (כמות מספרית), unit (ק״ג/גרם/ליטר/מ״ל/יח׳).\n` +
            `שמור שמות חומרי גלם פשוטים וכלליים ("עגבניה", "שמן זית", "מלח"). אל תמציא כמויות שלא כתובות — אם חסר, השאר qty ריק.`,
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                kind: { type: 'string' },
                yield_qty: { type: 'number' },
                yield_unit: { type: 'string' },
                ingredients: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: { name: { type: 'string' }, qty: { type: 'number' }, unit: { type: 'string' } },
                        required: ['name'],
                    },
                },
            },
            required: ['name'],
        },
    },
};
const KNOWN_TYPES = Object.keys(SCAN_PARSE_SPECS);
// Classify unknown input into one of the known domains (or invoice/unknown).
export async function classifyScanContent(fileUrls, text) {
    const options = [...KNOWN_TYPES, 'invoice']; // recipe is already in KNOWN_TYPES
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
        case 'recipe': return importRecipe(parsed);
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
// ── Recipe ingestion (P3 of the commissary): a scanned/typed recipe becomes a
// costed Recipe (PREP/DISH) in the BOM engine. Each ingredient is matched to an
// existing Ingredient (alias → exact → fuzzy token overlap ≥0.6) or created new
// with an unknown price. A PREP recipe then auto-appears in the commissary
// catalog. Reuses the same tables/formula as importRecipesFromJson (load.ts).
let _recipeTablesEnsured = false;
async function ensureRecipeTables() {
    if (_recipeTablesEnsured)
        return;
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Ingredient" (
    "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "supplier_name" TEXT, "unit" TEXT NOT NULL DEFAULT 'kg',
    "price_per_unit" DOUBLE PRECISION, "waste_percent" DOUBLE PRECISION DEFAULT 0, "category" TEXT, "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "IngredientAlias" (
    "id" TEXT PRIMARY KEY, "alias" TEXT NOT NULL, "ingredient_id" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(() => { });
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "Recipe" (
    "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL DEFAULT 'DISH', "name" TEXT NOT NULL, "total_cost" DOUBLE PRECISION,
    "sale_price" DOUBLE PRECISION, "food_cost_percent" DOUBLE PRECISION, "yield_qty" DOUBLE PRECISION DEFAULT 1,
    "yield_unit" TEXT DEFAULT 'unit', "category" TEXT, "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "RecipeIngredient" (
    "id" TEXT PRIMARY KEY, "recipe_id" TEXT NOT NULL, "ingredient_id" TEXT, "prep_recipe_id" TEXT,
    "qty" DOUBLE PRECISION NOT NULL, "unit" TEXT NOT NULL DEFAULT 'kg', "cost_at_import" DOUBLE PRECISION, "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    _recipeTablesEnsured = true;
}
const normIng = (s) => String(s || '').toLowerCase().trim().replace(/["'׳״.,\-+()/\\]/g, '').replace(/\s+/g, ' ');
async function importRecipe(parsed) {
    const name = String(parsed?.name || '').trim();
    if (!name)
        return { created: 0, skipped: 0, label: 'מתכון', message: 'לא זוהה שם מתכון.' };
    await ensureRecipeTables();
    const kind = String(parsed?.kind || '').toUpperCase() === 'DISH' ? 'DISH' : 'PREP';
    const yieldQty = Number(parsed?.yield_qty) > 0 ? Number(parsed.yield_qty) : 1;
    const yieldUnit = parsed?.yield_unit ? String(parsed.yield_unit).slice(0, 20) : 'unit';
    const ingredients = Array.isArray(parsed?.ingredients) ? parsed.ingredients : [];
    const recipeId = rid('rec');
    await db.$executeRawUnsafe(`INSERT INTO "Recipe" ("id","kind","name","yield_qty","yield_unit","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`, recipeId, kind, name.slice(0, 200), yieldQty, yieldUnit);
    // Preload the ingredient book once; append to it as we create new ones so two
    // lines naming the same new ingredient share a row.
    const aliases = await db.$queryRawUnsafe(`SELECT a.alias, i.id, i.price_per_unit, i.waste_percent FROM "IngredientAlias" a JOIN "Ingredient" i ON i.id=a.ingredient_id`).catch(() => []);
    const ings = await db.$queryRawUnsafe(`SELECT id, name, price_per_unit, waste_percent FROM "Ingredient"`).catch(() => []);
    const matchIngredient = async (iname, unit) => {
        const n = normIng(iname);
        for (const a of aliases)
            if (normIng(a.alias) === n)
                return a;
        for (const i of ings)
            if (normIng(i.name) === n)
                return i;
        // fuzzy — token overlap
        const toks = new Set(n.split(' ').filter(Boolean));
        let best = null, score = 0;
        for (const i of ings) {
            const it = new Set(normIng(i.name).split(' ').filter(Boolean));
            const inter = [...toks].filter((t) => it.has(t)).length;
            const s = inter / Math.max(toks.size, it.size, 1);
            if (s > score) {
                score = s;
                best = i;
            }
        }
        if (best && score >= 0.6)
            return best;
        // create new (price unknown → owner fills later)
        const id = rid('ing');
        await db.$executeRawUnsafe(`INSERT INTO "Ingredient" ("id","name","unit","waste_percent","createdAt","updatedAt") VALUES ($1,$2,$3,0,NOW(),NOW())`, id, iname.slice(0, 160), unit);
        const row = { id, name: iname, price_per_unit: null, waste_percent: 0, _new: true };
        ings.push(row);
        return row;
    };
    let total = 0, lineCount = 0, newIng = 0;
    for (const ing of ingredients) {
        const iname = String(ing?.name || '').trim();
        if (!iname)
            continue;
        const qty = Number(ing?.qty) > 0 ? Number(ing.qty) : 0;
        const unit = ing?.unit ? String(ing.unit).slice(0, 20) : 'kg';
        const m = await matchIngredient(iname, unit);
        if (m._new)
            newIng++;
        const price = m.price_per_unit != null ? Number(m.price_per_unit) : null;
        const waste = Number(m.waste_percent) || 0;
        const cost = price != null && qty > 0 ? (qty * price) / (1 - (waste < 1 ? waste : 0)) : null;
        if (cost)
            total += cost;
        await db.$executeRawUnsafe(`INSERT INTO "RecipeIngredient" ("id","recipe_id","ingredient_id","qty","unit","cost_at_import","createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())`, rid('ri'), recipeId, m.id, qty, unit, cost);
        lineCount++;
    }
    await db.$executeRawUnsafe(`UPDATE "Recipe" SET total_cost=$1 WHERE id=$2`, total > 0 ? total : null, recipeId);
    // Best-effort reconcile (nested preps + food-cost %) via the load.ts engine.
    try {
        const load = await import('../functions/load.js');
        if (typeof load.recomputeAllRecipeCosts === 'function')
            await load.recomputeAllRecipeCosts();
    }
    catch { /* inline total_cost already set */ }
    const kindLabel = kind === 'PREP' ? 'הכנה' : 'מנה';
    const costMsg = total > 0 ? `עלות משוערת ₪${Math.round(total)}` : 'עלות תחושב אחרי הזנת מחירי חומרי גלם';
    return {
        created: lineCount, skipped: ingredients.length - lineCount, label: 'מתכון',
        message: `נוצרה ${kindLabel} "${name}" עם ${lineCount} רכיבים${newIng ? ` (${newIng} חומרי גלם חדשים — עדכן להם מחיר במתכונים)` : ''}. ${costMsg}.`,
        details: { recipe_id: recipeId, kind, total_cost: total > 0 ? Math.round(total * 100) / 100 : null, new_ingredients: newIng },
    };
}
//# sourceMappingURL=aiScanner.js.map