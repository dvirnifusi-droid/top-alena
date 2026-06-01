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
