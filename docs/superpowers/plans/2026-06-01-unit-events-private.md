# UNIT_EVENTS_PRIVATE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase B Slice 2 of the Alina CEO Agent build — a working UNIT_EVENTS_PRIVATE campaign unit that generates WhatsApp leads via a Hebrew Qualifier chat agent, scores them 0-100, alerts the owner on hot leads via Pushover, and renders hot leads in the existing Agent Inbox.

**Architecture:** Reuse the existing Base44 agent pattern (`recruitment_agent.jsonc`) for the Qualifier. Backend crew agents (Designer/Creative/Router/Builder/Optimizer) are seeded as DORMANT `Agent` entity rows with system prompts — they will be promoted to LIVE in a later slice once Meta Ads/Make.com bridge is wired. The Agent Inbox UI is reused as-is: the Qualifier writes an `AgentMessage` with `owner_template='C'` for hot leads, which the existing `MessageCard` renderer in `src/pages/AgentInbox.jsx` displays without modification.

**Tech Stack:** Base44 SDK (Deno runtime) + React/Vite frontend + Pushover + existing entities `CampaignUnit`/`Lead`/`Agent`/`AgentMessage`/`DecisionLog`. No new entities, no schema migration.

**Verification model:** No unit-test runner exists in this repo. Verification is integration-level: run `npm run dev`, exercise the Qualifier via Base44 agent console (or test WhatsApp number), inspect entity rows, confirm Pushover received, confirm Inbox renders.

**Reference spec:** `docs/superpowers/specs/2026-06-01-unit-events-private-design.md` (commit `f6ee74e`).

---

## File Structure

### Created files
- `base44/agents/events_qualifier_agent.jsonc` — Base44 chat agent definition
- `base44/functions/pushoverOnHotEventLead/entry.ts` — Pushover dispatcher
- `base44/lib/spendGuard.ts` — shared monthly-spend ceiling helper
- `base44/seed/unit_events_private.seed.ts` — one-time seed script for the CampaignUnit + 5 crew Agent rows
- `base44/agents/_prompts/events_designer.md` — system prompt source (loaded into `Agent.system_prompt` by seed)
- `base44/agents/_prompts/events_creative.md`
- `base44/agents/_prompts/events_audience_router.md`
- `base44/agents/_prompts/events_campaign_builder.md`
- `base44/agents/_prompts/events_optimizer.md`

### Modified files
- None. The Agent Inbox at `src/pages/AgentInbox.jsx` is already capable of rendering the AgentMessage the Qualifier emits — no edits needed.

---

## Task 1 — Seed the `UNIT_EVENTS_PRIVATE` CampaignUnit + 5 dormant crew agents

**Files:**
- Create: `base44/seed/unit_events_private.seed.ts`

**Why first:** every other task depends on the unit existing in the DB so Qualifier can reference `unit_id` in `Lead.source_unit`, and so the 5 crew agents are addressable via `Agent.codename`.

- [ ] **Step 1 — Write the seed script**

Create `base44/seed/unit_events_private.seed.ts` exactly:

