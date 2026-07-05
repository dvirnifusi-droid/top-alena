// Live cash-flow projection from REAL data — pure & unit-tested.
// Income  = ShiftEndReport revenue (historical actuals) + a weekday-average
//           projection for future days.
// Expense = supplier Invoices (unpaid → upcoming outflow) + recurring fixed
//           costs (rent, monthly salaries…).
// Output matches the shape the /CashFlow page already consumes.

export type CashFlowEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'income' | 'expense';
  category: string;
  source: string | null;
  amount: number; // always positive
  status: 'received' | 'paid' | 'planned';
  balance_after?: number;
};

const DAY_MS = 86400 * 1000;
export function ymd(d: Date): string { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * DAY_MS); }

// Sum revenue per calendar day (a day may have lunch + dinner reports).
export function dailyRevenue(reports: { shift_date: Date; total_revenue: number | null }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of reports) {
    if (!r.shift_date) continue;
    const key = ymd(new Date(r.shift_date));
    m.set(key, (m.get(key) || 0) + (Number(r.total_revenue) || 0));
  }
  return m;
}

// Average daily revenue per weekday (0=Sun..6=Sat) over days on/after `since`.
export function weekdayAverages(daily: Map<string, number>, since: Date): Map<number, number> {
  const sums = new Map<number, { sum: number; n: number }>();
  for (const [key, rev] of daily) {
    const d = new Date(`${key}T00:00:00.000Z`);
    if (d < since) continue;
    const wd = d.getUTCDay();
    const cur = sums.get(wd) || { sum: 0, n: 0 };
    cur.sum += rev; cur.n += 1;
    sums.set(wd, cur);
  }
  const avg = new Map<number, number>();
  for (const [wd, { sum, n }] of sums) avg.set(wd, n ? sum / n : 0);
  return avg;
}

// Projected income for each day in (fromExclusive, toInclusive], using the
// weekday average (0 when a weekday has no history).
export function projectIncome(avg: Map<number, number>, fromExclusive: Date, toInclusive: Date): { date: string; amount: number }[] {
  const out: { date: string; amount: number }[] = [];
  let d = addDays(fromExclusive, 1);
  while (d <= toInclusive) {
    const amount = Math.round(avg.get(d.getUTCDay()) || 0);
    if (amount > 0) out.push({ date: ymd(d), amount });
    d = addDays(d, 1);
  }
  return out;
}

// Recurring monthly costs expanded to concrete dated occurrences in the window.
export function expandRecurring(
  costs: { id: string; name: string; amount: number; day_of_month: number; category: string; active?: boolean }[],
  windowStart: Date,
  windowEnd: Date,
): CashFlowEntry[] {
  const out: CashFlowEntry[] = [];
  for (const c of costs) {
    if (c.active === false) continue;
    const dom = Math.min(28, Math.max(1, Math.round(c.day_of_month) || 1));
    // iterate months from windowStart to windowEnd
    let y = windowStart.getUTCFullYear();
    let m = windowStart.getUTCMonth();
    while (true) {
      const occ = new Date(Date.UTC(y, m, dom));
      if (occ > windowEnd) break;
      if (occ >= windowStart) {
        out.push({
          id: `rc-${c.id}-${ymd(occ)}`,
          date: ymd(occ),
          type: 'expense',
          category: c.category || 'קבועות',
          source: c.name,
          amount: Math.abs(Number(c.amount) || 0),
          status: 'planned', // status is finalised in build() relative to today
        });
      }
      m += 1; if (m > 11) { m = 0; y += 1; }
    }
  }
  return out;
}

export type BuildInput = {
  openingBalance: number;
  openingDate: Date;
  today: Date;
  rangeEnd: Date;
  historicalDaily: Map<string, number>; // actual revenue per day (from shift reports)
  projected: { date: string; amount: number }[]; // future income
  invoices: { id: string; invoice_date: Date; total_amount: number; payment_status: string | null; supplier_name: string | null }[];
  recurring: CashFlowEntry[]; // from expandRecurring
};

// Build the full running-balance forecast in the page's expected shape.
export function buildLiveCashFlow(input: BuildInput) {
  const todayKey = ymd(input.today);
  const entries: CashFlowEntry[] = [];

  // Income — historical actuals within [openingDate, today]
  for (const [key, rev] of input.historicalDaily) {
    const d = new Date(`${key}T00:00:00.000Z`);
    if (d < input.openingDate || key > todayKey || rev <= 0) continue;
    entries.push({ id: `inc-${key}`, date: key, type: 'income', category: 'הכנסות משמרת', source: null, amount: Math.round(rev), status: 'received' });
  }
  // Income — projected future
  for (const p of input.projected) {
    entries.push({ id: `pinc-${p.date}`, date: p.date, type: 'income', category: 'הכנסות (תחזית)', source: null, amount: p.amount, status: 'planned' });
  }
  // Expenses — invoices
  for (const inv of input.invoices) {
    const paid = inv.payment_status === 'paid';
    const invKey = ymd(new Date(inv.invoice_date));
    // Unpaid invoices are money still owed → surface as an upcoming outflow
    // (dated today if the invoice is already in the past).
    const dateKey = paid ? invKey : (invKey < todayKey ? todayKey : invKey);
    entries.push({
      id: `inv-${inv.id}`,
      date: dateKey,
      type: 'expense',
      category: 'ספקים',
      source: inv.supplier_name || null,
      amount: Math.abs(Number(inv.total_amount) || 0),
      status: paid ? 'paid' : 'planned',
    });
  }
  // Expenses — recurring (finalise status vs today)
  for (const rc of input.recurring) {
    entries.push({ ...rc, status: rc.date < todayKey ? 'paid' : 'planned' });
  }

  entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let running = Math.round(input.openingBalance);
  const upcoming: CashFlowEntry[] = [];
  for (const e of entries) {
    running += e.type === 'income' ? e.amount : -e.amount;
    if (e.date >= todayKey) upcoming.push({ ...e, balance_after: running });
  }

  const negativeDays = upcoming.filter(e => (e.balance_after || 0) < 0).slice(0, 10);
  return {
    opening_balance: Math.round(input.openingBalance),
    current_projected_balance: running,
    upcoming_count: upcoming.length,
    upcoming: upcoming.slice(0, 200),
    negative_days_warning: negativeDays.length ? negativeDays : null,
  };
}
