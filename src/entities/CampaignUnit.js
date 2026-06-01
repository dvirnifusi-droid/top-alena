import { base44 } from '@/api/base44Client';

/**
 * CampaignUnit — a self-contained 5+1 agent crew promoting ONE thing.
 * See Step 4 for the full template definition.
 *
 * Backend schema:
 *   unit_id:               string  unique          (e.g. "UNIT_EVENTS_PRIVATE")
 *   unit_name:             string
 *   promoted_thing:        json                    ({type, name, hero_margin_pct, hero_price_ils, ...})
 *   target_outcome:        json                    ({primary_kpi, kpi_target_monthly, max_cpa_ils})
 *   budget:                json                    ({monthly_ils, daily_default_ils, daily_ceiling_ils, spent_mtd_ils})
 *   audience_seed:         json                    ({primary_geo, primary_demo, primary_interest_clusters, exclude_segments})
 *   language_policy:       json                    ({primary, secondary, ratio})
 *   landing_destinations:  json                    (array of {name, url, use_for})
 *   brand_guardrails:      json                    ({voice, forbidden, required_visual_motifs})
 *   crew:                  json                    ({designer, creative_strategist, audience_router, campaign_builder, optimizer, sales_closer})
 *   launch_platforms:      json                    (array: ["META", "GOOGLE_PMAX", ...])
 *   status:                string                  ("DRAFT"|"PENDING_APPROVAL"|"LIVE"|"PAUSED"|"RETIRED")
 *   kpi_actual_mtd:        number  default 0
 *   creatives:             json                    (array of asset refs from Designer)
 *   copy_variants:         json                    (array from Creative-Strategist)
 *   audience_matrix:       json                    (array from Audience-Router)
 *   external_campaign_ids: json                    ({meta: [...], google: [...]})
 *   health:                string                  ("GREEN"|"YELLOW"|"RED")
 *   last_optimizer_run:    datetime nullable
 *   created_date:          datetime
 *   updated_date:          datetime
 */
export const CampaignUnit = base44.entities.CampaignUnit;