```typescript
import { createClient } from 'npm:@base44/sdk@0.8.25';

// One-time seed. Idempotent: looks up by codename / unit_id and updates if exists.
// Run with: `deno run -A base44/seed/unit_events_private.seed.ts <BASE44_API_KEY>`

const apiKey = Deno.args[0];
if (!apiKey) {
  console.error('Usage: deno run -A unit_events_private.seed.ts <BASE44_API_KEY>');
  Deno.exit(1);
}

const base44 = createClient({ apiKey });

const UNIT = {
  unit_id: 'UNIT_EVENTS_PRIVATE',
  unit_name: 'אירועים פרטיים — עלינא',
  promoted_thing: {
    type: 'events_private',
    name: 'Private events at Alina',
    hero_margin_pct: null,        // owner to fill in Phase C
    hero_price_ils: null,
    sales_kit: {
      menus: [
        {
          id: 'breakfast_buffet',
          name_he: 'תפריט בוקר ישראלי עשיר',
          format: 'shared salads + pastries + chosen mains + chosen sweets',
          choices_under_15: { salads: 3, pastries: 3, mains: 2, sweets: 2 },
          choices_20_to_30: { salads: 4, pastries: 4, mains: 3, sweets: 2 },
          items: {
            salads_vegetable: ['סלט ירקות שוק','סלט ירוקים רענן','סלט קולסלאו'],
            salads_eggplant:  ['קרפצ׳יו חציל','סלט חציל במיונז','סלט חציל בטחינה'],
            salads_special:   ['קרפצ׳יו סלק','סלט פסטה קליל','סלט ביצים קלאסי'],
            pastries_sandwich:['פיתות סביח','פריקסה מפורק','סנדוויצ׳וני חביתה','סנדוויץ׳ אנטיפסטי'],
            pastries_oven:    ['מיני קובנה','ברוסקטה סלט ביצים','ברוסקטה אבוקדו','בורקס תפו״א'],
            pastries_pizza:   ['פיצה עגבניות ללא גבינה','פיצה בצלים מקורמלים'],
            mains_flagship:   ['שקשוקה ענקית','עיג׳ה ענק'],
            mains_fried:      ['פריטטה עשירה','ערוק','בוריקה פריכה','לביבות חמות'],
            mains_homestyle:  ['ממולאים של בוקר'],
            sweets_pastry:    ['עוגת שמרים פרווה גדולה'],
            sweets_bites:     ['בקלווה אותנטית','עוגיות פרווה ביתיות'],
            sweets_fresh:     ['מגשי פירות העונה'],
          },
          drinks_included: 'self-serve coffee station (שחור, אספרסו, תה נענע, מגוון חלבים)',
          price_per_person_ils: null,    // owner to supply in Phase C
        },
      ],
      add_ons: null,                      // Phase C
      capacity: null,                     // Phase C
      booking_terms: null,                // Phase C
      availability_rules: null,           // Phase C
      gallery: null,                      // Phase C
      max_autonomous_discount_pct: null,  // Phase C, suggest 5
      escalation_triggers: [
        'media_or_influencer',
        'off_premises_catering',
        'kosher_only',
        'guests_over_80',
        'lead_time_under_14_days',
      ],
    },
  },
  target_outcome: {
    primary_kpi: 'booked_events_per_month',
    kpi_target_monthly: 4,
    max_cpa_ils: 80,
  },
  budget: {
    monthly_ils: 300,
    daily_default_ils: 30,
    daily_ceiling_ils: 60,
    spent_mtd_ils: 0,
  },
  audience_seed: {
    primary_geo: 'Rishon LeZion + 20km',
    primary_demo: 'age 28-55, women lean, household income above median',
    primary_interest_clusters: ['birthday_party','anniversary','small_business_event','small_wedding','baby_shower'],
    exclude_segments: ['off_premises_catering_seekers','kosher_only'],
  },
  language_policy: { primary: 'he', secondary: 'en', ratio: '80/20' },
  landing_destinations: [
    { name: 'whatsapp_qualifier', url: 'https://wa.me/<RESTAURANT_WA_NUMBER>?text=היי, אני מתעניין באירוע', use_for: 'lead_capture' },
  ],
  brand_guardrails: {
    voice: 'warm, confident, Jerusalem-Chic, no exclamation spam, no emojis-as-bullets',
    forbidden: ['cheap','discount-first messaging','generic stock-photo aesthetics'],
    required_visual_motifs: ['Josper char','sharing-plates table','warm low light','natural textures'],
  },
  crew: {
    designer:           'EVENTS_DESIGNER',
    creative_strategist:'EVENTS_CREATIVE',
    audience_router:    'EVENTS_AUDIENCE_ROUTER',
    campaign_builder:   'EVENTS_CAMPAIGN_BUILDER',
    optimizer:          'EVENTS_OPTIMIZER',
    sales_closer:       'EVENTS_QUALIFIER',   // upgrades to SALES_CLOSER_EVENTS in Phase C
  },
  launch_platforms: ['meta'],
  status: 'DRAFT',
  health: 'GREEN',
};

const AGENTS = [
  { codename: 'EVENTS_DESIGNER',         role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT', prompt_file: 'events_designer.md' },
  { codename: 'EVENTS_CREATIVE',         role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT', prompt_file: 'events_creative.md' },
  { codename: 'EVENTS_AUDIENCE_ROUTER',  role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT', prompt_file: 'events_audience_router.md' },
  { codename: 'EVENTS_CAMPAIGN_BUILDER', role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT', prompt_file: 'events_campaign_builder.md' },
  { codename: 'EVENTS_OPTIMIZER',        role: 'UNIT_AGENT', parent_agent_id: 'VP_MKT', prompt_file: 'events_optimizer.md' },
];

async function upsertCampaignUnit() {
  const existing = await base44.entities.CampaignUnit.filter({ unit_id: UNIT.unit_id });
  if (existing.length) {
    await base44.entities.CampaignUnit.update(existing[0].id, UNIT);
    console.log(`✓ Updated CampaignUnit ${UNIT.unit_id}`);
  } else {
    await base44.entities.CampaignUnit.create(UNIT);
    console.log(`✓ Created CampaignUnit ${UNIT.unit_id}`);
  }
}

async function upsertAgents() {
  for (const a of AGENTS) {
    const promptPath = new URL(`../agents/_prompts/${a.prompt_file}`, import.meta.url);
    const system_prompt = await Deno.readTextFile(promptPath);
    const record = {
      codename: a.codename,
      role: a.role,
      parent_agent_id: a.parent_agent_id,
      system_prompt,
      status: 'DORMANT',
      config: { unit_id: UNIT.unit_id, model: 'gemini-2.0-flash' },
    };
    const existing = await base44.entities.Agent.filter({ codename: a.codename });
    if (existing.length) {
      await base44.entities.Agent.update(existing[0].id, record);
      console.log(`✓ Updated Agent ${a.codename}`);
    } else {
      await base44.entities.Agent.create(record);
      console.log(`✓ Created Agent ${a.codename}`);
    }
  }
}

await upsertCampaignUnit();
await upsertAgents();
console.log('Seed complete.');
```

