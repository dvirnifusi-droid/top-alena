// Guarded pay read/write. The ONLY path to EmployeePay data. Every call builds
// a Viewer from the JWT user (owner flag + the viewer's own Employee row for
// department + pay_access_scope) and enforces payAccess rules.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { canViewPay, canEditPay, ALL_SCOPE } from '../lib/payAccess.js';
import { buildPayViewer } from '../lib/payViewer.js';

// Per-role hourly rates (for staff with several jobs) live in a JSONB column NOT
// in the prisma schema — added with additive SQL only (prisma db push is
// forbidden on prod). The prisma EmployeePay model therefore never sees it; we
// read/write it with raw SQL and merge it into the returned pay object.
let _payColsEnsured = false;
async function ensurePayCols(): Promise<void> {
  if (_payColsEnsured) return;
  await (prisma as any).$executeRawUnsafe(`ALTER TABLE "EmployeePay" ADD COLUMN IF NOT EXISTS "role_rates" JSONB`).catch(() => {});
  _payColsEnsured = true;
}

// Raw-read role_rates for a set of employees → Map<employee_id, {role:rate}>.
async function roleRatesFor(employeeIds: string[]): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (!employeeIds.length) return out;
  await ensurePayCols();
  const rows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT employee_id, role_rates FROM "EmployeePay" WHERE employee_id = ANY($1::text[]) AND role_rates IS NOT NULL`,
    employeeIds,
  ).catch(() => []);
  for (const r of rows) if (r.role_rates && typeof r.role_rates === 'object') out.set(r.employee_id, r.role_rates);
  return out;
}

// Validate + persist role_rates for one employee (raw UPDATE — the row is
// guaranteed to exist because the prisma upsert ran first). {} / null clears it.
async function writeRoleRates(employeeId: string, raw: any): Promise<void> {
  if (raw === undefined) return; // caller didn't touch role rates → leave as-is
  await ensurePayCols();
  let clean: Record<string, number> | null = null;
  if (raw && typeof raw === 'object') {
    const o: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const name = String(k || '').trim();
      const n = Number(v);
      if (name && Number.isFinite(n) && n > 0) o[name] = n;
    }
    if (Object.keys(o).length) clean = o;
  }
  await (prisma as any).$executeRawUnsafe(
    `UPDATE "EmployeePay" SET "role_rates" = $1::jsonb WHERE employee_id = $2`,
    clean === null ? null : JSON.stringify(clean),
    employeeId,
  ).catch(() => {});
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
  const viewer = await buildPayViewer(user);
  if (!canViewPay(viewer, target)) throw new Error('forbidden');
  const pay = await (prisma as any).employeePay.findUnique({ where: { employee_id: employeeId } }).catch(() => null);
  const rr = (await roleRatesFor([employeeId])).get(employeeId) || null;
  // Also return the employee's positions so the editor knows which roles to price.
  const emp: any = await (prisma as any).employee.findUnique({
    where: { id: employeeId }, select: { positions: true, role: true },
  }).catch(() => null);
  const positions = Array.isArray(emp?.positions)
    ? emp.positions.map((p: any) => p?.position_name).filter(Boolean)
    : (emp?.role ? [emp.role] : []);
  return { pay: pay ? { ...pay, role_rates: rr } : (rr ? { role_rates: rr } : null), positions, can_edit: canEditPay(viewer, target) };
});

// Returns pay rows the caller may see (owner/all → everyone; dept manager → their
// department; employee → just themselves), each with the employee name.
registerFn('listEmployeePay', async ({ user }) => {
  const viewer = await buildPayViewer(user);
  const employees: any[] = await (prisma as any).employee.findMany({
    select: { id: true, full_name: true, department: true, status: true, positions: true, role: true },
  }).catch(() => []);
  const visibleIds = employees
    .filter(e => canViewPay(viewer, { employeeId: e.id, department: e.department ?? null }))
    .map(e => e.id);
  const pays: any[] = await (prisma as any).employeePay.findMany({
    where: { employee_id: { in: visibleIds } },
  }).catch(() => []);
  const payById = new Map(pays.map(p => [p.employee_id, p]));
  const rrById = await roleRatesFor(visibleIds);
  return employees
    .filter(e => visibleIds.includes(e.id))
    .map(e => {
      const pay = payById.get(e.id) ?? null;
      const rr = rrById.get(e.id) || null;
      // Distinct role list so the matrix can offer a rate per role (multi-role staff).
      const positions = Array.isArray(e.positions)
        ? [...new Set(e.positions.map((p: any) => p?.position_name).filter(Boolean))]
        : (e.role ? [e.role] : []);
      return {
        employee_id: e.id, full_name: e.full_name, department: e.department ?? null,
        status: e.status ?? null,
        pay: pay ? { ...pay, role_rates: rr } : (rr ? { role_rates: rr } : null),
        positions,
      };
    });
});

// Upsert pay for an employee. Requires canEditPay. Validates numbers.
registerFn('setEmployeePay', async ({ body, user }) => {
  const p = (body as any) || {};
  const employeeId = String(p.employee_id || '');
  const target = await loadTarget(employeeId);
  if (!target) throw new Error('employee_not_found');
  const viewer = await buildPayViewer(user);
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
  await writeRoleRates(employeeId, p.role_rates);
  return { ok: true };
});

// Bulk upsert pay for many employees in one call (the "one table for everyone"
// screen). Same validation + per-row access check as setEmployeePay, so a
// dept-scoped manager can only write rows they're allowed to. Returns a count +
// per-row errors instead of failing the whole batch on one bad row.
registerFn('setEmployeePayBulk', async ({ body, user }) => {
  const rows = Array.isArray((body as any)?.rows) ? (body as any).rows : [];
  const viewer = await buildPayViewer(user);
  const num = (v: any) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  let saved = 0;
  const errors: any[] = [];
  for (const r of rows) {
    const employeeId = String(r?.employee_id || '');
    if (!employeeId) continue;
    const target = await loadTarget(employeeId);
    if (!target) { errors.push({ employee_id: employeeId, error: 'not_found' }); continue; }
    if (!canEditPay(viewer, target)) { errors.push({ employee_id: employeeId, error: 'forbidden' }); continue; }
    const payType = ['hourly', 'monthly', 'tips'].includes(r.pay_type) ? r.pay_type : 'hourly';
    const hourly = num(r.hourly_rate), monthly = num(r.monthly_salary), pct = num(r.employer_pct);
    if ((hourly !== null && hourly < 0) || (monthly !== null && monthly < 0) || (pct !== null && pct < 0)) {
      errors.push({ employee_id: employeeId, error: 'invalid_amount' }); continue;
    }
    const data = {
      pay_type: payType,
      hourly_rate: payType === 'hourly' ? hourly : null,
      monthly_salary: payType === 'monthly' ? monthly : null,
      employer_pct: pct,
      updated_by: user?.id ?? null,
    };
    try {
      await (prisma as any).employeePay.upsert({
        where: { employee_id: employeeId },
        update: data,
        create: { employee_id: employeeId, ...data },
      });
      if (r.role_rates !== undefined) await writeRoleRates(employeeId, r.role_rates);
      saved++;
    } catch (e: any) {
      errors.push({ employee_id: employeeId, error: String(e?.message || e).slice(0, 120) });
    }
  }
  return { ok: true, saved, errors };
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
