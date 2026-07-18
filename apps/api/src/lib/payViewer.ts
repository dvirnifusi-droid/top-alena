// Single source for building the salary-privacy Viewer from a JWT user, so the
// owner-flag + department + scope resolution can't drift between callers
// (employeePay + laborCost). Fails closed: an unlinked user (no matching
// Employee) gets employeeId=null and no scope, seeing nothing beyond the owner
// flag. Owner is strictly role === 'owner' (no 'admin') to match the pay module.
import { prisma } from '../db.js';
import type { Viewer } from './payAccess.js';

export async function buildPayViewer(user: { id?: string; email?: string; role?: string | null } | null): Promise<Viewer> {
  // Read the CURRENT role from the DB, not the JWT. A JWT carries the role from
  // login time, so promoting someone to 'owner' had no effect until they logged
  // out and back in — they stayed locked out of their own salary data with no
  // hint why. The DB is the source of truth; the token is only a fallback.
  let liveRole: string | null = user?.role ?? null;
  if (user?.id) {
    const row: any = await (prisma as any).user.findUnique({
      where: { id: user.id }, select: { role: true },
    }).catch(() => null);
    if (row?.role) liveRole = row.role;
  }
  const isOwner = liveRole === 'owner';
  let emp: any = null;
  if (user?.email) {
    // Employee.email is neither unique nor guaranteed distinct (synthetic/placeholder
    // emails exist). If more than one row matches, the identity is ambiguous → fail
    // CLOSED (no scope) rather than inherit a possibly-wrong department/pay_access_scope.
    const matches = await (prisma as any).employee.findMany({
      where: { email: user.email },
      select: { id: true, department: true, pay_access_scope: true },
      take: 2,
    }).catch(() => []);
    emp = matches.length === 1 ? matches[0] : null;
  }
  return {
    isOwner,
    employeeId: emp?.id ?? null,
    department: emp?.department ?? null,
    payAccessScope: emp?.pay_access_scope ?? null,
  };
}
