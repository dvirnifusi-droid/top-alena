// Runtime lookup of the tenant's display name for templating into strings
// that used to hardcode 'עלינא'. Every prompt / email / WhatsApp template
// that references the restaurant by name should call getBrandName() at
// request time so tenant containers greet their own customers.
//
// Order of preference:
//   1. tenant-local RestaurantProfile.restaurant_name (owner-editable)
//   2. platform Tenant.restaurant_name (seeded at signup)
//   3. legacy hardcode 'עלינא' — only for the platform origin (slug='alena')
//   4. generic 'המסעדה' — safe fallback for anything else
//
// Cached per-process for 60s to avoid a Postgres round-trip on every
// template render.
import { prisma } from '../db.js';
let _cache = null;
const TTL_MS = 60_000;
export async function getBrandName() {
    const now = Date.now();
    if (_cache && now - _cache.at < TTL_MS)
        return _cache.name;
    const slug = String(process.env.TENANT_SLUG || 'alena').toLowerCase();
    let name = null;
    // 1. RestaurantProfile in this tenant's schema (owner-editable via /Branding).
    try {
        const p = await prisma.restaurantProfile.findFirst({
            select: { restaurant_name: true },
        });
        if (p?.restaurant_name && String(p.restaurant_name).trim()) {
            name = String(p.restaurant_name).trim();
        }
    }
    catch { /* profile not created yet — fall through */ }
    // 2. Platform Tenant row (seeded at signup — carries the name the owner
    //    typed in the signup form even before they touch /Branding).
    if (!name && slug !== 'alena') {
        try {
            const trows = await prisma.$queryRawUnsafe(`SELECT restaurant_name FROM "Tenant" WHERE slug = $1 LIMIT 1`, slug);
            if (trows.length && trows[0].restaurant_name) {
                name = String(trows[0].restaurant_name).trim();
            }
        }
        catch { /* Tenant table missing — fall through */ }
    }
    // 3. Legacy platform origin.
    if (!name && slug === 'alena')
        name = 'עלינא';
    // 4. Safe generic.
    if (!name)
        name = 'המסעדה';
    _cache = { name, at: now };
    return name;
}
/**
 * Substitute {brand} in a template string with the current tenant's name.
 * Sync wrapper for code paths that already have the name resolved.
 */
export function renderBrand(template, brand) {
    return String(template || '').replaceAll('{brand}', brand);
}
/**
 * Convenience — fetch brand + render in one call.
 */
export async function renderWithBrand(template) {
    const brand = await getBrandName();
    return renderBrand(template, brand);
}
/**
 * Clear the cache — call after /Branding save so the next request picks up
 * the new name immediately instead of waiting for TTL.
 */
export function invalidateBrandNameCache() {
    _cache = null;
}
//# sourceMappingURL=brandName.js.map