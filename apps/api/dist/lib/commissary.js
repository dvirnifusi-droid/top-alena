// Central-commissary ("בית הכנות") pricing math — pure & unit-tested. The
// commissary turns raw materials into PREPs (reusing the Recipe/Ingredient BOM
// engine) and "sells" them to its member restaurants at an internal transfer
// price = cost + markup. Keep this pure so the formula is testable and shared
// by every caller (catalog, distribution, internal invoice).
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
// Cost to produce ONE unit (kg / portion) of a PREP recipe: the recipe's total
// cost spread over its batch yield. yield_qty <= 0 is treated as a batch of 1.
export function prepCostPerUnit(recipe) {
    const total = Number(recipe?.total_cost);
    if (!Number.isFinite(total) || total <= 0)
        return 0;
    const yq = Number(recipe?.yield_qty);
    const y = Number.isFinite(yq) && yq > 0 ? yq : 1;
    return total / y;
}
// Cost per unit of a raw ingredient SOLD AS-IS (vegetables, meat — no prep),
// waste-adjusted the same way recipe costing does (qty × price / (1 - waste)).
export function rawCostPerUnit(ing) {
    const p = Number(ing?.price_per_unit);
    if (!Number.isFinite(p) || p <= 0)
        return 0;
    const w = Number(ing?.waste_percent);
    const waste = Number.isFinite(w) && w > 0 && w < 1 ? w : 0;
    return p / (1 - waste);
}
// The internal price the commissary charges a restaurant per unit. A manual
// price_override always wins; otherwise cost × (1 + markup%). Never negative.
export function internalPrice(costPerUnit, markupPct, override) {
    const ov = Number(override);
    if (Number.isFinite(ov) && ov > 0)
        return round2(ov);
    const c = Number(costPerUnit) || 0;
    const m = Number.isFinite(Number(markupPct)) ? Number(markupPct) : 0;
    return round2(c * (1 + m / 100));
}
// Margin the commissary makes, as a % of the internal price. null when there's
// no price to divide by.
export function marginPct(cost, price) {
    const c = Number(cost) || 0;
    const p = Number(price) || 0;
    if (p <= 0)
        return null;
    return Math.round(((p - c) / p) * 1000) / 10;
}
// Effective markup for one catalog item: its own markup if set, else the
// commissary default.
export function effectiveMarkup(itemMarkup, defaultMarkup) {
    return itemMarkup != null && Number.isFinite(Number(itemMarkup)) ? Number(itemMarkup) : Number(defaultMarkup) || 0;
}
//# sourceMappingURL=commissary.js.map