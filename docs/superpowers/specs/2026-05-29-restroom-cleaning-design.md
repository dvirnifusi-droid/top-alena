# Restroom Cleaning Management — Design

Date: 2026-05-29

## Goal
A dedicated "ניקיון שירותים" page where, every round hour, on-shift staff
(shift manager + dishwasher + waiters) get a Web Push reminder to check the
restrooms, and can mark a check as done with an optional photo.

## Decisions (from brainstorming)
- Delivery: **Web Push** to each on-shift employee's installed PWA.
- Placement: **dedicated page** + sidebar nav item.
- Target: only employees **currently clocked in** (`ShiftTracking.status='active'`,
  today) whose role/position is in a configurable target set (default:
  manager / waiter / dishwasher).
- Schedule: hourly, **only when ≥1 target employee is on shift**.
- Photo: **optional** to mark a check done.

## Data model (additive)
- `Employee.push_subscription Json?` — stored when the employee enables
  notifications on their device.
- `RestroomCheck` — `id, checked_by_id, checked_by_name, checked_at (String ISO),
  photo_url String?, notes String?, shift_date String, created_*`.
- `RestroomSettings` (singleton) — `id, enabled Boolean (def true),
  target_positions Json (string[]), created_*`. Editable by admin so target
  roles aren't hardcoded.

## Backend (apps/api)
Functions (auth required unless noted):
- `enableStaffPush({ subscription })` — save subscription onto the caller's
  Employee (matched by `req.user.email`).
- `recordRestroomCheck({ photo_url?, notes? })` — create a RestroomCheck for
  the caller.
- `getRestroomStatus()` — today's checks + whether the current hour is covered.
- `getRestroomSettings()` / `saveRestroomSettings({...})` — admin config.

Cron endpoint: `POST /api/cron/restroom-reminder`, guarded by `CRON_SECRET`
(header `x-cron-secret`). Logic:
1. Load active `ShiftTracking` for today.
2. Join to `Employee`; keep those whose `role`/`positions` intersect
   `RestroomSettings.target_positions` (empty target ⇒ all on-shift).
3. For each with a `push_subscription`, send Web Push ("בדקו את השירותים 🚽").
4. No-op if no eligible on-shift staff.

## Scheduling
System crontab line `0 * * * *` curls the endpoint with the secret. Added to
`setup-autodeploy.sh` (same hands-off mechanism as auto-deploy).

## DB migration / deploy
New columns require `prisma db push` against Supabase. To keep deploys
hands-off, the API container runs `prisma db push --skip-generate` on start
(non-fatal: failure logs and continues so the API still boots). Safe for the
additive changes here.

## Frontend (src)
New page `RestroomCleaning.jsx` (public route group = no; it's an authed admin
page, under the Layout):
- Today's timeline: hours checked, by whom, photo thumbnail.
- Big button "✅ בדקתי את השירותים" → optional photo upload (Core.UploadFile) →
  `recordRestroomCheck`.
- "🔔 הפעל התראות במכשיר הזה" → subscribe via existing VAPID key →
  `enableStaffPush`.
- Admin settings: enable/disable + multi-select target positions.
- Sidebar nav entry in `src/Layout.jsx`.

## Out of scope (YAGNI)
- Per-restroom (multiple bathrooms) breakdown.
- Escalation if a check is missed.
- Historical analytics page (checks are logged; reporting can come later).
