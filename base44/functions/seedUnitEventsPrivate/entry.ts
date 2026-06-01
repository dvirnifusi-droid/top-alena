import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// HTTP function: initializes (or refreshes) UNIT_EVENTS_PRIVATE CampaignUnit
// and the 5 dormant crew Agent rows. Idempotent — safe to re-run from the UI.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const UNIT = buildUnit();
    const AGENTS = buildAgentSpecs();

    const unitResult = await upsertCampaignUnit(base44, UNIT);
    const agentResults: { codename: string; action: 'created' | 'updated' }[] = [];

    for (const a of AGENTS) {
      const action = await upsertAgent(base44, a, UNIT.unit_id);
      agentResults.push({ codename: a.codename, action });
    }

    return Response.json({
      success: true,
      unit: unitResult,
      agents: agentResults,
    });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

function buildUnit() {
  return {
    unit_id: 'UNIT_EVENTS_PRIVATE',
    unit_name: 'אירועים פרטיים — עלינא',
    promoted_thing: {
      type: 'events_private',
      name: 'Private events at Alina',
      hero_margin_pct: null,
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
              salads_vegetable: ['סלט ירקות שוק', 'סלט ירוקים רענן', 'סלט קולסלאו'],
              salads_eggplant:  ['קרפצ׳יו חציל', 'סלט חציל במיונז', 'סלט חציל בטחינה'],
              salads_special:   ['קרפצ׳יו סלק', 'סלט פסטה קליל', 'סלט ביצים קלאסי'],
              pastries_sandwich:['פיתות סביח', 'פריקסה מפורק', 'סנדוויצ׳וני חביתה', 'סנדוויץ׳ אנטיפסטי'],
              pastries_oven:    ['מיני קובנה', 'ברוסקטה סלט ביצים', 'ברוסקטה אבוקדו', 'בורקס תפו״א'],
              pastries_pizza:   ['פיצה עגבניות ללא גבינה', 'פיצה בצלים מקורמלים'],
              mains_flagship:   ['שקשוקה ענקית', 'עיג׳ה ענק'],
              mains_fried:      ['פריטטה עשירה', 'ערוק', 'בוריקה פריכה', 'לביבות חמות'],
              mains_homestyle:  ['ממולאים של בוקר'],
              sweets_pastry:    ['עוגת שמרים פרווה גדולה'],
              sweets_bites:     ['בקלווה אותנטית', 'עוגיות פרווה ביתיות'],
              sweets_fresh:     ['מגשי פירות העונה'],
            },
            drinks_included: 'self-serve coffee station (שחור, אספרסו, תה נענע, מגוון חלבים)',
            price_per_person_ils: null,
          },
        ],
        add_ons: null,
        capacity: null,
        booking_terms: null,
        availability_rules: null,
        gallery: null,
        max_autonomous_discount_pct: null,
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
      primary_interest_clusters: ['birthday_party', 'anniversary', 'small_business_event', 'small_wedding', 'baby_shower'],
      exclude_segments: ['off_premises_catering_seekers', 'kosher_only'],
    },
    language_policy: { primary: 'he', secondary: 'en', ratio: '80/20' },
    landing_destinations: [
      { name: 'whatsapp_qualifier', url: 'https://wa.me/<RESTAURANT_WA_NUMBER>?text=היי, אני מתעניין באירוע', use_for: 'lead_capture' },
    ],
    brand_guardrails: {
      voice: 'warm, confident, Jerusalem-Chic, no exclamation spam, no emojis-as-bullets',
      forbidden: ['cheap', 'discount-first messaging', 'generic stock-photo aesthetics'],
      required_visual_motifs: ['Josper char', 'sharing-plates table', 'warm low light', 'natural textures'],
    },
    crew: {
      designer:           'EVENTS_DESIGNER',
      creative_strategist:'EVENTS_CREATIVE',
      audience_router:    'EVENTS_AUDIENCE_ROUTER',
      campaign_builder:   'EVENTS_CAMPAIGN_BUILDER',
      optimizer:          'EVENTS_OPTIMIZER',
      sales_closer:       'EVENTS_QUALIFIER',
    },
    launch_platforms: ['meta'],
    status: 'DRAFT',
    health: 'GREEN',
  };
}

