# Popups System — Design Spec

**Date:** 2026-05-31
**Project:** TOP ALENA (topalena.com)
**Status:** Approved for implementation planning

## Overview

A configurable in-app popup system supporting scheduled, recurring, and triggered popups. Admins and managers create popups with flexible targeting (roles, users, branches, pages), display styles (modal, toast, banner), and dismissal behaviors. The system runs globally inside the app shell and is independent of any single page.

## Goals

- Single creation flow handles one-off, daily, weekly, immediate, and trigger-based popups.
- Targeting can combine role, user, branch, and page filters.
- Three display styles selectable per popup: blocking modal, corner toast, top banner.
- Per-popup dismissal behavior: once-per-user, every appearance, or snooze-for-X-hours.
- Creators see usage stats (views, dismissals, CTA clicks).

## Non-Goals (YAGNI)

- A/B testing
- Heatmaps / advanced analytics
- External push notifications (browser/mobile push)
- Real-time WebSocket delivery
- Multi-language auto-translation

---

## Data Model (Base44 Entities)

### `Popup`

| Field | Type | Notes |
|---|---|---|
| `title` | string | Required |
| `content` | text (markdown) | Required |
| `image_url` | string? | Optional hero image |
| `cta_label` | string? | Optional action button text |
| `cta_url` | string? | Link opened by CTA |
| `display_type` | enum | `modal` \| `toast` \| `banner` |
| `priority` | enum | `low` \| `normal` \| `high` — orders concurrent popups |
| `schedule_type` | enum | `immediate` \| `once` \| `daily` \| `weekly` \| `trigger` |
| `start_at` | datetime | Active window start |
| `end_at` | datetime | Active window end |
| `daily_time` | string? | `"HH:mm"` for `daily` schedules |
| `weekly_days` | array<int>? | `[0–6]` (Sun–Sat) for `weekly` schedules |
| `trigger_page` | string? | Route slug for `trigger` schedule |
| `target_roles` | array<string> | Empty array = no role filter |
| `target_user_ids` | array<string> | Empty array = no user filter |
| `target_branches` | array<string> | Empty array = no branch filter |
| `target_pages` | array<string> | Empty array = all pages |
| `dismiss_behavior` | enum | `once_per_user` \| `every_time` \| `snooze_hours` |
| `snooze_hours` | number? | Used when `dismiss_behavior = snooze_hours` |
| `is_active` | boolean | Soft disable without deleting |
| `created_by` | string | User id of creator |

### `PopupView`

Tracks per-user interactions.

| Field | Type | Notes |
|---|---|---|
| `popup_id` | string | FK → `Popup` |
| `user_id` | string | FK → User |
| `seen_at` | datetime | When first rendered |
| `dismissed_at` | datetime? | When user closed it |
| `snooze_until` | datetime? | If `snooze_hours` chosen |
| `cta_clicked` | boolean | Default `false` |

---

## Architecture

### Runtime components (`src/components/popups/`)

- `PopupProvider.jsx` — global React Context wrapping `Layout.jsx`. Owns popup list, view records, polling, and the active queue.
- `PopupRenderer.jsx` — reads from the provider and renders the right display component per popup.
- `PopupModal.jsx` — blocking center modal (Radix Dialog + framer-motion).
- `PopupToast.jsx` — non-blocking corner toast (sonner).
- `PopupBanner.jsx` — top-of-page strip until dismissed.
- `usePopupQueue.js` — hook managing the ordered queue (priority, then created_at).
- `popupMatcher.js` — pure functions deciding whether a popup matches the current user/page/time.

### Admin components (`src/pages/PopupsAdmin.jsx` + `src/components/popups/admin/`)

- `PopupsAdmin.jsx` — list page (filter, search, edit/duplicate/disable/delete).
- `PopupForm.jsx` — 4-tab create/edit form (Content | Schedule | Targeting | Display) with live preview pane.
- `PopupPreview.jsx` — live in-form preview matching the chosen display type.
- `PopupTargetingPanel.jsx` — roles / users / branches / pages multi-selects.
- `PopupSchedulePanel.jsx` — schedule inputs (changes per `schedule_type`).
- `PopupStatsDialog.jsx` — view counts, dismiss counts, CTA clicks, breakdown by role.

### Integration points

