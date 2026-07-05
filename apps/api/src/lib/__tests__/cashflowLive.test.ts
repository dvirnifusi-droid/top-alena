import { describe, it, expect } from 'vitest';
import { dailyRevenue, weekdayAverages, projectIncome, expandRecurring, buildLiveCashFlow, ymd } from '../cashflowLive.js';

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('dailyRevenue', () => {
  it('sums lunch + dinner into one per-day total', () => {
    const m = dailyRevenue([
      { shift_date: D('2026-06-01'), total_revenue: 4000 },
      { shift_date: D('2026-06-01'), total_revenue: 6000 },
      { shift_date: D('2026-06-02'), total_revenue: 5000 },
    ]);
    expect(m.get('2026-06-01')).toBe(10000);
    expect(m.get('2026-06-02')).toBe(5000);
  });
  it('treats null revenue as 0', () => {
    const m = dailyRevenue([{ shift_date: D('2026-06-01'), total_revenue: null }]);
    expect(m.get('2026-06-01')).toBe(0);
  });
});

describe('weekdayAverages', () => {
  it('averages revenue per weekday since a cutoff', () => {
    // 2026-06-01 is Monday(1); 2026-06-08 Monday(1); 2026-06-02 Tuesday(2)
    const daily = new Map([['2026-06-01', 10000], ['2026-06-08', 12000], ['2026-06-02', 4000]]);
    const avg = weekdayAverages(daily, D('2026-06-01'));
    expect(avg.get(1)).toBe(11000); // two Mondays
    expect(avg.get(2)).toBe(4000);
  });
  it('excludes days before the cutoff', () => {
    const daily = new Map([['2026-05-01', 99999], ['2026-06-01', 10000]]);
    const avg = weekdayAverages(daily, D('2026-06-01'));
    // 2026-05-01 is Friday(5) — excluded; only the June Monday counts
    expect(avg.has(5)).toBe(false);
    expect(avg.get(1)).toBe(10000);
  });
});

describe('projectIncome', () => {
  it('projects each future day by its weekday average, skipping zero days', () => {
    const avg = new Map([[1, 11000], [2, 4000]]); // Mon, Tue only
    // from Sun 2026-06-07 exclusive → Wed 2026-06-10 inclusive
    const proj = projectIncome(avg, D('2026-06-07'), D('2026-06-10'));
    // Mon 6-08 = 11000, Tue 6-09 = 4000, Wed 6-10 = no avg → skipped
    expect(proj).toEqual([{ date: '2026-06-08', amount: 11000 }, { date: '2026-06-09', amount: 4000 }]);
  });
});

describe('expandRecurring', () => {
  it('creates one occurrence per month on day_of_month within the window', () => {
    const out = expandRecurring(
      [{ id: 'rent', name: 'שכירות', amount: 12000, day_of_month: 10, category: 'קבועות' }],
      D('2026-06-01'), D('2026-08-15'),
    );
    expect(out.map(e => e.date)).toEqual(['2026-06-10', '2026-07-10', '2026-08-10']);
    expect(out[0].type).toBe('expense');
    expect(out[0].amount).toBe(12000);
  });
  it('skips inactive costs', () => {
    expect(expandRecurring([{ id: 'x', name: 'y', amount: 100, day_of_month: 1, category: 'קבועות', active: false }], D('2026-06-01'), D('2026-07-01'))).toEqual([]);
  });
});

describe('buildLiveCashFlow', () => {
  const base = {
    openingBalance: 50000,
    openingDate: D('2026-06-01'),
    today: D('2026-06-15'),
    rangeEnd: D('2026-06-20'),
    historicalDaily: new Map([['2026-06-10', 10000]]), // past actual income
    projected: [{ date: '2026-06-16', amount: 8000 }],  // future income
    invoices: [
      { id: 'a', invoice_date: D('2026-06-05'), total_amount: 3000, payment_status: 'unpaid', supplier_name: 'ספק א' }, // past unpaid → dated today
      { id: 'b', invoice_date: D('2026-06-12'), total_amount: 2000, payment_status: 'paid', supplier_name: 'ספק ב' },   // paid, past
    ],
    recurring: [] as any[],
  };

  it('computes running balance and only surfaces today-or-future in upcoming', () => {
    const r = buildLiveCashFlow(base);
    expect(r.opening_balance).toBe(50000);
    // full range balance: 50000 +10000(6/10 income) -2000(6/12 paid) -3000(unpaid→today 6/15) +8000(6/16) = 63000
    expect(r.current_projected_balance).toBe(63000);
    // upcoming = entries dated >= today 6/15: the unpaid invoice (dated 6/15) and projected income 6/16
    const dates = r.upcoming.map(e => e.date);
    expect(dates).toContain('2026-06-15');
    expect(dates).toContain('2026-06-16');
    expect(dates).not.toContain('2026-06-10'); // past income excluded from upcoming
  });

  it('flags negative-balance days', () => {
    const r = buildLiveCashFlow({
      ...base, openingBalance: 1000,
      invoices: [{ id: 'big', invoice_date: D('2026-06-16'), total_amount: 20000, payment_status: 'unpaid', supplier_name: 'x' }],
      projected: [], historicalDaily: new Map(),
    });
    expect(r.negative_days_warning).not.toBeNull();
    expect(r.negative_days_warning![0].balance_after).toBeLessThan(0);
  });
});
