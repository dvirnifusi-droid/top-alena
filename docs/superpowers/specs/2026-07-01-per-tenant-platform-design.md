# Per-Tenant Platform (Track D) — Design

**Date:** 2026-07-01
**Status:** Proposed
**Author:** Dvir + Claude
**Depends on:** existing multi-tenant Phase 1 infrastructure (Tenant table, schema-per-tenant, subdomain routing)
**Blocks:** Tracks B (Self-Service Signup), C (Billing), F (Chains) — they all consume outputs of D

---

## 1. Goal

Transform TOP ALENA from "one restaurant's app that happens to support a second" into a **platform that any restaurant can walk into and immediately feel is theirs**, while:

- keeping the existing Alena tenant fully unchanged in look and behavior
- letting each tenant choose which modules to run, connect their own third-party accounts, and see their own brand everywhere
- doing all of this without asking the tenant to buy a Twilio number, open a Google Cloud account, or configure a WhatsApp webhook

The mental model is **"platform owns the utilities, tenant owns the identity."** WhatsApp, SMS, AI, storage, email, voice — the platform handles as one big managed account. Instagram, Google Business, bank account, POS — the tenant plugs those in because they legally must be under the tenant's name.

## 2. Non-Goals (out of scope for D)

- Self-service signup, tenant provisioning, onboarding wizard → **Track B**
- Billing engine, subscription tiers, invoicing → **Track C**
- Full isolation audit of the 143 Prisma models and 332 backend functions → **Track A**
- i18n, multi-currency, multi-region → **Track E** (deferred by owner request)
- Multi-location / restaurant chains → **Track F**
- Voice AI agent, SMS number pool, Newsletter builder, Reviews aggregation → later phases

## 3. Current State (what's already built)

