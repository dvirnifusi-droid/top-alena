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
    const rows = await prisma.$queryRawUnsafe(`SELECT l.source, l.ref_id, l.name, l.unit, l.department, l.qty, l.cost_per_unit, l.internal_price,
            o.customer_id, c.name AS customer_name
     FROM "CommissaryOrderLine" l
     JOIN "CommissaryOrder" o ON o.id = l.order_id
     LEFT JOIN "CommissaryCustomer" c ON c.id = o.customer_id
     WHERE o.order_date = $1`, date).catch(() => []);
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
//# sourceMappingURL=commissary.js.map