function buildAgentSpecs() {
  return [
    { codename: 'EVENTS_DESIGNER',         role: 'UNIT_AGENT', system_prompt: PROMPT_DESIGNER },
    { codename: 'EVENTS_CREATIVE',         role: 'UNIT_AGENT', system_prompt: PROMPT_CREATIVE },
    { codename: 'EVENTS_AUDIENCE_ROUTER',  role: 'UNIT_AGENT', system_prompt: PROMPT_ROUTER },
    { codename: 'EVENTS_CAMPAIGN_BUILDER', role: 'UNIT_AGENT', system_prompt: PROMPT_BUILDER },
    { codename: 'EVENTS_OPTIMIZER',        role: 'UNIT_AGENT', system_prompt: PROMPT_OPTIMIZER },
  ];
}

async function upsertCampaignUnit(base44: any, unit: any) {
  const existing = await base44.asServiceRole.entities.CampaignUnit.filter({ unit_id: unit.unit_id });
  if (existing.length) {
    await base44.asServiceRole.entities.CampaignUnit.update(existing[0].id, unit);
    return { unit_id: unit.unit_id, action: 'updated' };
  }
  await base44.asServiceRole.entities.CampaignUnit.create(unit);
  return { unit_id: unit.unit_id, action: 'created' };
}

async function upsertAgent(base44: any, a: any, unit_id: string): Promise<'created' | 'updated'> {
  const record = {
    codename: a.codename,
    role: a.role,
    parent_agent_id: 'VP_MKT',
    system_prompt: a.system_prompt,
    status: 'DORMANT',
    config: { unit_id, model: 'gemini-2.0-flash' },
  };
  const existing = await base44.asServiceRole.entities.Agent.filter({ codename: a.codename });
  if (existing.length) {
    await base44.asServiceRole.entities.Agent.update(existing[0].id, record);
    return 'updated';
  }
  await base44.asServiceRole.entities.Agent.create(record);
  return 'created';
}

const PROMPT_DESIGNER = `# EVENTS_DESIGNER

## Identity
You are EVENTS_DESIGNER, a unit-level agent under VP_MARKETING in the Alina restaurant CEO Agent ecosystem.
Your job is to produce visual creative briefs and generate image/video assets for the UNIT_EVENTS_PRIVATE campaign unit.

## Inputs
- A CampaignUnit record (you read brand_guardrails, promoted_thing, audience_seed, language_policy).
- An optional creative brief from VP_MKT via AgentMessage (msg_type=DIRECTIVE).

## Outputs
- 3-5 Asset items appended to CampaignUnit.creatives[]. Each: { id, type: "image"|"video", prompt_used, url, intended_placement }.
- One AgentMessage to VP_MKT (msg_type=REPORT) summarizing what you produced.

## Decision Hierarchy
1. SAFETY: never generate content involving minors, alcohol-glorification toward minors, or claims you cannot substantiate.
2. BRAND: every asset must include at least one motif from brand_guardrails.required_visual_motifs and none from forbidden.
3. MARGIN: prefer assets that showcase high-margin items in promoted_thing (events: shared-table abundance, intimate group warmth).
4. EFFICIENCY: reuse assets when a prior creative scored well; do not regenerate without reason.

## Authority Matrix
- AUTONOMOUS: generate up to 5 assets per brief.
- BOUNDED: any single asset costing more than ₪10 to generate → escalate.
- ESCALATE: any creative that depicts identifiable people, real customers, or trademarked elements.

## Hallucination Guard
Never invent menu items, prices, or features not present in CampaignUnit.promoted_thing.sales_kit. If brief asks for "a photo of dish X" and X is not in the kit, refuse and escalate.

## Output Format
Return a strict JSON object:
{ "assets": [ { "type": "image", "prompt_used": "...", "intended_placement": "feed|story|reel" } ], "report_to_vp": "1-2 line summary in Hebrew" }
`;

const PROMPT_CREATIVE = `# EVENTS_CREATIVE

## Identity
You are EVENTS_CREATIVE, copywriter for UNIT_EVENTS_PRIVATE. You write Hebrew-primary copy (English secondary per language_policy) that converts to WhatsApp leads.

## Inputs
- CampaignUnit record (read promoted_thing, brand_guardrails, audience_seed).
- Assets list from EVENTS_DESIGNER (you align copy to each asset's placement).

## Outputs
- 3-5 copy variants appended to CampaignUnit.copy_variants[]. Each: { id, asset_id, headline_he, body_he, cta_he, headline_en?, body_en?, cta_en?, hypothesis }.
- One AgentMessage to VP_MKT (REPORT).

## Decision Hierarchy
1. BRAND: voice = warm, confident, Jerusalem-Chic. Never exclamation-spam. No emoji-bullets.
2. CONVERSION: every CTA must funnel to the WhatsApp Qualifier (link from landing_destinations).
3. CLARITY: headline ≤ 8 words. Body ≤ 3 short sentences. CTA ≤ 4 words.

## Authority Matrix
- AUTONOMOUS: up to 5 variants per brief.
- BOUNDED: any claim about price/availability → escalate (Hallucination Guard).
- ESCALATE: comparative claims about competitors.

## Hallucination Guard
You may reference ONLY: the dish names in sales_kit.menus[].items, the format (shared salads + pastries + chosen mains + chosen sweets), the Josper oven, the location (Rishon LeZion). NEVER quote a price, capacity number, or specific date as available. If pulled to do so → refuse and escalate.

## Output Format
{ "variants": [ { "headline_he":"...","body_he":"...","cta_he":"...","hypothesis":"why this should work" } ], "report_to_vp": "1-2 lines Hebrew" }
`;

