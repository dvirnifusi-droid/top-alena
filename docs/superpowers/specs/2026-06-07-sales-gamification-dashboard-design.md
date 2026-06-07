# Sales Gamification Dashboard — Design Spec

**Date:** 2026-06-07
**Owner:** Dvir Nifusi (TOP ALENA)
**Status:** Approved for implementation

## Goal

Turn the employee home dashboard into a competitive, sales-driving surface. Owner stated requirements:

1. Employees see the rewards they can buy with their coins on the home dashboard (not buried inside `/GamificationCenter`).
2. More competitive "vibe" between waitstaff — visible ranking, peer comparison, instant feedback.
3. More sales push — direct link between selling specific items and earning coins, with shift-level group goals.

Sales attribution is **manager-confirmed**: waiter sells → tells the shift supervisor (אחמש) → supervisor taps "+1" in the app → instant coin credit + leaderboard update + push notification.

This is the v1 design. Beecomm POS integration may replace the manual "+1" mechanism in v2 once Beecomm webhooks deliver per-waiter sale events; the UI stays the same.

## Non-Goals

- Tipping calculation changes (out of scope; existing TipReport flow continues).
- Reward catalog management UX changes (admin already manages `Reward` entity in `/RewardsManager`).
- Cross-restaurant leaderboards (single location only).
- Replacing the existing daily challenge / badges / stories systems — this design **adds** layers on top, doesn't replace.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                     │
│                                                               │
│  EmployeeHome.jsx                                            │
│   ├── SalesGoalsBanner          (group progress, all roles) │
│   ├── ShiftLeaderboard          (sales-facing roles only)   │
│   ├── RewardShowcase            (affordable + locked, all)  │
│   ├── CompactCoinWidget         (kitchen/dishwasher only)   │
│   ├── WeeklyPersonalGoal        (waitstaff only)            │
│   └── ShiftSupervisorPanel      (managers only)             │
│        ├── ActiveGoalsList                                   │
│        ├── PerWaiterTapButtons                              │
│        ├── ActivateGoalDialog                                │
│        └── CloseGoalButton                                  │
│                                                               │
│  VoiceControl.jsx                                            │
│   └── 4 new intents: sale_credit, sales_goal_activate,      │
│       q_sales_status, q_sales_leader                         │
│                                                               │
│  Broadcast bus (window.dispatchEvent)                        │
│   ├── 'sales:credited'  → refresh banner+leaderboard+toast  │
│   ├── 'sales:goal-activated' → fetch goals + show banner    │
│   └── 'sales:goal-completed' → confetti fullscreen          │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTP + WebPush
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Fastify + Prisma)                                  │
│                                                               │
│  3 new Prisma models:                                        │
│   ├── SalesGoalTemplate  (reusable goal definitions)        │
│   ├── SalesGoal          (instance per-shift)               │
│   └── SaleEvent          (log per "+1" tap)                 │
│                                                               │
│  Coins continue to flow through existing CoinTransaction.   │
│                                                               │
│  6 new registerFn endpoints + helpers:                       │
│   ├── activateSalesGoal                                     │
│   ├── creditSale         (creates SaleEvent +              │
│   │                       CoinTransaction + push +         │
│   │                       broadcast)                        │
│   ├── closeSalesGoal     (manual + auto)                    │
│   ├── undoLastSale       (60s window)                       │
│   ├── getActiveSalesGoals                                   │
│   └── getShiftLeaderboard                                   │
│                                                               │
│  2 new crons:                                                │
│   ├── Hourly: auto-close goals at 03:00 IL of their shift   │
│   └── Sunday 06:00 IL: compute weekly personal goals        │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

### `SalesGoalTemplate`

Reusable templates managed by admin. Examples seeded at install: קינוח, ספיישל יומי, שדרוג ליין, מנה ראשונה, בקבוק יין.

```prisma
model SalesGoalTemplate {
  id                       String   @id @default(cuid())
  name                     String   // "מבצע קינוחים"
  dish_label               String   // "קינוח"
  emoji                    String   // "🍰"
  default_target           Int      // 30
  default_coins_per_sale   Int      // 50
  is_active                Boolean  @default(true)
  sort_order               Int?     @default(0)
  created_date             String?
  updated_date             String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
}
```

### `SalesGoal`

Instance of a template activated for a specific shift. Mutable `current_count` updates on every `creditSale`.

