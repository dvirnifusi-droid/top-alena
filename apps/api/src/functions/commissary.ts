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

let _commissaryReady = false;
async function ensureCommissaryTables(): Promise<void> {
  if (_commissaryReady) return;
  const sql = (prisma as any).$executeRawUnsafe.bind(prisma);
  // Single-row config (default markup applied to items with no explicit markup).
  await sql(`CREATE TABLE IF NOT EXISTS "CommissaryConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "default_markup_pct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
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
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "CommissaryItem_recipe_key" ON "CommissaryItem"("recipe_id") WHERE "recipe_id" IS NOT NULL`);
  await sql(`CREATE UNIQUE INDEX IF NOT EXISTS "CommissaryItem_ingredient_key" ON "CommissaryItem"("ingredient_id") WHERE "ingredient_id" IS NOT NULL`);
  _commissaryReady = true;
}

async function defaultMarkup(): Promise<number> {
  const rows: any[] = await (prisma as any)
    .$queryRawUnsafe(`SELECT default_markup_pct FROM "CommissaryConfig" WHERE id='default'`).catch(() => []);
  return rows.length ? Number(rows[0].default_markup_pct) : 30;
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// The commissary catalog: every PREP recipe (auto-listed so the owner can price
// them) + every raw ingredient explicitly added as sold-as-is. Each row carries
// cost/unit (from the BOM engine), the effective markup, the internal price the
// restaurants pay, and the commissary's margin.
registerFn('getCommissaryCatalog', async ({ user }) => {
  await requireBackOffice(user, 'getCommissaryCatalog');
  await ensureCommissaryTables();
  const defMarkup = await defaultMarkup();

  const preps: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, name, total_cost, yield_qty, yield_unit, category
     FROM "Recipe" WHERE kind='PREP' ORDER BY category NULLS LAST, name`,
  ).catch(() => []);
  const items: any[] = await (prisma as any).$queryRawUnsafe(`SELECT * FROM "CommissaryItem"`).catch(() => []);
  const byRecipe = new Map(items.filter((i) => i.recipe_id).map((i) => [i.recipe_id, i]));
  const rawItems = items.filter((i) => i.ingredient_id);
  const ingIds = rawItems.map((i) => i.ingredient_id);
  const ings: any[] = ingIds.length
    ? await (prisma as any).$queryRawUnsafe(
        `SELECT id, name, price_per_unit, waste_percent, unit, category, supplier_name FROM "Ingredient" WHERE id = ANY($1::text[])`,
        ingIds,
      ).catch(() => [])
    : [];
  const ingById = new Map(ings.map((i) => [i.id, i]));

  const catalog: any[] = [];
  for (const p of preps) {
    const it = byRecipe.get(p.id);
    const cost = prepCostPerUnit(p);
    const markup = effectiveMarkup(it?.markup_pct, defMarkup);
    const price = internalPrice(cost, markup, it?.price_override);
    catalog.push({
      item_id: it?.id || null, source: 'prep', ref_id: p.id, name: p.name,
      category: p.category || null, unit: p.yield_unit || 'unit',
      cost_per_unit: r2(cost), markup_pct: markup, price_override: it?.price_override ?? null,
      internal_price: price, margin_per_unit: r2(price - cost), margin_pct: marginPct(cost, price),
      in_catalog: !!(it && it.active), active: it ? !!it.active : false, has_cost: cost > 0,
    });
  }
  for (const it of rawItems) {
    const ing = ingById.get(it.ingredient_id);
    if (!ing) continue;
    const cost = rawCostPerUnit(ing);
    const markup = effectiveMarkup(it.markup_pct, defMarkup);
    const price = internalPrice(cost, markup, it.price_override);
    catalog.push({
      item_id: it.id, source: 'raw', ref_id: ing.id, name: ing.name,
      category: ing.category || null, unit: ing.unit || 'kg',
      cost_per_unit: r2(cost), markup_pct: markup, price_override: it.price_override ?? null,
      internal_price: price, margin_per_unit: r2(price - cost), margin_pct: marginPct(cost, price),
      in_catalog: !!it.active, active: !!it.active, has_cost: cost > 0,
    });
  }
  return { catalog, default_markup_pct: defMarkup, prep_count: preps.length, sold_as_is_count: rawItems.length };
});

// Upsert a catalog item's pricing (markup / override / active). Keyed by the
// referenced recipe OR ingredient, so calling twice edits the same row.
registerFn('setCommissaryItem', async ({ user, body }) => {
  await requireBackOffice(user, 'setCommissaryItem');
  await ensureCommissaryTables();
  const b = (body || {}) as any;
  const recipeId = b.recipe_id ? String(b.recipe_id) : null;
  const ingredientId = b.ingredient_id ? String(b.ingredient_id) : null;
  if (!recipeId && !ingredientId) throw new Error('recipe_id or ingredient_id required');
  if (recipeId && ingredientId) throw new Error('only one of recipe_id / ingredient_id');
  const num = (v: any) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const markup = num(b.markup_pct);
  const override = num(b.price_override);
  if ((markup != null && markup < 0) || (override != null && override < 0)) throw new Error('invalid_amount');
  const active = b.active === undefined ? true : !!b.active;
  const notes = b.notes ? String(b.notes).slice(0, 300) : null;
  const col = recipeId ? 'recipe_id' : 'ingredient_id';
  const val = recipeId || ingredientId;
  const existing: any[] = await (prisma as any).$queryRawUnsafe(`SELECT id FROM "CommissaryItem" WHERE ${col}=$1`, val).catch(() => []);
  if (existing.length) {
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "CommissaryItem" SET markup_pct=$1, price_override=$2, active=$3, notes=$4, "updatedAt"=NOW() WHERE id=$5`,
      markup, override, active, notes, existing[0].id,
    );
    return { ok: true, id: existing[0].id };
  }
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "CommissaryItem"(id, ${col}, markup_pct, price_override, active, notes)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)`,
    val, markup, override, active, notes,
  );
  return { ok: true };
});

// Remove a sold-as-is / pricing row entirely (a PREP just reverts to the default
// markup and drops out of the active catalog).
registerFn('removeCommissaryItem', async ({ user, body }) => {
  await requireBackOffice(user, 'removeCommissaryItem');
  await ensureCommissaryTables();
  const id = String((body as any)?.item_id || '');
  if (!id) throw new Error('item_id required');
  await (prisma as any).$executeRawUnsafe(`DELETE FROM "CommissaryItem" WHERE id=$1`, id);
  return { ok: true };
});

// Default markup applied to any item without its own markup.
registerFn('setCommissaryConfig', async ({ user, body }) => {
  await requireBackOffice(user, 'setCommissaryConfig');
  await ensureCommissaryTables();
  const m = Number((body as any)?.default_markup_pct);
  const markup = Number.isFinite(m) && m >= 0 ? m : 30;
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "CommissaryConfig"(id, default_markup_pct, "updatedAt") VALUES ('default', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET default_markup_pct=EXCLUDED.default_markup_pct, "updatedAt"=NOW()`,
    markup,
  );
  return { ok: true, default_markup_pct: markup };
});

// Ingredients the owner can add to the catalog as sold-as-is (raw) items.
registerFn('listCommissaryIngredients', async ({ user }) => {
  await requireBackOffice(user, 'listCommissaryIngredients');
  await ensureCommissaryTables();
  const ings: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, name, price_per_unit, unit, category FROM "Ingredient" ORDER BY category NULLS LAST, name`,
  ).catch(() => []);
  return { ingredients: ings };
});
