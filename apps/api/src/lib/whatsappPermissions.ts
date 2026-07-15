// Resolve a WhatsApp sender's phone number to an Employee record and
// derive their permission scope for the conversation agent. The agent
// uses this scope to (a) decide which tools to expose, (b) filter every
// query to only data the user is allowed to see.
//
// Hierarchy (from broadest to narrowest):
//   owner / admin             → sees EVERYTHING
//   restaurant_manager        → sees EVERYTHING (same as owner for now)
//   kitchen_manager           → sees all kitchen staff + their own data
//   floor_manager             → sees all floor staff (waiters/hosts/bar/runners)
//   shift_manager             → sees all floor staff (same as floor_manager for now)
//   staff (waiter/bartender/cook/etc) → sees ONLY themselves
//
// Identification chain:
//   1. Phone is in WHATSAPP_ADMIN_NUMBERS env → owner scope.
//   2. Phone matches Employee.phone → derive scope from role + positions.
//   3. No match → guest (very limited, mostly informational).

import { PrismaClient } from '@prisma/client';

const prisma: any = new PrismaClient();

export type Department = 'floor' | 'kitchen' | 'bar' | 'managers' | 'other';
export type Role =
  | 'owner'
  | 'restaurant_manager'
  | 'kitchen_manager'
  | 'floor_manager'
  | 'shift_manager'
  | 'staff'
  | 'guest';

export type AccessScope = {
  role: Role;
  employee_id: string | null;
  employee_name: string;
  phone: string;
  // Whether the agent should let the user run write actions (propose_*)
  can_write: boolean;
  // Department(s) the user can read from. 'all' = no filter.
  visible_departments: Department[] | 'all';
  // Specific employee IDs the user can query. 'all' = no filter; [] = self only (use employee_id).
  visible_employee_ids: string[] | 'all';
  // Hebrew label for the role, used in prompts.
  role_label_he: string;
  is_owner: boolean;
};

// === Position → department mapping ====================================
const POSITION_TO_DEPT: Array<{ test: RegExp; dept: Department }> = [
  { test: /(טבח|שטיפה|שף|מטבח|פיצריה|גריל|סלטים)/, dept: 'kitchen' },
  { test: /(ברמן|בריסטה|בר)/, dept: 'bar' },
  { test: /(מלצר|מארחת|הוסטס|ראנר|דייל|קופה|אריזות)/, dept: 'floor' },
  { test: /(מנהל|אחראי)/, dept: 'managers' },
];

function getDeptFromPositions(positions: any[]): Department {
  const list = (positions || []).map((p) => String(p?.position_name || p || ''));
  for (const p of list) {
    for (const rule of POSITION_TO_DEPT) if (rule.test.test(p)) return rule.dept;
  }
  return 'other';
}

// === Phone normalization =============================================
// Phones come from Twilio in +972... format. Employees may store as
// 050... or 972... Normalize to digits-only for comparison.
function normalizePhone(p: string): string {
  return String(p || '').replace(/\D/g, '').replace(/^0/, '972');
}

// === Main resolver ====================================================

