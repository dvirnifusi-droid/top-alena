# CEO Agent — Backend Schema Seed

This document defines the 5 new entities the CEO Agent ecosystem requires.
The frontend proxy files (`src/entities/Agent.js`, etc.) auto-create the entity bindings;
the **backend** (self-hosted API) must provide matching tables/collections with these fields.

If the backend uses dynamic schema (like Base44), the entities should appear on first write.
If the backend requires explicit migrations, use this doc to create them.

All entities also receive standard fields: `id`, `created_date`, `updated_date`, `created_by`.

---

## 1. Agent

Registry of every agent in the CEO ecosystem.

| Field | Type | Notes |
|---|---|---|
| codename | string, unique | e.g. `CEO`, `CFO`, `CRISIS`, `VP_MKT`, `SALES_CLOSER_EVENTS` |
| role | enum | `CEO` \| `EXECUTIVE` \| `VP` \| `UNIT_AGENT` \| `SUPPORT` |
| parent_agent_id | string, nullable | who this agent reports to |
| status | enum | `LIVE` \| `DORMANT` \| `FAILING` |
| last_heartbeat | datetime, nullable | |
| system_prompt | text | full prompt fed to `InvokeLLM` |
| model | string | LLM model id; falls back to backend default |
| config | json | per-agent thresholds, intervals, flags |

---

## 2. AgentMessage

Every message between agents OR from agent to owner. Implements the inter-agent envelope from Step 2.

| Field | Type | Notes |
|---|---|---|
| msg_id | string, unique | uuid |
| from_agent | string | codename or `SYSTEM` |
| to_agent | string | codename, `CEO`, `BROADCAST`, or `OWNER` |
| msg_type | enum | `SIGNAL` \| `REQUEST` \| `DIRECTIVE` \| `REPORT` \| `ACK` |
| priority_tier | int | 1–6 per Decision Hierarchy |
| topic | string | short slug |
| payload | json | `{summary, data, ils_impact_estimate, confidence, sources, expires_at}` |
| requires_response | bool | |
| qa_passed | bool | |
| owner_visible | bool | true = renders in Agent Inbox |
| owner_template | enum, nullable | `A` \| `B` \| `C` \| `D` |
| owner_response | json, nullable | answer after owner acts |
| responded_at | datetime, nullable | |
| parent_msg_id | string, nullable | for ACK/reply chains |
| processed | bool, default false | CEO marks true after handling |

**Indexes recommended:** `(to_agent, processed)`, `(owner_visible, created_date desc)`, `(priority_tier, created_date)`.

---

## 3. CampaignUnit

Self-contained promotion crew (5+1 agents) for ONE promoted thing.

| Field | Type | Notes |
|---|---|---|
| unit_id | string, unique | e.g. `UNIT_EVENTS_PRIVATE` |
| unit_name | string | |
| promoted_thing | json | `{type, name, hero_margin_pct, hero_price_ils, ...}` |
| target_outcome | json | `{primary_kpi, kpi_target_monthly, max_cpa_ils}` |
| budget | json | `{monthly_ils, daily_default_ils, daily_ceiling_ils, spent_mtd_ils}` |
| audience_seed | json | `{primary_geo, primary_demo, primary_interest_clusters, exclude_segments}` |
| language_policy | json | `{primary, secondary, ratio}` |
| landing_destinations | json | array of `{name, url, use_for}` |
| brand_guardrails | json | `{voice, forbidden, required_visual_motifs}` |
| crew | json | `{designer, creative_strategist, audience_router, campaign_builder, optimizer, sales_closer}` |
| launch_platforms | json | array, e.g. `["META", "GOOGLE_PMAX"]` |
| status | enum | `DRAFT` \| `PENDING_APPROVAL` \| `LIVE` \| `PAUSED` \| `RETIRED` |
| kpi_actual_mtd | number, default 0 | |
| creatives | json | asset refs from Designer |
| copy_variants | json | from Creative-Strategist |
| audience_matrix | json | from Audience-Router |
| external_campaign_ids | json | `{meta: [...], google: [...]}` |
| health | enum | `GREEN` \| `YELLOW` \| `RED` |
| last_optimizer_run | datetime, nullable | |

---

## 4. DecisionLog

Audit trail of every CEO decision. The training set for weekly self-review.

| Field | Type | Notes |
|---|---|---|
| trigger_agent | string | who raised the signal |
| trigger_msg_id | string, nullable | link to AgentMessage |
| decision | string | short slug |
| decision_summary | text | 1–2 lines human-readable |
| priority_tier | int | 1–6 |
| ils_impact_estimate | number, nullable | |
| ils_impact_actual | number, nullable | filled later when outcome known |
| owner_notified | bool | |
| owner_approved | bool, nullable | null = not required |
| outcome | enum | `PENDING` \| `SUCCESS` \| `FAILED` \| `CANCELLED` |
| outcome_note | text, nullable | |
| resolved_at | datetime, nullable | |

---

## 5. Lead

Every inquiry that enters the sales funnel. Owned by the Sales-Closer of the originating CampaignUnit.

| Field | Type | Notes |
|---|---|---|
| lead_id | string, unique | |
| source_unit | string | `CampaignUnit.unit_id` |
| channel | enum | `APP_INQUIRY` \| `WHATSAPP` \| `PHONE` \| `WALK_IN` \| `REFERRAL` |
| status | enum | `NEW` \| `QUALIFIED` \| `QUOTED` \| `BOOKED` \| `LOST` \| `COLD` |
| contact_name | string | |
| contact_phone | string | |
| contact_email | string, nullable | |
| qualifier_answers | json | `{event_date, event_type, guest_count, budget_per_person}` |
| conversation_log | json | array of `{role, content, timestamp}` |
| quoted_amount_ils | number, nullable | |
| booked_amount_ils | number, nullable | |
| reservation_id | string, nullable | link to existing Reservation entity |
| lost_reason | enum, nullable | `PRICE` \| `DATE_UNAVAIL` \| `GHOSTED` \| `OTHER` |
| assigned_to_agent | string | Sales-Closer codename |
| owner_alerted | bool, default false | |
| utm | json | `{source, medium, campaign, content}` |

---

## Compatibility notes

- All entities use existing topalena conventions: PascalCase names, snake_case fields, JWT-auth via `base44.entities.<Name>`.
- No existing entity, page, or function is modified.
- Frontend proxy files create lazy bindings — accessing `Agent.list()` from a not-yet-migrated backend will return HTTP 404 until the backend exposes the entity. This is the graceful-degradation path: agents that depend on missing entities will report `DORMANT` rather than crash.
