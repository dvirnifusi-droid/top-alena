// Labor-cost API (sub-projects C + D). Privacy-gated: labor cost is derived
// from salary data, so results are scoped to what the caller may see —
// owner = all, a department manager = their department, an employee = self.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { canViewPay, ALL_SCOPE, type Viewer } from '../lib/payAccess.js';
import { buildPayViewer } from '../lib/payViewer.js';
import { parseShiftHours, aggregateLabor, laborDeviation, sanitizeShiftHours, type LaborEntry, type PayInfo } from '../lib/laborCost.js';

const dstr = (d: any) => { try { return new Date(d).toISOString().slice(0, 10); } catch { return ''; } };

const DAY_MS = 86400 * 1000;

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
    select: { id: true, full_name: true, department: true, role: true },
  }).catch(() => []);
  const visible = employees.filter(e => canViewPay(viewer, { employeeId: e.id, department: e.department ?? null }));
  const visibleIds = new Set(visible.map(e => e.id));
  const pays: any[] = await (prisma as any).employeePay.findMany({ where: { employee_id: { in: [...visibleIds] } } }).catch(() => []);
  // Merge per-role rates (raw JSONB column, not in the prisma model) so the
  // resolver can pick a role-specific rate for multi-role staff.
  const rrRows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT employee_id, role_rates FROM "EmployeePay" WHERE employee_id = ANY($1::text[]) AND role_rates IS NOT NULL`,
    [...visibleIds],
  ).catch(() => []);
  const rrById = new Map<string, any>(rrRows.map(r => [r.employee_id, r.role_rates]));
  const payById = new Map<string, PayInfo>(pays.map(p => [p.employee_id, { ...p, role_rates: rrById.get(p.employee_id) ?? null }]));

  // ESTIMATE FALLBACK — when an employee has no personal rate, use the hourly
  // rate set on their POSITION (ניהול תפקידים). The schedule cost already did
  // this; /LaborCost and the dashboard KPI did not, so a per-role estimate
  // showed up in one place and not the other. `estimated` marks the rows that
  // came from the position so the UI never presents a guess as a known number.
  const positions: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT position_name, hourly_rate FROM "WorkPosition" WHERE hourly_rate IS NOT NULL AND hourly_rate > 0`).catch(() => []);
  const norm = (x: any) => String(x || '').replace(/[\s"'׳״־\-/\\|,.]+/g, '').toLowerCase();
  const posRate = new Map<string, number>();
  for (const p of positions) posRate.set(norm(p.position_name), Number(p.hourly_rate));
  let estimatedCount = 0;
  for (const e of visible) {
    const existing: any = payById.get(e.id);
    if (existing && existing.hourly_rate != null && Number(existing.hourly_rate) > 0) continue;
    if (existing && existing.pay_type && existing.pay_type !== 'hourly') continue; // monthly/tips — not an hourly gap
    const r = posRate.get(norm(e.role));
    if (!r) continue;
    payById.set(e.id, { ...(existing || {}), pay_type: 'hourly', hourly_rate: r, estimated: true } as any);
    estimatedCount++;
  }

  const nameById = new Map<string, string>(visible.map(e => [e.id, e.full_name]));
  return { visibleIds, payById, nameById, estimatedCount };
}

// C: planned schedule cost vs actual worked cost + deviations.
registerFn('getLaborCost', async ({ body, user }) => {
  const viewer = await buildPayViewer(user);
  const { from, to } = parseRange(body);
  const { visibleIds, payById, nameById, estimatedCount } = await visiblePay(viewer);

  // Planned — from WorkShift assignments. Also indexed by (employee|date) so a
  // stale actual clock can fall back to that shift's planned hours.
  const shifts: any[] = await (prisma as any).workShift.findMany({
    where: { date: { gte: from, lte: to } },
    select: { date: true, start_time: true, end_time: true, assigned_staff: true },
  }).catch(() => []);
  const plannedEntries: LaborEntry[] = [];
  const plannedByKey = new Map<string, number>(); // `${empId}|${YYYY-MM-DD}` → planned hours
  for (const s of shifts) {
    const hours = parseShiftHours(s.start_time, s.end_time);
    const ds = dstr(s.date);
    const staff = Array.isArray(s.assigned_staff) ? s.assigned_staff : [];
    for (const a of staff) {
      const id = a?.employee_id;
      // Planned assignments carry the role, so a multi-role employee is costed at
      // the rate for the role they're scheduled in. (Actual/clock hours have no
      // role → base rate; ShiftTracking doesn't record which job was worked.)
      if (id && visibleIds.has(id)) {
        // A per-assignment start/end wins over the shift-level times when present.
        const h = parseShiftHours(a?.start_time, a?.end_time) || hours;
        plannedEntries.push({ employee_id: id, hours: h, role: a?.position || null });
        if (ds) plannedByKey.set(`${id}|${ds}`, (plannedByKey.get(`${id}|${ds}`) || 0) + h);
      }
    }
  }

  // Actual — from ShiftTracking. Skip OPEN shifts (not clocked out → not finished)
  // and sanitize forgotten clock-outs (a 138h "shift" → that day's planned hours).
  const tracks: any[] = await (prisma as any).shiftTracking.findMany({
    where: { date: { gte: from, lte: to } },
    select: { employee_id: true, date: true, shift_end: true, total_hours: true, effective_hours: true },
  }).catch(() => []);
  const actualEntries: LaborEntry[] = tracks
    .filter(t => t.employee_id && visibleIds.has(t.employee_id) && t.shift_end)
    .map(t => ({
      employee_id: t.employee_id,
      hours: sanitizeShiftHours(Number(t.total_hours ?? t.effective_hours) || 0, plannedByKey.get(`${t.employee_id}|${dstr(t.date)}`)),
    }));

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
    estimated_employees: estimatedCount,
  };
});

// D: labor cost % of revenue. Company-wide metric → owner / all-scope only.
registerFn('getLaborCostRatio', async ({ body, user }) => {
  const viewer = await buildPayViewer(user);
  if (!viewer.isOwner && viewer.payAccessScope !== ALL_SCOPE) throw new Error('forbidden');
  const { from, to } = parseRange(body);
  const { visibleIds, payById, estimatedCount } = await visiblePay(viewer);

  const tracks: any[] = await (prisma as any).shiftTracking.findMany({
    where: { date: { gte: from, lte: to } },
    select: { employee_id: true, shift_end: true, total_hours: true, effective_hours: true },
  }).catch(() => []);
  // Finished shifts only, forgotten clock-outs capped (no schedule read here).
  const actualEntries: LaborEntry[] = tracks
    .filter(t => t.employee_id && visibleIds.has(t.employee_id) && t.shift_end)
    .map(t => ({ employee_id: t.employee_id, hours: sanitizeShiftHours(Number(t.total_hours ?? t.effective_hours) || 0) }));
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
    estimated_employees: estimatedCount,
  };
});