The multi-tenant architecture is already in production. Two live tenants exist: `alena` (owner's business) and `miha` (a new restaurant onboarded via WhatsApp).

**Existing infrastructure being reused:**

- `Tenant` table (in `platform` schema, raw SQL) — id, slug, restaurant_name, owner_email/phone, status, subdomain_url, timestamps
- **Postgres schema-per-tenant** — each tenant's data lives in `tenant_<slug>` schema. Cross-tenant data leakage is prevented at the database connection level, not at the query level.
- `TENANT_SLUG` env var set at provisioning time — the API resolves the schema from this at request time.
- `OnboardingState` table + `whatsappOnboarding.ts` — 7-step WhatsApp onboarding flow for new tenants.
- Super-admin console: `/PlatformAdmin`, `/PlatformAdminPending`, `/PlatformAdminTenants`.
- Backend functions: `listTenants`, `approveTenant`, `rejectTenant`, `impersonateTenant`, `restartTenantOnboarding`, `getMyOnboardingStatus`.
- `IntegrationSecret` table (per tenant) + `getSecret(key)` helper — already used for Meta Ads token, Drive folder id, Gomiley cookies.

**Existing but partially used:**

- `RestaurantProfile` model has `logo_url`, `brand_colors`, `brand_font`, `restaurant_name` — the columns exist but are not consistently read by the frontend.
- `BusinessProfile` model has `business_type`, `is_kosher`, `monthly_budget` — used by Marketing Advisor.

## 4. Design Overview

Track D adds five discrete pieces on top of the existing infrastructure:

1. **Feature Modules** — a per-tenant toggle table that controls which pages appear in the sidebar and which backend functions are available.
2. **Tenant Integrations Console** (`/Integrations`) — a short UI page where a tenant plugs in the ~5 external accounts they legally must own.
3. **Branding** — the tenant's logo, brand colors, font, and restaurant name propagate through the whole UI via CSS variables read from `RestaurantProfile`.
4. **WhatsApp Multi-Tenant Router** — a single WhatsApp Business number for the whole platform, with routing logic that maps each inbound message to the right tenant.
5. **Platform Utility Metering** — AI token usage tracked per tenant in a `platform.AiUsage` table, exposed in both super-admin and tenant dashboards.

Each piece is independent — they can ship in any order, each behind a feature flag. Alena is unaffected until Alena's `RestaurantProfile.brand_colors` is set or Alena's tenant-module row explicitly disables a module.

## 5. Detailed Design

### 5.1 Feature Modules

**Problem:** Every tenant currently sees every page. Miha shouldn't see "Alena's" event pages if she doesn't do events; Alena shouldn't be forced to see modules built for future tenants.

**Data model addition:**

```
platform.TenantModule
  id              cuid PK
  tenant_id       string (FK to Tenant.id)
  module_key      string   -- 'queue' | 'delivery' | 'events' | 'club' | 'ceo_agent' | 'waiter' | 'kitchen_screen' | 'stories' | 'gamification' | ...
  enabled         boolean  default true
  enabled_at      timestamptz
  UNIQUE(tenant_id, module_key)
```

**Module catalog** (source of truth in code, not DB): a `MODULE_CATALOG` constant in `apps/api/src/lib/modules.ts` lists every module, its human name in Hebrew, its icon, its sidebar category, its associated page paths, and its associated backend function prefixes.

**Default at provisioning:** every module enabled. New tenant = full feature set. The tenant turns modules OFF, not ON. This is the safe default that keeps Alena untouched.

**Frontend integration:**
- `Layout.jsx` — sidebar filtering reads `getTenantModules()` (5-min localStorage cache) and hides sidebar entries whose module is disabled.
- `PageGuard` — if a route belongs to a disabled module, redirect to Dashboard with a "This module is disabled" toast.
- New page `/PlatformSettings` — the tenant owner sees a checkbox grid of all modules with descriptions and a "Save" button. Toggling a module is instant.

**Backend integration:**
- `assertModuleEnabled(user, module_key)` middleware helper. Called at the top of tenant-facing backend functions that belong to a specific module.
- Functions that Alena uses today are labeled with modules that Alena has enabled (so no behavior change for her).

**Alena's migration path:** on first deploy, seed `TenantModule` rows for `alena` with every module enabled. Zero visible change.

### 5.2 Tenant Integrations Console (`/Integrations`)

**Problem:** A tenant needs a place to plug in the accounts that legally must be theirs (Instagram, Google Business, bank account for payments, POS). Other integrations are handled by the platform and never appear here.

**Page shape:**

The page shows five rows. Each row is a card with an icon, a name, a short description, a status pill (`Not connected` / `Connected` / `Error`), and an action button.

| Row | Backing store | Action button | Underlying |
|---|---|---|---|
| Instagram | `IntegrationSecret('META_ADS_ACCESS_TOKEN')` + IG business id | "Connect with Meta" (OAuth) | Meta Graph OAuth flow |
| Google Business | `IntegrationSecret('GOOGLE_BUSINESS_PLACE_ID')` + refresh token | "Connect" (OAuth) or paste `place_id` | Google OAuth |
| Payments | `IntegrationSecret('PAYMENT_ACCOUNT_ID')` | "Set up payments" | Stripe Connect or PayPlus Marketplace (choice deferred to Track C) |
| POS (Beecom) | `BeecommConfig` row | Existing form | Existing entity — just re-styled |
| Telegram (optional) | `IntegrationSecret('TELEGRAM_BOT_TOKEN')` + chat_id | Form: paste token + chat_id | Existing `telegram.ts` code path |

**Backend functions added:**
- `listMyIntegrations()` → returns status of each integration for the calling tenant
- `startOAuthFlow({ provider })` → returns redirect URL
- `handleOAuthCallback({ provider, code })` → completes OAuth, stores token in `IntegrationSecret`
- `disconnectIntegration({ provider })` → clears the tokens
- `testIntegration({ provider })` → makes a lightweight API call and returns success/error

**Explicitly not on the page:** WhatsApp (platform handles), SMS (platform handles), Email (platform handles), Web Push (automatic), AI (platform handles), Storage (automatic), Pushover (super-admin only, never exposed).

**Alena's migration path:** her existing values (Meta Ads token, Drive folder id) already live in `IntegrationSecret` — the page just reads them. If the values are set, the row shows "Connected" from day one.

### 5.3 Branding

**Problem:** Miha and Alena both see the "TOP ALENA" logo and Alena's color scheme. Miha's tenant should show Miha's logo and colors.

**Data source:** `RestaurantProfile.logo_url`, `RestaurantProfile.brand_colors` (JSON — expect keys `primary`, `secondary`, `accent`), `RestaurantProfile.brand_font`, `RestaurantProfile.restaurant_name`.

**Runtime flow:**
1. On page load, `Layout.jsx` fetches `RestaurantProfile.filter({}, [], 1)` (already cached in most pages).
2. Values are written to CSS variables on `document.documentElement`:
   - `--brand-primary`, `--brand-secondary`, `--brand-accent`
   - `--brand-font-family`
3. Header displays `logo_url` if present, else the platform logo as fallback.
4. Header title displays `restaurant_name`.
5. `<title>` (browser tab) is set to `restaurant_name`.
6. `PWA manifest` — dynamically generated per-tenant at `/api/public/fn/getManifest` so the "Install app" prompt shows the tenant's name and icon.

**New page `/Branding`:**
- Logo upload (drag-and-drop to MinIO via `/api/integrations/upload`)
- Color picker for primary/secondary/accent, with live preview
- Font family dropdown (a curated list of Google Fonts — Rubik, Assistant, Heebo, Alef, Frank Ruhl Libre for Hebrew; Inter, Roboto for future English)
- Restaurant name text input
- "Preview" panel shows a mini Layout with the chosen values applied

**Alena's migration path:** her `RestaurantProfile` already has logo, colors, and name filled in. Setting up the CSS-variable pipeline just makes the values she already has actually apply. Behavior is either identical (if the current UI already reads them) or an aesthetic improvement (using her real brand instead of a generic default).

### 5.4 WhatsApp Multi-Tenant Router

**Problem:** A single WhatsApp business number needs to serve inbound messages from customers of multiple tenants. The bot must know which tenant a given inbound message belongs to.

**Data model addition:**

```
platform.PhoneTenantMap
  phone           string PK   -- E.164 (e.g. +972521234567)
  last_tenant_id  string       -- FK to Tenant.id
  last_at         timestamptz
```

**Routing logic (in a new `resolveTenantFromMessage` helper):**

1. **Explicit slug prefix.** If the body starts with `+<slug>` (case-insensitive, e.g. `+miha היי`, `+yoavi order`), extract the slug, look up the tenant, and route the message there. This is what QR codes will produce.
2. **Phone memory.** Else look up `PhoneTenantMap[from_phone]`. If the phone has a last-known tenant, route there.
3. **Menu prompt.** Else send a generic Hebrew reply listing the ~3-5 most active tenants ("לאיזה עסק פנית?"). User picks one — that pick creates the `PhoneTenantMap` row.
4. **Dead-letter.** If parsing fails or the resolved tenant is disabled, forward to platform super-admin (Dvir's Pushover) with the raw message and phone.

**Outbound: setting the memory.** Every response the bot sends calls `setLastTenant(from_phone, tenant_id)` so subsequent messages from that phone don't need the prefix.

**Implementation location:** new file `apps/api/src/lib/whatsappRouter.ts`. The existing `whatsappAgent.ts` and its cousins take a `tenant_id` argument at the top of every entry function — the router calls into them with the resolved tenant.

**Existing QR codes for Alena:** need to be re-generated with the `+alena` prefix. **Backwards compatibility:** during the first 30 days, if a phone has no map entry and no prefix, and Alena is the only "live" tenant that phone has ever interacted with (checked against QueueEntry.phone + Reservation.phone in Alena's schema), route to Alena. This is a temporary bridge — remove after the QR regeneration is deployed and observed for two weeks.

**Alena's migration path:** at migration time, seed `PhoneTenantMap` from `QueueEntry.phone` and `Reservation.phone` for every distinct phone in `tenant_alena` schema — so any phone that has ever contacted Alena on WhatsApp continues to reach Alena. Miha starts empty; her customers reach her via QR-prefixed messages.

### 5.5 Platform Utility Metering (AI)

**Problem:** Every tenant's AI calls run on one shared Gemini API key. Without per-tenant metering, we can't reason about costs, can't enforce limits, and can't bill for AI usage in Track C.

**Data model addition:**

```
platform.AiUsage
  id              cuid PK
  tenant_id       string
  fn_name         string     -- 'askGemini' | 'runAgent' | 'runCeoDailyBrief' | 'invokeLLM' | ...
  model           string     -- 'gemini-2.5-flash' | ...
  tokens_in       int
  tokens_out      int
  cost_ils        float      -- computed at write time
  day             date       -- for cheap aggregate queries
  createdAt       timestamptz
  INDEX (tenant_id, day)
```

**Instrumentation:**
- The `invokeLLM` function in `apps/api/src/lib/llm.ts` is updated to accept a `tenant_id` and `fn_name` context. Every existing call site is threaded to pass these values. (Only the `invokeLLM` file itself changes signature — call sites already have `tenant_id` from the request context.)
- After every Gemini call, `invokeLLM` writes an `AiUsage` row asynchronously (fire-and-forget, wrapped in try/catch — never blocks the response).
- Cost calculation uses a hardcoded price table per model in the same file. Updated when Google changes pricing.

**Surfaces:**
- `/PlatformAdmin` gets a new "AI Usage" section: per-tenant token totals for current month, top 5 heaviest tenants, unusual spikes flagged.
- `/PlatformSettings` (per tenant) gets a "AI Consumption" widget: current-month totals and a 30-day chart. No enforcement yet — enforcement is Track C's problem.

**Alena's migration path:** her existing AI calls start writing `AiUsage` rows. No behavior change. She sees her own consumption from day one.

## 6. Cross-cutting: how Alena stays unaffected

Five rules apply to every commit in this track:

1. **Additive only.** No renames, no removed columns, no changed function signatures. New tables, new columns, new functions only. Prisma `db push` in non-interactive mode enforces this at build time.
2. **Default = current behavior.** Every new toggle defaults to the state that keeps Alena's UI identical to today. Feature flags default OFF (or default ON to match Alena's implicit setting today, whichever preserves her behavior).
3. **Miha is the canary.** Every new capability ships to Miha's tenant first. After 24-48 hours of Miha having it and no reported issues, the flag flips for Alena.
4. **Smoke test before push.** `tsc --noEmit` on the API, `vite build` on the frontend, and a scripted click-through of Alena's Dashboard / Employees / Reservations / WorkScheduling pages against a local build. If any smoke check fails, we don't push.
5. **Rollback is one commit.** Auto-deploy is `git reset --hard origin/migration`. `git revert HEAD && git push` restores the previous state in ~2 minutes.

## 7. Rollout Phases

The track is broken into six phases. Each phase is independently deployable, independently rollback-able, and independently valuable.

| Phase | Deliverable | Estimated size |
|---|---|---|
| **D1** | Feature Modules table + `MODULE_CATALOG` + `/PlatformSettings` UI + sidebar filtering | 2-3 days |
| **D2** | Branding: `RestaurantProfile` → CSS vars in Layout + `/Branding` page + dynamic manifest | 2 days |
| **D3** | WhatsApp Router: `PhoneTenantMap` + `resolveTenantFromMessage` + prefix parsing + phone-memory + QR regeneration script | 3-4 days |
| **D4** | `/Integrations` page + Instagram OAuth + Google Business OAuth + Telegram form | 3 days |
| **D5** | AI Metering: `AiUsage` table + `invokeLLM` instrumentation + super-admin dashboard + tenant widget | 1-2 days |
| **D6** | Payments row on `/Integrations` (Stripe Connect or PayPlus Marketplace — decision pending Track C brainstorm) | Deferred — depends on Track C |

D1-D5 can be executed in any order after D1. D6 waits for Track C.

## 8. Open Decisions Deferred

- **Payment marketplace provider** — Stripe Connect (global, developer-friendly, 2.9% + 30¢), PayPlus Marketplace (Israel-first, lower fees, less documentation), or CardCom Marketplace. Decision belongs to Track C brainstorming.
- **Custom domain (`app.yoavi.co.il` → tenant)** — mentioned as an enterprise capability; not designed here. Track A or a dedicated future track owns dynamic Caddy routing.
- **BYO AI keys (enterprise)** — deferred. All tenants share the platform Gemini key in this design.

## 9. Verification Criteria

The track is done when:

- Miha can log in, see the same set of pages as Alena, and turn off two modules — those two pages disappear from her sidebar within one browser refresh.
- Miha can upload a logo and pick brand colors; her sidebar, header, and browser tab reflect the change; Alena's are unaffected.
- A WhatsApp message sent to the platform number with body `+miha היי` reaches Miha's tenant. A message from Alena's regular customer (whose phone is pre-mapped) reaches Alena's tenant without any prefix.
- Miha can connect Instagram via OAuth from `/Integrations`; the token appears in her tenant's `IntegrationSecret` table; Alena's Instagram integration is not touched.
- `/PlatformAdmin` shows a per-tenant AI usage breakdown for the current month; Alena and Miha each see their own line.
- Every one of Alena's existing pages loads and behaves identically to how it behaved before the track started. (Manual click-through checklist run before each phase's deploy.)

---