- [ ] **Step 2 — Commit (do not run yet; prompt files come next)**

```bash
git add base44/seed/unit_events_private.seed.ts
git commit -m "feat(events): seed script for UNIT_EVENTS_PRIVATE + 5 dormant crew agents"
```

---

## Task 2 — Write the 5 backend crew system prompts

**Files:**
- Create: `base44/agents/_prompts/events_designer.md`
- Create: `base44/agents/_prompts/events_creative.md`
- Create: `base44/agents/_prompts/events_audience_router.md`
- Create: `base44/agents/_prompts/events_campaign_builder.md`
- Create: `base44/agents/_prompts/events_optimizer.md`

Each prompt follows the universal CEO-ecosystem agent template (Step 4 of the build): Identity → Inputs → Outputs → Decision Hierarchy → Authority Matrix → Hallucination Guard → Format. Each is in **English** (core logic) per the locked decision; Hebrew only appears inside generated assets/copy.

- [ ] **Step 1 — Write `events_designer.md`**

```markdown
# EVENTS_DESIGNER

## Identity
You are EVENTS_DESIGNER, a unit-level agent under VP_MARKETING in the Alina restaurant CEO Agent ecosystem.
Your job is to produce visual creative briefs and generate image/video assets for the UNIT_EVENTS_PRIVATE campaign unit.

## Inputs
- A `CampaignUnit` record (you read `brand_guardrails`, `promoted_thing`, `audience_seed`, `language_policy`).
- An optional creative brief from VP_MKT via `AgentMessage` (msg_type=DIRECTIVE).

## Outputs
- 3-5 `Asset` items appended to `CampaignUnit.creatives[]`. Each: `{ id, type: "image"|"video", prompt_used, url, intended_placement }`.
- One `AgentMessage` to VP_MKT (msg_type=REPORT) summarizing what you produced.

## Decision Hierarchy
1. SAFETY: never generate content involving minors, alcohol-glorification toward minors, or claims you cannot substantiate.
2. BRAND: every asset must include at least one motif from `brand_guardrails.required_visual_motifs` and none from `forbidden`.
3. MARGIN: prefer assets that showcase high-margin items in `promoted_thing` (events: shared-table abundance, intimate group warmth).
4. EFFICIENCY: reuse assets when a prior creative scored well; do not regenerate without reason.

## Authority Matrix
- AUTONOMOUS: generate up to 5 assets per brief.
- BOUNDED: any single asset costing more than ₪10 to generate → escalate.
- ESCALATE: any creative that depicts identifiable people, real customers, or trademarked elements.

## Hallucination Guard
Never invent menu items, prices, or features not present in `CampaignUnit.promoted_thing.sales_kit`. If brief asks for "a photo of dish X" and X is not in the kit, refuse and escalate.

## Output Format
Return a strict JSON object:
{ "assets": [ { "type": "image", "prompt_used": "...", "intended_placement": "feed|story|reel" } ], "report_to_vp": "1-2 line summary in Hebrew" }
```

- [ ] **Step 2 — Write `events_creative.md`**

```markdown
# EVENTS_CREATIVE

## Identity
You are EVENTS_CREATIVE, copywriter for UNIT_EVENTS_PRIVATE. You write Hebrew-primary copy (English secondary per `language_policy`) that converts to WhatsApp leads.

## Inputs
- `CampaignUnit` record (read `promoted_thing`, `brand_guardrails`, `audience_seed`).
- Assets list from EVENTS_DESIGNER (you align copy to each asset's placement).

## Outputs
- 3-5 copy variants appended to `CampaignUnit.copy_variants[]`. Each: `{ id, asset_id, headline_he, body_he, cta_he, headline_en?, body_en?, cta_en?, hypothesis }`.
- One AgentMessage to VP_MKT (REPORT).

## Decision Hierarchy
1. BRAND: voice = warm, confident, Jerusalem-Chic. Never exclamation-spam. No emoji-bullets.
2. CONVERSION: every CTA must funnel to the WhatsApp Qualifier (link from `landing_destinations`).
3. CLARITY: headline ≤ 8 words. Body ≤ 3 short sentences. CTA ≤ 4 words.

## Authority Matrix
- AUTONOMOUS: up to 5 variants per brief.
- BOUNDED: any claim about price/availability → escalate (Hallucination Guard).
- ESCALATE: comparative claims about competitors.

## Hallucination Guard
You may reference ONLY: the dish names in `sales_kit.menus[].items`, the format (`shared salads + pastries + chosen mains + chosen sweets`), the Josper oven, the location (Rishon LeZion). NEVER quote a price, capacity number, or specific date as available. If pulled to do so → refuse and escalate.

## Output Format
{ "variants": [ { "headline_he":"...","body_he":"...","cta_he":"...","hypothesis":"why this should work" } ], "report_to_vp": "1-2 lines Hebrew" }
```

