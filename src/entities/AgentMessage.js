import { base44 } from '@/api/base44Client';

/**
 * AgentMessage — every message sent between agents, OR from an agent to the owner.
 * Implements the inter-agent JSON envelope from Step 2.
 *
 * Backend schema:
 *   msg_id:             string  unique         (uuid)
 *   from_agent:         string                  (agent codename or "SYSTEM")
 *   to_agent:           string                  (codename, "CEO", "BROADCAST", or "OWNER")
 *   msg_type:           string                  ("SIGNAL"|"REQUEST"|"DIRECTIVE"|"REPORT"|"ACK")
 *   priority_tier:      integer                 (1-6, see Decision Hierarchy)
 *   topic:              string                  (short slug)
 *   payload:            json                    ({summary, data, ils_impact_estimate, confidence, sources, expires_at})
 *   requires_response:  boolean
 *   qa_passed:          boolean
 *   owner_visible:      boolean                 (if true → renders in Agent Inbox)
 *   owner_template:     string  nullable        ("A"|"B"|"C"|"D" — only for owner-facing)
 *   owner_response:     json    nullable        (yes/no/text after owner acts)
 *   responded_at:       datetime nullable
 *   parent_msg_id:      string  nullable        (for ACK/reply chains)
 *   processed:          boolean default false   (CEO sets true after processing a SIGNAL)
 *   created_date:       datetime
 */
export const AgentMessage = base44.entities.AgentMessage;
