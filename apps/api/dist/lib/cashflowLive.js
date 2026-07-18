// Live cash-flow projection from REAL data — pure & unit-tested.
// Income  = ShiftEndReport revenue (historical actuals) + a weekday-average
//           projection for future days.
// Expense = supplier Invoices (unpaid → upcoming outflow) + recurring fixed
//           costs (rent, monthly salaries…).
// Output matches the shape the /CashFlow page already consumes.
const DAY_MS = 86400 * 1000;
export function ymd(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { return new Date(d.getTime() + n * DAY_MS); }
// Sum revenue per calendar day (a day may have lunch + dinner reports).
export function dailyRevenue(reports) {
    const m = new Map();
    for (const r of reports) {
        if (!r.shift_date)
            continue;
        const key = ymd(new Date(r.shift_date));
        m.set(key, (m.get(key) || 0) + (Number(r.total_revenue) || 0));
    }
    return m;
}
// Average daily revenue per weekday (0=Sun..6=Sat) over days on/after `since`.
export function weekdayAverages(daily, since) {
    const sums = new Map();
    for (const [key, rev] of daily) {
        const d = new Date(`${key}T00:00:00.000Z`);
        if (d < since)
            continue;
        const wd = d.getUTCDay();
        const cur = sums.get(wd) || { sum: 0, n: 0 };
        cur.sum += rev;
        cur.n += 1;
        sums.set(wd, cur);
    }
    const avg = new Map();
    for (const [wd, { sum, n }] of sums)
        avg.set(wd, n ? sum / n : 0);
    return avg;
}
// Projected income for each day in (fromExclusive, toInclusive], using the
// weekday average (0 when a weekday has no history).
export function projectIncome(avg, fromExclusive, toInclusive) {
    const out = [];
    let d = addDays(fromExclusive, 1);
    while (d <= toInclusive) {
        const amount = Math.round(avg.get(d.getUTCDay()) || 0);
        if (amount > 0)
            out.push({ date: ymd(d), amount });
        d = addDays(d, 1);
    }
    return out;
}
// Recurring monthly costs expanded to concrete dated occurrences in the window.
export function expandRecurring(costs, windowStart, windowEnd) {
    const out = [];
    for (const c of costs) {
        if (c.active === false)
            continue;
        const dom = Math.min(28, Math.max(1, Math.round(c.day_of_month) || 1));
        // iterate months from windowStart to windowEnd
        let y = windowStart.getUTCFullYear();
        let m = windowStart.getUTCMonth();
        while (true) {
            const occ = new Date(Date.UTC(y, m, dom));
            if (occ > windowEnd)
                break;
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
            m += 1;
            if (m > 11) {
                m = 0;
                y += 1;
            }
        }
    }
    return out;
}
// Build the full running-balance forecast in the page's expected shape.
export function buildLiveCashFlow(input) {
    const todayKey = ymd(input.today);
    const entries = [];
    // Income — historical actuals within [openingDate, today]
    for (const [key, rev] of input.historicalDaily) {
        const d = new Date(`${key}T00:00:00.000Z`);
        if (d < input.openingDate || key > todayKey || rev <= 0)
            continue;
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
        const dueKey = inv.due_date ? ymd(new Date(inv.due_date)) : null;
        // Money leaves on the DUE date when one is set (שוטף+30 etc.). Without it,
        // fall back to the invoice date. An unpaid invoice already past its date
        // lands on today — it's owed now.
        const baseKey = dueKey || invKey;
        const dateKey = paid ? invKey : (baseKey < todayKey ? todayKey : baseKey);
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
    // Expenses — payroll. The single biggest outflow, previously missing entirely,
    // so every forecast was optimistic by a full salary run.
    for (const pr of (input.payroll || [])) {
        entries.push({ ...pr, status: pr.date < todayKey ? 'paid' : 'planned' });
    }
    entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let running = Math.round(input.openingBalance);
    const upcoming = [];
    for (const e of entries) {
        running += e.type === 'income' ? e.amount : -e.amount;
        if (e.date >= todayKey)
            upcoming.push({ ...e, balance_after: running });
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
//# sourceMappingURL=cashflowLive.js.map