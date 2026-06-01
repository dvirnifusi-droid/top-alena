import { base44 } from '@/api/base44Client';

/**
 * DecisionLog — audit trail of every CEO decision. The training set for weekly self-review.
 *
 * Backend schema:
 *   trigger_agent:       string                    (who raised the signal)
 *   trigger_msg_id:      string  nullable          (link to AgentMessage)
 *   decision:            string                    (short slug)
 *   decision_summary:    text                      (1-2 line human-readable)
 *   priority_tier:       integer                   (1-6)
 *   ils_impact_estimate: number  nullable
 *   ils_impact_actual:   number  nullable          (filled later when outcome known)
 *   owner_notified:      boolean
 *   owner_approved:      boolean nullable          (null = not required, true/false = answered)
 *   outcome:             string                    ("PENDING"|"SUCCESS"|"FAILED"|"CANCELLED")
 *   outcome_note:        text    nullable
 *   created_date:        datetime
 *   resolved_at:         datetime nullable
 */
export const DecisionLog = base44.entities.DecisionLog;
