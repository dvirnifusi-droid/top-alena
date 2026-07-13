// Central "email → restaurant" directory for the unified login.
// Lives in the shared `platform` Postgres schema (same pattern as
// PhoneTenantMap / AiUsage) so every tenant container writes to ONE table and
// the platform login (topalena.com) can resolve which restaurant an email
// belongs to and route the user there — no more "wrong URL = not registered".
import { prisma } from '../db.js';
import { currentTenantSlug } from './whatsappRouter.js';

const db = prisma as any;
let _ready = false;

async function ensureTable() {
  if (_ready) return;
  await db.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "platform"`);
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "platform"."EmailTenantMap" (
      "email" TEXT NOT NULL,
      "tenant_slug" TEXT NOT NULL,
      "restaurant_name" TEXT,
      "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("email","tenant_slug")
    );
  `);
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EmailTenantMap_email_idx" ON "platform"."EmailTenantMap"("email")`);
  _ready = true;
}

function norm(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

// Upsert one (email → tenant) membership. Slug defaults to the current container.
export async function registerEmailTenant(email: string, slug?: string, restaurantName?: string | null) {
  const e = norm(email);
  if (!e || !/\S+@\S+\.\S+/.test(e)) return;
  const s = (slug || currentTenantSlug()).toLowerCase();
  try {
    await ensureTable();
    await db.$executeRawUnsafe(
      `INSERT INTO "platform"."EmailTenantMap" ("email","tenant_slug","restaurant_name","updated_at")
       VALUES ($1,$2,$3,CURRENT_TIMESTAMP)
       ON CONFLICT ("email","tenant_slug")
       DO UPDATE SET "restaurant_name"=COALESCE(EXCLUDED."restaurant_name","platform"."EmailTenantMap"."restaurant_name"),
                     "updated_at"=CURRENT_TIMESTAMP`,
      e, s, restaurantName || null,
    );
  } catch (err: any) { console.warn('[emailTenantMap] register failed', err?.message); }
}

// All restaurants an email belongs to (across the fleet).
export async function resolveEmailTenants(email: string): Promise<Array<{ slug: string; name: string | null }>> {
  const e = norm(email);
  if (!e) return [];
  try {
    await ensureTable();
    const rows: any[] = await db.$queryRawUnsafe(
      `SELECT tenant_slug, restaurant_name FROM "platform"."EmailTenantMap" WHERE email = $1 ORDER BY updated_at DESC`,
      e,
    );
    return rows.map(r => ({ slug: String(r.tenant_slug).toLowerCase(), name: r.restaurant_name || null }));
  } catch (err: any) { console.warn('[emailTenantMap] resolve failed', err?.message); return []; }
}

// Sync THIS container's employees + users into the directory. Idempotent —
// safe to run on boot and on a timer. Self-healing: covers every add path.
export async function backfillEmailTenantMap(): Promise<{ slug: string; count: number }> {
  const slug = currentTenantSlug();
  let name: string | null = null;
  try {
    const p: any = await db.restaurantProfile.findFirst({ select: { restaurant_name: true } }).catch(() => null);
    name = p?.restaurant_name || null;
    if (!name && slug !== 'alena') {
      const rows: any[] = await db.$queryRawUnsafe(`SELECT restaurant_name FROM "Tenant" WHERE slug = $1 LIMIT 1`, slug).catch(() => []);
      name = rows?.[0]?.restaurant_name || null;
    }
    if (!name && slug === 'alena') name = 'עלינא';
  } catch { /* best effort */ }

  const emails = new Set<string>();
  try {
    const emps: any[] = await db.employee.findMany({ where: { email: { not: null } }, select: { email: true } });
    emps.forEach(x => { const e = norm(x.email); if (e) emails.add(e); });
  } catch { /* ignore */ }
  try {
    const users: any[] = await db.user.findMany({ where: { email: { not: null } }, select: { email: true } });
    users.forEach(x => { const e = norm(x.email); if (e) emails.add(e); });
  } catch { /* ignore */ }

  for (const e of emails) await registerEmailTenant(e, slug, name);
  return { slug, count: emails.size };
}