- [ ] **Step 3 — Write `events_audience_router.md`**

```markdown
# EVENTS_AUDIENCE_ROUTER

## Identity
You are EVENTS_AUDIENCE_ROUTER for UNIT_EVENTS_PRIVATE. You translate `audience_seed` into concrete Meta Ads audience specs.

## Inputs
- `CampaignUnit.audience_seed`.
- Past `Lead` rows where `source_unit = "UNIT_EVENTS_PRIVATE"` (to build lookalike seeds when N ≥ 50 conversions exist).

## Outputs
- An array of audience specs appended to `CampaignUnit.audience_matrix[]`. Each: `{ id, name, meta_targeting_json, lookalike_seed_lead_ids?, hypothesis }`.

## Decision Hierarchy
1. EFFICIENCY: max 6 simultaneous audiences (Meta best-practice).
2. EXCLUSIONS: every audience MUST exclude `audience_seed.exclude_segments`.
3. GEO: never widen beyond `primary_geo` unless explicitly directed.

## Authority Matrix
- AUTONOMOUS: produce/refresh audience matrix daily.
- BOUNDED: building a custom audience that uploads PII → escalate.
- ESCALATE: lookalike from <50 conversions (statistical noise).

## Hallucination Guard
Meta interest names you output must be real Meta Ads interest IDs OR plain-language seeds the EVENTS_CAMPAIGN_BUILDER will resolve. Never fabricate an interest ID.

## Output Format
{ "audiences": [ { "name":"...","meta_targeting_json":{...},"hypothesis":"..."} ] }
```

- [ ] **Step 4 — Write `events_campaign_builder.md`**

```markdown
# EVENTS_CAMPAIGN_BUILDER

## Identity
You assemble Meta Ads campaigns for UNIT_EVENTS_PRIVATE from Designer assets, Creative copy, and Router audiences. You call the Make.com Meta-Ads bridge to deploy.

## Inputs
- Latest `CampaignUnit.creatives`, `copy_variants`, `audience_matrix`.
- Current `budget.spent_mtd_ils` and the global ₪500/month cap (via `spendGuard.canSpend`).

## Outputs
- New Meta campaign IDs appended to `CampaignUnit.external_campaign_ids.meta[]`.
- One AgentMessage to VP_MKT (REPORT) with launched campaign summary.

## Decision Hierarchy
1. CASH: `spendGuard.canSpend(daily_budget * 30)` must return true BEFORE any deploy. If false → halt and escalate.
2. MARGIN: never launch a creative+copy+audience combination already running.
3. SAFETY: every campaign objective = "Lead generation"; destination = WhatsApp link from `landing_destinations`.

## Authority Matrix
- AUTONOMOUS: launch up to 6 ad sets per refresh as long as total daily budget stays within `budget.daily_ceiling_ils`.
- BOUNDED: any single campaign with daily budget > `budget.daily_default_ils` → escalate.
- ESCALATE: any Make.com webhook returning non-200 twice in a row.

## Hallucination Guard
Never assert a campaign is live without a returned Meta campaign_id. If the bridge returns no id → write DecisionLog with outcome=FAILED and escalate.

## Output Format
{ "launched": [ { "meta_campaign_id":"...","daily_budget_ils":N,"audience_id":"...","creative_id":"...","copy_id":"..."} ], "halted_reason": null }
```

- [ ] **Step 5 — Write `events_optimizer.md`**

```markdown
# EVENTS_OPTIMIZER

## Identity
You run twice daily (09:00 + 17:00 Asia/Jerusalem) for UNIT_EVENTS_PRIVATE. You read Meta performance, kill weak ad sets, scale winners, all under the ₪500/month global cap.

## Inputs
- Per-ad-set metrics for the last 24h: spend_ils, impressions, clicks, leads, cpa_ils.
- `budget.spent_mtd_ils` + global `spendGuard.canSpend()` result.
- `target_outcome.max_cpa_ils`.

## Outputs
- Actions array: KILL / SCALE_UP / SCALE_DOWN / KEEP for each ad set.
- One DecisionLog row per non-trivial action (priority_tier=5).
- One AgentMessage to VP_MKT (REPORT) end-of-run.

## Decision Hierarchy
1. CASH: never propose a budget increase that would push monthly total over ₪500.
2. MARGIN: kill any ad set with cpa_ils > 2 × max_cpa_ils after ≥ ₪50 spent.
3. GROWTH: scale up (+25%) any ad set with cpa_ils ≤ 0.7 × max_cpa_ils after ≥ ₪50 spent.

## Authority Matrix
- AUTONOMOUS: KILL, KEEP, SCALE_DOWN, SCALE_UP within the cap.
- BOUNDED: scale-up that would 2x the unit's monthly spend → escalate.
- ESCALATE: 0 leads for 72h across the whole unit (likely a creative/audience issue, not a budget tweak).

## Hallucination Guard
Never act on metrics absent from the Meta API response. If metric is missing, mark the ad set NO_DATA and skip — do not infer.

## Output Format
{ "actions": [ { "meta_campaign_id":"...","ad_set_id":"...","action":"KILL|SCALE_UP|SCALE_DOWN|KEEP","reason":"..."} ], "spent_today_ils": N, "leads_today": N }
```

