# Shift Clock-In Geofence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate `ShiftTracking` clock-in on a 30 m proximity to the restaurant and auto-close shifts when an employee strays past 500 m, with admin-controlled global + per-employee toggles, an in-app banner for the employee, and pushover alerts to admins.

**Architecture:** Browser geolocation drives both initial clock-in and a 120 s heartbeat polled from `ShiftClockWidget`. Heartbeat handler stores last lat/lng on `ShiftTracking`; two consecutive over-threshold readings (post a 2-minute warm-up window) trigger an auto-close. Banner shown via a `getMyAutoCloseNotice` query on Layout mount. Owner sets the restaurant lat/lng once from an admin Settings page.

**Tech Stack:** Prisma + Fastify (`apps/api/`), React + Vite (`src/`), existing `registerFn` + `invokePublic` / `base44.functions.X` patterns, `navigator.geolocation`, existing `pushoverToAdmins` helper.

**Spec:** [`docs/superpowers/specs/2026-06-02-shift-geofence-design.md`](../specs/2026-06-02-shift-geofence-design.md)

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `apps/api/src/lib/geofence.ts` | **Create** | Pure haversine distance helper + radius constants. Easy to unit-test. |
| `apps/api/scripts/test-geofence.ts` | **Create** | One-off assertion script for the haversine helper. Run with `npx tsx`. |
| `apps/api/prisma/schema.prisma` | **Modify** | Add geofence fields to `BusinessProfile`, `Employee`, `ShiftTracking`. |
| `apps/api/src/functions/load.ts` | **Modify** | Add 7 new `registerFn` handlers (config, clockIn, heartbeat, notices, toggles). |
| `src/components/shift/ShiftClockWidget.jsx` | **Modify** | Route clock-in through the new backend fn + add heartbeat `setInterval`. |
| `src/components/shift/AutoCloseNoticeBanner.jsx` | **Create** | Self-contained banner — checks notice, renders toast, marks seen. |
| `src/Layout.jsx` | **Modify** | Mount `<AutoCloseNoticeBanner />` for authenticated employees. |
| `src/pages/LocationSettings.jsx` | **Create** | Admin UI for restaurant lat/lng + global toggle + per-employee toggles. |
| `src/pages.config.js` | **Modify** | Register the new page. |
| `src/App.jsx` | **Modify** | Add admin-only route for `LocationSettings`. |

---

## Task 1: Haversine helper (pure, unit-tested)

**Files:**
- Create: `apps/api/src/lib/geofence.ts`
- Create: `apps/api/scripts/test-geofence.ts`

- [ ] **Step 1: Create the helper module**

`apps/api/src/lib/geofence.ts`:
```ts
// Geofence helpers — pure, no DB or network. Distance in meters between two
// WGS-84 coordinates using the haversine formula.

export const GEOFENCE_IN_RADIUS_M = 30;     // must be within this to clock in
export const GEOFENCE_OUT_RADIUS_M = 500;   // beyond this triggers auto-close
export const GEOFENCE_WARMUP_SECONDS = 120; // ignore heartbeat checks this long after clock-in
export const HEARTBEAT_INTERVAL_SECONDS = 120;

const EARTH_RADIUS_M = 6_371_000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
```

- [ ] **Step 2: Write the assertion script**

`apps/api/scripts/test-geofence.ts`:
```ts
import { distanceMeters } from '../src/lib/geofence.js';

function assertNear(actual: number, expected: number, tolerance: number, label: string) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error(`FAIL ${label}: got ${actual.toFixed(1)} m, expected ~${expected} m (tol ${tolerance})`);
    process.exit(1);
  }
  console.log(`PASS ${label}: ${actual.toFixed(1)} m (≈${expected} m)`);
}

// Identical points → 0
assertNear(
  distanceMeters({ lat: 31.96, lng: 34.80 }, { lat: 31.96, lng: 34.80 }),
  0, 0.001, 'identical points',
);

// Tel Aviv → Rishon LeZion ≈ 11.4 km
assertNear(
  distanceMeters({ lat: 32.0853, lng: 34.7818 }, { lat: 31.9730, lng: 34.7925 }),
  12500, 1500, 'TLV → Rishon',
);

// ~30 m N–S step at Israel latitude: 0.00027° ≈ 30 m
assertNear(
  distanceMeters({ lat: 31.96, lng: 34.80 }, { lat: 31.96027, lng: 34.80 }),
  30, 2, '~30 m N step',
);

// ~500 m E–W step at Israel latitude: 0.0053° lng ≈ 500 m (cos ~0.85)
assertNear(
  distanceMeters({ lat: 31.96, lng: 34.80 }, { lat: 31.96, lng: 34.8053 }),
  500, 25, '~500 m E step',
);

console.log('\nAll geofence assertions passed.');
```

