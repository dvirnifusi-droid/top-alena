// Pure salary-privacy + employer-cost logic. DB-free so it is unit-testable and
// is the single source of truth for who may see/edit pay.

export type Viewer = {
  isOwner: boolean;
  employeeId: string | null;     // the viewer's own Employee id (null if unlinked)
  department: string | null;
  payAccessScope: string | null; // null=self only | 'all' | '<department>'
};
export type PayTarget = { employeeId: string; department: string | null };

// Owner, an 'all'-scoped manager, or a manager scoped to the target's department.
export function canEditPay(v: Viewer, t: PayTarget): boolean {
  if (v.isOwner) return true;
  if (v.payAccessScope === 'all') return true;
  if (v.payAccessScope && t.department && v.payAccessScope === t.department) return true;
  return false;
}

// Anyone who can edit, plus an employee viewing their own record.
export function canViewPay(v: Viewer, t: PayTarget): boolean {
  if (canEditPay(v, t)) return true;
  return !!v.employeeId && v.employeeId === t.employeeId;
}

// Effective employer cost: detailed components (summed) win; else % of gross; else 0.
export function computeEmployerCost(
  gross: number,
  pay: { employer_pct?: number | null; employer_components?: Record<string, number> | null },
): number {
  const comp = pay.employer_components;
  if (comp && typeof comp === 'object') {
    const vals = Object.values(comp).map(Number).filter(n => Number.isFinite(n));
    if (vals.length) return vals.reduce((a, b) => a + b, 0);
  }
  if (pay.employer_pct && Number.isFinite(pay.employer_pct)) return (gross * pay.employer_pct) / 100;
  return 0;
}
