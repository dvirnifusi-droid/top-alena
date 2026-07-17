// Pure salary-privacy + employer-cost logic. DB-free so it is unit-testable and
// is the single source of truth for who may see/edit pay.
// Collision-proof sentinel for "all departments" scope. Kept off the department-name
// namespace so a real department literally named 'all' can never grant global access.
export const ALL_SCOPE = '__ALL__';
// Owner, an ALL_SCOPE-scoped manager, or a manager scoped to the target's department.
export function canEditPay(v, t) {
    if (v.isOwner)
        return true;
    const scope = typeof v.payAccessScope === 'string' ? v.payAccessScope : null;
    if (scope === ALL_SCOPE)
        return true;
    if (scope && t.department && scope === t.department)
        return true;
    return false;
}
// Anyone who can edit, plus an employee viewing their own record.
export function canViewPay(v, t) {
    if (canEditPay(v, t))
        return true;
    return !!v.employeeId && v.employeeId === t.employeeId;
}
// Effective employer cost: detailed components (summed) win; else % of gross; else 0.
export function computeEmployerCost(gross, pay) {
    const g = Number.isFinite(gross) ? gross : 0;
    const comp = pay.employer_components;
    if (comp && typeof comp === 'object') {
        const vals = Object.values(comp).map(Number).filter(n => Number.isFinite(n));
        if (vals.length)
            return Math.max(0, vals.reduce((a, b) => a + b, 0));
    }
    if (pay.employer_pct && Number.isFinite(pay.employer_pct) && pay.employer_pct > 0) {
        return Math.max(0, (g * pay.employer_pct) / 100);
    }
    return 0;
}
//# sourceMappingURL=payAccess.js.map