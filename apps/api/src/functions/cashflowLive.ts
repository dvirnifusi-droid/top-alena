// Live cash-flow API — builds the forecast from real data (shift reports +
// invoices + recurring costs) instead of a manual JSON import.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { dailyRevenue, weekdayAverages, projectIncome, expandRecurring, buildLiveCashFlow } from '../lib/cashflowLive.js';

const DAY_MS = 86400 * 1000;
const isAdmin = (user: any) => user?.role === 'owner' || user?.role === 'admin';

registerFn('getLiveCashFlow', async ({ body }) => {
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

  // Expenses — supplier invoices.
  const invoicesRaw: any[] = await (prisma as any).invoice.findMany({
    where: { status: { not: 'rejected' }, invoice_date: { gte: openingDate } },
    select: { id: true, invoice_date: true, total_amount: true, payment_status: true, supplier_id: true },
  }).catch(() => []);
  const supIds = [...new Set(invoicesRaw.map(i => i.supplier_id).filter(Boolean))];
  const sups: any[] = await (prisma as any).supplier.findMany({ where: { id: { in: supIds } }, select: { id: true, company_name: true } }).catch(() => []);
  const supName = new Map(sups.map(s => [s.id, s.company_name]));
  const invoices = invoicesRaw.map(i => ({
    id: i.id, invoice_date: new Date(i.invoice_date), total_amount: Number(i.total_amount) || 0,
    payment_status: i.payment_status, supplier_name: supName.get(i.supplier_id) || null,
  }));

  // Expenses — recurring fixed costs.
  const costs: any[] = await (prisma as any).recurringCost.findMany({ where: { active: true } }).catch(() => []);
  const recurring = expandRecurring(costs, openingDate, rangeEnd);

  const result = buildLiveCashFlow({ openingBalance, openingDate, today, rangeEnd, historicalDaily: daily, projected, invoices, recurring });
  return { ...result, days };
});

registerFn('getCashFlowOpening', async () => {
  const s = await (prisma as any).cashFlowSetting.findFirst({ orderBy: { updatedAt: 'desc' } }).catch(() => null);
  return {
    opening_balance: Number(s?.opening_balance) || 0,
    opening_date: s?.opening_date ? new Date(s.opening_date).toISOString().slice(0, 10) : null,
  };
});

registerFn('setCashFlowOpening', async ({ body, user }) => {
  if (!isAdmin(user)) throw new Error('forbidden');
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
