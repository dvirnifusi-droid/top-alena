import { DecisionLog } from '@/entities/all';

export async function logDecision({
  trigger_agent,
  trigger_msg_id = null,
  decision,
  decision_summary,
  priority_tier = 4,
  ils_impact_estimate = null,
  owner_notified = false,
  owner_approved = null,
  outcome = 'PENDING',
}) {
  try {
    return await DecisionLog.create({
      trigger_agent,
      trigger_msg_id,
      decision,
      decision_summary,
      priority_tier,
      ils_impact_estimate,
      owner_notified,
      owner_approved,
      outcome,
    });
  } catch (err) {
    console.warn('[agents] DecisionLog.create failed:', err?.message);
    return null;
  }
}

export async function resolveDecision(id, { outcome, outcome_note, ils_impact_actual }) {
  try {
    return await DecisionLog.update(id, {
      outcome,
      outcome_note,
      ils_impact_actual,
      resolved_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[agents] DecisionLog.update failed:', err?.message);
  }
}