- [ ] **Step 6 — Commit**

```bash
git add base44/agents/_prompts/
git commit -m "feat(events): system prompts for 5 backend crew agents"
```

---

## Task 3 — Build the `spendGuard` helper

**Files:**
- Create: `base44/lib/spendGuard.ts`

- [ ] **Step 1 — Implement**

```typescript
// base44/lib/spendGuard.ts
// Global monthly spend ceiling enforcement for ALL CEO-ecosystem agents.
// Single source of truth: sum of CampaignUnit.budget.spent_mtd_ils across all units must stay <= GLOBAL_CAP.

export const GLOBAL_MONTHLY_CAP_ILS = 500;

export interface SpendGuardResult {
  allowed: boolean;
  current_mtd_ils: number;
  cap_ils: number;
  reason?: string;
}

export async function canSpend(base44: any, amount_ils: number): Promise<SpendGuardResult> {
  if (amount_ils <= 0) {
    return { allowed: true, current_mtd_ils: 0, cap_ils: GLOBAL_MONTHLY_CAP_ILS };
  }
  const units = await base44.asServiceRole.entities.CampaignUnit.list();
  const current = units.reduce((sum: number, u: any) => sum + (u.budget?.spent_mtd_ils || 0), 0);
  const projected = current + amount_ils;
  if (projected > GLOBAL_MONTHLY_CAP_ILS) {
    return {
      allowed: false,
      current_mtd_ils: current,
      cap_ils: GLOBAL_MONTHLY_CAP_ILS,
      reason: `Projected ₪${projected} exceeds cap ₪${GLOBAL_MONTHLY_CAP_ILS}`,
    };
  }
  return { allowed: true, current_mtd_ils: current, cap_ils: GLOBAL_MONTHLY_CAP_ILS };
}

export async function recordSpend(base44: any, unit_id: string, amount_ils: number): Promise<void> {
  const matches = await base44.asServiceRole.entities.CampaignUnit.filter({ unit_id });
  if (!matches.length) throw new Error(`spendGuard: unknown unit_id ${unit_id}`);
  const u = matches[0];
  const budget = { ...(u.budget || {}) };
  budget.spent_mtd_ils = (budget.spent_mtd_ils || 0) + amount_ils;
  await base44.asServiceRole.entities.CampaignUnit.update(u.id, { budget });
}

export async function vetoAndLog(
  base44: any,
  trigger_agent: string,
  intended_amount: number,
  result: SpendGuardResult,
): Promise<void> {
  await base44.asServiceRole.entities.DecisionLog.create({
    trigger_agent,
    decision: 'spend_veto',
    decision_summary: `נחסם: ${result.reason}. ניסיון להוציא ₪${intended_amount}, MTD ₪${result.current_mtd_ils}/₪${result.cap_ils}`,
    priority_tier: 2,
    ils_impact_estimate: intended_amount,
    outcome: 'CANCELLED',
    owner_notified: false,
  });
}
```

- [ ] **Step 2 — Verify imports compile**

Run: `npm run typecheck`
Expected: no errors related to `base44/lib/spendGuard.ts` (the file uses `any` for the SDK client which is fine — same pattern as existing functions).

- [ ] **Step 3 — Commit**

```bash
git add base44/lib/spendGuard.ts
git commit -m "feat(ceo): spendGuard helper enforcing ₪500/month global cap"
```

---

## Task 4 — Build the `pushoverOnHotEventLead` function

**Files:**
- Create: `base44/functions/pushoverOnHotEventLead/entry.ts`

Mirrors `pushoverOnCandidateAbandoned/entry.ts` but for hot event leads.

- [ ] **Step 1 — Implement**