// Per-tenant owner phone from the platform Tenant registry (public schema on the
// same DB instance — verified readable cross-schema from tenant containers, which
// each know their TENANT_SLUG). Cached per process (5-min TTL; a container serves
// exactly one tenant so this is a single row). Lets every tenant recognize ITS
// OWN owner as is_owner=true without touching the shared WHATSAPP_ADMIN_NUMBERS.
let _ownerCache: { digits: string | null; at: number } | null = null;
async function getTenantOwnerDigits(): Promise<string | null> {
  const slug = String(process.env.TENANT_SLUG || '').trim();
  if (!slug) return null;
  if (_ownerCache && Date.now() - _ownerCache.at < 300_000) return _ownerCache.digits;
  let digits: string | null = null;
  try {
    const rows: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT owner_phone FROM public."Tenant" WHERE slug = $1 LIMIT 1`, slug,
    );
    const raw = rows?.[0]?.owner_phone;
    digits = raw ? normalizePhone(raw) : null;
  } catch { digits = null; /* registry unreachable — env + Employee paths still apply */ }
  _ownerCache = { digits, at: Date.now() };
  return digits;
}

export async function resolveAccessScope(rawPhone: string): Promise<AccessScope> {
  const phone = String(rawPhone || '').trim();
  const phoneDigits = normalizePhone(phone);

  // ── 1. Admin numbers from env → owner scope ─────────────────────────
  const adminNumbers = (process.env.WHATSAPP_ADMIN_NUMBERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const adminDigits = adminNumbers.map(normalizePhone);
  if (adminDigits.includes(phoneDigits)) {
    return {
      role: 'owner',
      employee_id: null,
      employee_name: 'בעלים',
      phone,
      can_write: true,
      visible_departments: 'all',
      visible_employee_ids: 'all',
      role_label_he: 'בעלים',
      is_owner: true,
    };
  }

  // ── 1b. Per-tenant registered owner (from the platform Tenant registry) ──
  // Makes every tenant's OWN owner a full owner on THEIR tenant, without adding
  // them to the shared WHATSAPP_ADMIN_NUMBERS env. Cross-schema read is cached.
  if (phoneDigits) {
    const ownerDigits = await getTenantOwnerDigits();
    if (ownerDigits && ownerDigits === phoneDigits) {
      return {
        role: 'owner',
        employee_id: null,
        employee_name: 'בעלים',
        phone,
        can_write: true,
        visible_departments: 'all',
        visible_employee_ids: 'all',
        role_label_he: 'בעלים',
        is_owner: true,
      };
    }
  }

  // ── 2. Match an Employee by phone (any format variant) ──────────────
  // Try exact, then normalized digits-only.
  const phoneVariants = [phone, phoneDigits, '0' + phoneDigits.replace(/^972/, ''), '+' + phoneDigits];
  const emp = await prisma.employee.findFirst({
    where: { OR: phoneVariants.map((v) => ({ phone: v })) },
  }).catch(() => null);

  if (!emp) {
    return {
      role: 'guest',
      employee_id: null,
      employee_name: 'אורח',
      phone,
      can_write: false,
      visible_departments: [],
      visible_employee_ids: [],
      role_label_he: 'אורח',
      is_owner: false,
    };
  }

  // ── 3. Derive role from Employee.role + positions[] ─────────────────
  const positions = Array.isArray(emp.positions) ? emp.positions : [];
  const positionStrs = positions.map((p: any) => String(p?.position_name || p || ''));
  const hasPosition = (re: RegExp) => positionStrs.some((s: string) => re.test(s));
  const dbRole = String(emp.role || '').toLowerCase();
  const dept = getDeptFromPositions(positions);

  // Owner recorded on the Employee row itself (onboarding may create the owner
  // as an Employee with role 'owner') — full owner rights, not just manager.
  if (dbRole === 'owner') {
    return {
      role: 'owner',
      employee_id: emp.id,
      employee_name: emp.full_name,
      phone,
      can_write: true,
      visible_departments: 'all',
      visible_employee_ids: 'all',
      role_label_he: 'בעלים',
      is_owner: true,
    };
  }

  // Restaurant manager (top of restaurant) — full visibility
  if (dbRole === 'restaurant_manager' || dbRole === 'manager' || hasPosition(/מנהל מסעדה|מנכ"ל|בעל מקום/)) {
    return {
      role: 'restaurant_manager',
      employee_id: emp.id,
      employee_name: emp.full_name,
      phone,
      can_write: true,
      visible_departments: 'all',
      visible_employee_ids: 'all',
      role_label_he: 'מנהל/ת מסעדה',
      is_owner: false,
    };
  }

  // Kitchen manager — kitchen staff
  if (dbRole === 'kitchen_manager' || hasPosition(/מנהל מטבח|שף ראשי|סו-?שף/)) {
    return {
      role: 'kitchen_manager',
      employee_id: emp.id,
      employee_name: emp.full_name,
      phone,
      can_write: true,
      visible_departments: ['kitchen', 'managers'],
      visible_employee_ids: 'all', // resolver filters by dept downstream
      role_label_he: 'מנהל/ת מטבח',
      is_owner: false,
    };
  }

  // Floor manager — floor + bar staff
  if (dbRole === 'floor_manager' || hasPosition(/מנהל פלור|מנהל אולם|מנהל קומה/)) {
    return {
      role: 'floor_manager',
      employee_id: emp.id,
      employee_name: emp.full_name,
      phone,
      can_write: true,
      visible_departments: ['floor', 'bar', 'managers'],
      visible_employee_ids: 'all',
      role_label_he: 'מנהל/ת פלור',
      is_owner: false,
    };
  }

  // Shift manager — same as floor manager for now (per owner's note: "בהמשך נעשה דברים אחרים")
  if (dbRole === 'shift_manager' || hasPosition(/מנהל משמרת|אחראי משמרת/)) {
    return {
      role: 'shift_manager',
      employee_id: emp.id,
      employee_name: emp.full_name,
      phone,
      can_write: true,
      visible_departments: ['floor', 'bar', 'managers'],
      visible_employee_ids: 'all',
      role_label_he: 'מנהל/ת משמרת',
      is_owner: false,
    };
  }

  // Default — staff. Sees only themselves.
  return {
    role: 'staff',
    employee_id: emp.id,
    employee_name: emp.full_name,
    phone,
    can_write: false,
    visible_departments: [dept],
    visible_employee_ids: [emp.id],
    role_label_he: positionStrs[0] || 'עובד/ת',
    is_owner: false,
  };
}

// === Helpers for tools to enforce scope ===============================
export function canSeeEmployee(scope: AccessScope, employeeId: string): boolean {
  if (scope.role === 'owner' || scope.role === 'restaurant_manager') return true;
  if (scope.visible_employee_ids === 'all') return true;
  return scope.visible_employee_ids.includes(employeeId);
}

export function scopeWhereClause(scope: AccessScope): { employee_id?: any } {
  if (scope.role === 'owner' || scope.role === 'restaurant_manager') return {};
  if (scope.visible_employee_ids === 'all') return {};
  return { employee_id: { in: scope.visible_employee_ids } };
}