- `src/Layout.jsx` — wrap children with `<PopupProvider>` and render `<PopupRenderer />`. Add sidebar nav item "פופ-אפים" (lucide `Megaphone`), gated to `admin`/`manager`.
- `src/App.jsx` — add `/popups-admin` route protected by `PageGuard` (admin/manager).

---

## Data Flow

### Initial load (when a user enters the app)
1. `PopupProvider` calls `Popup.filter({ is_active: true })` via Base44 SDK, cached with React Query.
2. Loads `PopupView` records for the current user.
3. Filters client-side via `popupMatcher.js`.
4. Builds queue sorted by `priority` (high → low), then `created_at` ascending.

### Polling
- Every 2 minutes the provider re-fetches the popup list (covers `daily` / `weekly` / `once` activations).
- On every route change, queue is re-filtered for `trigger_page` / `target_pages`.

### Rendering
1. The first queued popup is handed to `PopupRenderer`.
2. `PopupRenderer` dispatches by `display_type`: `modal` blocks and shows one at a time; `toast` and `banner` may coexist with each other and with a modal.
3. On close / CTA click → write `PopupView` (create or update).
4. Apply `dismiss_behavior`:
   - `once_per_user` — popup is excluded from this user's future queues forever.
   - `every_time` — popup re-enters queue on next poll if still scheduled.
   - `snooze_hours` — sets `snooze_until = now + snooze_hours`; matcher skips until that time.

### Matching rules (all must be true)
- `is_active === true`
- `start_at <= now <= end_at`
- Schedule satisfied:
  - `immediate` — always matches inside time window.
  - `once` — matches once after `start_at`.
  - `daily` — matches if current `HH:mm` is within the daily firing window (see Open Questions).
  - `weekly` — current weekday in `weekly_days` AND inside daily firing window.
  - `trigger` — current route equals `trigger_page` and not yet fired this session.
- Targeting matches:
  - For each non-empty target array, user must be in it. Empty arrays = no constraint.
  - Page constraint via `target_pages` (if set, current route must be in list).
- Not blocked by `PopupView`:
  - `once_per_user` + a `dismissed_at` exists → blocked.
  - `snooze_until > now` → blocked.

### Edge cases
- Multiple modals matching at once → display sequentially by priority.
- Multiple toasts/banners → stack visually.
- Unauthenticated user → only popups whose `target_pages` include the current public page are considered.
- Fetch failure → silent (no popups shown, app continues).
- Render failure → caught by the existing `ErrorBoundary`, offending popup removed from queue.

---

## Permissions

- Route `/popups-admin` — guarded by `PageGuard`: `admin` or `manager` only.
- Sidebar nav item — visible only to those roles.
- Listing: admins see all popups; managers see only popups they created.
- Base44 entity policies must restrict create/update/delete to admin and manager roles.

---

## Admin UX

- **List view:** filterable table (active state, display type, creator), search by title, row actions (edit, duplicate, disable/enable, delete).
- **Create/Edit form:** 4 tabs (Content | Schedule | Targeting | Display) with a side preview pane that reflects every change live.
- **"Preview now" button:** renders the popup to the creator immediately to verify look and feel.
- **Stats dialog:** total views, dismissals, CTA click count, and a breakdown by user role.

---

## Error Handling

- Popup list fetch fails → console.error, queue stays empty, app unaffected.
- `PopupView` write fails → console.error, do not block dismissal; user will not see the popup again in this session because the provider tracks dismissals in memory too.
- Render exception → caught by `ErrorBoundary`, popup removed from queue, next one shown.

---

## Tech Stack (already in `package.json`)

- `framer-motion` — enter/exit animations
- `sonner` — toast display
- `@radix-ui/react-dialog` — modal primitive
- `date-fns` — schedule math
- `react-markdown` — rich-text content rendering
- `@tanstack/react-query` — caching popup list and view records
- `lucide-react` — icons (`Megaphone` for nav)

---

## Open Questions (resolve before implementation)

1. **Daily/weekly firing window:** how long after `daily_time` does a `daily` popup remain eligible? Default proposal: 60 minutes. Confirm during planning.
2. **Trigger popups + repeats:** should `trigger` schedule fire on every visit to `trigger_page` or only first visit per session? Default proposal: once per session, controlled by `dismiss_behavior`.
3. **Base44 entity policy syntax:** confirm exact policy spec to enforce role-based create/update/delete server-side.

These are tracked for the implementation plan, not blockers for spec approval.
