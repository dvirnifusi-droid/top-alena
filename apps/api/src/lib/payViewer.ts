// Single source for building the salary-privacy Viewer from a JWT user, so the
// owner-flag + department + scope resolution can't drift between callers
// (employeePay + laborCost). Fails closed: an unlinked user (no matching
// Employee) gets employeeId=null and no scope, seeing nothing beyond the owner
// flag. Owner is strictly role === 'owner' (no 'admin') to match the pay module.
import { prisma } from '../db.js';
import type { Viewer } from './payAccess.js';

export async function buildPayViewer(user: { id?: string; email?: string; role?: string | null } | null): Promise<Viewer> {
  const isOwner = user?.role === 'owner';
  let emp: any = null;
  if (user?.email) {
    emp = await (prisma as any).employee.findFirst({
      where: { email: user.email },
      select: { id: true, department: true, pay_access_scope: true },
    }).catch(() => null);
  }
  return {
    isOwner,
    employeeId: emp?.id ?? null,
    department: emp?.department ?? null,
    payAccessScope: emp?.pay_access_scope ?? null,
  };
}
