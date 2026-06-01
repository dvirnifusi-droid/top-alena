# Design Spec — UNIT_EVENTS_PRIVATE (Phase B Slice 2)

**Date:** 2026-06-01
**Author:** Dvir Nifusi (owner) + Claude
**Status:** Approved by owner, ready for implementation plan
**Parent project:** Alina CEO Agent ecosystem (see memory: `project-alina-ceo-agent`)

---

## 1. Goal

Build the first concrete **Campaign Unit** of the CEO Agent ecosystem — `UNIT_EVENTS_PRIVATE` — that promotes private events at Alina, generates qualified leads, and routes hot leads to the owner for manual closing.

This slice is intentionally **lead-gen + pre-qualification only**. Auto-closing (with price quoting + payment link) is deferred to **Phase C** because the owner has not yet supplied a complete sales kit (currently only the breakfast-buffet menu exists; missing: prices, capacity, T&Cs, gallery, discount authority, escalation triggers, calendar rules — see memory `project-alina-event-menus`).

The Qualifier built in this slice produces `Lead` records whose `qualifier_answers` schema is **identical to what the Phase C Closer will consume**, so the Qualifier→Closer upgrade in Phase C is zero re-work.

---

## 2. Scope

### In scope (Phase B Slice 2)

1. **CampaignUnit record** for `UNIT_EVENTS_PRIVATE` with current partial sales_kit (breakfast menu) stored in `promoted_thing.sales_kit`.
2. **5 backend marketing crew agents** (records in `Agent` entity, system_prompt populated):
   - `EVENTS_DESIGNER` — visual asset generator
   - `EVENTS_CREATIVE` — copywriter (Hebrew)
   - `EVENTS_AUDIENCE_ROUTER` — audience targeting builder
   - `EVENTS_CAMPAIGN_BUILDER` — deploys campaigns to Meta Ads via Make.com bridge
   - `EVENTS_OPTIMIZER` — twice-daily cron, kills/scales ads under ₪500/month cap
3. **EVENTS_QUALIFIER Base44 agent** — chat agent embedded in the app (same pattern as `recruitment_agent.jsonc`):
   - WhatsApp greeting
   - Hebrew system prompt with 5 qualifying questions
   - CRUD on `Lead` entity
   - Calls `pushoverOnHotEventLead` function for owner alert
4. **New function** `pushoverOnHotEventLead` (parallel to `pushoverOnNewCandidate`).
5. **Agent Inbox card** for `Lead` records with `score >= hot`, with 3 action buttons:
   - "הצע תאריך חלופי" (suggest alternative date)
   - "שלח הצעה ידנית" (send manual quote)
   - "סגור — לא רלוונטי" (close as not relevant)
6. **Spend Guard** — every action by `EVENTS_CAMPAIGN_BUILDER` or `EVENTS_OPTIMIZER` reads `monthly_spend_total` from a shared budget ledger and refuses to exceed ₪500/month; over-cap requests log to `DecisionLog` and escalate.

### Out of scope (Phase C)

- `SALES_CLOSER_EVENTS` Base44 agent — auto-quoting, calendar check, payment link, proposal PDF, deposit collection. Blocked until owner supplies remaining 7 sales-kit items.
- Calendar-availability integration (consumed only by Closer).
- Payment-link integration (Stripe or similar).
- Proposal-PDF generation.
- Physical/IoT triggers (deferred to end of full build per project memory).

---

## 3. Architecture

### 3.1 Data Flow

```
            ┌─────────────────┐
            │  Meta Ads / IG  │  (external)
            └────────┬────────┘
                     │ click/CTA
                     ▼
          ┌────────────────────┐
          │  WhatsApp inbound  │
          └─────────┬──────────┘
                    │ webhook
                    ▼
       ┌──────────────────────────┐
       │   EVENTS_QUALIFIER       │  (Base44 chat agent)
       │   - greets               │
       │   - asks 5 questions     │
       │   - scores 0-100         │
       │   - writes Lead          │
       └────────────┬─────────────┘
                    │
        score>=60   │   score<60
            ▼       │       ▼
   pushoverOnHot…   │   Lead.status=COLD
            │       │
            ▼       ▼
     ┌──────────────────────┐
     │   Agent Inbox card   │  (owner-facing)
     │   3 action buttons   │
     └──────────────────────┘
                    │ owner picks action
                    ▼
            manual close (Phase B)
            OR → SALES_CLOSER_EVENTS (Phase C)
```

