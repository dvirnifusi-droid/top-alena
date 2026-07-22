import { describe, it, expect } from 'vitest';
import { parseShiftHours, laborCostForHours, aggregateLabor, laborDeviation, sanitizeShiftHours, MAX_SHIFT_HOURS } from '../laborCost.js';

describe('sanitizeShiftHours (forgotten clock-out guard)', () => {
  it('passes plausible shift hours through', () => {
    expect(sanitizeShiftHours(8)).toBe(8);
    expect(sanitizeShiftHours(MAX_SHIFT_HOURS)).toBe(MAX_SHIFT_HOURS);
  });
  it('returns 0 for non-positive / invalid', () => {
    expect(sanitizeShiftHours(0)).toBe(0);
    expect(sanitizeShiftHours(-5)).toBe(0);
    expect(sanitizeShiftHours(NaN)).toBe(0);
  });
  it('a stale 138h record falls back to the planned hours', () => {
    expect(sanitizeShiftHours(138.77, 8)).toBe(8); // <- the אסתר bug
  });
  it('caps a stale record at MAX when no planned hours are known', () => {
    expect(sanitizeShiftHours(138.77)).toBe(MAX_SHIFT_HOURS);
    expect(sanitizeShiftHours(200, 0)).toBe(MAX_SHIFT_HOURS);
    expect(sanitizeShiftHours(200, 40)).toBe(MAX_SHIFT_HOURS); // implausible planned ignored
  });
});

describe('parseShiftHours', () => {
  it('computes hours between HH:mm', () => {
    expect(parseShiftHours('09:00', '17:00')).toBe(8);
    expect(parseShiftHours('12:30', '16:00')).toBe(3.5);
  });
  it('handles overnight shifts', () => {
    expect(parseShiftHours('22:00', '02:00')).toBe(4);
  });
  it('returns 0 for invalid input', () => {
    expect(parseShiftHours('', '17:00')).toBe(0);
    expect(parseShiftHours('9am', '5pm')).toBe(0);
    expect(parseShiftHours('25:00', '26:00')).toBe(0);
  });
});

describe('laborCostForHours', () => {
  it('hourly: gross + employer %', () => {
    // 8h * 40 = 320 gross; +30% employer = 416
    expect(laborCostForHours({ pay_type: 'hourly', hourly_rate: 40, employer_pct: 30 }, 8)).toBe(416);
  });
  it('hourly with no employer cost = gross only', () => {
    expect(laborCostForHours({ pay_type: 'hourly', hourly_rate: 40 }, 8)).toBe(320);
  });
  it('monthly and tips employees contribute 0 (not variable schedule cost)', () => {
    expect(laborCostForHours({ pay_type: 'monthly', monthly_salary: 12000 } as any, 8)).toBe(0);
    expect(laborCostForHours({ pay_type: 'tips' }, 8)).toBe(0);
  });
  it('missing pay = 0', () => {
    expect(laborCostForHours(null, 8)).toBe(0);
  });
});

describe('aggregateLabor', () => {
  const pay = new Map<string, any>([
    ['e1', { pay_type: 'hourly', hourly_rate: 40, employer_pct: 30 }],
    ['e2', { pay_type: 'hourly', hourly_rate: 50 }],
    ['e3', { pay_type: 'tips' }],
  ]);
  it('sums cost + hours per employee and total, hourly only', () => {
    const agg = aggregateLabor([
      { employee_id: 'e1', hours: 8 },   // 416
      { employee_id: 'e1', hours: 2 },   // +2*40*1.3 = 104 → e1 total 520
      { employee_id: 'e2', hours: 10 },  // 500
      { employee_id: 'e3', hours: 8 },   // tips → 0
    ], pay);
    expect(agg.total).toBe(1020);
    expect(agg.totalHours).toBe(28);
    expect(agg.byEmployee.find(e => e.employee_id === 'e1')!.cost).toBe(520);
    expect(agg.byEmployee.find(e => e.employee_id === 'e3')!.cost).toBe(0);
  });
});

describe('laborDeviation', () => {
  it('computes planned vs actual deviation per employee and total', () => {
    const planned = aggregateLabor([{ employee_id: 'e1', hours: 8 }], new Map([['e1', { pay_type: 'hourly', hourly_rate: 40 }]]));
    const actual = aggregateLabor([{ employee_id: 'e1', hours: 10 }], new Map([['e1', { pay_type: 'hourly', hourly_rate: 40 }]]));
    const dev = laborDeviation(planned, actual);
    expect(dev.planned_total).toBe(320);
    expect(dev.actual_total).toBe(400);
    expect(dev.deviation_total).toBe(80);
    expect(dev.byEmployee[0].deviation).toBe(80);
  });
});
