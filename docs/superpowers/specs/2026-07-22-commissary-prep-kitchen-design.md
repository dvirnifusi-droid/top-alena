# בית הכנות (Central Commissary) — Design

**Date:** 2026-07-22 · **For:** the "מחנה יהודה" chain model · **Owner:** Dvir

## The business model (Machane Yehuda)

A chain = several restaurants (each its own brand/name) served by ONE central
prep kitchen ("בית הכנות" / commissary). The commissary:

1. Orders all the goods → **all invoices arrive at the commissary**.
2. Turns raw materials into **preps** (הכנות) via recipes.
3. **"Sells" preps to its member restaurants** with an internal markup.

Owner's asks, mapped to the build:
- Invoices → **inventory** with cost per unit. *(exists — C.1 + invoice→ingredient)*
- Compose a **prep from a recipe** (BOM) → computed cost. *(exists — Recipe kind=PREP)*
- Some products have **no prep** (vegetables, meat) → sold as-is with a price. *(new: sold-as-is catalog)*
- **Product tree per prep**: what it costs us + what we charge restaurants. *(new: internal pricing)*
- Chef sends a **prep list** → per-restaurant needs + cost + internal price → internal invoice. *(new: orders + distribution)*
- Chef sends a **recipe** (WhatsApp / photo) → detected preps + quantities + priced. *(new: AI recipe ingestion)*

## What ALREADY exists (reuse — do NOT rebuild)

- **BOM/recipe engine** (per-tenant): `Ingredient` (raw + `price_per_unit` + `waste_percent`), `Recipe` (`kind` = `PREP`|`DISH`, `total_cost`, `yield_qty`/`yield_unit`, `sale_price`, `food_cost_percent`), `RecipeIngredient` (BOM line: raw `ingredient_id` OR nested `prep_recipe_id`, `qty`, `unit`). Cost via `computeRecipeCost` (`load.ts:13528`): raw = `qty×price/(1-waste)`; nested prep = `qty×(prep.total_cost/prep.yield_qty)`. Fns: `listRecipes`/`getRecipe`/`addRecipeIngredient`/`recomputeAllRecipeCosts`/… Page: `Recipes.jsx`.
- **Invoice→ingredient price bridge (C.1)**: `getIngredientPriceUpdates`/`applyIngredientPriceUpdate` (`load.ts:14000`). Invoice→inventory: `emailInvoiceApprove` sets `Inventory.cost_per_unit`, learns `ProductAlias`.
- **AI scanner**: `aiScanner.ts` (menu/checklist/employees/suppliers/order_list). Classifies `recipe` but has **no recipe parse spec** yet → gap to fill. WhatsApp media: `whatsappScan.ts` + `twilioWebhook.ts`.
- **Chain infra** (`public` schema): `Chain`/`ChainMember`/`NetworkTask`/`NetworkTaskBranch`. Cross-tenant: `branchKpis` reads `tenant_<slug>` schema from the platform container; branch containers read/write `public.NetworkTaskBranch` scoped to their own slug. **This is the transport for commissary orders.**

## Architecture decision

**The commissary is an existing tenant** (the chain-HQ tenant) that already has
the per-tenant Recipe/Ingredient engine — no new tenant provisioning. We add a
"בית הכנות" layer on top:

- **Catalog & pricing** live in the commissary tenant's OWN schema (reuse the recipe engine; add an isolated `CommissaryItem` pricing table — NEVER alter the `Recipe`/`Ingredient` prisma models; follow the isolated-table + guarded pattern, additive SQL only).
- **Restaurant prep orders** flow through the `public` schema shared tables (new: `CommissaryOrder` / `CommissaryOrderLine`), exactly like `NetworkTaskBranch`: a branch container writes rows scoped to its own slug; the commissary reads all rows for its chain. For v1, restaurants that are not yet tenants are just named `CommissaryCustomer` rows in the commissary schema.
- **Internal invoice** = generated on read from an order's lines (qty × internal price), no new billing engine.

## Phases (each ships + deploys independently)

- **P1 — Catalog & internal pricing.** `CommissaryItem` (recipe_id? | ingredient_id?, markup_pct, price_override, active). `getCommissaryCatalog` (preps + sold-as-is ingredients, each with cost/unit, internal price, margin), `setCommissaryItem`, `getCommissarySummary`. Page `/Commissary` ("🏭 בית הכנות"): editable catalog table.
- **P2 — Restaurant orders + distribution + internal invoice.** `CommissaryCustomer`; `CommissaryOrder`/`CommissaryOrderLine`. Chef/manager builds a per-restaurant prep order → distribution view (total preps to make + per-restaurant cost + internal price) → internal invoice per restaurant.
- **P3 — AI recipe ingestion.** Add a `recipe` parse spec to `aiScanner.ts` (ingredients + quantities), match to existing `Ingredient` via alias/fuzzy, create `Recipe`(PREP/DISH) + `RecipeIngredient`, auto-price. Wire WhatsApp + Scanner page.
- **P4 — Chain wiring (cross-tenant ordering).** Member-tenant restaurants place orders through `public` shared tables so the commissary aggregates real branches; notify via `notifyBranchesOfTask` pattern.
- **P5 — Analytics & extras.** Commissary profitability (margin per prep, totals), margin-erosion alert (reuse C.1 price deltas), yield/batch cost-per-portion, monthly internal invoice per restaurant.

## Decisions (owner said "run on everything, we'll fix at the end")

- Internal price = `price_override` if set, else `cost_per_unit × (1 + markup_pct)`. Default markup configurable per commissary.
- Sold-as-is items = `Ingredient` flagged into the catalog (no recipe), priced the same way off `price_per_unit`.
- No `Recipe`/`Ingredient` schema changes — all new state in isolated additive tables.
- Prod DB rule: additive `ALTER TABLE … ADD COLUMN/CREATE TABLE IF NOT EXISTS` only; `prisma db push` forbidden. Verify the deployed container after every push (grep the running bundle).

## Testing

Pure cost/price math is unit-testable (extend `laborCost.ts`-style lib for the internal-price formula). Each phase verified live against the commissary tenant (Machane Yehuda = alena + juiceph today) via the deployed container.
