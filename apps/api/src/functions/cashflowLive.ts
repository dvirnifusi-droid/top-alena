// Live cash-flow API — builds the forecast from real data (shift reports +
// invoices + recurring costs) instead of a manual JSON import.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { dailyRevenue, weekdayAverages, projectIncome, expandRecurring, buildLiveCashFlow } from '../lib/cashflowLive.js';
import { requirePageAccess } from '../lib/pagePermissions.js';

const DAY_MS = 86400 * 1000;
const isAdmin = (user: any) => user?.role === 'owner' || user?.role === 'admin';

registerFn('getLiveCashFlow', async ({ body, user }) => {
  // Was completely unguarded: any authenticated employee could read the whole
  // cash flow straight off the API. Managers/owners only, and honour the
  // tenant's per-tier page allowlist.
  if (!isAdmin(user)) throw new Error('forbidden');
  await requirePageAccess(user, 'CashFlow');
  const days = Math.min(120, Math.max(7, parseInt(String((body as any)?.days || 30))));
  const today = new Date();
  const rangeEnd = new Date(today.getTime() + days * DAY_MS);

  const setting = await (prisma as any).cashFlowSetting.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(() => null);
  const openingBalance = Number(setting?.opening_balance) || 0;
  const openingDate = setting?.opening_date ? new Date(setting.opening_date) : new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  // Income — shift reports since opening for actuals; last 28d drives projection.
  const reports = await (prisma as any).shiftEndReport.findMany({
    where: { shift_date: { gte: openingDate } },
    select: { shift_date: true, total_revenue: true },
  }).catch(() => []);
  const daily = dailyRevenue(reports);
  // Prefer the last 90 days for the weekday average, but if there are no recent
  // shift reports fall back to all data since opening — so a projection is always
  // produced from whatever real history exists.
  const recentCut = new Date(today.getTime() - 90 * DAY_MS);
  const hasRecent = [...daily.keys()].some(k => new Date(`${k}T00:00:00.000Z`) >= recentCut);
  const avg = weekdayAverages(daily, hasRecent ? recentCut : openingDate);
  const projected = projectIncome(avg, today, rangeEnd);

  // Manual daily revenue — for days a manager never filed a shift-end report.
  // Merged on top of the reports so the forecast isn't blind on those days.
  await (prisma as any).$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "CashFlowDailyRevenue" (
       "date" TEXT PRIMARY KEY,
       "amount" DOUBLE PRECISION NOT NULL,
       "note" TEXT,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`).catch(() => {});
  const manualRows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT "date", "amount" FROM "CashFlowDailyRevenue"`).catch(() => []);
  for (const m of manualRows) {
    const k = String(m.date).slice(0, 10);
    if (!daily.has(k) || Number(daily.get(k)) <= 0) daily.set(k, Number(m.amount) || 0);
  }

  // Expenses — supplier invoices. due_date was added by raw SQL and isn't in
  // schema.prisma, so the generated client can't select it.
  const invoicesRaw: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, invoice_date, total_amount, payment_status, supplier_id,
            (CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                               WHERE table_name='Invoice' AND column_name='due_date')
                  THEN due_date ELSE NULL END) AS due_date
     FROM "Invoice" WHERE COALESCE(status,'') <> 'rejected' AND invoice_date >= $1`,
    openingDate).catch(async () => await (prisma as any).invoice.findMany({
      where: { status: { not: 'rejected' }, invoice_date: { gte: openingDate } },
      select: { id: true, invoice_date: true, total_amount: true, payment_status: true, supplier_id: true },
    }).catch(() => []));
  const supIds = [...new Set(invoicesRaw.map(i => i.supplier_id).filter(Boolean))];
  const sups: any[] = await (prisma as any).supplier.findMany({ where: { id: { in: supIds } }, select: { id: true, company_name: true } }).catch(() => []);
  const supName = new Map(sups.map(s => [s.id, s.company_name]));
  // No explicit due_date → derive it from the SUPPLIER'S payment terms (the same
  // engine the supplier ledger uses, so the two views agree). An occasional
  // supplier is paid on the spot; "שוטף+N" counts from month END, not from the
  // invoice date — treating it as the latter paid everyone up to a month early.
  const { parsePaymentTerms, dueDateFor } = await import('../lib/paymentTerms.js');
  const supTermRows: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id, payment_terms, COALESCE(is_occasional,false) AS is_occasional FROM "Supplier"`).catch(() => []);
  const termsBySupplier = new Map<string, any>();
  for (const r of supTermRows) {
    termsBySupplier.set(String(r.id), parsePaymentTerms(r.payment_terms, { occasional: r.is_occasional }));
  }

  const invoices = invoicesRaw.map(i => ({
    id: i.id, invoice_date: new Date(i.invoice_date),
    due_date: i.due_date
      ? new Date(i.due_date)
      : (termsBySupplier.has(String(i.supplier_id))
          ? dueDateFor(new Date(i.invoice_date), termsBySupplier.get(String(i.supplier_id)))
          : null),
    total_amount: Number(i.total_amount) || 0,
    payment_status: i.payment_status, supplier_name: supName.get(i.supplier_id) || null,
  }));

  // Expenses — recurring fixed costs.
  const costs: any[] = await (prisma as any).recurringCost.findMany({ where: { active: true } }).catch(() => []);
  const recurring = expandRecurring(costs, openingDate, rangeEnd);

  const payroll = await buildPayrollEntries(today, rangeEnd).catch(() => []);

  const result = buildLiveCashFlow({ openingBalance, openingDate, today, rangeEnd, historicalDaily: daily, projected, invoices, recurring, payroll });
  return { ...result, days, payroll_included: payroll.length > 0, manual_days: manualRows.length };
});