```prisma
model SalesGoal {
  id                       String   @id @default(cuid())
  template_id              String
  shift_date               String   // 'YYYY-MM-DD' — the date the SHIFT belongs to, not necessarily calendar today
  shift_type               String   // 'lunch' | 'dinner'
  dish_label               String   // copied from template at activation
  emoji                    String
  target                   Int      // editable at activation, defaults from template
  coins_per_sale           Int
  current_count            Int      @default(0)
  status                   String   @default("active")  // 'active' | 'completed' | 'closed'
  activated_by_id          String
  activated_by_name        String
  activated_at             DateTime @default(now())
  completed_at             DateTime?
  closed_at                DateTime?
  closed_by_id             String?
  created_date             String?
  updated_date             String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  @@index([shift_date, shift_type, status])
}
```

### `SaleEvent`

Log row per "+1" tap. Drives leaderboard counts, supports undo, and feeds the future Beecomm reconciliation.

```prisma
model SaleEvent {
  id                       String   @id @default(cuid())
  goal_id                  String
  waiter_id                String
  waiter_name              String
  credited_by_id           String
  credited_by_name         String
  coins_amount             Int
  is_bonus                 Boolean  @default(false)  // true for post-target double-bonus sales
  undone_at                DateTime?                  // soft-delete on undoLastSale
  coin_transaction_id      String?                    // link to the CoinTransaction row
  created_date             String?
  updated_date             String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  @@index([goal_id, createdAt])
  @@index([waiter_id, createdAt])
}
```

### Existing entities used

- `CoinTransaction` — every confirmed sale creates one approved transaction (`type='sale_bonus'`, `trigger='sales_goal:<goal_id>'`).
- `Reward` — RewardShowcase reads `is_active=true`, sorted by cost.
- `Employee` — for resolving names and role-gating UI.
- `WorkShift` — to know which employees are on shift right now (for "active leaderboard").

### Idempotent table creation

All 3 new tables get a `CREATE TABLE IF NOT EXISTS` block in the `__startupDriftRepair` IIFE in `load.ts`, matching the existing pattern (DepositSettings, ActivityLog, etc.). Prisma `db push` on container start is the primary mechanism; the ensure-table is the belt-and-suspenders fallback.

## Shift Date Resolution

A critical detail: "which shift does this goal/event belong to?"

Rule:
- If activation time is **before 17:00 IL** → `shift_date` = calendar today, `shift_type` = `lunch`.
- If activation time is **17:00–02:59 IL** → `shift_date` = the calendar day that started at 06:00, `shift_type` = `dinner`.
- If activation time is **03:00–05:59 IL** (rare manual case) → reject with error "no shift active right now".

Implementation: helper `resolveCurrentShift(now: Date): { date: string, type: 'lunch'|'dinner' } | null` shared across backend and frontend.

## API Endpoints

All under `/api/fn/`, all require auth. Role-restricted endpoints validated server-side via `Employee.role`/`position`.

### `POST /api/fn/activateSalesGoal` (manager+)
- Body: `{ template_id, target?, coins_per_sale? }` (optional overrides).
- Server: resolves current shift, creates `SalesGoal`, broadcasts `goal:activated` push to on-shift employees.
- Returns: created goal.

### `POST /api/fn/creditSale` (manager+)
- Body: `{ goal_id, waiter_id }`.
- Server:
  1. Loads goal, validates it's `active`.
  2. Creates `SaleEvent`.
  3. Creates `CoinTransaction` (amount = `goal.coins_per_sale`, doubled if `current_count >= target`).
  4. Increments `goal.current_count`.
  5. If `current_count == target` exactly → marks `goal.status = 'completed'`, broadcasts `goal:completed`.
  6. Sends targeted push to the waiter: "+50 🪙 על קינוח! אתה במקום #3".
  7. Broadcasts `sale:credited`.
- Returns: `{ event, new_count, leaderboard_position }`.

### `POST /api/fn/closeSalesGoal` (manager+)
- Body: `{ goal_id }`.
- Server: marks `goal.status = 'closed'`, generates an auto-Story to `StoriesBar` ("👑 המוביל ב-{dish_label}: {waiter_name} עם {count} מכירות"), broadcasts.
- Returns: summary stats.

### `POST /api/fn/undoLastSale` (manager+)
- Body: `{ goal_id, waiter_id }`.
- Server: only allowed if last `SaleEvent` for `(goal, waiter)` is within 60 seconds. Sets `undone_at`, decrements `current_count`, deletes/reverses the `CoinTransaction`. Broadcasts.
- Returns: success or error "חלון ביטול נסגר".

