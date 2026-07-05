import { describe, it, expect } from 'vitest';
import { medianIntervalDays, computeOverdueSuppliers, buildGapsDigest } from '../invoiceGaps.js';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('medianIntervalDays', () => {
  it('returns null for fewer than 2 dates', () => {
    expect(medianIntervalDays([])).toBeNull();
    expect(medianIntervalDays([day('2026-06-01')])).toBeNull();
  });
  it('computes the median gap in days', () => {
    // gaps: 7, 7 → median 7
    expect(medianIntervalDays([day('2026-06-01'), day('2026-06-08'), day('2026-06-15')])).toBe(7);
  });
  it('averages the two middle gaps for an even count', () => {
    // gaps: 5, 10, 15 → median 10 (odd) ; add one → gaps 5,10,15,20 → median (10+15)/2 = 12.5
    expect(medianIntervalDays([day('2026-06-01'), day('2026-06-06'), day('2026-06-16'), day('2026-07-01'), day('2026-07-21')])).toBe(12.5);
  });
});

describe('computeOverdueSuppliers', () => {
  const now = day('2026-07-04');
  it('flags a weekly supplier that is ~3 weeks silent', () => {
    const res = computeOverdueSuppliers([
      { id: 's1', name: 'ביסקוטי', invoiceDates: [day('2026-05-25'), day('2026-06-01'), day('2026-06-08'), day('2026-06-13')] },
    ], now);
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('ביסקוטי');
    expect(res[0].medianDays).toBeGreaterThan(0);
  });
  it('does NOT flag a supplier still within its rhythm', () => {
    const res = computeOverdueSuppliers([
      { id: 's2', name: 'משקאות', invoiceDates: [day('2026-06-13'), day('2026-06-20'), day('2026-06-27'), day('2026-07-02')] },
    ], now);
    expect(res).toHaveLength(0);
  });
  it('ignores suppliers with too little history to know a rhythm', () => {
    const res = computeOverdueSuppliers([
      { id: 's3', name: 'חד פעמי', invoiceDates: [day('2026-01-01'), day('2026-02-01')] },
    ], now);
    expect(res).toHaveLength(0);
  });
  it('ranks the most-overdue supplier first', () => {
    const res = computeOverdueSuppliers([
      { id: 'weekly', name: 'שבועי', invoiceDates: [day('2026-06-01'), day('2026-06-08'), day('2026-06-15')] },
      { id: 'monthly', name: 'חודשי', invoiceDates: [day('2026-03-01'), day('2026-04-01'), day('2026-05-01')] },
    ], now);
    // weekly (median 7, ~19d late = 2.7 cycles) should rank above monthly (median 30, ~64d late = 2.1 cycles)
    expect(res[0].name).toBe('שבועי');
  });
});

describe('buildGapsDigest', () => {
  it('summarizes pending + overdue + unfetchable', () => {
    const text = buildGapsDigest({
      overdue: [{ id: 's1', name: 'ביסקוטי', daysSinceLast: 21, medianDays: 7 }],
      pendingReview: 5,
      unfetchable: [{ sender: 'noreply@business-updates.facebook.com', subject: 'Meta ads receipt' }],
    });
    expect(text).toContain('5 חשבוניות ממתינות');
    expect(text).toContain('ביסקוטי');
    expect(text).toContain('facebook');
  });
  it('says all-clear when there is nothing to flag', () => {
    expect(buildGapsDigest({ overdue: [], pendingReview: 0, unfetchable: [] })).toContain('אין פערים ידועים');
  });
});
