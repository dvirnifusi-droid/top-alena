import { base44 } from '@/api/base44Client';

/**
 * Agent — registry of every agent in the CEO ecosystem.
 *
 * Backend schema (create matching table/collection):
 *   codename:           string  unique  (e.g. "CEO", "CFO", "CRISIS", "VP_MKT", "SALES_CLOSER_EVENTS")
 *   role:               string          ("CEO" | "EXECUTIVE" | "VP" | "UNIT_AGENT" | "SUPPORT")
 *   parent_agent_id:    string  nullable
 *   status:             string          ("LIVE" | "DORMANT" | "FAILING")
 *   last_heartbeat:     datetime nullable
 *   system_prompt:      text             (full system prompt for InvokeLLM)
 *   model:              string           ("gpt-4o" | "claude-3-5-sonnet" | "gemini-1.5-pro" | default)
 *   config:             json             (per-agent params: thresholds, intervals, etc.)
 *   created_date:       datetime
 *   updated_date:       datetime
 */
export const Agent = base44.entities.Agent;
