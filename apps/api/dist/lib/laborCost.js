// Labor-cost computation — pure & unit-tested. Uses per-employee pay from the
// EmployeePay model (sub-project B). Only HOURLY staff count: they are the
// variable cost the schedule controls. Monthly-salary staff are a fixed cost
// (handled as recurring in cash flow); tips staff are excluded entirely.
import { computeEmployerCost } from './payAccess.js';
// Normalize a role/position label so a rate keyed "מלצר/ית" matches the shift's
// "מלצרית" (same rule the schedule + pagePermissions use).
export const normRoleKey = (x) => String(x || '').replace(/[\s"'׳״־\-/\\|,.]+/g, '').toLowerCase();
// THE single source of truth for "what does this person earn per hour in THIS
// role". role-specific rate (role_rates) wins; otherwise the employee's base
// hourly_rate. Returns 0 when neither is set (caller may then fall back to the
// WorkPosition rate). Used by BOTH /LaborCost, the schedule grid, and the
// employee report so a rate entered anywhere shows up everywhere.
export function resolveHourlyRate(pay, role) {
    const rr = pay && pay.role_rates && typeof pay.role_rates === 'object' ? pay.role_rates : null;
    if (rr && role) {
        const nrole = normRoleKey(role);
        for (const k of Object.keys(rr)) {
            if (normRoleKey(k) === nrole) {
                const v = Number(rr[k]);
                if (Number.isFinite(v) && v > 0)
                    return v;
            }
        }
    }
    const base = Number(pay?.hourly_rate);
    return Number.isFinite(base) && base > 0 ? base : 0;
}
// Hours between two HH:mm strings; an end earlier than start means an overnight
// shift (+24h). Clamped to [0, 24]. Invalid input → 0.
export function parseShiftHours(start, end) {
    const toMin = (s) => {
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
        if (!m)
            return null;
        const h = +m[1], mi = +m[2];
        if (h > 23 || mi > 59)
            return null;
        return h * 60 + mi;
    };
    const a = toMin(start), b = toMin(end);
    if (a === null || b === null)
        return 0;
    let diff = b - a;
    if (diff < 0)
        diff += 24 * 60; // overnight
    const hours = diff / 60;
    return Math.min(24, Math.max(0, hours));
}
// Cost of `hours` for one employee in an optional role. Hourly only; monthly/tips → 0.
export function laborCostForHours(pay, hours, role) {
    if (!pay || pay.pay_type !== 'hourly')
        return 0;
    const rate = resolveHourlyRate(pay, role);
    const h = Number.isFinite(hours) && hours > 0 ? hours : 0;
    const gross = rate * h;
    // Employer overhead for HOURLY staff must scale with the hours worked, i.e. the
    // percentage path. Flat `employer_components` are a FIXED MONTHLY cost — adding
    // them per shift would multiply them ~N× across N shifts. So pass only the pct
    // (components are handled as a recurring monthly cost elsewhere, like salary).
    const employer = computeEmployerCost(gross, { employer_pct: pay.employer_pct ?? null });
    return gross + employer;
}
// Aggregate labor cost over a set of (employee, hours) entries.
export function aggregateLabor(entries, payById) {
    const perEmp = new Map();
    for (const e of entries) {
        if (!e.employee_id)
            continue;
        const pay = payById.get(e.employee_id);
        const hours = Number(e.hours) || 0;
        const cost = laborCostForHours(pay, hours, e.role);
        const cur = perEmp.get(e.employee_id) || { hours: 0, cost: 0 };
        cur.hours += hours;
        cur.cost += cost;
        perEmp.set(e.employee_id, cur);
    }
    let total = 0, totalHours = 0;
    const byEmployee = [];
    for (const [employee_id, { hours, cost }] of perEmp) {
        total += cost;
        totalHours += hours;
        byEmployee.push({ employee_id, hours: Math.round(hours * 100) / 100, cost: Math.round(cost) });
    }
    byEmployee.sort((a, b) => b.cost - a.cost);
    return { total: Math.round(total), totalHours: Math.round(totalHours * 100) / 100, byEmployee };
}
// Planned vs actual comparison with per-employee deviation.
export function laborDeviation(planned, actual) {
    const ids = new Set([...planned.byEmployee, ...actual.byEmployee].map(e => e.employee_id));
    const pById = new Map(planned.byEmployee.map(e => [e.employee_id, e]));
    const aById = new Map(actual.byEmployee.map(e => [e.employee_id, e]));
    const byEmployee = [...ids].map(id => {
        const p = pById.get(id);
        const a = aById.get(id);
        const plannedCost = p?.cost || 0;
        const actualCost = a?.cost || 0;
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
//# sourceMappingURL=laborCost.js.map