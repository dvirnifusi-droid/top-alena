import { AgentMessage } from '@/entities/all';

const uuid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * sendAgentMessage — create one AgentMessage in topalena.
 * If backend doesn't have the entity yet, swallow the error and log to console.
 * (Graceful degradation — agents must keep running.)
 */
export async function sendAgentMessage({
  from_agent,
  to_agent,
  msg_type,            // SIGNAL | REQUEST | DIRECTIVE | REPORT | ACK
  priority_tier = 4,
  topic,
  payload = {},
  requires_response = false,
  qa_passed = true,
  owner_visible = false,
  owner_template = null,
  parent_msg_id = null,
}) {
  const msg = {
    msg_id: uuid(),
    from_agent,
    to_agent,
    msg_type,
    priority_tier,
    topic,
    payload,
    requires_response,
    qa_passed,
    owner_visible,
    owner_template,
    parent_msg_id,
    processed: false,
  };
  try {
    return await AgentMessage.create(msg);
  } catch (err) {
    console.warn('[agents] AgentMessage.create failed — entity may not exist on backend yet:', err?.message);
    return { ...msg, _local_only: true };
  }
}

/**
 * Push an owner-facing message (Template A/B/C/D).
 * Auto-sets owner_visible=true.
 */
export async function notifyOwner({ template, topic, payload, from_agent = 'CEO', priority_tier = 3, requires_response = false }) {
  return sendAgentMessage({
    from_agent,
    to_agent: 'OWNER',
    msg_type: requires_response ? 'REQUEST' : 'REPORT',
    priority_tier,
    topic,
    payload,
    owner_visible: true,
    owner_template: template,
    requires_response,
  });
}

export async function getPendingMessages({ to_agent = 'CEO', limit = 50 } = {}) {
  try {
    return await AgentMessage.filter({ to_agent, processed: false }, '-created_date', limit);
  } catch (err) {
    console.warn('[agents] AgentMessage.filter failed:', err?.message);
    return [];
  }
}

export async function markProcessed(msg_id) {
  try {
    return await AgentMessage.update(msg_id, { processed: true });
  } catch (err) {
    console.warn('[agents] AgentMessage.update failed:', err?.message);
  }
}