### 3.2 Component map

| Component | Type | Location | Notes |
|---|---|---|---|
| `UNIT_EVENTS_PRIVATE` record | `CampaignUnit` entity row | DB | Seeded via migration or one-time admin script |
| 5 marketing crew agents | `Agent` entity rows | DB | `system_prompt` is the actual prompt text |
| `EVENTS_QUALIFIER` | Base44 agent JSON | `base44/agents/events_qualifier_agent.jsonc` | Hot-reload, same pattern as recruitment |
| `pushoverOnHotEventLead` | Base44 function | `base44/functions/pushoverOnHotEventLead/entry.ts` | Sends Pushover with lead summary |
| Agent Inbox card | React component | `src/components/agent-inbox/EventLeadCard.jsx` | New |
| Spend Guard | Function helper | `base44/lib/spendGuard.ts` | Called by Builder/Optimizer before any Meta API write |

### 3.3 Entities (reuse — already exist)

- `CampaignUnit` — already has `promoted_thing`, `crew`, `budget`, `creatives`, `copy_variants`, `audience_matrix`, `external_campaign_ids`, `health`, `kpi_actual_mtd`. **No schema change needed.**
- `Lead` — already has `qualifier_answers`, `status` (NEW→QUALIFIED→QUOTED→BOOKED→LOST→COLD), `conversation_log`, `quoted_amount_ils`, `booked_amount_ils`, `reservation_id`, `assigned_to_agent`, `owner_alerted`. **No schema change needed.**
- `Agent` — `codename`, `role`, `system_prompt`, `status`, `config`. **No schema change needed.**
- `AgentMessage` — for inter-agent comms.
- `DecisionLog` — every spend-guard veto and every escalation logged here.

---

## 4. Agent specifications

### 4.1 EVENTS_QUALIFIER (the only chat agent in this slice)

**Pattern:** identical to `recruitment_agent.jsonc`. Hebrew Base44 agent.

**WhatsApp greeting:** warm Hebrew, 2-3 lines, asks if now is a good time to ask 5 quick questions about their event.

**Qualifying questions (asked one at a time, not as a wall):**
1. תאריך מבוקש (or חלון תאריכים).
2. סוג אירוע — יום הולדת / יום נישואין / אירוע עסקי / חינה / אחר.
3. כמות אורחים משוערת.
4. תקציב משוער לסועד (טווח OK).
5. חלון שעות — בוקר / צהריים / ערב; חלק מהמקום / השכרה מלאה.

**Scoring (0-100):**
- Date filled and >= 14 days from today: +25
- Guest count in [10, 80] range: +25
- Budget per person stated and >= ₪150: +25
- Event type matches Alina's positioning (NOT off-premises catering, NOT kosher-only, NOT >100 guests, NOT same-day): +25
- Subtract 30 if any escalation trigger fires (media/influencer, kosher-only, off-premises, VIP).

**Hot threshold:** score >= 60 → fire `pushoverOnHotEventLead` + create Agent Inbox card.
**Cold:** score < 30 → write `Lead.status=COLD`, polite close, no owner alert.
**Warm (30-59):** save lead, no urgent alert; show in inbox under "warm" bucket.

**Tools:**
- CRUD on `Lead` entity.
- `pushoverOnHotEventLead` function call.

**Hallucination Guard (critical):** the Qualifier MUST NOT quote prices, dates as available, or specific menu items. If pushed, replies: "אני מעבירה את הפרטים למנהל המסעדה — הוא יחזור אליך עם הצעה מותאמת תוך X שעות."

### 4.2 The 5 backend crew agents

These are records in the `Agent` entity table. They run via cron or on-trigger (not user-facing chat). Each has `system_prompt` that follows the universal template from Step 4:

