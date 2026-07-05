import { describe, it, expect } from 'vitest';
import { canViewPay, canEditPay, computeEmployerCost, ALL_SCOPE } from '../payAccess.js';

const owner = { isOwner: true, employeeId: 'v1', department: 'ניהול', payAccessScope: null };
const kitchenMgr = { isOwner: false, employeeId: 'v2', department: 'מטבח', payAccessScope: 'מטבח' };
const floorMgr = { isOwner: false, employeeId: 'v3', department: 'פלור', payAccessScope: 'פלור' };
const allMgr = { isOwner: false, employeeId: 'v4', department: 'ניהול', payAccessScope: ALL_SCOPE };
const worker = { isOwner: false, employeeId: 'v5', department: 'מטבח', payAccessScope: null };

const kitchenTarget = { employeeId: 't-kitchen', department: 'מטבח' };
const floorTarget = { employeeId: 't-floor', department: 'פלור' };

describe('canEditPay', () => {
  it('owner edits anyone', () => {
    expect(canEditPay(owner, kitchenTarget)).toBe(true);
    expect(canEditPay(owner, floorTarget)).toBe(true);
  });
  it("scope 'all' edits anyone", () => {
    expect(canEditPay(allMgr, floorTarget)).toBe(true);
  });
  it('department manager edits only their department', () => {
    expect(canEditPay(kitchenMgr, kitchenTarget)).toBe(true);
    expect(canEditPay(kitchenMgr, floorTarget)).toBe(false);
    expect(canEditPay(floorMgr, floorTarget)).toBe(true);
  });
  it('plain employee cannot edit — not even themselves', () => {
    expect(canEditPay(worker, { employeeId: 'v5', department: 'מטבח' })).toBe(false);
  });
});

describe('canViewPay', () => {
  it('anyone who can edit can also view', () => {
    expect(canViewPay(kitchenMgr, kitchenTarget)).toBe(true);
  });
  it('employee views only themselves', () => {
    expect(canViewPay(worker, { employeeId: 'v5', department: 'מטבח' })).toBe(true);
    expect(canViewPay(worker, kitchenTarget)).toBe(false);
  });
  it('a manager cannot view another department', () => {
    expect(canViewPay(kitchenMgr, floorTarget)).toBe(false);
  });
});

describe('computeEmployerCost', () => {
  it('sums detailed components when present', () => {
    expect(computeEmployerCost(10000, { employer_components: { bituach_leumi: 700, pension: 1250 } })).toBe(1950);
  });
  it('falls back to percentage of gross', () => {
    expect(computeEmployerCost(10000, { employer_pct: 30 })).toBe(3000);
  });
  it('is zero when nothing configured', () => {
    expect(computeEmployerCost(10000, {})).toBe(0);
    expect(computeEmployerCost(10000, { employer_components: {} })).toBe(0);
  });
  it('prefers components over percentage when both present', () => {
    expect(computeEmployerCost(10000, { employer_components: { x: 500 }, employer_pct: 30 })).toBe(500);
  });
});

describe('ALL_SCOPE sentinel is collision-proof', () => {
  it('a manager scoped to a real department named "all" does NOT get global access', () => {
    const mgrOfAllDept = { isOwner: false, employeeId: 'x', department: 'all', payAccessScope: 'all' };
    expect(canEditPay(mgrOfAllDept, { employeeId: 't', department: 'מטבח' })).toBe(false);
    // …but still edits their own literal 'all' department
    expect(canEditPay(mgrOfAllDept, { employeeId: 't2', department: 'all' })).toBe(true);
  });
});

describe('canEditPay defends input shape', () => {
  it('non-string scope fails closed', () => {
    const bad = { isOwner: false, employeeId: 'x', department: 'מטבח', payAccessScope: true as any };
    expect(canEditPay(bad, { employeeId: 't', department: 'מטבח' })).toBe(false);
  });
});

describe('computeEmployerCost never returns negative or NaN', () => {
  it('clamps a negative component sum to 0', () => {
    expect(computeEmployerCost(10000, { employer_components: { a: 700, b: -1250 } })).toBe(0);
  });
  it('ignores a negative percentage', () => {
    expect(computeEmployerCost(10000, { employer_pct: -30 })).toBe(0);
  });
  it('NaN gross yields 0 not NaN', () => {
    expect(computeEmployerCost(NaN, { employer_pct: 30 })).toBe(0);
  });
});
