import { DailySales, Reservation, BeecommOrder, Invoice } from '@/entities/all';
import { invokeAgent } from './core/invokeAgent';
import { sendAgentMessage } from './core/messages';
import { heartbeat } from './core/registry';
import { CFO_SYSTEM_PROMPT, CFO_DAILY_REPORT_SCHEMA } from './prompts/cfoAnalyst';

const DAY_MS = 24 * 60 * 60 * 1000;

async function safeList(entity, ...args) {
  try { return await entity.list(...args); } catch { return null; }
}
async function safeFilter(entity, ...args) {
  try { return await entity.filter(...args); } catch { return null; }
}

/**
 * Pull whatever financial data is available.
 * Returns {data_quality, ...sources}.
 *   FULL     — Beecom orders present
 *   DEGRADED — DailySales aggregates only
 *   MINIMAL  — only Reservation count
 */
async function gatherFinanceData() {
  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();
  const since1d = new Date(now - DAY_MS).toISOString();

  const [beecomOrders, dailySales, reservations, invoices] = await Promise.all([
    safeFilter(BeecommOrder, { created_date: { gte: since30d } }, '-created_date', 500),
    safeList(DailySales, '-date', 30),
    safeFilter(Reservation, { created_date: { gte: since30d } }, '-created_date', 500),
    safeList(Invoice, '-created_date', 50),
  ]);

  let data_quality = 'MINIMAL';
  if (Array.isArray(beecomOrders) && beecomOrders.length) data_quality = 'FULL';
  else if (Array.isArray(dailySales) && dailySales.length) data_quality = 'DEGRADED';

  const yesterdayKey = new Date(now - DAY_MS).toISOString().slice(0, 10);
  const yesterdayReservations = (reservations || []).filter(r =>
    (r.date || r.reservation_date || r.created_date || '').startsWith(yesterdayKey)
  ).length;

  return {
    data_quality,
    yesterday_key: yesterdayKey,
    yesterday_reservations: yesterdayReservations,
    daily_sales_30d: dailySales || [],
    beecom_orders_30d: beecomOrders || [],
    invoices_recent: invoices || [],
    reservations_30d_count: (reservations || []).length,
  };
}

function summarizeForLLM(snapshot) {
  const ds = snapshot.daily_sales_30d.slice(0, 30);
  const totalRevenue30d = ds.reduce((s, d) => s + Number(d.total_revenue || d.revenue || 0), 0);
  const avgRevenue = ds.length ? totalRevenue30d / ds.length : null;
  const yesterdayRevenue = ds[0] ? Number(ds[0].total_revenue || ds[0].revenue || 0) : null;

  return {
    data_quality: snapshot.data_quality,
    yesterday_key: snapshot.yesterday_key,
    yesterday_revenue_ils: yesterdayRevenue,
    avg_revenue_30d_ils: avgRevenue,
    daily_sales_recent: ds.slice(0, 7).map(d => ({
      date: d.date,
      revenue: d.total_revenue || d.revenue,
      covers: d.total_covers || d.covers,
    })),
    yesterday_reservations: snapshot.yesterday_reservations,
    reservations_30d_count: snapshot.reservations_30d_count,
    beecom_orders_30d_count: snapshot.beecom_orders_30d.length,
    beecom_orders_sample: snapshot.beecom_orders_30d.slice(0, 20),
    invoices_recent_count: snapshot.invoices_recent.length,
  };
}

/**
 * runCFO — invoke the CFO agent and post its REPORT into the AgentMessage stream.
 * Returns { report, msgId }.
 */
export async function runCFO() {
  await heartbeat('CFO');
  const snapshot = await gatherFinanceData();
  const compact = summarizeForLLM(snapshot);

  const result = await invokeAgent({
    systemPrompt: CFO_SYSTEM_PROMPT,
    userPrompt: [
      `Today: ${new Date().toISOString()}`,
      `Run the daily P&L analysis using the data below.`,
      `Data quality: ${snapshot.data_quality}.`,
      'If a metric cannot be computed, set it to null. Do not estimate.',
      '',
      'DATA SNAPSHOT (JSON):',
      JSON.stringify(compact, null, 2),
    ].join('\n'),
    responseSchema: CFO_DAILY_REPORT_SCHEMA,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, snapshot };
  }

  const report = result.data;
  const msg = await sendAgentMessage({
    from_agent: 'CFO',
    to_agent: 'CEO',
    msg_type: 'REPORT',
    priority_tier: 4,
    topic: 'daily_pnl',
    payload: report,
    qa_passed: true,
  });

  // Escalations become their own SIGNAL messages so the CEO/Crisis can react.
  for (const esc of report.escalations || []) {
    const tier = esc.severity === 'CRITICAL' ? 2 : esc.severity === 'HIGH' ? 3 : 4;
    await sendAgentMessage({
      from_agent: 'CFO',
      to_agent: 'CEO',
      msg_type: 'SIGNAL',
      priority_tier: tier,
      topic: `cfo_escalation_${esc.trigger}`,
      payload: { summary: esc.summary, severity: esc.severity, source_report_msg: msg.msg_id || msg.id },
      qa_passed: true,
    });
  }

  return { ok: true, report, msgId: msg.msg_id || msg.id, snapshot };
}