- [ ] **Step 3: Run the assertions**

```bash
cd apps/api && npx tsx scripts/test-geofence.ts
```

Expected: 4 `PASS` lines + `All geofence assertions passed.`

- [ ] **Step 4: Commit**

```bash
cd /c/Users/97253/top-alena-migration
git add apps/api/src/lib/geofence.ts apps/api/scripts/test-geofence.ts
git commit -m "feat(geofence): add haversine helper with unit assertions"
```

---

## Task 2: Schema changes

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add fields to `BusinessProfile`**

Find `model BusinessProfile {` and add (before the closing `}`):
```
  restaurant_lat               Float?
  restaurant_lng               Float?
  location_tracking_required   Boolean?  @default(false)
```

- [ ] **Step 2: Add field to `Employee`**

Find `model Employee {` and add (before `createdBy String?`):
```
  location_tracking_disabled   Boolean?  @default(false)
```

- [ ] **Step 3: Add fields to `ShiftTracking`**

Find `model ShiftTracking {` and add (before `createdBy String?`):
```
  last_lat                     Float?
  last_lng                     Float?
  last_location_at             DateTime?
  auto_close_reason            String?
  auto_close_seen_at           DateTime?
```

- [ ] **Step 4: Regenerate Prisma client**

```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Commit**

```bash
cd /c/Users/97253/top-alena-migration
git add apps/api/prisma/schema.prisma
git commit -m "feat(geofence): schema fields on BusinessProfile/Employee/ShiftTracking"
```

(No `prisma db push` locally — the deploy host runs it at startup, and `load.ts` writes use try/catch unknown-column retry so partial deploy windows stay safe.)

---

## Task 3: Backend — `getGeofenceConfig` + `setRestaurantLocation`

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Add helper import**

Near the top of `apps/api/src/functions/load.ts` (around line 16, after the other lib imports), add:
```ts
import {
  distanceMeters,
  GEOFENCE_IN_RADIUS_M,
  GEOFENCE_OUT_RADIUS_M,
  GEOFENCE_WARMUP_SECONDS,
  HEARTBEAT_INTERVAL_SECONDS,
} from '../lib/geofence.js';
```

- [ ] **Step 2: Add the two handlers**

Append at the end of `load.ts`, before the final blank line:

```ts
/* ----- Shift geofence (clock-in proximity + auto-close on leave) ----- */

// Authed — anyone logged in can read config (frontend uses it to know whether
// to ask for GPS). Per-employee disable flag is resolved server-side.
registerFn('getGeofenceConfig', async ({ user }) => {
  const profile = await db.businessProfile.findFirst();
  const restaurant_lat = profile?.restaurant_lat ?? null;
  const restaurant_lng = profile?.restaurant_lng ?? null;
  const trackingFlagOn = !!profile?.location_tracking_required;
  const hasLocation = restaurant_lat != null && restaurant_lng != null;

  let my_tracking_disabled = false;
  if (user?.id) {
    const emp = await db.employee.findUnique({ where: { id: user.id } }).catch(() => null);
    my_tracking_disabled = !!emp?.location_tracking_disabled;
  }

  return {
    restaurant_lat,
    restaurant_lng,
    tracking_required: trackingFlagOn && hasLocation,
    my_tracking_disabled,
    in_radius_m: GEOFENCE_IN_RADIUS_M,
    out_radius_m: GEOFENCE_OUT_RADIUS_M,
    heartbeat_seconds: HEARTBEAT_INTERVAL_SECONDS,
  };
});

// Admin-only — save the restaurant's lat/lng on the single BusinessProfile row.
registerFn('setRestaurantLocation', async ({ user, body }) => {
  const role = (user as any)?.role;
  if (role !== 'admin' && role !== 'owner' && role !== 'manager') {
    throw new Error('admin only');
  }
  const { lat, lng } = body as any;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('lat/lng required as numbers');
  }
  const existing = await db.businessProfile.findFirst();
  const data = { restaurant_lat: lat, restaurant_lng: lng };
  const saved = existing
    ? await db.businessProfile.update({ where: { id: existing.id }, data })
    : await db.businessProfile.create({ data: { ...data, business_name: 'עלינא', business_type: 'restaurant', profile_data: {} } });
  return { profile: { restaurant_lat: saved.restaurant_lat, restaurant_lng: saved.restaurant_lng } };
});