| codename | role | parent | trigger | output |
|---|---|---|---|---|
| `EVENTS_DESIGNER` | `UNIT_AGENT` | `VP_MKT` | brief from VP | 3-5 `Asset` records (image URLs via `GenerateImage`) added to `CampaignUnit.creatives` |
| `EVENTS_CREATIVE` | `UNIT_AGENT` | `VP_MKT` | after Designer | 3-5 copy variants added to `CampaignUnit.copy_variants` |
| `EVENTS_AUDIENCE_ROUTER` | `UNIT_AGENT` | `VP_MKT` | from brief | audience-spec JSON added to `CampaignUnit.audience_matrix` |
| `EVENTS_CAMPAIGN_BUILDER` | `UNIT_AGENT` | `VP_MKT` | after 1+2+3 | Meta campaign_ids written to `CampaignUnit.external_campaign_ids.meta[]` |
| `EVENTS_OPTIMIZER` | `UNIT_AGENT` | `VP_MKT` | cron 09:00 + 17:00 IL | budget/audience changes + `OptimizationLog` (a `DecisionLog` row with category=OPTIMIZATION) |

Full system prompts will be written in the implementation plan, not this spec. The pattern is fixed.

---

## 5. Guardrails

1. **Spend cap ₪500/month total** across all CEO-ecosystem agents. Builder/Optimizer must call `spendGuard.canSpend(amount)` before any Meta API write that increases budget. Vetoed actions write a `DecisionLog` row and escalate to owner.
2. **Hallucination Guard** — Qualifier never quotes prices/availability not in `sales_kit`. Phase C Closer will inherit this guard with stricter scope (only quote from `sales_kit.menus[].price_per_person`).
3. **Escalation triggers** — automatically owner-only:
   - Media / influencer events
   - Off-premises catering requests
   - Kosher-only requests
   - >80 guests
   - <14 days lead time
4. **Silent timeout** — Qualifier sends one nudge at 24h, marks `COLD` at 72h.
5. **Schema lock** — `Lead.qualifier_answers` keys (`event_date`, `event_type`, `guest_count`, `budget_per_person`, `hours_window`) are frozen so Phase C Closer reads them without translation.

---

## 6. Acceptance criteria

A working slice means:
1. `UNIT_EVENTS_PRIVATE` row exists in `CampaignUnit` with the breakfast menu in `promoted_thing.sales_kit.menus[0]` and `status=DRAFT`.
2. 5 marketing crew agents exist as `Agent` rows with non-empty `system_prompt` and `status=DORMANT` (ready but not yet running — owner promotes to LIVE manually).
3. `events_qualifier_agent.jsonc` exists and is registered in the Base44 agent loader.
4. Sending a test WhatsApp message to the Qualifier triggers: greeting → 5 questions → `Lead` row written with `qualifier_answers` populated → score computed → if score>=60, Pushover fires and Agent Inbox card appears.
5. Agent Inbox card renders correctly (Hebrew RTL, 3 buttons functional in DOM).
6. `spendGuard.canSpend()` returns false when monthly cumulative would exceed ₪500; a test row appears in `DecisionLog`.

---

## 7. Open items deferred to Phase C

| Item | Owner action required |
|---|---|
| Prices per person (per menu, per guest-count tier) | Owner supplies |
| Add-ons price list (bar, DJ, photographer, decor) | Owner supplies |
| Capacity (seated/standing per area) | Owner supplies |
| Booking T&Cs (deposit %, cancellation, headcount deadline) | Owner supplies |
| Calendar availability rules + blackout dates | Owner supplies |
| Gallery (8-15 images + 2-3 videos) | Owner supplies |
| Max autonomous discount % | Owner decides (default suggestion 5%) |
| Calendar-check integration | Engineering (Phase C) |
| Payment-link integration | Engineering (Phase C) |
| Proposal-PDF generator | Engineering (Phase C) |
| `events_closer_agent.jsonc` Base44 agent | Engineering (Phase C) |

See memory `project-sales-closer-events-inputs` and `project-alina-event-menus` for the running checklist.

---

## 8. Risks

- **R1: Qualifier hallucinates prices anyway** — mitigated by strict system-prompt rule + Hallucination Guard + Phase B has NO price-quoting tool, so the agent literally cannot expose a number even if it tried.
- **R2: Owner ignores Inbox cards, leads cool off** — mitigated by Pushover push for hot leads + auto-COLD at 72h to prevent dead-lead pollution.
- **R3: Spend Guard race condition (two agents both check, both spend)** — mitigated by transactional read-modify-write in `spendGuard.canSpend(amount)` (single DB row, SELECT FOR UPDATE).
- **R4: Make.com Meta bridge fails silently** — `EVENTS_CAMPAIGN_BUILDER` must verify campaign_id returned from Meta and log to `DecisionLog` on failure.
