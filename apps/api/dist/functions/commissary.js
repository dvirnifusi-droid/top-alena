// Central commissary ("בית הכנות") — Phase 1: catalog + internal pricing.
// The commissary reuses the per-tenant Recipe/Ingredient BOM engine (a PREP
// recipe already carries a computed total_cost + batch yield). This module adds
// the layer ON TOP: what the commissary SELLS to its member restaurants and at
// what internal (transfer) price. State lives in isolated additive tables —
// the Recipe/Ingredient models are never touched (prisma db push is forbidden
// on prod; see the DB-drift playbook).
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { requireBackOffice } from '../lib/pagePermissions.js';
import { currentTenantSlug } from '../lib/whatsappRouter.js';
import { sendWhatsApp } from '../lib/twilio.js';
import { prepCostPerUnit, rawCostPerUnit, internalPrice, marginPct, effectiveMarkup } from '../lib/commissary.js';
// The commissary is divided into departments (מטבח מרכזי / מחסן משקאות / מרלו"ג /
// קונדיטוריה מרכזית). Each catalog item belongs to one. Kept as data (config)
// so the owner can rename/extend them later without a code change.
const DEFAULT_DEPARTMENTS = ['מטבח מרכזי', 'מחסן משקאות', 'מרלו"ג', 'קונדיטוריה מרכזית'];
let _commissaryReady = false;
async function ensureCommissaryTables() {
    if (_commissaryReady)
        return;
    const sql = prisma.$executeRawUnsafe.bind(prisma);
    // Single-row config (default markup applied to items with no explicit markup).
    await sql(`CREATE TABLE IF NOT EXISTS "CommissaryConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "default_markup_pct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await sql(`ALTER TABLE "CommissaryConfig" ADD COLUMN IF NOT EXISTS "departments" JSONB`).catch(() => { });
    // A sellable catalog item = a PREP recipe OR a raw ingredient sold as-is
    // (vegetables, meat). Exactly one of recipe_id / ingredient_id is set.
    await sql(`CREATE TABLE IF NOT EXISTS "CommissaryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipe_id" TEXT,
    "ingredient_id" TEXT,
    "markup_pct" DOUBLE PRECISION,
    "price_override" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await sql(`ALTER TABLE "CommissaryItem" ADD COLUMN IF NOT EXISTS "department" TEXT`).catch(() => { });
    await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "CommissaryItem_recipe_key" ON "CommissaryItem"("recipe_id") WHERE "recipe_id" IS NOT NULL`);
    await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "CommissaryItem_ingredient_key" ON "CommissaryItem"("ingredient_id") WHERE "ingredient_id" IS NOT NULL`);
    // P2 — the restaurants that buy from the commissary, their orders, and lines.
    await sql(`CREATE TABLE IF NOT EXISTS "CommissaryCustomer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "contact" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    // order_date is a plain 'YYYY-MM-DD' string — no timezone math (owner rule).
    await sql(`CREATE TABLE IF NOT EXISTS "CommissaryOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customer_id" TEXT NOT NULL,
    "order_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await sql(`CREATE INDEX IF NOT EXISTS "CommissaryOrder_date_idx" ON "CommissaryOrder"("order_date")`);
    // Each line snapshots the cost + internal price at order time, so the internal
    // invoice stays stable even if the catalog is re-priced later.
    await sql(`CREATE TABLE IF NOT EXISTS "CommissaryOrderLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "name" TEXT,
    "unit" TEXT,
    "department" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "cost_per_unit" DOUBLE PRECISION,
    "internal_price" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
    await sql(`CREATE INDEX IF NOT EXISTS "CommissaryOrderLine_order_idx" ON "CommissaryOrderLine"("order_id")`);
    _commissaryReady = true;
}
async function loadConfig() {
    const rows = await prisma
        .$queryRawUnsafe(`SELECT default_markup_pct, departments FROM "CommissaryConfig" WHERE id='default'`).catch(() => []);
    const markup = rows.length ? Number(rows[0].default_markup_pct) : 30;
    const depsRaw = rows.length && Array.isArray(rows[0].departments) ? rows[0].departments.map(String).filter(Boolean) : null;
    return { default_markup_pct: markup, departments: depsRaw && depsRaw.length ? depsRaw : DEFAULT_DEPARTMENTS };
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// The commissary catalog: every PREP recipe (auto-listed so the owner can price
// them) + every raw ingredient explicitly added as sold-as-is. Each row carries
// cost/unit (from the BOM engine), the effective markup, the internal price the
// restaurants pay, and the commissary's margin. Shared by the catalog fn AND the
// order/distribution fns so pricing is identical everywhere.
async function buildCatalog() {
    const cfg = await loadConfig();
    const defMarkup = cfg.default_markup_pct;
    const preps = await prisma.$queryRawUnsafe(`SELECT id, name, total_cost, yield_qty, yield_unit, category
     FROM "Recipe" WHERE kind='PREP' ORDER BY category NULLS LAST, name`).catch(() => []);
    const items = await prisma.$queryRawUnsafe(`SELECT * FROM "CommissaryItem"`).catch(() => []);
    const byRecipe = new Map(items.filter((i) => i.recipe_id).map((i) => [i.recipe_id, i]));
    const rawItems = items.filter((i) => i.ingredient_id);
    const ingIds = rawItems.map((i) => i.ingredient_id);
    const ings = ingIds.length
        ? await prisma.$queryRawUnsafe(`SELECT id, name, price_per_unit, waste_percent, unit, category, supplier_name FROM "Ingredient" WHERE id = ANY($1::text[])`, ingIds).catch(() => [])
        : [];
    const ingById = new Map(ings.map((i) => [i.id, i]));
    const catalog = [];
    for (const p of preps) {
        const it = byRecipe.get(p.id);
        const cost = prepCostPerUnit(p);
        const markup = effectiveMarkup(it?.markup_pct, defMarkup);
        const price = internalPrice(cost, markup, it?.price_override);
        catalog.push({
            item_id: it?.id || null, source: 'prep', ref_id: p.id, name: p.name,
            category: p.category || null, unit: p.yield_unit || 'unit', department: it?.department ?? null,
            cost_per_unit: r2(cost), markup_pct: markup, price_override: it?.price_override ?? null,
            internal_price: price, margin_per_unit: r2(price - cost), margin_pct: marginPct(cost, price),
            in_catalog: !!(it && it.active), active: it ? !!it.active : false, has_cost: cost > 0,
        });
    }
    for (const it of rawItems) {
        const ing = ingById.get(it.ingredient_id);
        if (!ing)
            continue;
        const cost = rawCostPerUnit(ing);
        const markup = effectiveMarkup(it.markup_pct, defMarkup);
        const price = internalPrice(cost, markup, it.price_override);
        catalog.push({
            item_id: it.id, source: 'raw', ref_id: ing.id, name: ing.name,
            category: ing.category || null, unit: ing.unit || 'kg', department: it.department ?? null,
            cost_per_unit: r2(cost), markup_pct: markup, price_override: it.price_override ?? null,
            internal_price: price, margin_per_unit: r2(price - cost), margin_pct: marginPct(cost, price),
            in_catalog: !!it.active, active: !!it.active, has_cost: cost > 0,
        });
    }
    return {
        catalog, default_markup_pct: defMarkup, departments: cfg.departments,
        prep_count: preps.length, sold_as_is_count: rawItems.length,
    };
}
registerFn('getCommissaryCatalog', async ({ user }) => {
    await requireBackOffice(user, 'getCommissaryCatalog');
    await ensureCommissaryTables();
    return buildCatalog();
});
// Upsert a catalog item's pricing (markup / override / active). Keyed by the
// referenced recipe OR ingredient, so calling twice edits the same row.
registerFn('setCommissaryItem', async ({ user, body }) => {
    await requireBackOffice(user, 'setCommissaryItem');
    await ensureCommissaryTables();
    const b = (body || {});
    const recipeId = b.recipe_id ? String(b.recipe_id) : null;
    const ingredientId = b.ingredient_id ? String(b.ingredient_id) : null;
    if (!recipeId && !ingredientId)
        throw new Error('recipe_id or ingredient_id required');
    if (recipeId && ingredientId)
        throw new Error('only one of recipe_id / ingredient_id');
    const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
    const markup = num(b.markup_pct);
    const override = num(b.price_override);
    if ((markup != null && markup < 0) || (override != null && override < 0))
        throw new Error('invalid_amount');
    const active = b.active === undefined ? true : !!b.active;
    const notes = b.notes ? String(b.notes).slice(0, 300) : null;
    // department is optional — undefined means "leave as-is"; '' / null clears it.
    const deptProvided = b.department !== undefined;
    const dept = deptProvided ? (b.department ? String(b.department).slice(0, 80) : null) : null;
    const col = recipeId ? 'recipe_id' : 'ingredient_id';
    const val = recipeId || ingredientId;
    const existing = await prisma.$queryRawUnsafe(`SELECT id FROM "CommissaryItem" WHERE ${col}=$1`, val).catch(() => []);
    if (existing.length) {
        await prisma.$executeRawUnsafe(`UPDATE "CommissaryItem" SET markup_pct=$1, price_override=$2, active=$3, notes=$4, "updatedAt"=NOW() WHERE id=$5`, markup, override, active, notes, existing[0].id);
    }
    else {
        await prisma.$executeRawUnsafe(`INSERT INTO "CommissaryItem"(id, ${col}, markup_pct, price_override, active, notes)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`, val, markup, override, active, notes);
    }
    // Only touch department when the caller passed it (so a price edit doesn't wipe it).
    if (deptProvided) {
        await prisma.$executeRawUnsafe(`UPDATE "CommissaryItem" SET department=$1 WHERE ${col}=$2`, dept, val);
    }
    return { ok: true };
});
// Remove a sold-as-is / pricing row entirely (a PREP just reverts to the default
// markup and drops out of the active catalog).
registerFn('removeCommissaryItem', async ({ user, body }) => {
    await requireBackOffice(user, 'removeCommissaryItem');
    await ensureCommissaryTables();
    const id = String(body?.item_id || '');
    if (!id)
        throw new Error('item_id required');
    await prisma.$executeRawUnsafe(`DELETE FROM "CommissaryItem" WHERE id=$1`, id);
    return { ok: true };
});
// Default markup applied to any item without its own markup.
registerFn('setCommissaryConfig', async ({ user, body }) => {
    await requireBackOffice(user, 'setCommissaryConfig');
    await ensureCommissaryTables();
    const b = (body || {});
    const cur = await loadConfig();
    const m = Number(b.default_markup_pct);
    const markup = Number.isFinite(m) && m >= 0 ? m : cur.default_markup_pct;
    // Optional: rename/replace the department list (dedup, drop blanks).
    let departments = cur.departments;
    if (Array.isArray(b.departments)) {
        const clean = [...new Set(b.departments.map((d) => String(d || '').trim()).filter(Boolean))].slice(0, 20);
        if (clean.length)
            departments = clean;
    }
    await prisma.$executeRawUnsafe(`INSERT INTO "CommissaryConfig"(id, default_markup_pct, departments, "updatedAt") VALUES ('default', $1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET default_markup_pct=EXCLUDED.default_markup_pct, departments=EXCLUDED.departments, "updatedAt"=NOW()`, markup, JSON.stringify(departments));
    return { ok: true, default_markup_pct: markup, departments };
});
// Ingredients the owner can add to the catalog as sold-as-is (raw) items.
registerFn('listCommissaryIngredients', async ({ user }) => {
    await requireBackOffice(user, 'listCommissaryIngredients');
    await ensureCommissaryTables();
    const ings = await prisma.$queryRawUnsafe(`SELECT id, name, price_per_unit, unit, category FROM "Ingredient" ORDER BY category NULLS LAST, name`).catch(() => []);
    return { ingredients: ings };
});
// ── P2: restaurants (customers), orders, distribution + internal invoice ──────
registerFn('listCommissaryCustomers', async ({ user }) => {
    await requireBackOffice(user, 'listCommissaryCustomers');
    await ensureCommissaryTables();
    const rows = await prisma.$queryRawUnsafe(`SELECT id, name, slug, contact, active FROM "CommissaryCustomer" ORDER BY active DESC, name`).catch(() => []);
    return { customers: rows };
});
registerFn('saveCommissaryCustomer', async ({ user, body }) => {
    await requireBackOffice(user, 'saveCommissaryCustomer');
    await ensureCommissaryTables();
    const b = (body || {});
    const name = String(b.name || '').trim();
    if (!name)
        throw new Error('name required');
    const slug = b.slug ? String(b.slug).trim().slice(0, 60) : null;
    const contact = b.contact ? String(b.contact).slice(0, 200) : null;
    const active = b.active === undefined ? true : !!b.active;
    if (b.id) {
        await prisma.$executeRawUnsafe(`UPDATE "CommissaryCustomer" SET name=$1, slug=$2, contact=$3, active=$4 WHERE id=$5`, name, slug, contact, active, String(b.id));
        return { ok: true, id: String(b.id) };
    }
    const rows = await prisma.$queryRawUnsafe(`INSERT INTO "CommissaryCustomer"(id, name, slug, contact, active)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4) RETURNING id`, name, slug, contact, active);
    return { ok: true, id: rows[0]?.id };
});
registerFn('deleteCommissaryCustomer', async ({ user, body }) => {
    await requireBackOffice(user, 'deleteCommissaryCustomer');
    await ensureCommissaryTables();
    const id = String(body?.id || '');
    if (!id)
        throw new Error('id required');
    await prisma.$executeRawUnsafe(`DELETE FROM "CommissaryCustomer" WHERE id=$1`, id);
    return { ok: true };
});
// List orders (optionally filtered by date range / customer) with a total.
registerFn('listCommissaryOrders', async ({ user, body }) => {
    await requireBackOffice(user, 'listCommissaryOrders');
    await ensureCommissaryTables();
    const b = (body || {});
    const wh = [];
    const params = [];
    if (b.date_from) {
        params.push(String(b.date_from).slice(0, 10));
        wh.push(`o.order_date >= $${params.length}`);
    }
    if (b.date_to) {
        params.push(String(b.date_to).slice(0, 10));
        wh.push(`o.order_date <= $${params.length}`);
    }
    if (b.customer_id) {
        params.push(String(b.customer_id));
        wh.push(`o.customer_id = $${params.length}`);
    }
    const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
    const rows = await prisma.$queryRawUnsafe(`SELECT o.id, o.customer_id, o.order_date, o.status, o.notes, c.name AS customer_name,
            COALESCE(SUM(l.qty * COALESCE(l.internal_price,0)),0) AS total_ils,
            COUNT(l.id)::int AS line_count
     FROM "CommissaryOrder" o
     LEFT JOIN "CommissaryCustomer" c ON c.id = o.customer_id
     LEFT JOIN "CommissaryOrderLine" l ON l.order_id = o.id
     ${where}
     GROUP BY o.id, c.name
     ORDER BY o.order_date DESC, c.name`, ...params).catch(() => []);
    return { orders: rows.map((r) => ({ ...r, total_ils: r2(r.total_ils) })) };
});
registerFn('getCommissaryOrder', async ({ user, body }) => {
    await requireBackOffice(user, 'getCommissaryOrder');
    await ensureCommissaryTables();
    const id = String(body?.order_id || '');
    if (!id)
        throw new Error('order_id required');
    const orders = await prisma.$queryRawUnsafe(`SELECT o.*, c.name AS customer_name FROM "CommissaryOrder" o
     LEFT JOIN "CommissaryCustomer" c ON c.id=o.customer_id WHERE o.id=$1`, id).catch(() => []);
    if (!orders.length)
        throw new Error('order_not_found');
    const lines = await prisma.$queryRawUnsafe(`SELECT * FROM "CommissaryOrderLine" WHERE order_id=$1 ORDER BY department NULLS LAST, name`, id).catch(() => []);
    const total = lines.reduce((s, l) => s + Number(l.qty) * (Number(l.internal_price) || 0), 0);
    return { order: orders[0], lines, total_ils: r2(total) };
});
// Create/update an order and REPLACE its lines. Each line's cost + internal
// price are snapshotted from the CURRENT catalog so the invoice is stable.
registerFn('saveCommissaryOrder', async ({ user, body }) => {
    await requireBackOffice(user, 'saveCommissaryOrder');
    await ensureCommissaryTables();
    const b = (body || {});
    const customerId = String(b.customer_id || '');
    const orderDate = String(b.order_date || '').slice(0, 10);
    if (!customerId)
        throw new Error('customer_id required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate))
        throw new Error('order_date (YYYY-MM-DD) required');
    const notes = b.notes ? String(b.notes).slice(0, 500) : null;
    const linesIn = Array.isArray(b.lines) ? b.lines : [];
    // Price each requested line from the live catalog.
    const { catalog } = await buildCatalog();
    const byRef = new Map(catalog.map((c) => [`${c.source}:${c.ref_id}`, c]));
    let orderId = b.order_id ? String(b.order_id) : null;
    if (orderId) {
        await prisma.$executeRawUnsafe(`UPDATE "CommissaryOrder" SET customer_id=$1, order_date=$2, notes=$3, "updatedAt"=NOW() WHERE id=$4`, customerId, orderDate, notes, orderId);
        await prisma.$executeRawUnsafe(`DELETE FROM "CommissaryOrderLine" WHERE order_id=$1`, orderId);
    }
    else {
        const rows = await prisma.$queryRawUnsafe(`INSERT INTO "CommissaryOrder"(id, customer_id, order_date, notes)
       VALUES (gen_random_uuid()::text, $1, $2, $3) RETURNING id`, customerId, orderDate, notes);
        orderId = rows[0]?.id;
    }
    let saved = 0;
    for (const ln of linesIn) {
        const source = ln.source === 'raw' ? 'raw' : 'prep';
        const refId = String(ln.ref_id || '');
        const qty = Number(ln.qty);
        if (!refId || !Number.isFinite(qty) || qty <= 0)
            continue;
        const cat = byRef.get(`${source}:${refId}`);
        if (!cat)
            continue;
        await prisma.$executeRawUnsafe(`INSERT INTO "CommissaryOrderLine"(id, order_id, source, ref_id, name, unit, department, qty, cost_per_unit, internal_price)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9)`, orderId, source, refId, cat.name, cat.unit, cat.department, qty, cat.cost_per_unit, cat.internal_price);
        saved++;
    }
    return { ok: true, order_id: orderId, lines_saved: saved };
});
registerFn('deleteCommissaryOrder', async ({ user, body }) => {
    await requireBackOffice(user, 'deleteCommissaryOrder');
    await ensureCommissaryTables();
    const id = String(body?.order_id || '');
    if (!id)
        throw new Error('order_id required');
    await prisma.$executeRawUnsafe(`DELETE FROM "CommissaryOrderLine" WHERE order_id=$1`, id);
    await prisma.$executeRawUnsafe(`DELETE FROM "CommissaryOrder" WHERE id=$1`, id);
    return { ok: true };
});
// THE distribution view: for a given date, aggregate every restaurant's order
// into (a) what the commissary must PRODUCE per item (total qty, grouped by
// department, with the per-restaurant split), and (b) the internal invoice per
// restaurant (what each owes). This is the chef's "what to make today" + billing.
registerFn('getCommissaryDistribution', async ({ user, body }) => {
    await requireBackOffice(user, 'getCommissaryDistribution');
    await ensureCommissaryTables();
    const date = String(body?.order_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error('order_date (YYYY-MM-DD) required');
    // Local (manually-entered) orders.
    const localRows = await prisma.$queryRawUnsafe(`SELECT l.source, l.ref_id, l.name, l.unit, l.department, l.qty, l.cost_per_unit, l.internal_price,
            o.customer_id, c.name AS customer_name
     FROM "CommissaryOrderLine" l
     JOIN "CommissaryOrder" o ON o.id = l.order_id
     LEFT JOIN "CommissaryCustomer" c ON c.id = o.customer_id
     WHERE o.order_date = $1`, date).catch(() => []);
    // Chain (branch-app) orders from the shared public tables — merged in so the
    // commissary sees branch orders and manual orders together. Branch lines carry
    // no cost (branches never see it) → we look cost up from our live catalog.
    const chainRows = [];
    const chain = await myChain().catch(() => null);
    if (chain?.chain_id) {
        await ensureChainCommissaryTables();
        const costByKey = new Map();
        const { catalog } = await buildCatalog();
        for (const c of catalog)
            costByKey.set(`${c.source}:${c.ref_id}`, c);
        const cr = await prisma.$queryRawUnsafe(`SELECT l.item_key, l.name, l.unit, l.department, l.qty, l.internal_price, o.branch_slug, o.branch_name
       FROM public."CommissaryChainOrderLine" l
       JOIN public."CommissaryChainOrder" o ON o.id = l.order_id
       WHERE o.chain_id = $1 AND o.order_date = $2`, chain.chain_id, date).catch(() => []);
        for (const l of cr) {
            const [source, ...rest] = String(l.item_key || '').split(':');
            const ref_id = rest.join(':');
            const cat = costByKey.get(l.item_key);
            chainRows.push({
                source, ref_id, name: l.name, unit: l.unit, department: l.department || null,
                qty: l.qty, cost_per_unit: cat ? cat.cost_per_unit : 0, internal_price: l.internal_price,
                customer_id: `branch:${l.branch_slug}`, customer_name: l.branch_name || l.branch_slug,
            });
        }
    }
    const rows = [...localRows, ...chainRows];
    // (a) production per item, keyed by source:ref.
    const items = new Map();
    // (b) per-restaurant invoice.
    const byCustomer = new Map();
    let grandCost = 0, grandPrice = 0;
    for (const l of rows) {
        const key = `${l.source}:${l.ref_id}`;
        const qty = Number(l.qty) || 0;
        const cost = qty * (Number(l.cost_per_unit) || 0);
        const price = qty * (Number(l.internal_price) || 0);
        grandCost += cost;
        grandPrice += price;
        if (!items.has(key)) {
            items.set(key, {
                source: l.source, ref_id: l.ref_id, name: l.name, unit: l.unit, department: l.department || null,
                total_qty: 0, total_cost: 0, total_price: 0, per_customer: [],
            });
        }
        const it = items.get(key);
        it.total_qty += qty;
        it.total_cost += cost;
        it.total_price += price;
        it.per_customer.push({ customer_id: l.customer_id, customer_name: l.customer_name, qty });
        const cid = l.customer_id || 'unknown';
        if (!byCustomer.has(cid))
            byCustomer.set(cid, { customer_id: cid, customer_name: l.customer_name, total_ils: 0, cost_ils: 0, line_count: 0 });
        const cu = byCustomer.get(cid);
        cu.total_ils += price;
        cu.cost_ils += cost;
        cu.line_count += 1;
    }
    const production = [...items.values()].map((it) => ({
        ...it, total_qty: r2(it.total_qty), total_cost: r2(it.total_cost), total_price: r2(it.total_price),
        margin_ils: r2(it.total_price - it.total_cost),
    })).sort((a, b) => (a.department || '').localeCompare(b.department || '') || b.total_price - a.total_price);
    const invoices = [...byCustomer.values()].map((cu) => ({
        ...cu, total_ils: r2(cu.total_ils), cost_ils: r2(cu.cost_ils), margin_ils: r2(cu.total_ils - cu.cost_ils),
    })).sort((a, b) => b.total_ils - a.total_ils);
    return {
        order_date: date, production, invoices,
        totals: { cost_ils: r2(grandCost), price_ils: r2(grandPrice), margin_ils: r2(grandPrice - grandCost), item_count: production.length, customer_count: invoices.length },
    };
});
// ── P4: chain cross-tenant ordering ───────────────────────────────────────────
// The commissary (chain-HQ) PUBLISHES its catalog to the shared `public` schema;
// member restaurants (branches) read it and place orders from THEIR own app,
// scoped to their slug — exactly the NetworkTaskBranch pattern. No branch can
// read another tenant's business schema.
let _chainCommReady = false;
async function ensureChainCommissaryTables() {
    if (_chainCommReady)
        return;
    const sql = prisma.$executeRawUnsafe.bind(prisma);
    await sql(`ALTER TABLE public."Chain" ADD COLUMN IF NOT EXISTS "commissary_slug" TEXT`).catch(() => { });
    await sql(`ALTER TABLE public."Chain" ADD COLUMN IF NOT EXISTS "commissary_profit_pct" DOUBLE PRECISION`).catch(() => { });
    await sql(`CREATE TABLE IF NOT EXISTS public."CommissaryCatalogItem" (
    "id" TEXT PRIMARY KEY, "chain_id" TEXT NOT NULL, "item_key" TEXT NOT NULL,
    "name" TEXT, "unit" TEXT, "department" TEXT, "internal_price" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true, "updatedAt" TIMESTAMPTZ DEFAULT NOW())`).catch(() => { });
    await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "CommissaryCatalogItem_key" ON public."CommissaryCatalogItem"("chain_id","item_key")`).catch(() => { });
    // Network owner sees cost + margin (branches never select these columns).
    await sql(`ALTER TABLE public."CommissaryCatalogItem" ADD COLUMN IF NOT EXISTS "cost_per_unit" DOUBLE PRECISION`).catch(() => { });
    await sql(`ALTER TABLE public."CommissaryCatalogItem" ADD COLUMN IF NOT EXISTS "markup_pct" DOUBLE PRECISION`).catch(() => { });
    await sql(`ALTER TABLE public."CommissaryCatalogItem" ADD COLUMN IF NOT EXISTS "source" TEXT`).catch(() => { });
    await sql(`CREATE TABLE IF NOT EXISTS public."CommissaryChainOrder" (
    "id" TEXT PRIMARY KEY, "chain_id" TEXT NOT NULL, "branch_slug" TEXT NOT NULL, "branch_name" TEXT,
    "order_date" TEXT NOT NULL, "notes" TEXT, "status" TEXT DEFAULT 'submitted',
    "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`).catch(() => { });
    await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "CommissaryChainOrder_key" ON public."CommissaryChainOrder"("chain_id","branch_slug","order_date")`).catch(() => { });
    await sql(`CREATE TABLE IF NOT EXISTS public."CommissaryChainOrderLine" (
    "id" TEXT PRIMARY KEY, "order_id" TEXT NOT NULL, "item_key" TEXT NOT NULL,
    "name" TEXT, "unit" TEXT, "department" TEXT, "qty" DOUBLE PRECISION NOT NULL, "internal_price" DOUBLE PRECISION)`).catch(() => { });
    await sql(`CREATE INDEX IF NOT EXISTS "CommissaryChainOrderLine_order" ON public."CommissaryChainOrderLine"("order_id")`).catch(() => { });
    // Live production status — the commissary marks each prep DONE as it's made,
    // like a prep sheet. Keyed by chain + date + item so the same day's board is shared.
    await sql(`CREATE TABLE IF NOT EXISTS public."CommissaryProduction" (
    "id" TEXT PRIMARY KEY, "chain_id" TEXT NOT NULL, "order_date" TEXT NOT NULL, "item_key" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false, "done_by" TEXT, "done_at" TIMESTAMPTZ, "note" TEXT,
    "updatedAt" TIMESTAMPTZ DEFAULT NOW())`).catch(() => { });
    await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "CommissaryProduction_key" ON public."CommissaryProduction"("chain_id","order_date","item_key")`).catch(() => { });
    _chainCommReady = true;
}
// The chain the CURRENT tenant belongs to (via its ChainMember row) + the
// designated commissary slug. Null if this tenant isn't in a chain.
async function myChain() {
    await ensureChainCommissaryTables();
    const slug = currentTenantSlug();
    const rows = await prisma.$queryRawUnsafe(`SELECT m.chain_id, m.name AS branch_name, c.name AS chain_name, c.commissary_slug
     FROM public."ChainMember" m JOIN public."Chain" c ON c.id = m.chain_id WHERE m.slug = $1 LIMIT 1`, slug).catch(() => []);
    if (!rows.length)
        return null;
    return { chain_id: rows[0].chain_id, chain_name: rows[0].chain_name, branch_name: rows[0].branch_name || slug, commissary_slug: rows[0].commissary_slug || null };
}
// Commissary side: push the local active catalog to the shared chain catalog.
// The first tenant to publish claims the commissary role for the chain.
registerFn('publishCommissaryCatalog', async ({ user }) => {
    await requireBackOffice(user, 'publishCommissaryCatalog');
    await ensureCommissaryTables();
    const slug = currentTenantSlug();
    const chain = await myChain();
    if (!chain)
        throw new Error('not_in_chain');
    if (!chain.commissary_slug) {
        await prisma.$executeRawUnsafe(`UPDATE public."Chain" SET "commissary_slug"=$1 WHERE id=$2`, slug, chain.chain_id).catch(() => { });
    }
    else if (chain.commissary_slug !== slug) {
        throw new Error('not_commissary'); // another member is the commissary
    }
    const { catalog } = await buildCatalog();
    // Publish all ACTIVE items — even ones without a cost yet (owner prices them
    // later; they still appear on the prep list / are orderable).
    const active = catalog.filter((c) => c.active);
    const keys = [];
    for (const c of active) {
        const key = `${c.source}:${c.ref_id}`;
        keys.push(key);
        await prisma.$executeRawUnsafe(`INSERT INTO public."CommissaryCatalogItem"(id, chain_id, item_key, source, name, unit, department, cost_per_unit, markup_pct, internal_price, active, "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, true, NOW())
       ON CONFLICT (chain_id, item_key) DO UPDATE SET source=EXCLUDED.source, name=EXCLUDED.name, unit=EXCLUDED.unit, department=EXCLUDED.department, cost_per_unit=EXCLUDED.cost_per_unit, markup_pct=EXCLUDED.markup_pct, internal_price=EXCLUDED.internal_price, active=true, "updatedAt"=NOW()`, chain.chain_id, key, c.source, c.name, c.unit, c.department, c.cost_per_unit, c.markup_pct, c.internal_price).catch(() => { });
    }
    // Deactivate anything no longer in the active catalog.
    await prisma.$executeRawUnsafe(`UPDATE public."CommissaryCatalogItem" SET active=false WHERE chain_id=$1 AND ($2::text[] = '{}' OR NOT (item_key = ANY($2::text[])))`, chain.chain_id, keys).catch(() => { });
    return { ok: true, published: active.length, chain_name: chain.chain_name };
});
// Branch side: the published catalog for this branch's chain.
registerFn('getBranchCommissaryInfo', async ({ user }) => {
    await requireBackOffice(user, 'getBranchCommissaryInfo', 'BranchCommissary');
    const slug = currentTenantSlug();
    const chain = await myChain();
    if (!chain)
        return { in_chain: false };
    const catalog = await prisma.$queryRawUnsafe(`SELECT item_key, name, unit, department, internal_price FROM public."CommissaryCatalogItem"
     WHERE chain_id=$1 AND active=true ORDER BY department NULLS LAST, name`, chain.chain_id).catch(() => []);
    return { in_chain: true, chain_name: chain.chain_name, is_commissary: chain.commissary_slug === slug, slug, catalog };
});
// Branch side: this branch's order for a date.
registerFn('getMyBranchCommissaryOrder', async ({ user, body }) => {
    await requireBackOffice(user, 'getMyBranchCommissaryOrder', 'BranchCommissary');
    const slug = currentTenantSlug();
    const chain = await myChain();
    if (!chain)
        return { lines: [] };
    const date = String(body?.order_date || '').slice(0, 10);
    const orders = await prisma.$queryRawUnsafe(`SELECT id, notes FROM public."CommissaryChainOrder" WHERE chain_id=$1 AND branch_slug=$2 AND order_date=$3`, chain.chain_id, slug, date).catch(() => []);
    if (!orders.length)
        return { lines: [] };
    const lines = await prisma.$queryRawUnsafe(`SELECT item_key, qty FROM public."CommissaryChainOrderLine" WHERE order_id=$1`, orders[0].id).catch(() => []);
    return { order_id: orders[0].id, notes: orders[0].notes, lines };
});
// Branch side: submit/replace this branch's order (scoped to its own slug).
registerFn('submitBranchCommissaryOrder', async ({ user, body }) => {
    await requireBackOffice(user, 'submitBranchCommissaryOrder', 'BranchCommissary');
    const slug = currentTenantSlug();
    const chain = await myChain();
    if (!chain)
        throw new Error('not_in_chain');
    const b = (body || {});
    const date = String(b.order_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error('order_date (YYYY-MM-DD) required');
    const notes = b.notes ? String(b.notes).slice(0, 500) : null;
    const linesIn = Array.isArray(b.lines) ? b.lines : [];
    const cat = await prisma.$queryRawUnsafe(`SELECT item_key, name, unit, department, internal_price FROM public."CommissaryCatalogItem" WHERE chain_id=$1 AND active=true`, chain.chain_id).catch(() => []);
    const byKey = new Map(cat.map((c) => [c.item_key, c]));
    const existing = await prisma.$queryRawUnsafe(`SELECT id FROM public."CommissaryChainOrder" WHERE chain_id=$1 AND branch_slug=$2 AND order_date=$3`, chain.chain_id, slug, date).catch(() => []);
    let orderId;
    if (existing.length) {
        orderId = existing[0].id;
        await prisma.$executeRawUnsafe(`UPDATE public."CommissaryChainOrder" SET notes=$1, branch_name=$2, "updatedAt"=NOW() WHERE id=$3`, notes, chain.branch_name, orderId).catch(() => { });
        await prisma.$executeRawUnsafe(`DELETE FROM public."CommissaryChainOrderLine" WHERE order_id=$1`, orderId).catch(() => { });
    }
    else {
        const ins = await prisma.$queryRawUnsafe(`INSERT INTO public."CommissaryChainOrder"(id, chain_id, branch_slug, branch_name, order_date, notes)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5) RETURNING id`, chain.chain_id, slug, chain.branch_name, date, notes);
        orderId = ins[0].id;
    }
    let saved = 0;
    for (const ln of linesIn) {
        const key = String(ln.item_key || '');
        const qty = Number(ln.qty);
        if (!key || !Number.isFinite(qty) || qty <= 0)
            continue;
        const c = byKey.get(key);
        if (!c)
            continue;
        await prisma.$executeRawUnsafe(`INSERT INTO public."CommissaryChainOrderLine"(id, order_id, item_key, name, unit, department, qty, internal_price)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)`, orderId, key, c.name, c.unit, c.department, qty, c.internal_price).catch(() => { });
        saved++;
    }
    return { ok: true, order_id: orderId, lines_saved: saved };
});
// ── P5: analytics ─────────────────────────────────────────────────────────────
// Profitability of the commissary over a date range (local + chain orders), a
// per-restaurant summary (a period "internal invoice"), and pricing-health
// alerts computed from the CURRENT catalog (loss / thin-margin / no-cost items).
registerFn('getCommissaryAnalytics', async ({ user, body }) => {
    await requireBackOffice(user, 'getCommissaryAnalytics');
    await ensureCommissaryTables();
    const b = (body || {});
    const DAY = 86400000;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date_to)) ? String(b.date_to).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(b.date_from))
        ? String(b.date_from).slice(0, 10)
        : new Date(new Date(to + 'T00:00:00Z').getTime() - 29 * DAY).toISOString().slice(0, 10);
    // Live catalog → cost lookup for chain lines + the pricing-health alerts.
    const { catalog } = await buildCatalog();
    const costByKey = new Map();
    for (const c of catalog)
        costByKey.set(`${c.source}:${c.ref_id}`, c);
    // Local order lines in range.
    const local = await prisma.$queryRawUnsafe(`SELECT l.source, l.ref_id, l.name, l.unit, l.department, l.qty, l.cost_per_unit, l.internal_price,
            c.name AS customer_name
     FROM "CommissaryOrderLine" l JOIN "CommissaryOrder" o ON o.id=l.order_id
     LEFT JOIN "CommissaryCustomer" c ON c.id=o.customer_id
     WHERE o.order_date >= $1 AND o.order_date <= $2`, from, to).catch(() => []);
    // Chain (branch) order lines in range.
    const rowsAll = [...local];
    const chain = await myChain().catch(() => null);
    if (chain?.chain_id) {
        await ensureChainCommissaryTables();
        const cr = await prisma.$queryRawUnsafe(`SELECT l.item_key, l.name, l.unit, l.department, l.qty, l.internal_price, o.branch_name
       FROM public."CommissaryChainOrderLine" l JOIN public."CommissaryChainOrder" o ON o.id=l.order_id
       WHERE o.chain_id=$1 AND o.order_date >= $2 AND o.order_date <= $3`, chain.chain_id, from, to).catch(() => []);
        for (const l of cr) {
            const [source, ...rest] = String(l.item_key || '').split(':');
            const cat = costByKey.get(l.item_key);
            rowsAll.push({
                source, ref_id: rest.join(':'), name: l.name, unit: l.unit, department: l.department || null,
                qty: l.qty, cost_per_unit: cat ? cat.cost_per_unit : 0, internal_price: l.internal_price,
                customer_name: l.branch_name,
            });
        }
    }
    const byItem = new Map();
    const byDept = new Map();
    const byCustomer = new Map();
    let tCost = 0, tRev = 0;
    for (const l of rowsAll) {
        const qty = Number(l.qty) || 0;
        const cost = qty * (Number(l.cost_per_unit) || 0);
        const rev = qty * (Number(l.internal_price) || 0);
        tCost += cost;
        tRev += rev;
        const ik = `${l.source}:${l.ref_id}`;
        if (!byItem.has(ik))
            byItem.set(ik, { name: l.name, unit: l.unit, department: l.department || null, qty: 0, cost: 0, revenue: 0 });
        const it = byItem.get(ik);
        it.qty += qty;
        it.cost += cost;
        it.revenue += rev;
        const dk = l.department || 'ללא מחלקה';
        if (!byDept.has(dk))
            byDept.set(dk, { department: dk, cost: 0, revenue: 0 });
        const dt = byDept.get(dk);
        dt.cost += cost;
        dt.revenue += rev;
        const ck = l.customer_name || 'לא ידוע';
        if (!byCustomer.has(ck))
            byCustomer.set(ck, { customer_name: ck, cost: 0, revenue: 0, lines: 0 });
        const cu = byCustomer.get(ck);
        cu.cost += cost;
        cu.revenue += rev;
        cu.lines += 1;
    }
    const finItem = (x) => ({ ...x, qty: r2(x.qty), cost: r2(x.cost), revenue: r2(x.revenue), margin: r2(x.revenue - x.cost), margin_pct: marginPct(x.cost, x.revenue) });
    const items = [...byItem.values()].map(finItem);
    const by_item = [...items].sort((a, b) => b.margin - a.margin);
    const losers = [...items].filter((i) => i.revenue > 0 && i.margin <= 0).sort((a, b) => a.margin - b.margin);
    const by_department = [...byDept.values()].map((d) => ({ ...d, cost: r2(d.cost), revenue: r2(d.revenue), margin: r2(d.revenue - d.cost) })).sort((a, b) => b.revenue - a.revenue);
    const by_customer = [...byCustomer.values()].map((c) => ({ ...c, cost: r2(c.cost), revenue: r2(c.revenue), margin: r2(c.revenue - c.cost) })).sort((a, b) => b.revenue - a.revenue);
    // Pricing-health alerts from the current catalog.
    const alerts = [];
    for (const c of catalog) {
        if (!c.active)
            continue;
        if (!c.has_cost) {
            alerts.push({ name: c.name, department: c.department, issue: 'no_cost', cost_per_unit: c.cost_per_unit, internal_price: c.internal_price, margin_pct: null });
            continue;
        }
        if (c.internal_price <= c.cost_per_unit) {
            alerts.push({ name: c.name, department: c.department, issue: 'loss', cost_per_unit: c.cost_per_unit, internal_price: c.internal_price, margin_pct: c.margin_pct });
            continue;
        }
        if (c.margin_pct != null && c.margin_pct < 15) {
            alerts.push({ name: c.name, department: c.department, issue: 'thin', cost_per_unit: c.cost_per_unit, internal_price: c.internal_price, margin_pct: c.margin_pct });
        }
    }
    return {
        from, to,
        totals: { cost: r2(tCost), revenue: r2(tRev), margin: r2(tRev - tCost), margin_pct: marginPct(tCost, tRev), item_count: items.length, customer_count: by_customer.length },
        by_item, losers, by_department, by_customer, alerts,
    };
});
// ── P6: NETWORK-LEVEL commissary (lives INSIDE the chain HQ, not a branch) ─────
// The commissary belongs to the NETWORK. The network owner manages the catalog,
// sees every branch's orders, and runs production/cost from the Machane-Yehuda
// dashboard. Branches (incl. the flagship) only ORDER via BranchCommissary.
// All data is public + chain-scoped; gated to the chain owner / platform owner.
async function assertChainOwner(user, chainId) {
    const email = String(user?.email || '').toLowerCase();
    if (!email)
        throw new Error('unauthorized');
    const plat = String(process.env.PLATFORM_OWNER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (plat.includes(email))
        return;
    const rows = await prisma.$queryRawUnsafe(`SELECT owner_email FROM public."Chain" WHERE id=$1`, chainId).catch(() => []);
    if (rows[0]?.owner_email && String(rows[0].owner_email).toLowerCase() === email)
        return;
    throw new Error('forbidden');
}
// The whole commissary view for a chain: catalog (with cost + margin), the
// branches, and the distribution for a date (what to make + per-branch invoice).
registerFn('getChainCommissary', async ({ user, body }) => {
    const chainId = String(body?.chain_id || '');
    if (!chainId)
        throw new Error('chain_id required');
    await assertChainOwner(user, chainId);
    await ensureChainCommissaryTables();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.order_date)) ? String(body.order_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    const chainRow = await prisma.$queryRawUnsafe(`SELECT name, commissary_slug FROM public."Chain" WHERE id=$1`, chainId).catch(() => []);
    const members = await prisma.$queryRawUnsafe(`SELECT slug, name FROM public."ChainMember" WHERE chain_id=$1 ORDER BY name`, chainId).catch(() => []);
    const catRows = await prisma.$queryRawUnsafe(`SELECT item_key, source, name, unit, department, cost_per_unit, markup_pct, internal_price, active
     FROM public."CommissaryCatalogItem" WHERE chain_id=$1 ORDER BY department NULLS LAST, name`, chainId).catch(() => []);
    const catalog = catRows.map((c) => ({
        ...c, cost_per_unit: r2(c.cost_per_unit), internal_price: r2(c.internal_price),
        margin: r2((Number(c.internal_price) || 0) - (Number(c.cost_per_unit) || 0)),
        margin_pct: marginPct(Number(c.cost_per_unit) || 0, Number(c.internal_price) || 0),
    }));
    const costByKey = new Map(catalog.map((c) => [c.item_key, c]));
    // Distribution for the date, from public chain orders.
    const lineRows = await prisma.$queryRawUnsafe(`SELECT l.item_key, l.name, l.unit, l.department, l.qty, l.internal_price, o.branch_slug, o.branch_name
     FROM public."CommissaryChainOrderLine" l JOIN public."CommissaryChainOrder" o ON o.id=l.order_id
     WHERE o.chain_id=$1 AND o.order_date=$2`, chainId, date).catch(() => []);
    const items = new Map();
    const byBranch = new Map();
    let gCost = 0, gRev = 0;
    for (const l of lineRows) {
        const qty = Number(l.qty) || 0;
        const cat = costByKey.get(l.item_key);
        const cost = qty * (cat ? Number(cat.cost_per_unit) || 0 : 0);
        const rev = qty * (Number(l.internal_price) || 0);
        gCost += cost;
        gRev += rev;
        if (!items.has(l.item_key))
            items.set(l.item_key, { item_key: l.item_key, name: l.name, unit: l.unit, department: l.department || null, total_qty: 0, total_cost: 0, total_price: 0, per_branch: [] });
        const it = items.get(l.item_key);
        it.total_qty += qty;
        it.total_cost += cost;
        it.total_price += rev;
        it.per_branch.push({ branch: l.branch_name || l.branch_slug, qty });
        const bk = l.branch_slug || 'unknown';
        if (!byBranch.has(bk))
            byBranch.set(bk, { branch_slug: bk, branch_name: l.branch_name || bk, total_ils: 0, cost_ils: 0, lines: 0 });
        const bx = byBranch.get(bk);
        bx.total_ils += rev;
        bx.cost_ils += cost;
        bx.lines += 1;
    }
    // Live production status (which preps are already made) → the shared board.
    const prodStatus = await prisma.$queryRawUnsafe(`SELECT item_key, done, done_by, done_at FROM public."CommissaryProduction" WHERE chain_id=$1 AND order_date=$2`, chainId, date).catch(() => []);
    const statusByKey = new Map(prodStatus.map((s) => [s.item_key, s]));
    const production = [...items.values()].map((it) => {
        const st = statusByKey.get(it.item_key);
        return {
            ...it, total_qty: r2(it.total_qty), total_cost: r2(it.total_cost), total_price: r2(it.total_price), margin: r2(it.total_price - it.total_cost),
            done: !!st?.done, done_by: st?.done_by || null, done_at: st?.done_at || null,
        };
    }).sort((a, b) => (a.department || '').localeCompare(b.department || '') || b.total_price - a.total_price);
    const invoices = [...byBranch.values()].map((bx) => ({ ...bx, total_ils: r2(bx.total_ils), cost_ils: r2(bx.cost_ils), margin_ils: r2(bx.total_ils - bx.cost_ils) })).sort((a, b) => b.total_ils - a.total_ils);
    const doneCount = production.filter((p) => p.done).length;
    return {
        chain_id: chainId, chain_name: chainRow[0]?.name || '', commissary_slug: chainRow[0]?.commissary_slug || null,
        order_date: date, members, catalog,
        distribution: {
            production, invoices,
            totals: { cost: r2(gCost), revenue: r2(gRev), margin: r2(gRev - gCost), item_count: production.length, branch_count: invoices.length, done_count: doneCount },
        },
    };
});
// Mark a prep DONE / not-done on the live commissary board (like a prep sheet).
registerFn('markCommissaryProduction', async ({ user, body }) => {
    const b = (body || {});
    const chainId = String(b.chain_id || '');
    const date = String(b.order_date || '').slice(0, 10);
    const itemKey = String(b.item_key || '');
    if (!chainId || !itemKey || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error('chain_id + order_date + item_key required');
    await assertChainOwner(user, chainId);
    await ensureChainCommissaryTables();
    const done = !!b.done;
    const who = String(user?.full_name || user?.email || '').slice(0, 120) || null;
    const note = b.note !== undefined ? (b.note ? String(b.note).slice(0, 300) : null) : undefined;
    const ex = await prisma.$queryRawUnsafe(`SELECT id FROM public."CommissaryProduction" WHERE chain_id=$1 AND order_date=$2 AND item_key=$3`, chainId, date, itemKey).catch(() => []);
    if (ex.length) {
        await prisma.$executeRawUnsafe(`UPDATE public."CommissaryProduction" SET done=$1, done_by=CASE WHEN $1 THEN $2 ELSE NULL END, done_at=CASE WHEN $1 THEN NOW() ELSE NULL END${note !== undefined ? ', note=$5' : ''}, "updatedAt"=NOW() WHERE id=$4`, ...(note !== undefined ? [done, who, ex[0].id, note] : [done, who, ex[0].id])).catch(() => { });
    }
    else {
        await prisma.$executeRawUnsafe(`INSERT INTO public."CommissaryProduction"(id, chain_id, order_date, item_key, done, done_by, done_at, note) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, CASE WHEN $4 THEN $5 ELSE NULL END, CASE WHEN $4 THEN NOW() ELSE NULL END, $6)`, chainId, date, itemKey, done, who, note ?? null).catch(() => { });
    }
    return { ok: true };
});
// New production day — clear the done marks for a date.
registerFn('resetCommissaryProduction', async ({ user, body }) => {
    const b = (body || {});
    const chainId = String(b.chain_id || '');
    const date = String(b.order_date || '').slice(0, 10);
    if (!chainId || !/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error('chain_id + order_date required');
    await assertChainOwner(user, chainId);
    await ensureChainCommissaryTables();
    await prisma.$executeRawUnsafe(`DELETE FROM public."CommissaryProduction" WHERE chain_id=$1 AND order_date=$2`, chainId, date).catch(() => { });
    return { ok: true };
});
// Network owner adjusts a catalog item's pricing / department / active.
registerFn('setChainCommissaryItemPricing', async ({ user, body }) => {
    const b = (body || {});
    const chainId = String(b.chain_id || '');
    const itemKey = String(b.item_key || '');
    if (!chainId || !itemKey)
        throw new Error('chain_id + item_key required');
    await assertChainOwner(user, chainId);
    await ensureChainCommissaryTables();
    const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
    const rows = await prisma.$queryRawUnsafe(`SELECT cost_per_unit FROM public."CommissaryCatalogItem" WHERE chain_id=$1 AND item_key=$2`, chainId, itemKey).catch(() => []);
    if (!rows.length)
        throw new Error('item_not_found');
    const cost = Number(rows[0].cost_per_unit) || 0;
    const override = num(b.price_override);
    const markup = num(b.markup_pct);
    const price = override != null && override > 0 ? override : r2(cost * (1 + (markup != null ? markup : 30) / 100));
    const active = b.active === undefined ? true : !!b.active;
    const dept = b.department !== undefined ? (b.department ? String(b.department).slice(0, 80) : null) : undefined;
    await prisma.$executeRawUnsafe(`UPDATE public."CommissaryCatalogItem" SET markup_pct=$1, internal_price=$2, active=$3${dept !== undefined ? ', department=$5' : ''}, "updatedAt"=NOW() WHERE chain_id=$4 AND item_key=$6`, ...(dept !== undefined ? [markup, price, active, chainId, dept, itemKey] : [markup, price, active, chainId, itemKey])).catch(() => { });
    return { ok: true, internal_price: price };
});
// Network owner creates/replaces a branch's order (on the branch's behalf).
registerFn('saveChainCommissaryOrder', async ({ user, body }) => {
    const b = (body || {});
    const chainId = String(b.chain_id || '');
    const branchSlug = String(b.branch_slug || '');
    const date = String(b.order_date || '').slice(0, 10);
    if (!chainId || !branchSlug)
        throw new Error('chain_id + branch_slug required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        throw new Error('order_date (YYYY-MM-DD) required');
    await assertChainOwner(user, chainId);
    await ensureChainCommissaryTables();
    const mem = await prisma.$queryRawUnsafe(`SELECT name FROM public."ChainMember" WHERE chain_id=$1 AND slug=$2`, chainId, branchSlug).catch(() => []);
    const branchName = mem[0]?.name || branchSlug;
    const cat = await prisma.$queryRawUnsafe(`SELECT item_key, name, unit, department, internal_price FROM public."CommissaryCatalogItem" WHERE chain_id=$1 AND active=true`, chainId).catch(() => []);
    const byKey = new Map(cat.map((c) => [c.item_key, c]));
    const linesIn = Array.isArray(b.lines) ? b.lines : [];
    const existing = await prisma.$queryRawUnsafe(`SELECT id FROM public."CommissaryChainOrder" WHERE chain_id=$1 AND branch_slug=$2 AND order_date=$3`, chainId, branchSlug, date).catch(() => []);
    let orderId;
    if (existing.length) {
        orderId = existing[0].id;
        await prisma.$executeRawUnsafe(`DELETE FROM public."CommissaryChainOrderLine" WHERE order_id=$1`, orderId).catch(() => { });
        await prisma.$executeRawUnsafe(`UPDATE public."CommissaryChainOrder" SET branch_name=$1, "updatedAt"=NOW() WHERE id=$2`, branchName, orderId).catch(() => { });
    }
    else {
        const ins = await prisma.$queryRawUnsafe(`INSERT INTO public."CommissaryChainOrder"(id, chain_id, branch_slug, branch_name, order_date) VALUES (gen_random_uuid()::text, $1, $2, $3, $4) RETURNING id`, chainId, branchSlug, branchName, date);
        orderId = ins[0].id;
    }
    let saved = 0;
    for (const ln of linesIn) {
        const key = String(ln.item_key || '');
        const qty = Number(ln.qty);
        if (!key || !Number.isFinite(qty) || qty <= 0)
            continue;
        const c = byKey.get(key);
        if (!c)
            continue;
        await prisma.$executeRawUnsafe(`INSERT INTO public."CommissaryChainOrderLine"(id, order_id, item_key, name, unit, department, qty, internal_price) VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)`, orderId, key, c.name, c.unit, c.department, qty, c.internal_price).catch(() => { });
        saved++;
    }
    return { ok: true, order_id: orderId, lines_saved: saved };
});
// ── Deeper flow: what to BUY from suppliers + raw cost + profit%, and "ready" ──
// Explode a PREP recipe into raw ingredient quantities (recursively; nested preps
// scale by yield). Reads the commissary tenant's own Recipe/Ingredient tables.
function explodeRecipe(recipeId, units, recipeById, riByRecipe, acc, depth = 0) {
    if (depth > 8)
        return;
    const recipe = recipeById.get(recipeId);
    if (!recipe)
        return;
    const y = Number(recipe.yield_qty) > 0 ? Number(recipe.yield_qty) : 1;
    const batches = units / y;
    for (const ri of (riByRecipe.get(recipeId) || [])) {
        const need = batches * (Number(ri.qty) || 0);
        if (ri.ingredient_id)
            acc.set(ri.ingredient_id, (acc.get(ri.ingredient_id) || 0) + need);
        else if (ri.prep_recipe_id)
            explodeRecipe(ri.prep_recipe_id, need, recipeById, riByRecipe, acc, depth + 1);
    }
}
// What the commissary must BUY to fulfil a date's orders: raw materials derived
// from the product tree of every ordered prep, grouped by supplier, + the raw
// cost and a profit-% suggestion (covers labor / fixed / variable).
registerFn('getChainCommissaryPurchasing', async ({ user, body }) => {
    const chainId = String(body?.chain_id || '');
    if (!chainId)
        throw new Error('chain_id required');
    await assertChainOwner(user, chainId);
    await ensureChainCommissaryTables();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.order_date)) ? String(body.order_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
    // The date's ordered preps (from public chain orders).
    const lines = await prisma.$queryRawUnsafe(`SELECT l.item_key, SUM(l.qty) AS qty FROM public."CommissaryChainOrderLine" l JOIN public."CommissaryChainOrder" o ON o.id=l.order_id
     WHERE o.chain_id=$1 AND o.order_date=$2 GROUP BY l.item_key`, chainId, date).catch(() => []);
    // The commissary's recipe tree (its own schema).
    const recipes = await prisma.$queryRawUnsafe(`SELECT id, yield_qty FROM "Recipe"`).catch(() => []);
    const ris = await prisma.$queryRawUnsafe(`SELECT recipe_id, ingredient_id, prep_recipe_id, qty FROM "RecipeIngredient"`).catch(() => []);
    const ings = await prisma.$queryRawUnsafe(`SELECT id, name, unit, price_per_unit, waste_percent, supplier_name FROM "Ingredient"`).catch(() => []);
    const recipeById = new Map(recipes.map((r) => [r.id, r]));
    const riByRecipe = new Map();
    for (const ri of ris) {
        const a = riByRecipe.get(ri.recipe_id) || [];
        a.push(ri);
        riByRecipe.set(ri.recipe_id, a);
    }
    const ingById = new Map(ings.map((i) => [i.id, i]));
    const acc = new Map();
    let unpricedPreps = 0;
    for (const ln of lines) {
        const [src, ...rest] = String(ln.item_key || '').split(':');
        const refId = rest.join(':');
        const qty = Number(ln.qty) || 0;
        if (src === 'prep') {
            if (recipeById.has(refId))
                explodeRecipe(refId, qty, recipeById, riByRecipe, acc, 0);
            else
                unpricedPreps++;
        }
        else if (src === 'raw') {
            acc.set(refId, (acc.get(refId) || 0) + qty); // sold as-is → buy directly
        }
    }
    // Group raw needs by supplier.
    const bySupplier = new Map();
    let rawCost = 0;
    for (const [ingId, qty] of acc) {
        const ing = ingById.get(ingId);
        if (!ing)
            continue;
        const waste = Number(ing.waste_percent) > 0 && Number(ing.waste_percent) < 1 ? Number(ing.waste_percent) : 0;
        const buyQty = qty / (1 - waste); // account for waste
        const price = Number(ing.price_per_unit);
        const cost = Number.isFinite(price) && price > 0 ? buyQty * price : 0;
        rawCost += cost;
        const sup = ing.supplier_name || 'ללא ספק';
        if (!bySupplier.has(sup))
            bySupplier.set(sup, { supplier: sup, items: [], subtotal: 0 });
        const s = bySupplier.get(sup);
        s.items.push({ name: ing.name, qty: r2(buyQty), unit: ing.unit || 'kg', price: Number.isFinite(price) ? r2(price) : null, cost: r2(cost), no_price: !(Number.isFinite(price) && price > 0) });
        s.subtotal += cost;
    }
    const suppliers = [...bySupplier.values()].map((s) => ({ ...s, subtotal: r2(s.subtotal), items: s.items.sort((a, b) => b.cost - a.cost) })).sort((a, b) => b.subtotal - a.subtotal);
    const chainRow = await prisma.$queryRawUnsafe(`SELECT commissary_profit_pct FROM public."Chain" WHERE id=$1`, chainId).catch(() => []);
    const profitPct = chainRow[0]?.commissary_profit_pct != null ? Number(chainRow[0].commissary_profit_pct) : 30;
    return {
        chain_id: chainId, order_date: date, suppliers,
        raw_cost_total: r2(rawCost), profit_pct: profitPct,
        suggested_total: r2(rawCost * (1 + profitPct / 100)),
        ingredient_count: acc.size, unpriced_preps: unpricedPreps,
    };
});
// Owner sets the network profit % (labor / fixed / variable coverage).
registerFn('setChainCommissaryProfit', async ({ user, body }) => {
    const chainId = String(body?.chain_id || '');
    if (!chainId)
        throw new Error('chain_id required');
    await assertChainOwner(user, chainId);
    await ensureChainCommissaryTables();
    const m = Number(body?.profit_pct);
    const pct = Number.isFinite(m) && m >= 0 ? m : 30;
    await prisma.$executeRawUnsafe(`UPDATE public."Chain" SET commissary_profit_pct=$1 WHERE id=$2`, pct, chainId).catch(() => { });
    return { ok: true, profit_pct: pct };
});
// "Order ready for pickup" — WhatsApp the branch owner. Manual (owner clicks it).
registerFn('notifyBranchOrderReady', async ({ user, body }) => {
    const b = (body || {});
    const chainId = String(b.chain_id || '');
    const branchSlug = String(b.branch_slug || '');
    if (!chainId || !branchSlug)
        throw new Error('chain_id + branch_slug required');
    await assertChainOwner(user, chainId);
    await ensureChainCommissaryTables();
    const date = String(b.order_date || '').slice(0, 10);
    const tr = await prisma.$queryRawUnsafe(`SELECT owner_phone, restaurant_name FROM public."Tenant" WHERE slug=$1 LIMIT 1`, branchSlug).catch(() => []);
    const phone = tr[0]?.owner_phone;
    if (!phone)
        return { ok: false, error: 'no_phone', message: 'לסניף אין מספר טלפון מוגדר.' };
    const chainRow = await prisma.$queryRawUnsafe(`SELECT name FROM public."Chain" WHERE id=$1`, chainId).catch(() => []);
    const msg = `🏭 *בית הכנות ${chainRow[0]?.name || ''}*\nההזמנה שלכם${date ? ` ל-${date}` : ''} *מוכנה לאיסוף* ✅`;
    try {
        await sendWhatsApp(phone, msg);
        return { ok: true, sent_to: phone };
    }
    catch (e) {
        return { ok: false, error: String(e?.message || e).slice(0, 120) };
    }
});
//# sourceMappingURL=commissary.js.map