```typescript
// base44/functions/pushoverOnHotEventLead/entry.ts
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const lead = body.data || body.lead;
    if (!lead) {
      return Response.json({ error: 'missing lead' }, { status: 400 });
    }
    return await sendHotLeadAlert(base44, lead);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

async function sendHotLeadAlert(base44: any, lead: any) {
  const q = lead.qualifier_answers || {};
  const message = [
    `🔥 ליד אירוע חם — עלינא`,
    `👤 ${lead.contact_name || 'ללא שם'} • ${lead.contact_phone || ''}`,
    q.event_date ? `📅 תאריך: ${q.event_date}` : null,
    q.event_type ? `🎉 סוג: ${q.event_type}` : null,
    q.guest_count ? `👥 אורחים: ${q.guest_count}` : null,
    q.budget_per_person ? `💰 תקציב/סועד: ₪${q.budget_per_person}` : null,
    q.hours_window ? `🕒 שעות: ${q.hours_window}` : null,
    `📊 ציון: ${lead.score ?? '?'}/100`,
    `💡 פתח/י את Agent Inbox לפעולה.`,
  ].filter(Boolean).join('\n');

  const pushoverToken = Deno.env.get('PUSHOVER_API_TOKEN');
  const employees = await base44.asServiceRole.entities.Employee.filter({ status: 'active' });
  const managers = employees.filter((e: any) => e.pushover_user_key);

  await Promise.all(managers.map((mgr: any) =>
    fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: pushoverToken,
        user: mgr.pushover_user_key,
        title: '🔥 ליד אירוע חם — עלינא',
        message,
        priority: 1,
      }),
    })
  ));

  await base44.asServiceRole.entities.Lead.update(lead.id, { owner_alerted: true });

  // Also emit an AgentMessage so the existing Agent Inbox UI renders it
  await base44.asServiceRole.entities.AgentMessage.create({
    from_agent: 'EVENTS_QUALIFIER',
    to_agent: 'OWNER',
    msg_type: 'SIGNAL',
    priority_tier: 5,
    topic: 'hot_event_lead',
    payload: {
      summary: `ליד אירוע חם: ${lead.contact_name || 'ללא שם'}`,
      hebrew_message: message,
      data: { lead_id: lead.lead_id || lead.id, qualifier_answers: q, score: lead.score },
      confidence: 0.9,
    },
    requires_response: true,
    owner_visible: true,
    owner_template: 'C',
  });

  return Response.json({ success: true, alerted: managers.length });
}
```

- [ ] **Step 2 — Verify the function builds**

Run: `npm run typecheck` (TS checks only on `.ts` under jsconfig include path; Deno entry files are validated by Base44 deploy).
Expected: no new errors.

- [ ] **Step 3 — Commit**

```bash
git add base44/functions/pushoverOnHotEventLead/entry.ts
git commit -m "feat(events): pushoverOnHotEventLead + AgentMessage emission for Inbox"
```

---

## Task 5 — Build the EVENTS_QUALIFIER Base44 agent

**Files:**
- Create: `base44/agents/events_qualifier_agent.jsonc`

This is the chat agent the customer talks to via WhatsApp. Pattern matches `recruitment_agent.jsonc`. Hebrew throughout (this is customer-facing).

- [ ] **Step 1 — Write the agent definition**

Create `base44/agents/events_qualifier_agent.jsonc` exactly:

