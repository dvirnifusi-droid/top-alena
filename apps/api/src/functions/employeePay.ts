// Guarded pay read/write. The ONLY path to EmployeePay data. Every call builds
// a Viewer from the JWT user (owner flag + the viewer's own Employee row for
// department + pay_access_scope) and enforces payAccess rules.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { canViewPay, canEditPay, ALL_SCOPE, type Viewer } from '../lib/payAccess.js';

async function buildViewer(user: { id: string; email: string; role?: string | null } | null): Promise<Viewer> {
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

async function loadTarget(employeeId: string): Promise<{ employeeId: string; department: string | null; full_name: string } | null> {
  const t: any = await (prisma as any).employee.findUnique({
    where: { id: employeeId },
    select: { id: true, department: true, full_name: true },
  }).catch(() => null);
  if (!t) return null;
  return { employeeId: t.id, department: t.department ?? null, full_name: t.full_name };
}

// Returns { pay, can_edit } if the caller may view; throws 'forbidden' otherwise.
registerFn('getEmployeePay', async ({ body, user }) => {
  const employeeId = String((body as any)?.employee_id || '');
  const target = await loadTarget(employeeId);
  if (!target) throw new Error('employee_not_found');
  const viewer = await buildViewer(user);
  if (!canViewPay(viewer, target)) throw new Error('forbidden');
  const pay = await (prisma as any).employeePay.findUnique({ where: { employee_id: employeeId } }).catch(() => null);
  return { pay: pay ?? null, can_edit: canEditPay(viewer, target) };
});

// Returns pay rows the caller may see (owner/all → everyone; dept manager → their
// department; employee → just themselves), each with the employee name.
registerFn('listEmployeePay', async ({ user }) => {
  const viewer = await buildViewer(user);
  const employees: any[] = await (prisma as any).employee.findMany({
    select: { id: true, full_name: true, department: true },
  }).catch(() => []);
  const visibleIds = employees
    .filter(e => canViewPay(viewer, { employeeId: e.id, department: e.department ?? null }))
    .map(e => e.id);
  const pays: any[] = await (prisma as any).employeePay.findMany({
    where: { employee_id: { in: visibleIds } },
  }).catch(() => []);
  const payById = new Map(pays.map(p => [p.employee_id, p]));
  return employees
    .filter(e => visibleIds.includes(e.id))
    .map(e => ({ employee_id: e.id, full_name: e.full_name, department: e.department ?? null, pay: payById.get(e.id) ?? null }));
});

// Upsert pay for an employee. Requires canEditPay. Validates numbers.
registerFn('setEmployeePay', async ({ body, user }) => {
  const p = (body as any) || {};
  const employeeId = String(p.employee_id || '');
  const target = await loadTarget(employeeId);
  if (!target) throw new Error('employee_not_found');
  const viewer = await buildViewer(user);
  if (!canEditPay(viewer, target)) throw new Error('forbidden');

  const payType = ['hourly', 'monthly', 'tips'].includes(p.pay_type) ? p.pay_type : 'hourly';
  const num = (v: any) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  const hourly = num(p.hourly_rate);
  const monthly = num(p.monthly_salary);
  const pct = num(p.employer_pct);
  if ((hourly !== null && hourly < 0) || (monthly !== null && monthly < 0) || (pct !== null && pct < 0)) {
    throw new Error('invalid_amount');
  }
  const data = {
    pay_type: payType,
    hourly_rate: hourly,
    monthly_salary: monthly,
    employer_pct: pct,
    employer_components: p.employer_components && typeof p.employer_components === 'object' ? p.employer_components : null,
    notes: p.notes ? String(p.notes).slice(0, 500) : null,
    updated_by: user?.id ?? null,
  };
  await (prisma as any).employeePay.upsert({
    where: { employee_id: employeeId },
    update: data,
    create: { employee_id: employeeId, ...data },
  });
  return { ok: true };
});

// Owner-only: set a manager's salary-access scope (self=null | ALL_SCOPE | department).
registerFn('setPayAccessScope', async ({ body, user }) => {
  if (user?.role !== 'owner') throw new Error('forbidden');
  const p = (body as any) || {};
  const employeeId = String(p.employee_id || '');
  if (!employeeId) throw new Error('employee_required');
  const raw = p.scope;
  const scope = raw === ALL_SCOPE ? ALL_SCOPE : raw && raw !== 'self' ? String(raw).slice(0, 60) : null;
  await (prisma as any).employee.update({ where: { id: employeeId }, data: { pay_access_scope: scope } }).catch(() => {
    throw new Error('employee_not_found');
  });
  return { ok: true, scope };
});
