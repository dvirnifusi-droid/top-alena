# Shift Clock-In Geofence — Design Spec

**Date:** 2026-06-02
**Owner:** Dvir
**Scope:** Restrict shift clock-in to the restaurant's physical perimeter; auto-close shifts when an employee walks away without clocking out.

---

## Problem

Employees sometimes:
1. **Forget to clock out** when they leave at the end of a shift → payroll/hours inflate
2. **Clock in remotely** when they're not actually at the restaurant → fraud risk

Owner wants both prevented by a location check.

## Goals

- Clock-in must require the employee to be within **30 m** of the restaurant
- While clocked-in, if the employee moves more than **500 m** away → shift closes automatically
- Owner gets a **Pushover** alert when an auto-close happens
- Employee sees an **in-app banner** next time they open the app explaining the auto-close
- Admin (manager) can clock employees in/out **manually**, bypassing the geofence (covers desktop / GPS-less devices / GPS misbehavior)
- Owner can toggle the whole feature **on/off globally** and **off for specific employees**

## Non-Goals

- Background tracking when the app is closed (technically not possible reliably from a browser; out of scope).
- Schedule-based auto-close (deliberately rejected — scheduled hours are general, not actual leave times).
- A standalone in-app notifications system. The "banner on next login" is sufficient.

---

## Data Model — schema.prisma additions

### `BusinessProfile`
```
restaurant_lat               Float?    // owner sets via "use current location" button
restaurant_lng               Float?
location_tracking_required   Boolean?  @default(false)   // global on/off
```

### `Employee`
```
location_tracking_disabled   Boolean?  @default(false)   // per-employee override
```

### `ShiftTracking`
```
last_lat                     Float?
last_lng                     Float?
last_location_at             DateTime?
auto_close_reason            String?   // null | "left_geofence"
auto_close_seen_at           DateTime? // when the employee viewed the banner
```

All new fields are nullable / defaulted, so existing rows stay valid and the existing unknown-column retry pattern in `chatJobApplication` style (try/catch + fallback) is reused on writes.

---

## Backend Functions — `apps/api/src/functions/load.ts`

### `setRestaurantLocation({ lat, lng })`
Admin-only. Saves lat/lng on the single `BusinessProfile` row.

### `getGeofenceConfig()`
Public-to-authed. Returns `{ restaurant_lat, restaurant_lng, tracking_required, my_tracking_disabled, in_radius_m: 30, out_radius_m: 500, heartbeat_seconds: 120 }`. Used by the frontend to know whether to ask for GPS at all.

### `clockInWithLocation({ lat, lng, manager_override?: boolean })`
1. Load `BusinessProfile`.
2. If `tracking_required` is false OR caller's `location_tracking_disabled` is true OR `manager_override` is true (and caller is admin) → skip geofence check.
3. Otherwise compute haversine distance to restaurant. If > 30 m → throw `outside_geofence` with the actual distance for the UI to show.
4. Create `ShiftTracking` with `last_lat`, `last_lng`, `last_location_at = now`.

### `shiftHeartbeat({ shift_id, lat, lng })`
1. Load shift. If `status !== 'active'` → no-op.
2. Update `last_lat`, `last_lng`, `last_location_at`.
3. Compute distance.
   - Ignore if `now - shift_start < 2 min` (jitter window right after clock-in).
   - Otherwise: read the *previous* heartbeat's `last_lat`/`last_lng` from the row BEFORE updating. If the previous reading was also >500 m AND the current is >500 m → trigger auto-close. Otherwise just update fields and return.
   - This is the "two consecutive readings" debounce: a single jitter spike won't trigger anything; only two pings ≥2 min apart that both show >500 m do.
4. On close:
   - `shift_end = now`, `status = 'auto_closed'`, `auto_close_reason = 'left_geofence'`
   - `pushoverToAdmins('🚪 משמרת נסגרה אוטומטית', '${employee_name} התרחק 500m+ מהעסק. נסגרה ב-HH:MM')`
   - Compute `total_hours` and any other fields the existing manual close computes (mirror the `closeShift` logic).

### `getMyAutoCloseNotice()`
Returns the most recent `ShiftTracking` for the caller where `auto_close_reason='left_geofence'` AND `auto_close_seen_at IS NULL`. Used by the frontend to show the banner.

### `markAutoCloseNoticeSeen({ shift_id })`
Sets `auto_close_seen_at = now`.

