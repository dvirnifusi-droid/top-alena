// D3 — WhatsApp Multi-Tenant Router.
//
// One platform-owned WhatsApp number receives inbound messages for every
// tenant. This module figures out WHICH tenant a message belongs to, so the
// inbox handler can either process it locally (if we are that tenant) or
// forward it to the tenant's container.
//
// Resolution priority:
//   1. Explicit slug prefix "+<slug>" at the start of the body (from QR).
//   2. Phone memory (PhoneTenantMap) — the last tenant this phone talked to.
//   3. Fallback tenant — for now, 'alena' (only the original tenant existed
//      before D3, so any legacy customer without a QR or memory should route
//      to Alena — the "install" tenant). Configurable via
//      process.env.PLATFORM_DEFAULT_TENANT.
//
// Every outbound reply calls setLastTenant so the next message from that
// phone skips step 1 automatically.
//
// Tables:
//   platform.PhoneTenantMap(phone PK, last_tenant_slug, last_at)
//     — created lazily on first use, matching the ensurePlatformTables
//     pattern from load.ts (§4.7 of CLAUDE.md).
import { prisma } from '../db.js';
// Slug marker — accepts +slug or slug+ (RTL bidi may flip the +), and the
// token can be Latin OR Hebrew (or any Unicode letter). Hebrew tokens are
// resolved to canonical slugs via HE_SLUG_ALIASES + Tenant.restaurant_name.
// Bounded by whitespace/start/end/punctuation so it doesn't match mid-word.
const SLUG_PREFIX_PLUS = /(^|\s)\+([\p{L}][\p{L}\p{N}-]{1,32})(?=\s|$|[,.:;!?])/u;
const SLUG_SUFFIX_PLUS = /(^|\s)([\p{L}][\p{L}\p{N}-]{1,32})\+(?=\s|$|[,.:;!?])/u;
// Built-in Hebrew display names for platform-installations that aren't in the
// Tenant table. Alena is not stored there — she's the platform origin.
// Includes common misspellings.
const HE_SLUG_ALIASES = {
    'עלינא': 'alena',
    'אלנא': 'alena',
    'עלנא': 'alena',
    'מיהא': 'miha',
};
// Fallback tenant when nothing resolves. Alena because she predates D3 and
// legacy phones point to her by default. Override in a tenant container by
// setting PLATFORM_DEFAULT_TENANT (unlikely — this is a platform-level knob).
const FALLBACK_SLUG = () => (process.env.PLATFORM_DEFAULT_TENANT || 'alena').toLowerCase();
let _phoneMapTableReady = false;
async function ensurePhoneMapTable() {
    if (_phoneMapTableReady)
        return;
    // Same pattern as ensurePlatformTables — table lives in the `platform`
    // Postgres schema (shared, cross-tenant). Create the schema first in case
    // the caller is the first to touch it.
    await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "platform"`);
    await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "platform"."PhoneTenantMap" (
      "phone" TEXT PRIMARY KEY,
      "last_tenant_slug" TEXT NOT NULL,
      "last_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
    _phoneMapTableReady = true;
}
export function normalizePhone(raw) {
    if (!raw)
        return '';
    return String(raw).replace(/^whatsapp:/i, '').replace(/\s+/g, '').trim();
}
/**
 * Map a matched token (from the +slug regex) to a canonical tenant slug.
 * - Pure Latin → lowercase as-is (matches the slug column directly).
 * - Hardcoded Hebrew alias → its target slug.
 * - Otherwise → query Tenant.restaurant_name for an exact case-insensitive
 *   match and return that row's slug.
 * Returns null when no tenant matches.
 */
async function resolveSlugFromToken(token) {
    const trimmed = token.trim();
    if (!trimmed)
        return null;
    // Latin-only shortcut — matches Tenant.slug directly (never queries DB).
    if (/^[a-z][a-z0-9-]{1,32}$/i.test(trimmed)) {
        return trimmed.toLowerCase();
    }
    // Hardcoded Hebrew alias.
    const alias = HE_SLUG_ALIASES[trimmed];
    if (alias)
        return alias;
    // Look up in Tenant table by restaurant_name.
    try {
        const rows = await prisma.$queryRawUnsafe(`SELECT slug FROM "Tenant"
       WHERE LOWER(TRIM(restaurant_name)) = LOWER($1)
       LIMIT 1`, trimmed);
        return rows.length ? String(rows[0].slug).toLowerCase() : null;
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[whatsappRouter] slug lookup failed:', e?.message);
        return null;
    }
}
/**
 * Look up the tenant a phone+message belongs to.
 * Never throws — always returns a resolution (falling back to alena/default).
 */
export async function resolveTenantFromMessage(fromPhone, body) {
    const phone = normalizePhone(fromPhone);
    // 1. Explicit slug token — try `+slug` first, then `slug+` (RTL fallback).
    const bodyStr = String(body || '');
    const m = SLUG_PREFIX_PLUS.exec(bodyStr) || SLUG_SUFFIX_PLUS.exec(bodyStr);
    if (m) {
        // Both regexes capture the token in group 2. Might be Latin or Hebrew.
        const token = m[2];
        const slug = await resolveSlugFromToken(token);
        if (slug) {
            const bodyAfterPrefix = (bodyStr.slice(0, m.index) + bodyStr.slice(m.index + m[0].length))
                .replace(/\s+/g, ' ')
                .trim();
            return { slug, source: 'prefix', bodyAfterPrefix };
        }
        // Token didn't resolve to a known tenant — fall through to memory/fallback.
    }
    // 2. Owner-phone lookup — AUTHORITATIVE, so it runs BEFORE the memory cache.
    // A business owner must always reach their OWN agent, even if their phone was
    // once cached against another tenant (e.g. they messaged before their own
    // tenant went live and got stuck on 'alena'). Match the sender against every
    // live tenant's owner_phone by trailing 9 digits. An owner who wants to act on
    // a different tenant still overrides this with an explicit `+slug` (step 1).
    if (phone) {
        try {
            const digits = phone.replace(/\D/g, '');
            const tail = digits.slice(-9);
            if (tail.length === 9) {
                const rows = await prisma.$queryRawUnsafe(`SELECT slug FROM public."Tenant"
           WHERE status = 'live' AND owner_phone IS NOT NULL
             AND right(regexp_replace(owner_phone, '\\D', '', 'g'), 9) = $1
           ORDER BY live_at DESC NULLS LAST LIMIT 1`, tail);
                if (rows.length && rows[0].slug) {
                    return { slug: String(rows[0].slug).toLowerCase(), source: 'owner_phone' };
                }
            }
        }
        catch (e) {
            console.warn('[whatsappRouter] owner_phone lookup failed:', e?.message);
        }
    }
    // 3. Memory lookup — for NON-owners (employees) whose phone isn't an owner_phone
    // of any live tenant, remember which tenant they last talked to.
    if (phone) {
        try {
            await ensurePhoneMapTable();
            const rows = await prisma.$queryRawUnsafe(`SELECT last_tenant_slug FROM "platform"."PhoneTenantMap" WHERE phone = $1 LIMIT 1`, phone);
            if (rows.length && rows[0].last_tenant_slug) {
                return { slug: String(rows[0].last_tenant_slug).toLowerCase(), source: 'memory' };
            }
        }
        catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[whatsappRouter] phone map lookup failed:', e?.message);
        }
    }
    // 4. Fallback.
    return { slug: FALLBACK_SLUG(), source: 'fallback' };
}
/**
 * Record which tenant a phone last talked to. Called after the tenant's
 * container has processed the message and sent a reply. Idempotent —
 * upserts (phone, slug, now()).
 */
export async function setLastTenant(fromPhone, tenantSlug) {
    const phone = normalizePhone(fromPhone);
    const slug = String(tenantSlug || '').toLowerCase();
    if (!phone || !slug)
        return;
    try {
        await ensurePhoneMapTable();
        await prisma.$executeRawUnsafe(`INSERT INTO "platform"."PhoneTenantMap"(phone, last_tenant_slug, last_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (phone) DO UPDATE SET last_tenant_slug = EXCLUDED.last_tenant_slug, last_at = NOW()`, phone, slug);
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[whatsappRouter] setLastTenant failed:', e?.message);
    }
}
/**
 * The slug of the tenant this container is running as. Set at provision
 * time (TENANT_SLUG env var). Returns 'alena' as a safe default if unset,
 * matching the historical single-tenant assumption.
 */
export function currentTenantSlug() {
    return String(process.env.TENANT_SLUG || 'alena').toLowerCase();
}
/**
 * Given a resolved tenant slug, return the internal HTTP URL for that
 * tenant's api container. Used by the router to forward messages.
 *
 * Convention (from scripts/provision-tenant.sh):
 *   - main (alena) container: "top-alena-api-1" on port 3001
 *   - tenant containers:      "tenant-<slug>-api" on port 3001
 *
 * Both are reachable on the shared Docker network `top-alena_default`.
 */
export function containerUrlForSlug(slug) {
    const s = slug.toLowerCase();
    if (s === 'alena')
        return 'http://top-alena-api-1:3001';
    return `http://tenant-${s}-api:3001`;
}
//# sourceMappingURL=whatsappRouter.js.map