// Admin-only — flip the global "geofence required" switch.
registerFn('setGlobalLocationTracking', async ({ user, body }) => {
  const role = (user as any)?.role;
  if (role !== 'admin' && role !== 'owner' && role !== 'manager') {
    throw new Error('admin only');
  }
  const { enabled } = body as any;
  const existing = await db.businessProfile.findFirst();
  if (!existing) throw new Error('business profile not set');
  const saved = await db.businessProfile.update({
    where: { id: existing.id },
    data: { location_tracking_required: !!enabled },
  });
  return { location_tracking_required: saved.location_tracking_required };
});

// Admin-only — per-employee opt-out.
registerFn('setEmployeeLocationToggle', async ({ user, body }) => {
  const role = (user as any)?.role;
  if (role !== 'admin' && role !== 'owner' && role !== 'manager') {
    throw new Error('admin only');
  }
  const { employee_id, disabled } = body as any;
  if (!employee_id) throw new Error('employee_id required');
  const saved = await db.employee.update({
    where: { id: employee_id },
    data: { location_tracking_disabled: !!disabled },
  });
  return { employee_id: saved.id, location_tracking_disabled: saved.location_tracking_disabled };
});
```

- [ ] **Step 3: Sanity-check compile (no test runner here — just tsc)**

```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc -p tsconfig.json --noEmit 2>&1 | head -20
```

Expected: no errors mentioning `geofence`, `getGeofenceConfig`, or `setRestaurantLocation`. Other unrelated pre-existing errors may print — those are not our problem.

- [ ] **Step 4: Commit**

```bash
cd /c/Users/97253/top-alena-migration
git add apps/api/src/functions/load.ts
git commit -m "feat(geofence): config + admin setters (restaurant location, global toggle, per-employee toggle)"
```

---

## Task 4: Backend — `clockInWithLocation`

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Append the handler**

Append after the handlers from Task 3:

```ts
// Authed — gated clock-in. Mirrors the create the frontend used to do directly,
// but adds a geofence check. Returns the same shape `ShiftTracking.create` would.
registerFn('clockInWithLocation', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  const { lat, lng, manager_override } = body as any;

  const profile = await db.businessProfile.findFirst();
  const trackingOn =
    !!profile?.location_tracking_required &&
    profile?.restaurant_lat != null &&
    profile?.restaurant_lng != null;

  const emp = await db.employee.findUnique({ where: { id: user.id } }).catch(() => null);
  const empDisabled = !!emp?.location_tracking_disabled;

  const role = (user as any)?.role;
  const isAdmin = role === 'admin' || role === 'owner' || role === 'manager';
  const skipCheck = !trackingOn || empDisabled || (manager_override && isAdmin);

  if (!skipCheck) {
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new Error('location_required');
    }
    const d = distanceMeters(
      { lat, lng },
      { lat: profile!.restaurant_lat as number, lng: profile!.restaurant_lng as number },
    );
    if (d > GEOFENCE_IN_RADIUS_M) {
      const err: any = new Error('outside_geofence');
      err.distance_m = Math.round(d);
      err.allowed_m = GEOFENCE_IN_RADIUS_M;
      throw err;
    }
  }

  // Check for an already-active shift for this employee — don't double clock-in.
  const open = await db.shiftTracking.findFirst({
    where: { employee_id: user.id, status: 'active' },
  });
  if (open) return { shift: open, already_active: true };

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const base: any = {
    employee_id: user.id,
    employee_name: (user as any).full_name || emp?.full_name || (user as any).email || 'עובד',
    date: new Date(today),
    shift_start: now,
    status: 'active',
    breaks: [],
    total_break_minutes: 0,
    had_meal: false,
  };
  const optionalLoc =
    typeof lat === 'number' && typeof lng === 'number'
      ? { last_lat: lat, last_lng: lng, last_location_at: now }
      : {};

  let shift: any = null;
  try {
    shift = await db.shiftTracking.create({ data: { ...base, ...optionalLoc } });
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (/unknown (arg|column)/i.test(msg) || msg.toLowerCase().includes('last_lat')) {
      console.warn('[clockInWithLocation] retrying without location fields:', msg);
      shift = await db.shiftTracking.create({ data: base });
    } else {
      throw e;
    }
  }
  return { shift, already_active: false };
});
```

- [ ] **Step 2: tsc check**

```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc -p tsconfig.json --noEmit 2>&1 | head -10
```

Expected: no new errors mentioning `clockInWithLocation`.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/97253/top-alena-migration
git add apps/api/src/functions/load.ts
git commit -m "feat(geofence): clockInWithLocation handler with 30m gate + manager override"
```

