// Labor-cost API (sub-projects C + D). Privacy-gated: labor cost is derived
// from salary data, so results are scoped to what the caller may see —
// owner = all, a department manager = their department, an employee = self.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { canViewPay, type Viewer } from '../lib/payAccess.js';
import { parseShiftHours, aggregateLabor, laborDeviation, type LaborEntry, type PayInfo } from '../lib/laborCost.js';

const DAY_MS = 86400 * 1000;

async function buildViewer(user: any): Promise<Viewer> {
  const isOwner = user?.role === 'owner' || user?.role === 'admin';
  let emp: any = null;
  if (user?.email) {
    emp = await (prisma as any).employee.findFirst({
      where: { email: user.email },
      select: { id: true, department: true, pay_access_scope: true },
    }).catch(() => null);
  }
  return { isOwner, employeeId: emp?.id ?? null, department: emp?.department ?? null, payAccessScope: emp?.pay_access_scope ?? null };
}

function parseRange(body: any): { from: Date; to: Date } {
  const b = body || {};
  const to = typeof b.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.to) ? new Date(`${b.to}T23:59:59.000Z`) : new Date();
  const from = typeof b.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.from)
    ? new Date(`${b.from}T00:00:00.000Z`)
    : new Date(to.getTime() - (Math.min(365, Math.max(1, parseInt(String(b.days || 30)))) * DAY_MS));
  return { from, to };
}

// Build a payById map restricted to employees the viewer may see, plus a name map.
async function visiblePay(viewer: Viewer) {
  const employees: any[] = await (prisma as any).employee.findMany({
    select: { id: true, full_name: true, department: true },
  }).catch(() => []);
  const visible = employees.filter(e => canViewPay(viewer, { employeeId: e.id, department: e.department ?? null }));
  const visibleIds = new Set(visible.map(e => e.id));
  const pays: any[] = await (prisma as any).employeePay.findMany({ where: { employee_id: { in: [...visibleIds] } } }).catch(() => []);
  const payById = new Map<string, PayInfo>(pays.map(p => [p.employee_id, p]));
  const nameById = new Map<string, string>(visible.map(e => [e.id, e.full_name]));
  return { visibleIds, payById, nameById };
}

// C: planned schedule cost vs actual worked cost + deviations.
registerFn('getLaborCost', async ({ body, user }) => {
  const viewer = await buildViewer(user);
  const { from, to } = parseRange(body);
  const { visibleIds, payById, nameById } = await visiblePay(viewer);

  // Planned — from WorkShift assignments.
  const shifts: any[] = await (prisma as any).workShift.findMany({
    where: { date: { gte: from, lte: to } },
    select: { start_time: true, end_time: true, assigned_staff: true },
  }).catch(() => []);
  const plannedEntries: LaborEntry[] = [];
  for (const s of shifts) {
    const hours = parseShiftHours(s.start_time, s.end_time);
    const staff = Array.isArray(s.assigned_staff) ? s.assigned_staff : [];
    for (const a of staff) {
      const id = a?.employee_id;
      if (id && visibleIds.has(id)) plannedEntries.push({ employee_id: id, hours });
    }
  }

  // Actual — from ShiftTracking worked hours.
  const tracks: any[] = await (prisma as any).shiftTracking.findMany({
    where: { date: { gte: from, lte: to } },
    select: { employee_id: true, total_hours: true, effective_hours: true },
  }).catch(() => []);
  const actualEntries: LaborEntry[] = tracks
    .filter(t => t.employee_id && visibleIds.has(t.employee_id))
    .map(t => ({ employee_id: t.employee_id, hours: Number(t.total_hours ?? t.effective_hours) || 0 }));

  const planned = aggregateLabor(plannedEntries, payById);
  const actual = aggregateLabor(actualEntries, payById);
  const dev = laborDeviation(planned, actual);
  const withNames = dev.byEmployee.map(e => ({ ...e, name: nameById.get(e.employee_id) || 'עובד' }));

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    planned_total: planned.total,
    actual_total: actual.total,
    deviation_total: dev.deviation_total,
    planned_hours: planned.totalHours,
    actual_hours: actual.totalHours,
    by_employee: withNames,
  };
});

// D: labor cost % of revenue. Company-wide metric → owner / all-scope only.
registerFn('getLaborCostRatio', async ({ body, user }) => {
  const viewer = await buildViewer(user);
  if (!viewer.isOwner && viewer.payAccessScope !== 'all') throw new Error('forbidden');
  const { from, to } = parseRange(body);
  const { visibleIds, payById } = await visiblePay(viewer);

  const tracks: any[] = await (prisma as any).shiftTracking.findMany({
    where: { date: { gte: from, lte: to } },
    select: { employee_id: true, total_hours: true, effective_hours: true },
  }).catch(() => []);
  const actualEntries: LaborEntry[] = tracks
    .filter(t => t.employee_id && visibleIds.has(t.employee_id))
    .map(t => ({ employee_id: t.employee_id, hours: Number(t.total_hours ?? t.effective_hours) || 0 }));
  const labor = aggregateLabor(actualEntries, payById).total;

  const rev = await (prisma as any).shiftEndReport.aggregate({
    _sum: { total_revenue: true },
    where: { shift_date: { gte: from, lte: to } },
  }).catch(() => ({ _sum: { total_revenue: 0 } }));
  const revenue = Math.round(Number(rev?._sum?.total_revenue) || 0);

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    labor_cost: labor,
    revenue,
    ratio_pct: revenue > 0 ? Math.round((labor / revenue) * 1000) / 10 : null,
  };
});