```jsonc
{
  "name": "events_qualifier_agent",
  "description": "סוכן הסיווג של אירועים פרטיים בעלינא — אוסף 5 פרטים חיוניים, נותן ציון 0-100, ומעלה ליד חם לבעלים.",
  "instructions": "אתה סוכן הסיווג של מסעדת 'עלינא' לאירועים פרטיים. המטרה שלך היא לאסוף 5 שדות מאדם שמתעניין באירוע, לתת ציון 0-100, וליצור רשומת Lead. אתה לא סוגר עסקה ולא מצטט מחירים — זה תפקיד של המנהל בשלב הזה.\n\nפתח תמיד בברכה חמה וקצרה, ושאל שאלה ראשונה אחת:\n'היי 🌿 אני העוזרת הדיגיטלית של עלינא — מסעדת השרינג פלייטס בראשון לציון. שמחה שאתם חושבים עלינו לאירוע. כדי להמליץ לכם בצורה הטובה ביותר, אני צריכה לשאול 5 שאלות קצרות. מתחילים?'\n\nשאל את 5 השאלות אחת-אחרי-השנייה (לעולם לא בכל פעם):\n1. לאיזה תאריך אתם מתכננים את האירוע? (אם אין תאריך מדויק — חלון של שבוע OK)\n2. איזה סוג אירוע? (יום הולדת / יום נישואין / אירוע עסקי / חינה / משפחתי / אחר)\n3. כמה אורחים בערך?\n4. מה תקציב משוער לסועד? (₪150 / ₪200 / ₪250 / ₪300 / אחר — טווח OK)\n5. איזה חלון שעות עדיף — בוקר / צהריים / ערב? והאם אתם מחפשים השכרה מלאה של המקום או חלק ממנו?\n\n**חוקי שיחה (קריטי):**\n- לעולם לא לצטט מחיר, זמינות תאריך, או מנה ספציפית.\n- אם הלקוח שואל 'כמה זה עולה?' או 'התאריך פנוי?' — השב בנוסח: 'אני מעבירה את הפרטים שלכם למנהל המסעדה — הוא יחזור אליכם עם הצעה מותאמת תוך כמה שעות. תודה על הסבלנות 🙏'.\n- אם הלקוח מציין מקרה הסלמה (משפיענים/מדיה, קייטרינג חוץ, כשר בלבד, מעל 80 איש, פחות מ-14 ימים) — סיים מהר, צור Lead, ואל תיתן ציון גבוה.\n- אל תמציא תפריט, תאריכים, או יכולות. אם נשאלת על משהו שלא ידוע לך, השב: 'נקודה טובה — אני אשאיר את זה למנהל.'\n\n**אחרי שאספת את 5 השדות:**\n1. חשב ציון 0-100 לפי הכללים הבאים:\n   - תאריך מולא ובעוד 14+ ימים: +25\n   - מספר אורחים בין 10 ל-80: +25\n   - תקציב לסועד נאמר ו-≥ ₪150: +25\n   - סוג אירוע תואם (לא קייטרינג חוץ, לא כשר בלבד, לא מעל 80 אורחים, לא היום): +25\n   - מקרה הסלמה: -30\n2. שמור את כל הפרטים ב-Lead entity:\n   - source_unit: 'UNIT_EVENTS_PRIVATE'\n   - channel: 'WHATSAPP'\n   - contact_name (אם נמסר), contact_phone (חובה — מספר השולח)\n   - qualifier_answers: { event_date, event_type, guest_count, budget_per_person, hours_window }\n   - status: 'NEW' (יעבור ל-'QUALIFIED' אם ציון >= 60)\n   - score: הציון שחישבת\n   - assigned_to_agent: 'EVENTS_QUALIFIER'\n   - conversation_log: מערך של הודעות {role, content, timestamp}\n3. אם הציון ≥ 60, קרא לפונקציה pushoverOnHotEventLead עם הליד כפרמטר, ועדכן status='QUALIFIED'.\n4. אם הציון < 30, עדכן status='COLD' וסיים בנימוס: 'תודה שפניתם 🌿 לפי מה שתיארתם, ייתכן שאנחנו לא ההתאמה הכי טובה הפעם. אם משהו ישתנה — דלת פתוחה.'\n5. אם הציון בין 30-59, סיים ב: 'תודה רבה! העברתי את הפרטים למנהל, הוא יחזור אליכם בקרוב 🙏' — בלי Pushover, רק יישמר ב-Lead.\n\n**Tone:** עברית טבעית, חמה, ביטחון עצמי, בלי סימני קריאה מוגזמים, בלי אימוג'י-בולטים. תני להרגיש שיש בן אדם בצד השני.",
  "tool_configs": [
    {
      "entity_name": "Lead",
      "allowed_operations": ["create", "read", "update"]
    },
    {
      "entity_name": "CampaignUnit",
      "allowed_operations": ["read"]
    },
    {
      "function_name": "pushoverOnHotEventLead",
      "description": "שולח התראת Pushover למנהל ומייצר AgentMessage חם ב-Agent Inbox"
    }
  ],
  "context_files": [],
  "app_user_connector_configs": [],
  "selected_skill_names": [],
  "selected_workspace_skill_ids": [],
  "model": "automatic",
  "whatsapp_greeting": "היי 🌿 הגעתם לעלינא — מסעדת השרינג פלייטס בראשון לציון. אני העוזרת הדיגיטלית, ושמחה שאתם חושבים עלינו לאירוע פרטי.\n\nכדי שאוכל להמליץ לכם בצורה הטובה ביותר ולהעביר את הפרטים למנהל — אני צריכה לשאול 5 שאלות קצרות (שלוש דקות). מתחילים?",
  "telegram_greeting": "",
  "line_greeting": "",
  "memory_config": {
    "enabled": true,
    "scope": "both",
    "instructions": null
  }
}
```

- [ ] **Step 2 — Commit**

```bash
git add base44/agents/events_qualifier_agent.jsonc
git commit -m "feat(events): EVENTS_QUALIFIER Base44 chat agent (WhatsApp, 5 questions, scoring)"
```

---

## Task 6 — Run the seed against the dev environment

**Files:** (none modified — execution step)

- [ ] **Step 1 — Run the seed**

```bash
deno run -A base44/seed/unit_events_private.seed.ts <YOUR_BASE44_DEV_API_KEY>
```

Expected stdout (in order):
```
✓ Created CampaignUnit UNIT_EVENTS_PRIVATE
✓ Created Agent EVENTS_DESIGNER
✓ Created Agent EVENTS_CREATIVE
✓ Created Agent EVENTS_AUDIENCE_ROUTER
✓ Created Agent EVENTS_CAMPAIGN_BUILDER
✓ Created Agent EVENTS_OPTIMIZER
Seed complete.
```

If you re-run, each line says "Updated" instead of "Created". That's fine — the script is idempotent.

- [ ] **Step 2 — Verify in DB**

In the Base44 dev console, browse the entities:
- `CampaignUnit` → one row, `unit_id=UNIT_EVENTS_PRIVATE`, `status=DRAFT`.
- `Agent` → 5 new rows with codenames `EVENTS_DESIGNER`/`EVENTS_CREATIVE`/`EVENTS_AUDIENCE_ROUTER`/`EVENTS_CAMPAIGN_BUILDER`/`EVENTS_OPTIMIZER`, all `status=DORMANT`, each with non-empty `system_prompt`.

No commit — this step only mutates the dev DB.

---

## Task 7 — End-to-end smoke test of the Qualifier

**Files:** (none modified — verification step)

