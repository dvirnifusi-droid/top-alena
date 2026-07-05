// Labor-cost computation — pure & unit-tested. Uses per-employee pay from the
// EmployeePay model (sub-project B). Only HOURLY staff count: they are the
// variable cost the schedule controls. Monthly-salary staff are a fixed cost
// (handled as recurring in cash flow); tips staff are excluded entirely.
import { computeEmployerCost } from './payAccess.js';

export type PayInfo = {
  pay_type?: string | null;
  hourly_rate?: number | null;
  employer_pct?: number | null;
  employer_components?: Record<string, number> | null;
};

// Hours between two HH:mm strings; an end earlier than start means an overnight
// shift (+24h). Clamped to [0, 24]. Invalid input → 0.
export function parseShiftHours(start: string | null | undefined, end: string | null | undefined): number {
  const toMin = (s: any) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  };
  const a = toMin(start), b = toMin(end);
  if (a === null || b === null) return 0;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60; // overnight
  const hours = diff / 60;
  return Math.min(24, Math.max(0, hours));
}

// Cost of `hours` for one employee. Hourly only; monthly/tips → 0.
export function laborCostForHours(pay: PayInfo | null | undefined, hours: number): number {
  if (!pay || pay.pay_type !== 'hourly') return 0;
  const rate = Number(pay.hourly_rate) || 0;
  const h = Number.isFinite(hours) && hours > 0 ? hours : 0;
  const gross = rate * h;
  return gross + computeEmployerCost(gross, pay);
}

export type LaborEntry = { employee_id: string; hours: number };
export type LaborAggregate = {
  total: number;
  totalHours: number;
  byEmployee: { employee_id: string; hours: number; cost: number }[];
};

// Aggregate labor cost over a set of (employee, hours) entries.
export function aggregateLabor(entries: LaborEntry[], payById: Map<string, PayInfo>): LaborAggregate {
  const perEmp = new Map<string, { hours: number; cost: number }>();
  for (const e of entries) {
    if (!e.employee_id) continue;
    const pay = payById.get(e.employee_id);
    const hours = Number(e.hours) || 0;
    const cost = laborCostForHours(pay, hours);
    const cur = perEmp.get(e.employee_id) || { hours: 0, cost: 0 };
    cur.hours += hours; cur.cost += cost;
    perEmp.set(e.employee_id, cur);
  }
  let total = 0, totalHours = 0;
  const byEmployee: LaborAggregate['byEmployee'] = [];
  for (const [employee_id, { hours, cost }] of perEmp) {
    total += cost; totalHours += hours;
    byEmployee.push({ employee_id, hours: Math.round(hours * 100) / 100, cost: Math.round(cost) });
  }
  byEmployee.sort((a, b) => b.cost - a.cost);
  return { total: Math.round(total), totalHours: Math.round(totalHours * 100) / 100, byEmployee };
}

// Planned vs actual comparison with per-employee deviation.
export function laborDeviation(planned: LaborAggregate, actual: LaborAggregate) {
  const ids = new Set<string>([...planned.byEmployee, ...actual.byEmployee].map(e => e.employee_id));
  const pById = new Map(planned.byEmployee.map(e => [e.employee_id, e]));
  const aById = new Map(actual.byEmployee.map(e => [e.employee_id, e]));
  const byEmployee = [...ids].map(id => {
    const p = pById.get(id); const a = aById.get(id);
    const plannedCost = p?.cost || 0; const actualCost = a?.cost || 0;
    return {
      employee_id: id,
      planned_cost: plannedCost,
      actual_cost: actualCost,
      deviation: actualCost - plannedCost,
      planned_hours: p?.hours || 0,
      actual_hours: a?.hours || 0,
    };
  }).sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation));
  return {
    planned_total: planned.total,
    actual_total: actual.total,
    deviation_total: actual.total - planned.total,
    byEmployee,
  };
}
