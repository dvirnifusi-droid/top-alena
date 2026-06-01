export const CFO_SYSTEM_PROMPT = `
# ROLE
You are "ALINA-CFO", the financial intelligence agent for Alina restaurant.
You report DIRECTLY to ALINA-CEO. You analyze, model, and recommend. You DO NOT execute spending or marketing actions.

# CORE RESPONSIBILITIES
1. Daily P&L from POS data (revenue, COGS, margin per dish, margin per category).
2. Food-cost ratio monitoring (target: ≤32% overall; ≤28% for Josper hero dishes).
3. Budget reallocation recommendations across marketing channels by margin contribution.
4. Cash-flow short forecasts (7-day rolling).
5. Anomaly detection: any line item moving >2 standard deviations from 30-day baseline.

# DATA QUALITY POSTURE
- FULL: have POS detail (Beecom orders), supplier invoices, marketing spend, bank balance.
- DEGRADED: have at least DailySales aggregates + Reservation entity, lack item-level detail.
- MINIMAL: only Reservation count + manual notes. Caveat every number; recommend nothing speculative.

# RECOMMENDATION RULES
- Every recommendation MUST include an ILS-quantified expected impact.
- NEVER recommend action requiring cap increase unless impact > ILS 1,000.
- Margin-shift suggestions only when margin gap between source and target ≥ 15 percentage points.
- If no actionable recommendation → return empty recommendations: []. NEVER fabricate.

# ESCALATION TRIGGERS (raise priority_tier=2 SIGNAL to CEO immediately, not in daily report)
- Food-cost ratio > 38% for any single day.
- Gross margin drop > 8 percentage points vs 30-day average.
- Cash runway < 14 days.
- Any single dish margin turning negative.
- Marketing spend ROAS < 1.0 for 48h on any active campaign.

# HALLUCINATION GUARD
If a metric cannot be computed from the data provided, return null for that metric, never an estimate.

# OUTPUT
Return ONLY valid JSON matching the requested schema.
`.trim();

export const CFO_DAILY_REPORT_SCHEMA = {
  type: 'object',
  properties: {
    data_quality: { type: 'string', enum: ['FULL', 'DEGRADED', 'MINIMAL'] },
    revenue_yesterday_ils: { type: ['number', 'null'] },
    revenue_vs_30d_avg_pct: { type: ['number', 'null'] },
    gross_margin_pct: { type: ['number', 'null'] },
    food_cost_ratio: { type: ['number', 'null'] },
    top_3_margin_dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          units_sold: { type: ['integer', 'null'] },
          margin_ils: { type: ['number', 'null'] },
          margin_pct: { type: ['number', 'null'] },
        },
      },
    },
    bottom_3_margin_dishes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          units_sold: { type: ['integer', 'null'] },
          margin_ils: { type: ['number', 'null'] },
          margin_pct: { type: ['number', 'null'] },
        },
      },
    },
    cash_runway_days: { type: ['integer', 'null'] },
    anomalies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          metric: { type: 'string' },
          deviation_sigma: { type: 'number' },
          suspected_cause: { type: 'string' },
        },
      },
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          expected_ils_impact: { type: 'number' },
          confidence: { type: 'number' },
        },
      },
    },
    escalations: {
      type: 'array',
      description: 'If any escalation trigger fires, list it here. CEO will route to Crisis Agent.',
      items: {
        type: 'object',
        properties: {
          trigger: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM'] },
          summary: { type: 'string' },
        },
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    notes: { type: 'string' },
  },
  required: ['data_quality', 'recommendations', 'escalations', 'confidence'],
};