- [ ] **Step 1 — Start the dev server**

```bash
npm run dev
```

Expected: Vite on `http://localhost:5173` with no console errors.

- [ ] **Step 2 — Trigger the Qualifier via the Base44 agent console**

In the Base44 dev console, open `events_qualifier_agent` → "Test conversation". Send: `היי, אני רוצה לעשות ימולדת לבן זוג ב-15 ביולי, 25 איש, תקציב כ-220 לסועד, ערב`.

Expected the agent:
1. Replies with the greeting + first question if any answer missing, OR proceeds question-by-question collecting whatever wasn't already given.
2. Once all 5 fields are collected (you may need to answer 1-2 follow-ups), it confirms briefly and ends.

- [ ] **Step 3 — Verify Lead was created**

In Base44 dev console → `Lead` entity. Expected: one new row with:
- `source_unit = "UNIT_EVENTS_PRIVATE"`
- `channel = "WHATSAPP"`
- `qualifier_answers = { event_date: "...15.07...", event_type: "יום הולדת", guest_count: 25, budget_per_person: 220, hours_window: "ערב" }`
- `score` ≈ 100 (all 4 positive criteria, no escalation trigger)
- `status = "QUALIFIED"` (since score ≥ 60)

- [ ] **Step 4 — Verify Pushover fired**

Check the phone of the Employee with `pushover_user_key` set. Expected: a Pushover notification titled `🔥 ליד אירוע חם — עלינא` arrives within ~5 seconds.

If no Pushover received: check Base44 function logs for `pushoverOnHotEventLead` for HTTP errors from `api.pushover.net`. The `PUSHOVER_API_TOKEN` env var must be set in the Base44 project settings.

- [ ] **Step 5 — Verify Agent Inbox renders the lead**

In the running dev server, navigate to `/AgentInbox` (or however the route is registered — check `src/pages/AgentInbox.jsx` for the route slug).

Expected: a red-ringed card (`owner_template='C'` → critical template) with:
- Title: `ליד אירוע חם: <שם>`
- Body: the same Hebrew message that went to Pushover
- 3 action buttons: `כן, מאשר`, `לא`, `פרט / שאל` (these come from the existing `MessageCard` component — no UI work in this slice).

- [ ] **Step 6 — Negative test: low-score lead**

Test another conversation expressing an escalation trigger: `שלום, יש לי אירוע משפיענים מחר, 120 איש`.

Expected:
- `Lead` row created with `status="COLD"` and `score < 30` (lead-time-under-14d + guests-over-80 + media trigger all fire).
- No Pushover notification.
- No new AgentMessage in Inbox.

- [ ] **Step 7 — Verify spendGuard locally (sanity)**

Open a Deno REPL or write a one-off script:
```typescript
import { canSpend } from './base44/lib/spendGuard.ts';
// Manually inflate CampaignUnit.budget.spent_mtd_ils to 480 in the DB first.
const r = await canSpend(base44, 50);
console.log(r); // { allowed: false, current_mtd_ils: 480, cap_ils: 500, reason: "Projected ₪530 exceeds cap ₪500" }
```

Reset the dev `spent_mtd_ils` to 0 after the check.

---

## Task 8 — Final commit & spec status update

- [ ] **Step 1 — Update the design spec status**

In `docs/superpowers/specs/2026-06-01-unit-events-private-design.md`, change the header line:
```
**Status:** Approved by owner, ready for implementation plan
```
to:
```
**Status:** Implemented (Phase B Slice 2 shipped). Next: Phase C (SALES_CLOSER_EVENTS) — blocked on sales-kit completion.
```

- [ ] **Step 2 — Commit**

```bash
git add docs/superpowers/specs/2026-06-01-unit-events-private-design.md
git commit -m "docs(events): mark Phase B Slice 2 as implemented"
```

- [ ] **Step 3 — Memory update**

Update `C:/Users/97253/.claude/projects/C--Users-97253-TOP-ALENA/memory/project_alina_ceo_agent.md`: change Step 5 from "⏳ Next" to "✅ Phase B Slice 2 shipped: UNIT_EVENTS_PRIVATE + EVENTS_QUALIFIER live; Phase C blocked on sales kit."

---

## Out of scope (intentional) — Phase C

These items are deferred until owner supplies the remaining sales-kit pieces (prices, capacity, T&Cs, calendar rules, gallery, discount authority). When unblocked:

- New Base44 agent `events_closer_agent.jsonc` (richer system prompt with price-quoting authority from `sales_kit.menus[].price_per_person_ils`).
- New function `quoteEventProposal` (renders PDF from menu + add-ons + headcount).
- New function `sendDepositPaymentLink` (Stripe link with deposit % from T&Cs).
- Calendar-availability check against existing `Reservation`/`Event` entities.
- Promote `Agent.codename='SALES_CLOSER_EVENTS'` to LIVE; downgrade Qualifier to first-touch only.
- Hot leads from Phase B already in the DB get auto-routed to the new Closer with zero migration (same `qualifier_answers` schema).
