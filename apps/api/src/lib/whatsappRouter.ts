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

// Slug marker — accepts both `+slug` and `slug+` anywhere in the body.
// The second form handles WhatsApp on RTL keyboards, which sometimes
// visually renders "+miha היי" but sends "היי miha+" (the plus flips to
// the other side of the token during bidi rendering).
// Both must be bounded by whitespace/start/end/punctuation to avoid
// matching mid-word (e.g. "email+extras" won't match).
const SLUG_PREFIX_PLUS = /(^|\s)\+([a-z][a-z0-9-]{2,32})(?=\s|$|[,.:;!?])/i;
const SLUG_SUFFIX_PLUS = /(^|\s)([a-z][a-z0-9-]{2,32})\+(?=\s|$|[,.:;!?])/i;

// Fallback tenant when nothing resolves. Alena because she predates D3 and
// legacy phones point to her by default. Override in a tenant container by
// setting PLATFORM_DEFAULT_TENANT (unlikely — this is a platform-level knob).
const FALLBACK_SLUG = () => (process.env.PLATFORM_DEFAULT_TENANT || 'alena').toLowerCase();

let _phoneMapTableReady = false;

async function ensurePhoneMapTable() {
  if (_phoneMapTableReady) return;
  // Same pattern as ensurePlatformTables — table lives in the `platform`
  // Postgres schema (shared, cross-tenant). Create the schema first in case
  // the caller is the first to touch it.
  await (prisma as any).$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "platform"`);
  await (prisma as any).$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "platform"."PhoneTenantMap" (
      "phone" TEXT PRIMARY KEY,
      "last_tenant_slug" TEXT NOT NULL,
      "last_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  _phoneMapTableReady = true;
}

export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).replace(/^whatsapp:/i, '').replace(/\s+/g, '').trim();
}

export type TenantResolution = {
  slug: string;
  source: 'prefix' | 'memory' | 'fallback';
  bodyAfterPrefix?: string; // when source='prefix', body minus the "+slug" bit
};

/**
 * Look up the tenant a phone+message belongs to.
 * Never throws — always returns a resolution (falling back to alena/default).
 */
export async function resolveTenantFromMessage(
  fromPhone: string,
  body: string,
): Promise<TenantResolution> {
  const phone = normalizePhone(fromPhone);

  // 1. Explicit slug token — try `+slug` first, then `slug+` (RTL fallback).
  const bodyStr = String(body || '');
  const m = SLUG_PREFIX_PLUS.exec(bodyStr) || SLUG_SUFFIX_PLUS.exec(bodyStr);
  if (m) {
    // Both regexes capture the slug in group 2.
    const slug = m[2].toLowerCase();
    // Strip the whole match (including its leading whitespace) from wherever
    // it appeared, then collapse whitespace.
    const bodyAfterPrefix = (bodyStr.slice(0, m.index) + bodyStr.slice(m.index + m[0].length))
      .replace(/\s+/g, ' ')
      .trim();
    return { slug, source: 'prefix', bodyAfterPrefix };
  }

  // 2. Memory lookup.
  if (phone) {
    try {
      await ensurePhoneMapTable();
      const rows: any[] = await (prisma as any).$queryRawUnsafe(
        `SELECT last_tenant_slug FROM "platform"."PhoneTenantMap" WHERE phone = $1 LIMIT 1`,
        phone,
      );
      if (rows.length && rows[0].last_tenant_slug) {
        return { slug: String(rows[0].last_tenant_slug).toLowerCase(), source: 'memory' };
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[whatsappRouter] phone map lookup failed:', e?.message);
    }
  }

  // 3. Fallback.
  return { slug: FALLBACK_SLUG(), source: 'fallback' };
}

/**
 * Record which tenant a phone last talked to. Called after the tenant's
 * container has processed the message and sent a reply. Idempotent —
 * upserts (phone, slug, now()).
 */
export async function setLastTenant(fromPhone: string, tenantSlug: string): Promise<void> {
  const phone = normalizePhone(fromPhone);
  const slug = String(tenantSlug || '').toLowerCase();
  if (!phone || !slug) return;
  try {
    await ensurePhoneMapTable();
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "platform"."PhoneTenantMap"(phone, last_tenant_slug, last_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (phone) DO UPDATE SET last_tenant_slug = EXCLUDED.last_tenant_slug, last_at = NOW()`,
      phone,
      slug,
    );
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn('[whatsappRouter] setLastTenant failed:', e?.message);
  }
}

/**
 * The slug of the tenant this container is running as. Set at provision
 * time (TENANT_SLUG env var). Returns 'alena' as a safe default if unset,
 * matching the historical single-tenant assumption.
 */
export function currentTenantSlug(): string {
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
export function containerUrlForSlug(slug: string): string {
  const s = slug.toLowerCase();
  if (s === 'alena') return 'http://top-alena-api-1:3001';
  return `http://tenant-${s}-api:3001`;
}
