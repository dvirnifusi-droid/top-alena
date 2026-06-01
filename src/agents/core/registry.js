import { Agent } from '@/entities/all';

/**
 * Agent registry helpers. Defines the static catalog of agent codenames
 * we recognize, plus runtime heartbeat helpers.
 *
 * Used by ceoOrchestrator to know what's LIVE vs DORMANT vs FAILING.
 */

export const AGENT_CATALOG = [
  // Executive — direct reports to CEO
  { codename: 'CEO', role: 'CEO', parent_agent_id: null },
  { codename: 'CFO', role: 'EXECUTIVE', parent_agent_id: 'CEO' },
  { codename: 'CCO', role: 'EXECUTIVE', parent_agent_id: 'CEO' },
  { codename: 'CRISIS', role: 'EXECUTIVE', parent_agent_id: 'CEO' },
  // VPs
  { codename: 'VP_MKT', role: 'VP', parent_agent_id: 'CEO' },
  { codename: 'VP_OPS', role: 'VP', parent_agent_id: 'CEO' },
  // Marketing — Creative & Content cluster
  { codename: 'COPYWRITER', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'VISUAL_DESIGNER', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'TREND_SPOTTER', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'STORYTELLER', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'MENU_ENGINEER', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  // Marketing — Traffic & Media cluster
  { codename: 'MAIN_MEDIA_BUYER', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'EVENT_CAMPAIGNS', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'LUNCH_CAMPAIGNS', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'EVENING_DELIVERY_CAMPAIGNS', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'OPTIMIZATION_ANALYST', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  // Marketing — Sales & Growth cluster
  { codename: 'CONVERSATIONAL', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'SALES_CLOSER_EVENTS', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'UPSELL', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'LOCAL_SEO', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'INFLUENCER_OUTREACH', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  { codename: 'B2B_CORPORATE', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT' },
  // Operations — Logistics & Control
  { codename: 'PURCHASING', role: 'UNIT_AGENT', parent_agent_id: 'VP_OPS' },
  { codename: 'INVENTORY_AUTOPILOT', role: 'UNIT_AGENT', parent_agent_id: 'VP_OPS' },
  { codename: 'COMPLIANCE', role: 'UNIT_AGENT', parent_agent_id: 'VP_OPS' },
  { codename: 'CASH_FLOW_ANALYST', role: 'UNIT_AGENT', parent_agent_id: 'VP_OPS' },
  { codename: 'CREDIT_CARD_MATCHING', role: 'UNIT_AGENT', parent_agent_id: 'VP_OPS' },
  { codename: 'HR_RECRUITER', role: 'UNIT_AGENT', parent_agent_id: 'VP_OPS' },
  { codename: 'UTILITIES_OVERHEAD', role: 'UNIT_AGENT', parent_agent_id: 'VP_OPS' },
  { codename: 'LEGAL_IP', role: 'UNIT_AGENT', parent_agent_id: 'VP_OPS' },
  { codename: 'MYSTERY_SHOPPER', role: 'UNIT_AGENT', parent_agent_id: 'VP_OPS' },
];

const HEARTBEAT_WINDOW_MS = 30 * 60 * 1000; // 30 min — beyond this = FAILING

export async function loadRegistry() {
  let live = [];
  try {
    live = await Agent.list('', 100);
  } catch (err) {
    console.warn('[agents] Agent.list failed:', err?.message);
  }
  const liveByCodename = new Map(live.map(a => [a.codename, a]));
  const now = Date.now();

  return AGENT_CATALOG.map(spec => {
    const rec = liveByCodename.get(spec.codename);
    if (!rec) return { ...spec, status: 'DORMANT', last_heartbeat: null };
    const beat = rec.last_heartbeat ? new Date(rec.last_heartbeat).getTime() : 0;
    const status = beat && (now - beat) > HEARTBEAT_WINDOW_MS ? 'FAILING' : (rec.status || 'LIVE');
    return { ...spec, ...rec, status };
  });
}

export async function heartbeat(codename) {
  try {
    const list = await Agent.filter({ codename }, '', 1);
    const now = new Date().toISOString();
    if (list?.length) {
      return await Agent.update(list[0].id, { last_heartbeat: now, status: 'LIVE' });
    }
    return await Agent.create({ codename, status: 'LIVE', last_heartbeat: now });
  } catch (err) {
    console.warn('[agents] heartbeat failed for', codename, err?.message);
  }
}

export function systemStatusLine(registry) {
  const live = registry.filter(a => a.status === 'LIVE').length;
  return `מצב מערכת: ${live}/${registry.length} סוכנים פעילים`;
}