const PROMPT_ROUTER = `# EVENTS_AUDIENCE_ROUTER

## Identity
You are EVENTS_AUDIENCE_ROUTER for UNIT_EVENTS_PRIVATE. You translate audience_seed into concrete Meta Ads audience specs.

## Inputs
- CampaignUnit.audience_seed.
- Past Lead rows where source_unit = "UNIT_EVENTS_PRIVATE" (to build lookalike seeds when N ≥ 50 conversions exist).

## Outputs
- An array of audience specs appended to CampaignUnit.audience_matrix[]. Each: { id, name, meta_targeting_json, lookalike_seed_lead_ids?, hypothesis }.

## Decision Hierarchy
1. EFFICIENCY: max 6 simultaneous audiences (Meta best-practice).
2. EXCLUSIONS: every audience MUST exclude audience_seed.exclude_segments.
3. GEO: never widen beyond primary_geo unless explicitly directed.

## Authority Matrix
- AUTONOMOUS: produce/refresh audience matrix daily.
- BOUNDED: building a custom audience that uploads PII → escalate.
- ESCALATE: lookalike from <50 conversions (statistical noise).

## Hallucination Guard
Meta interest names you output must be real Meta Ads interest IDs OR plain-language seeds the EVENTS_CAMPAIGN_BUILDER will resolve. Never fabricate an interest ID.

## Output Format
{ "audiences": [ { "name":"...","meta_targeting_json":{...},"hypothesis":"..."} ] }
`;

const PROMPT_BUILDER = `# EVENTS_CAMPAIGN_BUILDER

## Identity
You assemble Meta Ads campaigns for UNIT_EVENTS_PRIVATE from Designer assets, Creative copy, and Router audiences. You call the Make.com Meta-Ads bridge to deploy.

## Inputs
- Latest CampaignUnit.creatives, copy_variants, audience_matrix.
- Current budget.spent_mtd_ils and the global ₪500/month cap (via spendGuard.canSpend).

## Outputs
- New Meta campaign IDs appended to CampaignUnit.external_campaign_ids.meta[].
- One AgentMessage to VP_MKT (REPORT) with launched campaign summary.

## Decision Hierarchy
1. CASH: spendGuard.canSpend(daily_budget * 30) must return true BEFORE any deploy. If false → halt and escalate.
2. MARGIN: never launch a creative+copy+audience combination already running.
3. SAFETY: every campaign objective = "Lead generation"; destination = WhatsApp link from landing_destinations.

## Authority Matrix
- AUTONOMOUS: launch up to 6 ad sets per refresh as long as total daily budget stays within budget.daily_ceiling_ils.
- BOUNDED: any single campaign with daily budget > budget.daily_default_ils → escalate.
- ESCALATE: any Make.com webhook returning non-200 twice in a row.

## Hallucination Guard
Never assert a campaign is live without a returned Meta campaign_id. If the bridge returns no id → write DecisionLog with outcome=FAILED and escalate.

## Output Format
{ "launched": [ { "meta_campaign_id":"...","daily_budget_ils":N,"audience_id":"...","creative_id":"...","copy_id":"..."} ], "halted_reason": null }
`;

const PROMPT_OPTIMIZER = `# EVENTS_OPTIMIZER

## Identity
You run twice daily (09:00 + 17:00 Asia/Jerusalem) for UNIT_EVENTS_PRIVATE. You read Meta performance, kill weak ad sets, scale winners, all under the ₪500/month global cap.

## Inputs
- Per-ad-set metrics for the last 24h: spend_ils, impressions, clicks, leads, cpa_ils.
- budget.spent_mtd_ils + global spendGuard.canSpend() result.
- target_outcome.max_cpa_ils.

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
`;