### `GET /api/fn/getActiveSalesGoals` (any auth)
- Query: `?shift_date=...&shift_type=...` (defaults to current shift).
- Returns: `[{ goal, top_5_leaderboard, my_count, my_position }]` — joined view, one query for the whole banner+leaderboard render.

### `GET /api/fn/getShiftLeaderboard` (any auth)
- Query: `?shift_date=...&shift_type=...`.
- Returns: ranked list of all employees on shift with their total coins+sales across all active goals.

### `GET /api/fn/getMyWeeklyGoal` (any auth)
- Returns: `{ target, current, deadline, reward_coins }`. Server reads cached value for the user, falls back to compute on demand.

### `GET /api/fn/getActiveRewardsForMe` (any auth)
- Returns: rewards split into `{ affordable: [...], locked: [...] }` based on caller's coin balance, sorted ascending by cost within each bucket.

## Broadcasts and Real-Time

**DOM events** (same-tab refresh, no push needed):
- `sales:credited` — payload `{ goal_id, waiter_id, new_count, target }` — listened to by SalesGoalsBanner, ShiftLeaderboard, ShiftSupervisorPanel.
- `sales:goal-activated` — payload `{ goal }` — triggers banner mount.
- `sales:goal-completed` — payload `{ goal }` — triggers fullscreen confetti.

**Push notifications** (cross-device, follows existing `pushoverToActiveShift()` helper):
- On `creditSale` → push to the credited waiter only ("+{coins} 🪙 על {dish_label}! מקום #{n}").
- On `goal:activated` → push to all on-shift waitstaff ("🎯 יעד חדש: {target} {dish_label}").
- On `goal:completed` → push to all on-shift waitstaff ("🎉 הצוות עשה את זה! בונוס כפול על מכירות נוספות").

**New helper** `pushoverToActiveShift(title, message, optionalEmployeeId?)`:
- Resolves "active shift" via `resolveCurrentShift(now)`.
- Loads `WorkShift.assigned_staff` for that date+type.
- If `optionalEmployeeId` provided, pushes to that one employee only.
- Otherwise pushes to all assigned staff with a valid `push_subscription`.

## Frontend Components

### `SalesGoalsBanner.jsx` (new, top of EmployeeHome below StoriesBar)
- Visible to: all roles.
- Reads `getActiveSalesGoals()` on mount + on `sales:credited` event.
- Shows up to 3 concurrent goals as stacked progress bars.
- Gradient changes by completion: red → yellow → green → animated purple-glow when ≥100%.
- Footer shows "👑 המוביל הערב" or "אתה המוביל" or "אתה במקום #X · עוד Y ותעקוף את Z".

### `ShiftLeaderboard.jsx` (new, below banner)
- Visible to: all roles except kitchen/dishwashers.
- Shows top 5 with medals (🥇🥈🥉4️⃣5️⃣).
- Caller's row always highlighted (bordered + yellow bg).
- If caller is outside top 5, shows top 3 + caller's row with rank.

### `RewardShowcase.jsx` (new, replaces/supplements existing rewards UI on home)
- Visible to: all roles.
- 2 rows:
  - **זמינים עכשיו**: rewards where `balance >= cost`, sorted ascending, max 6, horizontal scroll, [קנה] button.
  - **קצת עוד**: next 3-4 rewards above balance, with progress bar "עוד X מטבעות", no button.
- Optional collapsed third row "כל היתר" — full catalog, lazy-loaded.
- [קנה] tap → existing redemption flow (creates `CoinTransaction` with `status='pending_approval'`), confetti, "🎉 הבקשה נשלחה למנהל".

### `CompactCoinWidget.jsx` (new, non-sales roles)
- Visible to: roles where ranking/competition isn't relevant (kitchen, dishwashers, drivers).
- Single-line widget: balance + "[צפה בפרסים →]" link to `/GamificationCenter`.
- Replaces banner+leaderboard for these roles so the home stays clean without excluding them from the reward economy.

### `WeeklyPersonalGoal.jsx` (new, waitstaff only)
- Visible to: roles with `position` in waitstaff list.
- Reads `getMyWeeklyGoal()`.
- Progress bar + "עוד X מכירות לבונוס {Y} 🪙".

### `ShiftSupervisorPanel.jsx` (new, managers only)
- Visible to: `role in ['admin','manager']` OR `position in ['אחראי משמרת','מנהלת משמרת','מנהל משמרת']`.
- Renders per active goal:
  - Goal title + progress + 🎯 target.
  - List of buttons, one per waiter on shift, showing their current count: `[רן 5] [שירה 4] [דביר 3]`.
  - Tap → calls `creditSale`, optimistic +1, confetti, push fires server-side.
  - Long-press → calls `undoLastSale` (only enabled for last 60s after a tap).