---

## Task 5: Backend — `shiftHeartbeat` (debounced auto-close)

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Append the handler**

Append after the Task 4 handler:

```ts
// Authed — heartbeat from the active shift widget. Returns whether the shift
// is still open. Debounce: requires (a) past warm-up window AND (b) the
// PREVIOUS reading was also over the threshold before auto-closing. This
// kills false positives from GPS jitter.
registerFn('shiftHeartbeat', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  const { shift_id, lat, lng } = body as any;
  if (!shift_id || typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('shift_id, lat, lng required');
  }

  const shift = await db.shiftTracking.findUnique({ where: { id: shift_id } });
  if (!shift) throw new Error('shift_not_found');
  if (shift.employee_id !== user.id) throw new Error('not your shift');
  if (shift.status !== 'active') {
    return { status: shift.status, closed: true };
  }

  const profile = await db.businessProfile.findFirst();
  const trackingOn =
    !!profile?.location_tracking_required &&
    profile?.restaurant_lat != null &&
    profile?.restaurant_lng != null;
  const emp = await db.employee.findUnique({ where: { id: user.id } }).catch(() => null);
  const empDisabled = !!emp?.location_tracking_disabled;

  // Always record the current ping. We only AUTO-CLOSE if tracking is on for
  // this employee and the debounce conditions are met.
  const now = new Date();
  const prevLat = shift.last_lat as number | null;
  const prevLng = shift.last_lng as number | null;
  const shiftStartMs = new Date(shift.shift_start).getTime();
  const ageSeconds = (now.getTime() - shiftStartMs) / 1000;

  let willClose = false;
  if (trackingOn && !empDisabled && ageSeconds >= GEOFENCE_WARMUP_SECONDS) {
    const cur = distanceMeters(
      { lat, lng },
      { lat: profile!.restaurant_lat as number, lng: profile!.restaurant_lng as number },
    );
    if (cur > GEOFENCE_OUT_RADIUS_M && prevLat != null && prevLng != null) {
      const prev = distanceMeters(
        { lat: prevLat, lng: prevLng },
        { lat: profile!.restaurant_lat as number, lng: profile!.restaurant_lng as number },
      );
      if (prev > GEOFENCE_OUT_RADIUS_M) willClose = true;
    }
  }

  if (!willClose) {
    await db.shiftTracking.update({
      where: { id: shift_id },
      data: { last_lat: lat, last_lng: lng, last_location_at: now },
    });
    return { closed: false };
  }

  // Auto-close
  const startMs = new Date(shift.shift_start).getTime();
  const totalHours = Math.max(0, (now.getTime() - startMs) / 3_600_000 - (shift.total_break_minutes || 0) / 60);
  await db.shiftTracking.update({
    where: { id: shift_id },
    data: {
      shift_end: now,
      status: 'auto_closed',
      auto_close_reason: 'left_geofence',
      total_hours: totalHours,
      effective_hours: totalHours,
      last_lat: lat,
      last_lng: lng,
      last_location_at: now,
    },
  });

  const empName = shift.employee_name || emp?.full_name || 'עובד';
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  pushoverToAdmins(
    '🚪 משמרת נסגרה אוטומטית',
    `${empName} התרחק 500m+ מהעסק. נסגרה ב-${hhmm}.`,
  ).catch(() => {});

  return { closed: true, reason: 'left_geofence' };
}, { public: false });
```

- [ ] **Step 2: tsc check**

```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc -p tsconfig.json --noEmit 2>&1 | head -10
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /c/Users/97253/top-alena-migration
git add apps/api/src/functions/load.ts
git commit -m "feat(geofence): shiftHeartbeat with debounced auto-close + pushover alert"
```

---

## Task 6: Backend — auto-close notice queries

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Append the two handlers**

```ts
// Authed — employee asks "did anything auto-close on me that I haven't seen?"
registerFn('getMyAutoCloseNotice', async ({ user }) => {
  if (!user?.id) return { notice: null };
  const shift = await db.shiftTracking.findFirst({
    where: {
      employee_id: user.id,
      auto_close_reason: 'left_geofence',
      auto_close_seen_at: null,
    },
    orderBy: { shift_end: 'desc' },
  });
  if (!shift) return { notice: null };
  return {
    notice: {
      shift_id: shift.id,
      shift_end: shift.shift_end,
      reason: shift.auto_close_reason,
    },
  };
});

// Authed — mark the banner as dismissed.
registerFn('markAutoCloseNoticeSeen', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  const { shift_id } = body as any;
  if (!shift_id) throw new Error('shift_id required');
  const shift = await db.shiftTracking.findUnique({ where: { id: shift_id } });
  if (!shift || shift.employee_id !== user.id) throw new Error('not found');
  await db.shiftTracking.update({
    where: { id: shift_id },
    data: { auto_close_seen_at: new Date() },
  });
  return { ok: true };
});
```

