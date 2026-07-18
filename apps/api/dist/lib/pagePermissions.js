// Per-tier page permissions — the single source of truth for "may this user
// open (or call) this?". Lives in lib/ (pure, only depends on prisma) so ANY
// function module can import it without creating an import cycle with the
// giant load.ts registry.
import { prisma } from '../db.js';
let _permEnsured = false;
export async function ensurePermissionTiers() {
    if (_permEnsured)
        return;
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PermissionTier" (
       "id" TEXT PRIMARY KEY,
       "label" TEXT NOT NULL,
       "base_level" TEXT NOT NULL DEFAULT 'employee',
       "sort" INTEGER NOT NULL DEFAULT 0,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`);
    // Per-tier explicit page allowlist (NULL = not configured → legacy behaviour)
    // + the employee→tier assignment. Additive only (prisma db push is forbidden
    // on prod — see the DB-drift playbook).
    await prisma.$executeRawUnsafe(`ALTER TABLE "PermissionTier" ADD COLUMN IF NOT EXISTS "allowed_pages" JSONB`).catch(() => { });
    await prisma.$executeRawUnsafe(`ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "permission_tier_id" TEXT`).catch(() => { });
    _permEnsured = true;
}
// Normalize a role/position/tier label for auto-matching ("מנהל  מטבח" ≡ "מנהל מטבח").
export const normTier = (s) => String(s || '').replace(/[\s"'׳״־-]+/g, '').toLowerCase();
// Owner always gets everything (you can never lock yourself out). Otherwise an
// explicit assignment (Employee.permission_tier_id) wins, else we auto-match the
// employee's job title against a tier label. allowed_pages === null means the
// tenant hasn't configured an allowlist → callers keep the legacy behaviour.
export async function resolveUserTier(user) {
    if (String(user?.role) === 'owner') {
        return { is_owner: true, tier: null, allowed_pages: null, source: 'owner' };
    }
    await ensurePermissionTiers();
    const tiers = await prisma
        .$queryRawUnsafe(`SELECT * FROM "PermissionTier" ORDER BY "sort" ASC`).catch(() => []);
    if (!tiers.length)
        return { is_owner: false, tier: null, allowed_pages: null, source: 'no_tiers' };
    const emps = user?.email
        ? await prisma.$queryRawUnsafe(`SELECT id, role, permission_tier_id, positions FROM "Employee" WHERE lower(email)=lower($1) LIMIT 2`, user.email).catch(() => [])
        : [];
    // Ambiguous email (two employees share it) → fail closed on auto-match.
    const emp = emps.length === 1 ? emps[0] : null;
    let tier = null;
    let source = 'none';
    if (emp?.permission_tier_id) {
        tier = tiers.find((t) => t.id === emp.permission_tier_id) || null;
        if (tier)
            source = 'assigned';
    }
    if (!tier && emp) {
        const cands = [emp.role, ...(Array.isArray(emp.positions) ? emp.positions.map((p) => p?.position_name) : [])]
            .filter(Boolean).map(normTier);
        tier = tiers.find((t) => cands.includes(normTier(t.label))) || null;
        if (tier)
            source = 'auto_position';
    }
    if (!tier)
        return { is_owner: false, tier: null, allowed_pages: null, source };
    const pages = Array.isArray(tier.allowed_pages) ? tier.allowed_pages.map(String) : null;
    return { is_owner: false, tier, allowed_pages: pages && pages.length ? pages : null, source };
}
// Back-office roles. Intentionally BROAD (manager included) so hardening an
// endpoint can't lock out a legitimate manager — only plain employees are cut.
export function isBackOfficeRole(role) {
    return role === 'admin' || role === 'owner' || role === 'manager';
}
// Every denial is logged with the fn + who + why, so a mis-classified endpoint
// shows up immediately in `docker logs` instead of silently breaking someone.
function logDeny(fn, user, why) {
    console.warn(`[perm-deny] fn=${fn} why=${why} user=${user?.email || 'anon'} role=${user?.role || '-'}`);
}
// Guard for back-office endpoints: must be authenticated, must hold a
// back-office role, and must pass the tenant's per-tier page allowlist.
// `/api/fn` already enforces authentication, and public pages reach a SEPARATE
// route (/api/public/fn) that only serves fns registered `{public:true}` — so
// adding this can never break an anonymous/public flow.
export async function requireBackOffice(user, fnName, pageName) {
    if (!user?.id) {
        logDeny(fnName, user, 'unauthenticated');
        throw new Error('unauthorized');
    }
    if (!isBackOfficeRole(user.role)) {
        logDeny(fnName, user, 'not_back_office');
        throw new Error('forbidden');
    }
    if (pageName) {
        try {
            await requirePageAccess(user, pageName);
        }
        catch (e) {
            logDeny(fnName, user, `page:${pageName}`);
            throw e;
        }
    }
}
// Weaker guard for endpoints staff legitimately use (e.g. the shift-end report
// AI): authentication + the page allowlist, but NO role requirement.
export async function requireStaff(user, fnName, pageName) {
    if (!user?.id) {
        logDeny(fnName, user, 'unauthenticated');
        throw new Error('unauthorized');
    }
    if (pageName) {
        try {
            await requirePageAccess(user, pageName);
        }
        catch (e) {
            logDeny(fnName, user, `page:${pageName}`);
            throw e;
        }
    }
}
// Server-side gate. Throws 'forbidden_page' unless the user may open `pageName`,
// so a hidden sidebar entry can't simply be bypassed by calling the API.
// Deliberately permissive when the tenant has NOT configured tiers, so turning
// this on can never lock an existing tenant out of its own data.
export async function requirePageAccess(user, pageName) {
    const r = await resolveUserTier(user).catch(() => null);
    if (r?.is_owner)
        return;
    if (!r || r.allowed_pages === null)
        return;
    if (!r.allowed_pages.includes(pageName))
        throw new Error('forbidden_page');
}
//# sourceMappingURL=pagePermissions.js.map