- "+ הפעל יעד חדש" button → `ActivateGoalDialog`.
- "סגור יעד" per-goal button → confirm dialog → calls `closeSalesGoal`.

### `ActivateGoalDialog.jsx` (new)
- Lists active templates (`SalesGoalTemplate.is_active=true`), sorted by `sort_order`.
- Each template card shows emoji, name, defaults.
- Selection reveals editable fields `target` and `coins_per_sale`.
- "הפעל" → calls `activateSalesGoal`.

### Existing components touched

- `EmployeeHome.jsx` — add new components to the widget catalog and to `useDashboardLayout` default order:
  1. `stories`
  2. `sales_banner` (new, top for everyone with sales context)
  3. `shift_leaderboard` (new)
  4. `reward_showcase` (new)
  5. `weekly_goal` (new, waitstaff only)
  6. `supervisor_panel` (new, managers only)
  7. ...existing widgets continue below.
- `VoiceControl.jsx` — auto-start on `?voice=1`.
- `manifest.json` — add `shortcuts` array.
- `Layout.jsx` — install banner mount.

### Role-gating helper

Single helper `isShiftSupervisor(employee)` returns true if the employee's `role` is admin/manager OR `position` matches one of the supervisor titles. Used by `ShiftSupervisorPanel` and to filter sales-related voice intents (`sale_credit` only works if caller is supervisor).

## Voice Intents

Added to existing voice catalog (matchers in `voiceIntents.js`, examples in `parseVoiceCommand` LLM prompt, handlers in `handleVoiceCommand.js`).

| Intent | Example phrases | Server action |
|--------|-----------------|---------------|
| `sale_credit` | "+1 קינוח לרן", "תוסיף קינוח לרן", "רן מכר קינוח" | Resolves active goal by dish_label; calls `creditSale` |
| `sales_goal_activate` | "תפעיל יעד מבצע קינוחים", "פתח יעד 30 קינוחים" | Finds matching template by name/dish_label; calls `activateSalesGoal` |
| `q_sales_status` | "כמה קינוחים מכרנו", "מה סטטוס המכירות" | TTS: "{dish_label}: {current}/{target}. המוביל {name} עם {count}" |
| `q_sales_leader` | "מי המוביל היום", "מי מוביל במכירות" | TTS: "{name}, {sales} מכירות, {coins} מטבעות" |

Permission: `sale_credit` and `sales_goal_activate` return error to the user if the caller isn't a shift supervisor.

## PWA Enhancements

### `manifest.json` — Shortcuts
```json
"shortcuts": [
  {
    "name": "🎤 הקלטה מהירה",
    "short_name": "Voice",
    "url": "/?voice=1",
    "icons": [{ "src": "/icons/voice-192.png", "sizes": "192x192" }]
  },
  { "name": "🪑 מפת הושבה", "url": "/SeatingSetup", "icons": [...] },
  { "name": "🏆 הלוח שלי", "url": "/Dashboard", "icons": [...] }
]
```
Long-press app icon on Android (12+) and iOS (13+) shows these as quick options.

### `?voice=1` auto-start
In `VoiceControl.jsx`:
```js
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('voice') === '1' && supported) {
    const t = setTimeout(() => start(), 500); // give TTS time to prime
    return () => clearTimeout(t);
  }
}, []);
```
After auto-start, the URL is cleaned with `history.replaceState(null, '', location.pathname)` so refresh doesn't re-trigger.

### Install prompt
`InstallAppBanner.jsx` (new) listens for `beforeinstallprompt`, stores the event, shows a soft banner ("📲 התקן את עלינא במסך הבית") with [התקן] / [אחר כך]. Only shown to employees (role in waitstaff/manager), only once per 7 days, dismiss persisted to localStorage.

## Crons

### Auto-close at 03:00 IL of the shift
Runs hourly. For each `SalesGoal` with `status='active'`:
- Compute the close-time for that goal:
  - `lunch` goals close at 18:00 IL of `shift_date`.
  - `dinner` goals close at 03:00 IL of `shift_date + 1 day`.
- If `now >= close_time`, call `closeSalesGoal(goal.id)` (which also generates the auto-Story).