- [ ] **Step 2: tsc check + commit**

```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc -p tsconfig.json --noEmit 2>&1 | head -10
cd /c/Users/97253/top-alena-migration
git add apps/api/src/functions/load.ts
git commit -m "feat(geofence): getMyAutoCloseNotice + markAutoCloseNoticeSeen"
```

---

## Task 7: Frontend — `ShiftClockWidget` clock-in + heartbeat

**Files:**
- Modify: `src/components/shift/ShiftClockWidget.jsx`

- [ ] **Step 1: Add `getCurrentPosition` helper and replace `startShift`**

Open `src/components/shift/ShiftClockWidget.jsx`. Near the top of the component file, after the imports, add:

```jsx
// Promise wrapper around navigator.geolocation. Resolves with {lat,lng} or
// rejects with a short code: 'denied' | 'unavailable' | 'timeout'.
function readPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unavailable'));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === 1) reject(new Error('denied'));
        else if (err.code === 2) reject(new Error('unavailable'));
        else reject(new Error('timeout'));
      },
      { timeout: 8000, maximumAge: 15000, enableHighAccuracy: true },
    );
  });
}
```

Then locate the existing `const startShift = async () => { ... }` function. Replace the call to `base44.entities.ShiftTracking.create({...})` (lines ~86-95) with a single call to the new backend fn, with a manager override prompt on geofence failure. The replacement for the **entire `startShift` body** (still inside the existing arrow fn):

```jsx
    const startShift = async () => {
        setActionLoading(true);
        try {
            // Pull config: do we even need GPS for this user?
            const cfg = await base44.functions.getGeofenceConfig({});
            let coords = null;
            if (cfg?.data?.tracking_required && !cfg?.data?.my_tracking_disabled) {
                try {
                    coords = await readPosition();
                } catch (e) {
                    const msg = e.message === 'denied'
                        ? 'צריך לאשר הרשאת מיקום כדי להיכנס למשמרת'
                        : 'המיקום לא זמין כרגע. פנה למנהל לכניסה ידנית.';
                    alert(msg);
                    setActionLoading(false);
                    return;
                }
            }

            let res;
            try {
                res = await base44.functions.clockInWithLocation({
                    lat: coords?.lat ?? null,
                    lng: coords?.lng ?? null,
                });
            } catch (err) {
                const data = err?.response?.data || err?.data || {};
                if (data?.error === 'outside_geofence' || /outside_geofence/.test(err?.message || '')) {
                    alert(`אתה במרחק ${data.distance_m || '?'} מ' מהעסק — לא ניתן להיכנס מכאן.`);
                } else {
                    alert('שגיאה בכניסה למשמרת: ' + (err?.message || 'unknown'));
                }
                setActionLoading(false);
                return;
            }

            const shift = res?.data?.shift;
            if (!shift) {
                alert('שגיאה: לא נוצרה משמרת');
                setActionLoading(false);
                return;
            }

            // The schedule-bookkeeping block below (WorkShift assignment) is
            // copied verbatim from the previous startShift implementation —
            // only the ShiftTracking.create was replaced.
            const now = shift.shift_start;
            const today = format(new Date(), 'yyyy-MM-dd');
            const employeeRecord = await findEmployeeRecord(user);
            const employeeId = employeeRecord?.id || user.id;
            const employeeName = employeeRecord?.full_name || user.full_name;
            const workShifts = await base44.entities.WorkShift.filter({ date: today });
            let assignmentFound = null;
            let targetShift = null;
            for (const ws of workShifts) {
                const assignment = (ws.assigned_staff || []).find(a =>
                    a.employee_id === employeeId ||
                    (a.employee_name && employeeName && a.employee_name.toLowerCase() === employeeName.toLowerCase())
                );
                if (assignment) { assignmentFound = assignment; targetShift = ws; break; }
            }
            if (!assignmentFound) {
                const hour = new Date().getHours();
                const shiftType = hour < 16 ? 'lunch' : 'dinner';
                let ws = workShifts.find(w => w.shift_type === shiftType);
                if (!ws) {
                    ws = await base44.entities.WorkShift.create({
                        date: today,
                        shift_type: shiftType,
                        start_time: shiftType === 'lunch' ? '12:00' : '17:00',
                        end_time: shiftType === 'lunch' ? '17:00' : '23:00',
                        assigned_staff: [],
                        positions_needed: {},
                    });
                }
                const updatedStaff = [...(ws.assigned_staff || []), {
                    employee_id: employeeId,
                    employee_name: user.full_name,
                    position: 'בלתם',
                    start_time: format(new Date(now), 'HH:mm'),
                    end_time: '',
                    breaks: [],
                    notes: 'נוסף אוטומטית',
                    had_meal: false,
                    meal_details: '',
                    total_break_minutes: 0,
                }];
                await base44.entities.WorkShift.update(ws.id, { assigned_staff: updatedStaff });
            } else if (assignmentFound.position === 'בלתם' || !assignmentFound.start_time) {
                const updatedStaff = [...(targetShift.assigned_staff || [])].map(a =>
                    (a.employee_id === employeeId || (a.employee_name && employeeName && a.employee_name.toLowerCase() === employeeName.toLowerCase()))
                        ? { ...a, employee_id: employeeId, start_time: format(new Date(now), 'HH:mm') }
                        : a
                );
                await base44.entities.WorkShift.update(targetShift.id, { assigned_staff: updatedStaff });
            }

            setActiveShift(shift);
            setShowGearUp(true);
        } finally {
            setActionLoading(false);
        }
    };
