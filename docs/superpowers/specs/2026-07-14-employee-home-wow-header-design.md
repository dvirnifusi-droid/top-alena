# EmployeeHome "Wow" Header — Design

**Date:** 2026-07-14
**Owner ask:** Employees open the app and go "WOW". Compact hero header with the business photo + logo on top, in each tenant's own colors/language. All existing buttons must stay in place and working; the vibe must feel energetic ("אנרגיה טובה"). Photo must NOT take too much space.

## Scope (this iteration)
- **EmployeeHome.jsx** — the employee landing screen. Restyle only; preserve every button/widget and the customizable widget order.
- Per-tenant branding already exists (`useTenantBranding`): `name`, `logo_url`, `brand_colors {primary,secondary,accent}`, `brand_font`. Add `cover_photo_url`.

## Design
### Compact hero header (~150–180px)
- **Background:** `cover_photo_url` if set, with a warm brand-color gradient overlay (for text legibility); pure brand gradient if no photo. Rounded-3xl, soft shadow.
- **Overlay content (RTL):**
  - Top row: business logo (small) + business name on one side; the existing action cluster on the other — CoinWidget, ShiftNotificationBell, "ערוך דשבורד". All preserved.
  - Main: time-based greeting ("בוקר טוב / צהריים טובים / ערב טוב, {first name} 👋"), employee avatar, today's position badge, and the "החלף משתמש" button — all preserved.
- **Energy:** gentle entrance animation (fade+rise), subtle floating sparkle/emoji accent, warm palette.

### Page & cards
- Page background: warm cream gradient (not slate) using brand tint.
- Keep the widget list exactly as-is (order, visibility, handlers). Only wrap/soften via existing card styles — no structural change to widgets.

### Cover photo upload
- **Branding.jsx**: add a "תמונת רקע לאדר" uploader next to the logo uploader (reuses `base44.integrations.Core.UploadFile`), saving `cover_photo_url` on RestaurantProfile.

## Data / backend
- `schema.prisma`: `RestaurantProfile.cover_photo_url String?`.
- Startup drift-repair: `ALTER TABLE "RestaurantProfile" ADD COLUMN IF NOT EXISTS "cover_photo_url" TEXT;` (heals every tenant on boot, avoids P2022 on `RestaurantProfile.list`).
- `useTenantBranding.js`: expose `cover_photo_url`.

## Non-goals
- No change to widget logic, routing, or any handler.
- No per-widget redesign this pass (can follow later).

## Risk / safety
- Shared bundle across tenants → gradient fallback guarantees every tenant looks good with zero setup.
- All buttons retained verbatim; only their container styling changes.