// Projected PAYROLL outflows. Cost is accrued from the SCHEDULE (same rates and
// overtime rules as /LaborCost: personal rate, else the position estimate), but
// the money leaves on payday — so a month's wages appear as one dated outflow
// instead of being smeared daily. payroll_day defaults to the 10th (typical IL).
async function buildPayrollEntries(today: Date, rangeEnd: Date): Promise<any[]> {
  const dbx = prisma as any;
  await dbx.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "CashFlowPayrollSetting" (
       "id" TEXT PRIMARY KEY, "payroll_day" INTEGER NOT NULL DEFAULT 10,
       "enabled" BOOLEAN NOT NULL DEFAULT true,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});
  const cfg: any[] = await dbx.$queryRawUnsafe(
    `SELECT payroll_day, enabled FROM "CashFlowPayrollSetting" LIMIT 1`).catch(() => []);
  if (cfg[0] && cfg[0].enabled === false) return [];
  const payDay = Math.min(28, Math.max(1, Number(cfg[0]?.payroll_day) || 10));

  // Rates: personal first, else the position estimate — the same rule the
  // schedule, /LaborCost and the dashboard KPI all use.
  const pays: any[] = await dbx.$queryRawUnsafe(
    `SELECT employee_id, pay_type, hourly_rate, monthly_salary, employer_pct FROM "EmployeePay"`).catch(() => []);
  const payBy = new Map<string, any>(pays.map((x: any) => [String(x.employee_id), x]));
  const emps: any[] = await dbx.$queryRawUnsafe(`SELECT id, role FROM "Employee"`).catch(() => []);
  const posRows: any[] = await dbx.$queryRawUnsafe(
    `SELECT position_name, hourly_rate FROM "WorkPosition" WHERE hourly_rate IS NOT NULL AND hourly_rate > 0`).catch(() => []);
  const norm = (x: any) => String(x || '').replace(/[\s"'׳״־\-\/\\|,.]+/g, '').toLowerCase();
  const posRate = new Map<string, number>(posRows.map((x: any) => [norm(x.position_name), Number(x.hourly_rate)]));
  for (const e of emps) {
    const cur = payBy.get(String(e.id));
    if (cur && cur.hourly_rate != null && Number(cur.hourly_rate) > 0) continue;
    if (cur && cur.pay_type && cur.pay_type !== 'hourly') continue;
    const r = posRate.get(norm(e.role));
    if (r) payBy.set(String(e.id), { ...(cur || {}), pay_type: 'hourly', hourly_rate: r });
  }

  const start = new Date(today.getTime() - 45 * DAY_MS);
  const shifts: any[] = await dbx.$queryRawUnsafe(
    `SELECT date, assigned_staff FROM "WorkShift" WHERE date >= $1 AND date <= $2`, start, rangeEnd).catch(() => []);
  const toMin = (t: any) => { const m = String(t || '').match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  const hrsOf = (a: any, b: any) => { const x = toMin(a), y0 = toMin(b); if (x == null || y0 == null) return 0; let y = y0; if (y < x) y += 1440; return (y - x) / 60; };
  const gross = (h: number, r: number) => Math.min(h, 8) * r + Math.min(Math.max(h - 8, 0), 2) * r * 1.25 + Math.max(h - 10, 0) * r * 1.5;

  const byMonth = new Map<string, number>();
  for (const sh of shifts) {
    const d = new Date(sh.date);
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    for (const a of (Array.isArray(sh.assigned_staff) ? sh.assigned_staff : [])) {
      const pay = payBy.get(String(a.employee_id));
      const rate = Number(pay?.hourly_rate) || 0;
      if (!rate || (pay?.pay_type && pay.pay_type !== 'hourly')) continue;
      let h = hrsOf(a.start_time, a.end_time);
      if (a.total_break_minutes) h = Math.max(0, h - Number(a.total_break_minutes) / 60);
      const mult = 1 + (Number(pay?.employer_pct) || 0) / 100;
      byMonth.set(mk, (byMonth.get(mk) || 0) + gross(h, rate) * mult);
    }
  }
  const monthlyFixed = pays
    .filter((x: any) => x.pay_type === 'monthly' && Number(x.monthly_salary) > 0)
    .reduce((n: number, x: any) => n + Number(x.monthly_salary) * (1 + (Number(x.employer_pct) || 0) / 100), 0);

  const out: any[] = [];
  for (const mk of byMonth.keys()) {
    const [y, m] = mk.split('-').map(Number);
    // Wages for month M are paid on payDay of M+1 (Date month index m == next month).
    const payDate = new Date(Date.UTC(y, m, payDay));
    if (payDate < today || payDate > rangeEnd) continue;
    const amount = Math.round((byMonth.get(mk) || 0) + monthlyFixed);
    if (amount <= 0) continue;
    out.push({
      id: `pay-${mk}`, date: payDate.toISOString().slice(0, 10), type: 'expense',
      category: 'משכורות', source: `שכר ${mk}`, amount, status: 'planned',
    });
  }
  return out;
}

registerFn('getCashFlowOpening', async ({ user }) => {
  if (!isAdmin(user)) throw new Error('forbidden');
  await requirePageAccess(user, 'CashFlow');
  const s = await (prisma as any).cashFlowSetting.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(() => null);
  return {
    opening_balance: Number(s?.opening_balance) || 0,
    opening_date: s?.opening_date ? new Date(s.opening_date).toISOString().slice(0, 10) : null,
  };
});

registerFn('setCashFlowOpening', async ({ body, user }) => {
  if (!isAdmin(user)) throw new Error('forbidden');
  await requirePageAccess(user, 'CashFlow');
  const p = (body as any) || {};
  const bal = Number(p.opening_balance);
  if (!Number.isFinite(bal)) throw new Error('invalid_amount');
  const date = typeof p.opening_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.opening_date)
    ? new Date(`${p.opening_date}T00:00:00.000Z`) : new Date();
  const existing = await (prisma as any).cashFlowSetting.findFirst().catch(() => null);
  if (existing) {
    await (prisma as any).cashFlowSetting.update({ where: { id: existing.id }, data: { opening_balance: bal, opening_date: date } });
  } else {
    await (prisma as any).cashFlowSetting.create({ data: { opening_balance: bal, opening_date: date } });
  }
  return { ok: true };
});


// Manual daily revenue — for days a shift-end report was never filed, so the day
// is not silently treated as zero income.
registerFn('setDailyRevenue', async ({ body, user }) => {
  if (!isAdmin(user)) throw new Error('forbidden');
  await requirePageAccess(user, 'CashFlow');
  const b = (body as any) || {};
  const date = String(b.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid_date');
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('invalid_amount');
  await (prisma as any).$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "CashFlowDailyRevenue" (
       "date" TEXT PRIMARY KEY, "amount" DOUBLE PRECISION NOT NULL, "note" TEXT,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});
  await (prisma as any).$executeRawUnsafe(
    `INSERT INTO "CashFlowDailyRevenue"("date","amount","note","updatedAt") VALUES ($1,$2,$3,NOW())
     ON CONFLICT ("date") DO UPDATE SET "amount"=EXCLUDED."amount","note"=EXCLUDED."note","updatedAt"=NOW()`,
    date, amount, b.note ? String(b.note).slice(0, 200) : null);
  return { ok: true, date, amount };
});

registerFn('getPayrollSetting', async ({ user }) => {
  if (!isAdmin(user)) throw new Error('forbidden');
  const r: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT payroll_day, enabled FROM "CashFlowPayrollSetting" LIMIT 1`).catch(() => []);
  return { payroll_day: Number(r[0]?.payroll_day) || 10, enabled: r[0]?.enabled !== false };
});

registerFn('setPayrollSetting', async ({ body, user }) => {
  if (!isAdmin(user)) throw new Error('forbidden');
  await requirePageAccess(user, 'CashFlow');
  const b = (body as any) || {};
  const day = Math.min(28, Math.max(1, Number(b.payroll_day) || 10));
  const enabled = b.enabled !== false;
  const { randomUUID } = await import('node:crypto');
  await (prisma as any).$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "CashFlowPayrollSetting" (
       "id" TEXT PRIMARY KEY, "payroll_day" INTEGER NOT NULL DEFAULT 10,
       "enabled" BOOLEAN NOT NULL DEFAULT true,
       "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`).catch(() => {});
  const ex: any[] = await (prisma as any).$queryRawUnsafe(
    `SELECT id FROM "CashFlowPayrollSetting" LIMIT 1`).catch(() => []);
  if (ex[0]) {
    await (prisma as any).$executeRawUnsafe(
      `UPDATE "CashFlowPayrollSetting" SET payroll_day=$2, enabled=$3, "updatedAt"=NOW() WHERE id=$1`,
      ex[0].id, day, enabled);
  } else {
    await (prisma as any).$executeRawUnsafe(
      `INSERT INTO "CashFlowPayrollSetting"("id","payroll_day","enabled","updatedAt") VALUES ($1,$2,$3,NOW())`,
      randomUUID(), day, enabled);
  }
  return { ok: true, payroll_day: day, enabled };
});