```

- [ ] **Step 2: Add heartbeat polling**

In the same file, find where `activeShift` is used in a `useEffect` (or where elapsed time is tracked — around line 244). Add a new `useEffect` that polls geolocation every 2 min while `activeShift?.status === 'active'`:

```jsx
    // Geofence heartbeat — only while a shift is active. Stops on auto-close.
    React.useEffect(() => {
        if (!activeShift || activeShift.status !== 'active') return;
        let cancelled = false;
        const sendPing = async () => {
            if (cancelled || !navigator.geolocation) return;
            try {
                const pos = await readPosition();
                const res = await base44.functions.shiftHeartbeat({
                    shift_id: activeShift.id,
                    lat: pos.lat,
                    lng: pos.lng,
                });
                if (res?.data?.closed) {
                    // The server closed our shift — refresh local state.
                    setActiveShift(null);
                    alert('המשמרת שלך נסגרה אוטומטית — התרחקת מהעסק.');
                }
            } catch {
                // Silent. We don't block the worker over a single failed ping.
            }
        };
        // First ping after 30 s (not immediate — clock-in already saved a location)
        const t0 = setTimeout(sendPing, 30_000);
        const interval = setInterval(sendPing, 120_000);
        return () => { cancelled = true; clearTimeout(t0); clearInterval(interval); };
    }, [activeShift?.id, activeShift?.status]);
```

(If the file doesn't already `import React from 'react'` at top — it does in JSX files, but verify and add the named import if needed.)

- [ ] **Step 3: Manual sanity — file compiles**

```bash
cd /c/Users/97253/top-alena-migration && npx vite build 2>&1 | tail -20
```

Expected: build succeeds. If a syntax error appears in `ShiftClockWidget.jsx`, fix it before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/components/shift/ShiftClockWidget.jsx
git commit -m "feat(geofence): widget routes clock-in through backend + heartbeat polling"
```

---

## Task 8: Frontend — `AutoCloseNoticeBanner`

**Files:**
- Create: `src/components/shift/AutoCloseNoticeBanner.jsx`
- Modify: `src/Layout.jsx`

- [ ] **Step 1: Create the banner component**

`src/components/shift/AutoCloseNoticeBanner.jsx`:
```jsx
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function AutoCloseNoticeBanner() {
    const [notice, setNotice] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await base44.functions.getMyAutoCloseNotice({});
                if (!cancelled && res?.data?.notice) setNotice(res.data.notice);
            } catch {
                /* ignore */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!notice) return null;

    const when = notice.shift_end
        ? new Date(notice.shift_end).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
        : '';

    const dismiss = async () => {
        try { await base44.functions.markAutoCloseNoticeSeen({ shift_id: notice.shift_id }); } catch {}
        setNotice(null);
    };

    return (
        <div className="fixed top-4 inset-x-4 z-50 max-w-md mx-auto bg-orange-50 border border-orange-300 rounded-xl shadow-lg p-4 flex items-start gap-3">
            <span className="text-2xl">🚪</span>
            <div className="flex-1 text-sm text-slate-800">
                <div className="font-bold mb-1">המשמרת שלך נסגרה אוטומטית</div>
                <div>סגרנו לך משמרת ב-{when} כי התרחקת מהעסק. אם זו טעות — דבר עם המנהל.</div>
            </div>
            <button
                onClick={dismiss}
                className="text-slate-500 hover:text-slate-800 text-lg leading-none px-1"
                aria-label="סגור"
            >×</button>
        </div>
    );
}
```

