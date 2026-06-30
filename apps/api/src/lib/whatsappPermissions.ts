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
