import { CustomerFeedback, DailySales, Reservation, BeecommOrder, InventoryAlert, CampaignLog } from '@/entities/all';
import { invokeAgent } from './core/invokeAgent';
import { sendAgentMessage } from './core/messages';
import { heartbeat } from './core/registry';
import { CRISIS_SYSTEM_PROMPT, CRISIS_SCAN_SCHEMA } from './prompts/crisisMonitor';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

async function safeList(entity, ...args) {
  try { return await entity.list(...args); } catch { return null; }
}
async function safeFilter(entity, ...args) {
  try { return await entity.filter(...args); } catch { return null; }
}

/**
 * Gather signals the Crisis Agent needs to evaluate.
 * Each block degrades gracefully — if entity unavailable, returns null.
 */
async function gatherSignals() {
  const now = Date.now();
  const since1h = new Date(now - HOUR_MS).toISOString();
  const since24h = new Date(now - DAY_MS).toISOString();

  const [recentFeedback24h, recentFeedback1h, posLast2h, openInventoryAlerts, campaignLogs] = await Promise.all([
    safeFilter(CustomerFeedback, { created_date: { gte: since24h } }, '-created_date', 200),
    safeFilter(CustomerFeedback, { created_date: { gte: since1h } }, '-created_date', 50),
    safeFilter(BeecommOrder, { created_date: { gte: new Date(now - 2 * HOUR_MS).toISOString() } }, '-created_date', 100),
    safeFilter(InventoryAlert, { resolved: false }, '-created_date', 50),
    safeList(CampaignLog, '-created_date', 30),
  ]);

  const negative1h = (recentFeedback1h || []).filter(f =>
    (typeof f.rating === 'number' && f.rating <= 2) || /negative|שלילי|גרוע|נורא/i.test(f.sentiment || '')
  ).length;

  const avgRating24h = (recentFeedback24h || []).length
    ? (recentFeedback24h.reduce((s, f) => s + Number(f.rating || 0), 0) / recentFeedback24h.length)
    : null;

  const isOpenHour = (() => {
    const h = new Date().getHours();
    return h >= 11 && h <= 23;
  })();

  return {
    avg_rating_24h: avgRating24h,
    negative_mentions_1h: negative1h,
    pos_transactions_last_2h: (posLast2h || []).length,
    is_open_hour: isOpenHour,
    open_inventory_alerts: (openInventoryAlerts || []).slice(0, 10).map(a => ({
      sku: a.sku || a.item || null,
      message: a.message || a.alert || null,
      severity: a.severity || null,
    })),
    active_campaigns: (campaignLogs || []).slice(0, 10).map(c => ({
      name: c.campaign_name || c.name,
      spend: c.spend || c.spend_ils,
      revenue: c.revenue || c.attributed_revenue,
      roas: (c.revenue && c.spend) ? Number(c.revenue) / Number(c.spend) : null,
    })),
  };
}

/**
 * runCrisisScan — runs one polling cycle. Emits SIGNAL messages for every triggered alert.
 * Returns { scan, criticalCount }.
 */
export async function runCrisisScan() {
  await heartbeat('CRISIS');
  const signals = await gatherSignals();

  const result = await invokeAgent({
    systemPrompt: CRISIS_SYSTEM_PROMPT,
    userPrompt: [
      `Now: ${new Date().toISOString()}`,
      'Evaluate the 8 monitored signals. Use the data below — if a data point is missing, do not invent.',
      'Return ONLY signals that are genuinely triggered. If everything is fine, set triggered: [] and all_clear: true.',
      '',
      'DATA SNAPSHOT (JSON):',
      JSON.stringify(signals, null, 2),
    ].join('\n'),
    responseSchema: CRISIS_SCAN_SCHEMA,
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const scan = result.data;
  let criticalCount = 0;
  for (const t of scan.triggered || []) {
    const tier = t.severity === 'BLACK' ? 1 : t.severity === 'RED' ? 2 : 4;
    if (t.severity === 'BLACK' || t.severity === 'RED') criticalCount++;
    await sendAgentMessage({
      from_agent: 'CRISIS',
      to_agent: 'CEO',
      msg_type: 'SIGNAL',
      priority_tier: tier,
      topic: `crisis_${t.signal_id}`,
      payload: t,
      qa_passed: true,
    });
  }

  return { ok: true, scan, criticalCount, signals };
}