### `setEmployeeLocationToggle({ employee_id, disabled })`
Admin-only. Sets `Employee.location_tracking_disabled`.

---

## Frontend Changes

### `src/components/shift/ShiftClockWidget.jsx`
- **On mount / before clock-in:** call `getGeofenceConfig()`. If `tracking_required && !my_tracking_disabled`, the "Clock In" button calls `navigator.geolocation.getCurrentPosition` first, then `clockInWithLocation(lat, lng)`. Show clear errors:
  - Permission denied → "צריך לאשר הרשאת מיקום כדי להיכנס למשמרת"
  - `outside_geofence` → "אתה במרחק X מ' מהעסק — לא ניתן להיכנס מכאן"
  - GPS unavailable → "המיקום לא זמין. פנה למנהל לכניסה ידנית."
- **While active shift:** `setInterval` every 120s → `navigator.geolocation.getCurrentPosition` → `shiftHeartbeat({shift_id, lat, lng})`. On error (perm revoked mid-shift) — silent no-op; manager will see the missing heartbeats if needed.
- **Manager override button:** only visible if `user.role === 'admin'`. Opens an "Clock in for employee" dropdown + a "force clock in" checkbox that skips the geofence check.

### Banner on app load — wherever the employee-facing top-level layout is (likely `src/Layout.jsx` for non-admins)
- On mount, call `getMyAutoCloseNotice()`. If a shift comes back:
  - Show a dismissible toast/banner: "המשמרת שלך מתאריך X נסגרה אוטומטית ב-HH:MM כי התרחקת מהעסק. אם זו טעות — דבר עם המנהל."
  - On dismiss → call `markAutoCloseNoticeSeen({shift_id})`.

### New page / section — admin settings
- "📍 מיקום העסק" — single button "קבע מיקום עכשיו" that runs `getCurrentPosition` and calls `setRestaurantLocation`. Shows the current saved lat/lng + a map link to verify.
- Toggle "דרוש מיקום לכניסה למשמרת" (`location_tracking_required` global).
- List of employees with a "ללא דרישת מיקום" checkbox each → `setEmployeeLocationToggle`.

Location for this UI: existing admin settings page if there is one, otherwise a new section in the dashboard. I'll pick during implementation based on existing structure.

---

## Edge Cases & Decisions

| Case | Behavior |
|---|---|
| Employee denies GPS permission at clock-in | Cannot clock in. Manager override only. |
| Employee revokes GPS mid-shift | Heartbeats silently fail. Shift stays open until: (a) manager closes, (b) employee re-grants and walks 500m+. No auto-close from missing heartbeats — intentional, since "no heartbeat" ≠ "left the restaurant" reliably (could just be tab closed). |
| GPS jitter (sudden 600m reading then back) | Debounced: requires `>500m` on **two consecutive** heartbeats AND at least 2 min since clock-in. False close rate should be near zero. |
| Restaurant location not yet set by owner | `getGeofenceConfig` returns `tracking_required: false` regardless of the saved flag. Frontend skips geofence. Show admin a one-line warning on the dashboard: "מיקום העסק לא הוגדר — geofence כבוי". |
| Owner toggles tracking_required from off → on | Active shifts continue without retroactive geofence. Next clock-in will require location. |
| Employee on desktop / no GPS | Cannot clock in alone — must use manager override. |
| Employee genuinely leaves mid-shift on a legitimate errand and returns | Will be auto-closed on the way out. Acceptable tradeoff per owner — that's the whole point. Manager can re-open / adjust hours after the fact. |

---

## Testing Strategy

- Unit: haversine distance helper (known coordinates, known distance).
- Unit: heartbeat debounce logic (one >500m → no close; two consecutive → close).
- Manual e2e on phone:
  1. Set restaurant location at the actual restaurant.
  2. Stand outside → try to clock in → expect rejection.
  3. Stand inside → clock in → success.
  4. Walk away → wait 4–5 min → expect auto-close + pushover.
  5. Re-open app → expect banner.
  6. Test manager override flow.

---

## Rollout

1. Schema change → `prisma db push` runs on next deploy.
2. New backend functions deployed alongside; old `clockIn` stays working for any client that hasn't refreshed.
3. Frontend update lands → users see new flow on next refresh.
4. **Default `location_tracking_required = false`** so nothing breaks on day-1. Owner flips the toggle when ready.

---

## Open Items

None — all questions confirmed with the owner during brainstorming.
