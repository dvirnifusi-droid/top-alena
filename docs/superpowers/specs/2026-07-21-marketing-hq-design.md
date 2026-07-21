# Marketing HQ — Design Spec (Workstream A, slice 1)

**Date:** 2026-07-21 · **Status:** approved to build ("יאלה נצא לדרך")
**Roadmap:** [[project_maor_roadmap]] workstream A — the marketing advisor becomes a marketing MANAGER that lives inside a dashboard with the tasks/actions to do.

## Goal

A `/MarketingHQ` command center: live marketing KPIs + a **ranked, one-click-executable action list** the AI advisor produces from real business data. Turns the advisor from "gives advice" into "brings you a prioritized to-do list and executes it."

## Slice 1 scope (this build)

1. **Backend `getMarketingHQ`** (read; `requireBackOffice`) — returns `{ kpis, actions, headline, drips_enabled }`.
2. **Frontend `MarketingHQ.jsx`** — KPI tile row + advisor headline + action cards, added as the **default tab in `MarketingHub.jsx`** (no new sidebar row/route needed).
3. **Execute** — each action's "בצע" button opens a confirm (shows segment count + editable message) and calls the **existing** `sendCustomerCampaign` (consent, 24h throttle, opt-out footer, CampaignSend logging already enforced there). No new send path.

Out of scope for slice 1 (later slices of A): LLM campaign authoring, agents vetting the social agency, wiring the 45-field profile into the agents, the photo→AI content studio (workstream B).

## KPIs (all real data)

| KPI | Source |
|---|---|
| חברי מועדון פעילים | `db.customer.count` where `marketing_consent=true, marketing_unsubscribed_at=null` |
| הכנסה השבוע מול שעבר | `beecommOrder` sum by `date` (this week Sun→today vs prior week), field `total_ils` (mirrors `weeklyInsights.insightSalesWoW`) |
| לקוחות נוטשים | `db.customer.count` where `buildSegmentWhere('winback_60')` |
| ימי הולדת ב-7 ימים | `db.customer.count` where `birthday_mmdd IN (next 7 mmdd)` + consent |
| % מסירה בקמפיינים | `marketingStats(30).delivery.delivered_pct` (null = "לא נמדד") |

## Actions (deterministic, ranked by impact; each carries a segment + default message)

Generated only when the data warrants it (real count > 0), so the list is honest:
- **החזרת נוטשים** — `segment: winback_60` (or 90), count N → campaign.
- **פינוק VIP** — `segment: vip`, count N → campaign.
- **תזכורת מטבעות** — `segment: with_coins` → "יש לך מטבעות, בוא לממש".
- **ימי הולדת השבוע** — `segment: birthday_this_month`/7-day → greeting + offer.
- **ירידה בהכנסה** — if WoW pct < 0 → "דחיפה" campaign to `all_consented`.
- **בעיית מסירה** — if delivery pct < 70 (tracked ≥ 20) → link to diagnose (not a send).
- **הדיוורים כבויים** — if `DRIP_CAMPAIGNS_ENABLED !== 'true'` → notice + link (owner decision; env-gated, not a runtime toggle in v1).

Each action: `{ id, priority, icon, title, why, impact, segment, channel, default_message, count, kind: 'campaign'|'link' }`.

## Advisor headline

One short "מנהל השיווק שלך אומר…" paragraph via `invokeLLM` + `MARKETING_ADVISOR_PERSONA` (load.ts:128), fed the KPIs + action titles. **Best-effort**: try/catch → deterministic fallback sentence so the page never blocks on the LLM.

## Reuse map (nothing built from scratch)

- KPIs: `marketingStats` (lib/marketingStats.ts:57) + `beecommOrder` revenue.
- Segments/counts: `buildSegmentWhere` (load.ts:3130), `previewCustomerSegment` (load.ts:4366).
- Execute: `sendCustomerCampaign` (load.ts:4407).
- Advisor voice: `MARKETING_ADVISOR_PERSONA` + `invokeLLM`.
- Page host: tab in `MarketingHub.jsx`.

## Gates / safety

- `getMarketingHQ`: `requireBackOffice(user, 'getMarketingHQ', 'MarketingHub')`.
- Execute path is the already-gated `sendCustomerCampaign` (owner/admin + consent + throttle). HQ adds no new way to message customers.
- Deterministic-first: numbers come from SQL, never the LLM (same discipline as weeklyInsights / owner dashboard).

## Build order

1. `getMarketingHQ` in load.ts (after `getMarketingStats`).
2. `MarketingHQ.jsx` + register as default tab in `MarketingHub.jsx`; add to `modules.ts` marketing pages.
3. Build + deploy + verify KPIs render and one action executes against live data.
