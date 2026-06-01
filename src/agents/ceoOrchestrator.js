import { invokeAgent } from './core/invokeAgent';
import { getPendingMessages, markProcessed, notifyOwner } from './core/messages';
import { logDecision } from './core/decisionLog';
import { heartbeat, loadRegistry, systemStatusLine } from './core/registry';
import { runCFO } from './cfoAnalyst';
import { runCrisisScan } from './crisisMonitor';
import { CEO_SYSTEM_PROMPT, CEO_BRIEF_SCHEMA } from './prompts/ceoBrain';

/**
 * runCEOBrief — main entry point for the CEO Agent.
 *
 * Called by:
 *   - Make.com cron at 09:00 / 17:00 / 00:00 (POST /fn/<wrapper>)
 *   - Manual button in Agent Inbox
 *
 * Flow:
 *   1. Heartbeat self.
 *   2. Load registry → know which agents are LIVE / DORMANT / FAILING.
 *   3. Run CFO (if LIVE or DORMANT — runs in DEGRADED if missing data).
 *   4. Run Crisis scan.
 *   5. Collect any pending unprocessed messages addressed to CEO.
 *   6. Invoke CEO LLM with the bundle → produces ONE Template A/B/C/D message.
 *   7. Persist as owner-visible AgentMessage. Log decision. Mark messages processed.
 *
 * @param {object} [opts]
 * @param {'morning'|'afternoon'|'night'|'manual'} [opts.slot]
 */
export async function runCEOBrief({ slot = 'manual' } = {}) {
  await heartbeat('CEO');

  // 1. Registry
  const registry = await loadRegistry();
  const statusLine = systemStatusLine(registry);

  // 2. Sensors — run sequentially so Crisis can react to CFO's escalations.
  const cfoOutcome = await runCFO().catch(err => ({ ok: false, error: err?.message }));
  const crisisOutcome = await runCrisisScan().catch(err => ({ ok: false, error: err?.message }));

  // 3. Pending messages addressed to CEO (signals/reports from sensors above + any prior unprocessed)
  const pending = await getPendingMessages({ to_agent: 'CEO', limit: 50 });

  // 4. Build the user prompt for the CEO brain
  const bundle = {
    slot,
    now: new Date().toISOString(),
    system_status: statusLine,
    registry_summary: {
      live: registry.filter(a => a.status === 'LIVE').map(a => a.codename),
      dormant: registry.filter(a => a.status === 'DORMANT').map(a => a.codename),
      failing: registry.filter(a => a.status === 'FAILING').map(a => a.codename),
    },
    cfo_report: cfoOutcome.ok ? cfoOutcome.report : { error: cfoOutcome.error || 'CFO unavailable' },
    crisis_scan: crisisOutcome.ok ? crisisOutcome.scan : { error: crisisOutcome.error || 'Crisis unavailable' },
    pending_messages: pending.map(m => ({
      msg_id: m.msg_id || m.id,
      from_agent: m.from_agent,
      msg_type: m.msg_type,
      priority_tier: m.priority_tier,
      topic: m.topic,
      payload_summary: m.payload?.summary || null,
      payload: m.payload,
    })),
  };

  // 5. Decide template:
  //    - Any BLACK/RED crisis → Template C
  //    - 09:00/17:00/00:00 (or manual) without crisis → Template A (Daily Brief)
  //    - Approval-required pending message → Template B (request)
  //    - Major win in CFO report → Template D (later)
  const slotLabel = slot === 'morning' ? 'בוקר' : slot === 'afternoon' ? 'אחה"צ' : slot === 'night' ? 'לילה' : 'מצב נוכחי';

  const result = await invokeAgent({
    systemPrompt: CEO_SYSTEM_PROMPT,
    userPrompt: [
      `It is now ${bundle.now}. Brief slot: ${slot} (${slotLabel}).`,
      `Your job: produce ONE owner-facing message in Hebrew, following templates A/B/C/D.`,
      `Decide which template based on signals:`,
      `- Any BLACK or RED crisis triggered → Template C.`,
      `- A pending REQUEST that needs owner approval → Template B.`,
      `- Otherwise on a scheduled slot → Template A (Daily Brief).`,
      `- If a notable positive milestone occurred → Template D.`,
      `Always append the system_status line at the end of Template A: "${bundle.system_status}".`,
      ``,
      `BUNDLE (JSON):`,
      JSON.stringify(bundle, null, 2),
    ].join('\n'),
    responseSchema: CEO_BRIEF_SCHEMA,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, bundle };
  }

  const brief = result.data;

  // 6. Persist as owner-visible message
  const ownerMsg = await notifyOwner({
    template: brief.template,
    topic: `ceo_${slot}_${brief.template}`,
    payload: {
      summary: brief.title || brief.hebrew_message?.split('\n')[0],
      hebrew_message: brief.hebrew_message,
      recommended_action: brief.recommended_action,
      data_quality: brief.data_quality,
      confidence: brief.confidence,
      cfo_report: bundle.cfo_report,
      crisis_scan: bundle.crisis_scan,
      system_status: statusLine,
    },
    priority_tier: brief.priority_tier || 4,
    requires_response: !!brief.requires_response,
  });

  // 7. Log decision
  if (brief.decision_log_entry) {
    await logDecision({
      trigger_agent: 'CEO',
      trigger_msg_id: ownerMsg.msg_id || ownerMsg.id,
      decision: brief.decision_log_entry.decision || `brief_${slot}`,
      decision_summary: brief.decision_log_entry.decision_summary || brief.hebrew_message?.slice(0, 200),
      priority_tier: brief.priority_tier || 4,
      ils_impact_estimate: brief.decision_log_entry.ils_impact_estimate ?? null,
      owner_notified: true,
    });
  }

  // 8. Mark consumed pending messages as processed
  for (const m of pending) {
    if (m.msg_id) await markProcessed(m.msg_id);
    else if (m.id) await markProcessed(m.id);
  }

  return { ok: true, brief, ownerMsgId: ownerMsg.msg_id || ownerMsg.id, bundle };
}

/**
 * Acknowledge an owner response on a Template B message.
 */
export async function handleOwnerResponse(msg_id, response) {
  // Caller (UI) updates the AgentMessage owner_response field directly.
  // Here we just resolve the related decision log entry if needed.
  await logDecision({
    trigger_agent: 'OWNER',
    trigger_msg_id: msg_id,
    decision: 'owner_response',
    decision_summary: `Owner responded: ${JSON.stringify(response).slice(0, 200)}`,
    owner_notified: true,
    owner_approved: response?.answer === 'yes' ? true : response?.answer === 'no' ? false : null,
    outcome: 'PENDING',
  });
}