- [ ] **Step 2: Mount on Layout**

Open `src/Layout.jsx`. Add the import at the top:
```jsx
import AutoCloseNoticeBanner from '@/components/shift/AutoCloseNoticeBanner';
```

And inside the top-level returned JSX (wherever children are rendered), add `<AutoCloseNoticeBanner />` as a sibling at the top — it self-suppresses when there's no notice. If unsure where exactly, place it right inside the outermost `<div>` of the layout's return statement.

- [ ] **Step 3: Build + commit**

```bash
cd /c/Users/97253/top-alena-migration && npx vite build 2>&1 | tail -10
git add src/components/shift/AutoCloseNoticeBanner.jsx src/Layout.jsx
git commit -m "feat(geofence): in-app banner for auto-closed shifts"
```

---

## Task 9: Frontend — admin Settings page

**Files:**
- Create: `src/pages/LocationSettings.jsx`
- Modify: `src/pages.config.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Create the page**

`src/pages/LocationSettings.jsx`:
```jsx
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export default function LocationSettings() {
    const [config, setConfig] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    const load = async () => {
        const cfg = await base44.functions.getGeofenceConfig({});
        setConfig(cfg?.data || null);
        const emps = await base44.entities.Employee.list();
        setEmployees(emps || []);
    };
    useEffect(() => { load(); }, []);

    const captureLocation = async () => {
        if (!navigator.geolocation) { alert('GPS לא זמין במכשיר הזה'); return; }
        setSaving(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                await base44.functions.setRestaurantLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setMsg(`✅ נשמר מיקום: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
                setSaving(false);
                load();
            },
            (err) => { alert('שגיאת מיקום: ' + err.message); setSaving(false); },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    };

    const toggleGlobal = async (enabled) => {
        await base44.functions.setGlobalLocationTracking({ enabled });
        load();
    };
    const toggleEmployee = async (employee_id, disabled) => {
        await base44.functions.setEmployeeLocationToggle({ employee_id, disabled });
        load();
    };

    if (!config) return <div className="p-6">טוען...</div>;

    const mapsHref = config.restaurant_lat
        ? `https://maps.google.com/?q=${config.restaurant_lat},${config.restaurant_lng}`
        : null;

    return (
        <div className="p-4 max-w-2xl mx-auto space-y-4">
            <h1 className="text-2xl font-bold">📍 הגדרות מיקום העסק</h1>

            <Card>
                <CardContent className="p-4 space-y-3">
                    <h2 className="font-semibold">מיקום העסק</h2>
                    {config.restaurant_lat ? (
                        <p className="text-sm text-slate-600">
                            {config.restaurant_lat.toFixed(5)}, {config.restaurant_lng.toFixed(5)}{' '}
                            <a href={mapsHref} target="_blank" rel="noopener" className="text-blue-600 underline">פתח במפה</a>
                        </p>
                    ) : (
                        <p className="text-sm text-orange-600">⚠️ עוד לא הוגדר מיקום — geofence כבוי בכל מקרה.</p>
                    )}
                    <Button onClick={captureLocation} disabled={saving}>
                        📍 קבע מיקום עכשיו (השתמש ב-GPS של המכשיר)
                    </Button>
                    {msg && <p className="text-sm text-green-700">{msg}</p>}
                    <p className="text-xs text-slate-500">תצטרך/י לעמוד במסעדה כשתלחץ/י על הכפתור.</p>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold">דרישת מיקום לכניסה למשמרת</h2>
                            <p className="text-xs text-slate-500">כשמופעל: עובדים חייבים להיות במרחק 30m מהעסק כדי להחתים כניסה.</p>
                        </div>
                        <Switch
                            checked={!!config.tracking_required}
                            onCheckedChange={toggleGlobal}
                            disabled={config.restaurant_lat == null}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 space-y-2">
                    <h2 className="font-semibold">עובדים — בלי דרישת מיקום</h2>
                    <p className="text-xs text-slate-500">סמן עובדים שיכולים להחתים כניסה גם מחוץ למסעדה (פטור פרטני).</p>
                    <div className="divide-y">
                        {employees.map(emp => (
                            <div key={emp.id} className="flex items-center justify-between py-2">
                                <span>{emp.full_name}</span>
                                <Switch
                                    checked={!!emp.location_tracking_disabled}
                                    onCheckedChange={(v) => toggleEmployee(emp.id, v)}
                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
```

- [ ] **Step 2: Register the page**

Open `src/pages.config.js`. Following the existing pattern (look at an admin-only page like `GamificationAdmin` already registered there), add an entry:

```js
{ path: 'LocationSettings', component: 'LocationSettings', adminOnly: true, label: 'הגדרות מיקום' }
```

(Use whatever exact shape the file uses — copy the closest existing entry's shape.)

- [ ] **Step 3: Add the route**

Open `src/App.jsx`. Find where other admin-only routes are registered and add:

```jsx
import LocationSettings from '@/pages/LocationSettings';
// ...
<Route path="/LocationSettings" element={<LocationSettings />} />
```

(Match the surrounding pattern — protected route wrapper, etc.)

- [ ] **Step 4: Add to sidebar (Layout.jsx)**

Open `src/Layout.jsx`. Find the admin sidebar items and add a link to `/LocationSettings` with label "הגדרות מיקום" or "📍 מיקום עסק". Match surrounding pattern.

- [ ] **Step 5: Build + commit**

```bash
cd /c/Users/97253/top-alena-migration && npx vite build 2>&1 | tail -10
git add src/pages/LocationSettings.jsx src/pages.config.js src/App.jsx src/Layout.jsx
git commit -m "feat(geofence): admin LocationSettings page (set location, global + per-employee toggles)"
```

---

## Task 10: Deploy + manual e2e

**Files:** none — operational.

- [ ] **Step 1: Push**

```bash
cd /c/Users/97253/top-alena-migration && git push origin migration
```

Wait 2–3 min for auto-deploy.

- [ ] **Step 2: Verify deploy live**

Browse to the app. Open browser devtools → Network. Reload. Check that a call to `getGeofenceConfig` returns 200 with `tracking_required: false` (default).

- [ ] **Step 3: Set restaurant location**

As owner/admin, navigate to `/LocationSettings`. Stand inside the restaurant. Click "קבע מיקום עכשיו". Confirm the lat/lng saves and Google Maps link points at the actual restaurant.

- [ ] **Step 4: Enable global tracking**

Flip "דרישת מיקום לכניסה למשמרת" on. Refresh — call to `getGeofenceConfig` should now return `tracking_required: true`.

- [ ] **Step 5: Test allow path**

While inside the restaurant: open the shift widget on a phone, try to clock in. Expected: works, ShiftTracking row created with `last_lat`/`last_lng` populated.

- [ ] **Step 6: Test block path**

Walk 50m+ away (or use a second device from off-site). Try to clock in. Expected: alert "אתה במרחק X מ' מהעסק — לא ניתן להיכנס מכאן".

- [ ] **Step 7: Test auto-close**

Clock in inside the restaurant. Leave the phone with the tab open. Walk >500m away (e.g., across the street and down the block twice). Within ~4 min you should:
- Receive a pushover: "🚪 משמרת נסגרה אוטומטית — ... ב-HH:MM"
- See the shift end-time in the dashboard equals roughly now
- On next app open as the employee: see the orange banner

- [ ] **Step 8: Test per-employee disable**

In `LocationSettings`, flip a specific employee's "בלי דרישת מיקום" on. That employee should be able to clock in from anywhere. Verify with their account.

- [ ] **Step 9: Disable feature**

Flip the global switch off. Verify clock-in works without GPS prompts.

---

## Notes on Risk

- **GPS jitter near the 30 m boundary** — debounce only protects against the *out* radius. If a real employee at the doorway gets a 35 m reading on clock-in they'll be blocked. If reports come in, bump `GEOFENCE_IN_RADIUS_M` to 50 m in `geofence.ts` — single-line change, redeploy.
- **First-time setup window** — between the code deploy and the owner saving a location, `tracking_required` resolves to `false` because there's no `restaurant_lat`. Safe by design.
- **No Prisma migration here** — relying on `prisma db push` at deploy startup. The kashrut precedent in `chatJobApplication` already does this. If deploy startup doesn't run `db push`, the `clockInWithLocation` retry catches the unknown-column error.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-02-shift-geofence.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks sequentially in this session with checkpoints.

**Which approach?**