### Weekly personal goals — Sunday 06:00 IL
For each active employee with waitstaff role:
- Compute last week's total sales count.
- Set this week's `target` = `last_week + 15%` (rounded), `reward_coins` = configurable per-restaurant constant (default 200).
- Store in a small `WeeklyPersonalGoal` table or as a Json blob on Employee — TBD whether we add an entity. **Decision: add a new minimal entity** `WeeklyPersonalGoal { id, employee_id, week_start_date, target, current_count, reward_coins, awarded }` for queryability and history. Same drift-repair pattern as the sales tables.

Both crons follow the existing in-process timer pattern (`setTimeout` loop with `__autoTrackerCronTimer`-style guards). Manual trigger endpoints `POST /api/cron/sales-auto-close` and `POST /api/cron/weekly-personal-goals` for the secret-guarded cron route.

## Auto-Tracker Integration

The Auto-Tracker from yesterday watches user actions. We extend it to log:
- `action_type: 'sale_credit'` (label = `dish_label + waiter_name`) every time the supervisor taps "+1".
- `action_type: 'goal_activate'` (label = `template name`) every time a goal is activated.

The daily 23:00 IL analyzer will then suggest things like:
- "אתה לוחץ +1 קינוח לרן כל ערב — תרצה widget קצר 'הוסף קינוח לרן' בדף הבית שלך?"
- "מבצע הקינוחים נפתח 12 ערבי שישי ברציפות — תרצה הפעלה אוטומטית בכל יום שישי 18:00?"

No code changes to the Auto-Tracker analyzer needed — it already scans `ActivityLog` patterns generically. The integration is the new log calls from `creditSale` and `activateSalesGoal` endpoints (they call `activityLog.create()` server-side instead of relying on client batching, to ensure server-driven events still get logged).

## Error Handling

- **No active shift when activating goal** → 400 "אין משמרת פעילה כרגע" (only relevant during the 03:00–06:00 dead window).
- **Crediting a sale on a closed/completed goal** → 409 "היעד נסגר".
- **Crediting a sale for a waiter not on shift** → allowed but logged with `not_on_shift=true` metadata, for the supervisor's discretion (sometimes a waiter helps without being scheduled).
- **Undo outside 60s window** → 410 "חלון ביטול נסגר".
- **Concurrent +1 taps** → handled by transactional increment in Prisma (`update where { id } { current_count: { increment: 1 } }`).
- **Push subscription expired** → swallowed, sale still credited, broadcast still fires.

## Testing Strategy

- **Backend unit**: each registerFn tested with mock body+user, verifying DB writes happen and broadcasts emit.
- **Backend integration**: full flow `activateSalesGoal → creditSale × 5 → closeSalesGoal`, verifying `current_count`, `CoinTransaction` rows, and Story generation.
- **Cron**: assert that a `lunch` goal activated at 13:00 closes at 18:00 same day; a `dinner` goal activated at 20:00 closes at 03:00 next day.
- **Frontend**: hand-tested. The codebase has no component test setup, and adding one is out of scope for this feature. Manual checklist in the implementation plan.
- **Production smoke**: after each phase ships, run a real "+1" through the supervisor UI on the live restaurant, watch the leaderboard update on a second device, watch the push arrive.

## Out of Scope (Future v2)

- **Beecomm integration** replaces the manual "+1" but keeps the same UI. When Beecomm webhooks deliver `item.sold` events, server resolves which active `SalesGoal` it matches by `dish_label`, finds the waiter by Beecomm order's `assigned_to`, and calls the same internal `creditSale()` function the manual UI calls. No frontend changes.
- **Team-vs-team competition** (multi-team leagues).
- **Animated reward unlock cards** (visual polish).
- **Reward purchase history** displayed to employee.
- **Goal templates per day-of-week** (e.g., "always activate קינוחים on Fridays").

## Build Order

1. **Phase 1 — Templates + entities + endpoints** (2–3h): Prisma models + drift-repair + 6 registerFns + 5 seed templates + `/SalesGoalTemplates` admin page.
2. **Phase 2 — Supervisor panel** (2–3h): `ShiftSupervisorPanel` + `ActivateGoalDialog` + role gating + DOM broadcast `sales:credited`.
3. **Phase 3 — Employee surface** (3–4h): `SalesGoalsBanner` + `ShiftLeaderboard` + `RewardShowcase` + `WeeklyPersonalGoal` + integration into `EmployeeHome` widget catalog.
4. **Phase 4 — Voice + PWA + Push + Cron + Auto-Tracker** (1–2h): 4 voice intents + manifest shortcuts + `?voice=1` + `pushoverToActiveShift` + 2 crons + Auto-Tracker event hooks.

Each phase is independently shippable to production.

**Total estimate: 8–12 hours.**
