# Sales Gamification Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the employee home dashboard into a competitive sales-driving surface with manager-confirmed "+1" sale tracking, live leaderboards, visible reward catalog, and voice/PWA integrations.

**Architecture:** 3 new Prisma entities (SalesGoalTemplate, SalesGoal, SaleEvent) drive a Fastify endpoint set that creates CoinTransaction rows through the existing gamification system. New React components render on EmployeeHome with role-gated visibility. Real-time updates via DOM custom events + Pushover for cross-device. Auto-close cron at 03:00 IL per shift; manual close anytime.

**Tech Stack:** React + Vite, Fastify + Prisma + PostgreSQL, Pushover for push, Web Speech API for voice. Deploys via `git push origin migration` → Docker compose on Hetzner; `prisma db push --skip-generate` runs on container start; idempotent `CREATE TABLE IF NOT EXISTS` in startup drift-repair as backup.

**Verification convention:** This project has no automated test framework for frontend. Backend validates via `npx tsc --noEmit`. All behavior is verified via post-push manual smoke on the live site (deploy takes ~4 min). Each task ends with a build + commit + push, then the deploy is allowed to settle before the next task's manual verification.

**Working directory:** `C:\Users\97253\top-alena-migration` (the `migration` branch worktree). All paths below are relative to it unless noted.

---

## File Structure

### Backend (apps/api)

| File | Responsibility |
|------|---------------|
| `apps/api/prisma/schema.prisma` | + 4 models: SalesGoalTemplate, SalesGoal, SaleEvent, WeeklyPersonalGoal |
| `apps/api/src/functions/load.ts` | + 11 registerFn endpoints, helpers (resolveCurrentShift, pushoverToActiveShift), 2 startup ensure-table blocks, 2 in-process crons |
| `apps/api/src/routes/cron.ts` | + 2 secret-guarded endpoints: `/sales-auto-close`, `/weekly-personal-goals` |
| `apps/api/scripts/seed-sales-templates.ts` | One-shot seed for 5 default SalesGoalTemplate rows |

### Frontend (src)

| File | Responsibility |
|------|---------------|
| `src/lib/salesShift.js` | Shared helper: `resolveCurrentShift(now)` so frontend and backend agree on "which shift am I in?" |
| `src/lib/roleGates.js` | `isShiftSupervisor(employee)`, `isWaitstaff(employee)`, `isNonSalesRole(employee)` |
| `src/components/sales/SalesGoalsBanner.jsx` | Top-of-home banner showing group progress per active goal |
| `src/components/sales/ShiftLeaderboard.jsx` | Live ranking of waitstaff for current shift |
| `src/components/sales/RewardShowcase.jsx` | Affordable + locked rewards with progress bars |
| `src/components/sales/CompactCoinWidget.jsx` | One-line balance + shop link for non-sales roles |
| `src/components/sales/WeeklyPersonalGoal.jsx` | Personal weekly target progress bar |
| `src/components/sales/ShiftSupervisorPanel.jsx` | Manager view: active goals, +1 per waiter, activate, close, undo |
| `src/components/sales/ActivateGoalDialog.jsx` | Template picker + editable target/coins fields |
| `src/components/sales/InstallAppBanner.jsx` | PWA install prompt for staff |
| `src/pages/SalesGoalTemplates.jsx` | Admin page to manage templates |
| `src/pages/EmployeeHome.jsx` | Modify: add 6 new widgets to layout, register in `useDashboardLayout` defaults |
| `src/hooks/useDashboardLayout.js` | Modify: add sales widgets to default layout |
| `src/components/voice/voiceIntents.js` | Add 4 matchers for sales voice intents |
| `src/components/voice/handleVoiceCommand.js` | Add 4 case handlers |
| `src/components/voice/VoiceControl.jsx` | Modify: auto-start on `?voice=1` query param |
| `src/Layout.jsx` | Modify: mount InstallAppBanner |
| `public/manifest.json` | Modify: add `shortcuts` array |
| `src/pages.config.js` | Modify: register SalesGoalTemplates page |

---

## Pre-flight

- [ ] **Step 1: Verify branch and clean working tree**

Run:
```
cd "C:\Users\97253\top-alena-migration"
git status
git branch --show-current
```

Expected: `migration` branch, no uncommitted changes (untracked files OK).

- [ ] **Step 2: Pull latest**

Run:
```
git pull origin migration
```

Expected: "Already up to date" or clean fast-forward.

---

## Phase 1 — Backend Foundation (entities + endpoints + seed + admin page)

### Task 1.1: Add Prisma models for sales gamification

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add 4 models)

- [ ] **Step 1: Open schema.prisma and locate the Achievement model**

Find `model Achievement {` (around line 44). Insert the new models BEFORE it (the file is alphabetized loosely; keeping them near the top is fine for grep-ability).

- [ ] **Step 2: Insert the 4 models**

Insert this block immediately before `model Achievement {`:

```prisma
// Sales gamification — manager-confirmed "+1" tap creates CoinTransaction.
model SalesGoalTemplate {
  id                       String   @id @default(cuid())
  name                     String
  dish_label               String
  emoji                    String
  default_target           Int
  default_coins_per_sale   Int
  is_active                Boolean  @default(true)
  sort_order               Int?     @default(0)
  created_date             String?
  updated_date             String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
}

model SalesGoal {
  id                       String   @id @default(cuid())
  template_id              String
  shift_date               String
  shift_type               String
  dish_label               String
  emoji                    String
  target                   Int
  coins_per_sale           Int
  current_count            Int      @default(0)
  status                   String   @default("active")
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

model SaleEvent {
  id                       String   @id @default(cuid())
  goal_id                  String
  waiter_id                String
  waiter_name              String
  credited_by_id           String
  credited_by_name         String
  coins_amount             Int
  is_bonus                 Boolean  @default(false)
  undone_at                DateTime?
  coin_transaction_id      String?
  created_date             String?
  updated_date             String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  @@index([goal_id, createdAt])
  @@index([waiter_id, createdAt])
}

model WeeklyPersonalGoal {
  id                       String   @id @default(cuid())
  employee_id              String
  employee_name            String
  week_start_date          String   // 'YYYY-MM-DD' of the Sunday
  target                   Int
  current_count            Int      @default(0)
  reward_coins             Int
  awarded                  Boolean  @default(false)
  awarded_at               DateTime?
  created_date             String?
  updated_date             String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt

  @@index([employee_id, week_start_date])
}

```

- [ ] **Step 3: Regenerate Prisma client**

Run:
```
cd apps/api && npx prisma generate
```

Expected: "✔ Generated Prisma Client".

- [ ] **Step 4: Typecheck**

Run:
```
npx tsc --noEmit
```

Expected: no errors. If errors mention the new models, the regen didn't take effect — re-run `prisma generate`.

- [ ] **Step 5: Commit**

```
cd ../..
git add apps/api/prisma/schema.prisma
git commit -m "feat(sales-gamification): add SalesGoalTemplate/SalesGoal/SaleEvent/WeeklyPersonalGoal models"
```

### Task 1.2: Add idempotent CREATE TABLE statements to startup drift-repair

**Files:**
- Modify: `apps/api/src/functions/load.ts` (extend the existing `__startupDriftRepair` IIFE)

- [ ] **Step 1: Locate the startup drift-repair block**

Open `apps/api/src/functions/load.ts`, find the line `[startup] ActivityLog table + indexes ensured` (around line 9400). The closing of the IIFE is right below — `})();`. We'll insert our blocks BEFORE the closing.

- [ ] **Step 2: Insert ensure-table blocks**

Find this exact text:
```
      console.log('[startup] ActivityLog table + indexes ensured');
    } catch (e: any) {
      console.error('[startup] ensure ActivityLog failed:', e?.message);
    }
  })();
}
```

Replace with:
```
      console.log('[startup] ActivityLog table + indexes ensured');
    } catch (e: any) {
      console.error('[startup] ensure ActivityLog failed:', e?.message);
    }
    try {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SalesGoalTemplate" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "dish_label" TEXT NOT NULL,
        "emoji" TEXT NOT NULL,
        "default_target" INTEGER NOT NULL,
        "default_coins_per_sale" INTEGER NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
        "sort_order" INTEGER DEFAULT 0,
        "created_date" TEXT,
        "updated_date" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SalesGoal" (
        "id" TEXT PRIMARY KEY,
        "template_id" TEXT NOT NULL,
        "shift_date" TEXT NOT NULL,
        "shift_type" TEXT NOT NULL,
        "dish_label" TEXT NOT NULL,
        "emoji" TEXT NOT NULL,
        "target" INTEGER NOT NULL,
        "coins_per_sale" INTEGER NOT NULL,
        "current_count" INTEGER NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'active',
        "activated_by_id" TEXT NOT NULL,
        "activated_by_name" TEXT NOT NULL,
        "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completed_at" TIMESTAMP(3),
        "closed_at" TIMESTAMP(3),
        "closed_by_id" TEXT,
        "created_date" TEXT,
        "updated_date" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SalesGoal_shift_status_idx" ON "SalesGoal" ("shift_date", "shift_type", "status");`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "SaleEvent" (
        "id" TEXT PRIMARY KEY,
        "goal_id" TEXT NOT NULL,
        "waiter_id" TEXT NOT NULL,
        "waiter_name" TEXT NOT NULL,
        "credited_by_id" TEXT NOT NULL,
        "credited_by_name" TEXT NOT NULL,
        "coins_amount" INTEGER NOT NULL,
        "is_bonus" BOOLEAN NOT NULL DEFAULT FALSE,
        "undone_at" TIMESTAMP(3),
        "coin_transaction_id" TEXT,
        "created_date" TEXT,
        "updated_date" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SaleEvent_goal_createdAt_idx" ON "SaleEvent" ("goal_id", "createdAt");`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "SaleEvent_waiter_createdAt_idx" ON "SaleEvent" ("waiter_id", "createdAt");`);
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "WeeklyPersonalGoal" (
        "id" TEXT PRIMARY KEY,
        "employee_id" TEXT NOT NULL,
        "employee_name" TEXT NOT NULL,
        "week_start_date" TEXT NOT NULL,
        "target" INTEGER NOT NULL,
        "current_count" INTEGER NOT NULL DEFAULT 0,
        "reward_coins" INTEGER NOT NULL,
        "awarded" BOOLEAN NOT NULL DEFAULT FALSE,
        "awarded_at" TIMESTAMP(3),
        "created_date" TEXT,
        "updated_date" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "WeeklyPersonalGoal_employee_week_idx" ON "WeeklyPersonalGoal" ("employee_id", "week_start_date");`);
      console.log('[startup] Sales gamification tables ensured');
    } catch (e: any) {
      console.error('[startup] ensure sales gamification tables failed:', e?.message);
    }
  })();
}
```

- [ ] **Step 3: Typecheck**

Run:
```
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
cd ../..
git add apps/api/src/functions/load.ts
git commit -m "feat(sales-gamification): idempotent CREATE TABLE for new entities at startup"
```

### Task 1.3: Add shared shift-date resolution helper

**Files:**
- Create: `src/lib/salesShift.js` (frontend version)
- Modify: `apps/api/src/functions/load.ts` (backend version — local helper)

- [ ] **Step 1: Create frontend helper**

Create `src/lib/salesShift.js`:

```js
// Resolves which shift "now" belongs to, in Asia/Jerusalem time.
// Returns { date: 'YYYY-MM-DD', type: 'lunch'|'dinner' } or null when in the
// 03:00–05:59 IL dead window. Backend has an identical helper in load.ts —
// keep them in sync if you change the rule.
export function resolveCurrentShift(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', hour12: false,
    }).formatToParts(now);
    const get = (t) => parts.find(p => p.type === t)?.value;
    const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
    const hour = parseInt(get('hour'), 10);

    if (hour >= 6 && hour < 17) return { date: dateStr, type: 'lunch' };
    if (hour >= 17 && hour <= 23) return { date: dateStr, type: 'dinner' };
    if (hour >= 0 && hour < 3) {
        // After-midnight tail of last night's dinner shift.
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const y = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Jerusalem',
            year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(yesterday);
        const yget = (t) => y.find(p => p.type === t)?.value;
        return { date: `${yget('year')}-${yget('month')}-${yget('day')}`, type: 'dinner' };
    }
    return null; // 03:00–05:59 dead window
}
```

- [ ] **Step 2: Add backend helper to load.ts**

Open `apps/api/src/functions/load.ts`. Find the end of the file (the `sendTeamWhatsApp` registerFn block we added yesterday). Append BEFORE the Auto-Tracker block (search for `// === Auto-Tracker ====`).

Insert immediately before `// === Auto-Tracker`:

```typescript
// === Shared shift resolution =================================================
// Mirror of src/lib/salesShift.js — frontend and backend MUST agree on which
// shift a given moment belongs to or sales goals get filed to the wrong shift.
function resolveCurrentShift(now: Date = new Date()): { date: string; type: 'lunch' | 'dinner' } | null {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = parseInt(get('hour'), 10);

  if (hour >= 6 && hour < 17) return { date: dateStr, type: 'lunch' };
  if (hour >= 17 && hour <= 23) return { date: dateStr, type: 'dinner' };
  if (hour >= 0 && hour < 3) {
    const y = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    const yget = (t: string) => y.find(p => p.type === t)?.value || '';
    return { date: `${yget('year')}-${yget('month')}-${yget('day')}`, type: 'dinner' };
  }
  return null;
}

```

- [ ] **Step 3: Typecheck**

Run:
```
cd apps/api && npx tsc --noEmit
```

Expected: no errors (the function is currently unused, that's fine).

- [ ] **Step 4: Commit**

```
cd ../..
git add src/lib/salesShift.js apps/api/src/functions/load.ts
git commit -m "feat(sales-gamification): add resolveCurrentShift helper (frontend + backend mirror)"
```

### Task 1.4: Add `pushoverToActiveShift` helper and role check

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Add helpers right after `resolveCurrentShift`**

Open `apps/api/src/functions/load.ts`. Immediately after the `resolveCurrentShift` function you just added, insert:

```typescript
// Resolves the staff currently on shift and returns Employee records with
// push capability. If `onlyEmployeeId` is provided, returns just that one.
async function getActiveShiftStaff(onlyEmployeeId?: string): Promise<any[]> {
  const shift = resolveCurrentShift(new Date());
  if (!shift) return [];
  const workShifts: any[] = await (db as any).workShift.findMany({
    where: { date: shift.date, shift_type: shift.type },
  });
  const ids = new Set<string>();
  for (const ws of workShifts) {
    for (const a of (ws.assigned_staff || [])) {
      if (a.employee_id) ids.add(a.employee_id);
    }
  }
  if (onlyEmployeeId) {
    if (!ids.has(onlyEmployeeId)) return [];
    const e = await (db as any).employee.findUnique({ where: { id: onlyEmployeeId } });
    return e ? [e] : [];
  }
  if (ids.size === 0) return [];
  return (db as any).employee.findMany({ where: { id: { in: [...ids] } } });
}

// Like pushoverToAdmins but addresses staff on the currently active shift only.
async function pushoverToActiveShift(title: string, message: string, onlyEmployeeId?: string) {
  try {
    const staff = await getActiveShiftStaff(onlyEmployeeId);
    for (const e of staff) {
      const sub = (e as any).push_subscription;
      if (!sub) continue;
      try { await pushover(sub, title, message); }
      catch (err: any) { console.warn('[pushoverToActiveShift] push failed for', e.id, err?.message); }
    }
  } catch (e: any) {
    console.warn('[pushoverToActiveShift] failed:', e?.message);
  }
}

// Role check used by sale_credit / activateSalesGoal endpoints and voice intents.
const SUPERVISOR_POSITIONS = new Set(['אחראי משמרת', 'מנהלת משמרת', 'מנהל משמרת', 'אחמש']);
async function isShiftSupervisor(userId: string): Promise<boolean> {
  try {
    const u: any = await (db as any).user.findUnique({ where: { id: userId } });
    if (!u) return false;
    if (u.role === 'admin' || u.role === 'manager' || u.role === 'owner') return true;
    const emp: any = await (db as any).employee.findFirst({ where: { email: u.email } });
    if (!emp) return false;
    if (emp.role === 'admin' || emp.role === 'manager') return true;
    const positions: string[] = Array.isArray(emp.positions) ? emp.positions : (emp.role ? [emp.role] : []);
    return positions.some(p => SUPERVISOR_POSITIONS.has(String(p).trim()));
  } catch { return false; }
}

```

- [ ] **Step 2: Typecheck**

Run:
```
cd apps/api && npx tsc --noEmit
```

Expected: no errors. If `pushover` is reported missing, add `pushover` to the existing import from `'../lib/pushover.js'` at the top of the file.

- [ ] **Step 3: Commit**

```
cd ../..
git add apps/api/src/functions/load.ts
git commit -m "feat(sales-gamification): pushoverToActiveShift + isShiftSupervisor helpers"
```

### Task 1.5: Add `activateSalesGoal` registerFn

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Add registerFn at the end of the helpers block you just inserted**

Open `apps/api/src/functions/load.ts`. Immediately after the `isShiftSupervisor` function, insert:

```typescript
registerFn('activateSalesGoal', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if (!(await isShiftSupervisor(user.id))) throw new Error('only shift supervisors can activate goals');
  const b = (body || {}) as any;
  const templateId = String(b.template_id || '');
  if (!templateId) throw new Error('template_id required');
  const tmpl: any = await (db as any).salesGoalTemplate.findUnique({ where: { id: templateId } });
  if (!tmpl) throw new Error('template not found');
  if (!tmpl.is_active) throw new Error('template not active');
  const shift = resolveCurrentShift(new Date());
  if (!shift) throw new Error('no active shift right now (03:00–06:00 dead window)');

  const goal: any = await (db as any).salesGoal.create({
    data: {
      template_id: tmpl.id,
      shift_date: shift.date,
      shift_type: shift.type,
      dish_label: tmpl.dish_label,
      emoji: tmpl.emoji,
      target: Number(b.target) > 0 ? Number(b.target) : tmpl.default_target,
      coins_per_sale: Number(b.coins_per_sale) > 0 ? Number(b.coins_per_sale) : tmpl.default_coins_per_sale,
      activated_by_id: String(user.id),
      activated_by_name: String((user as any).full_name || user.email || ''),
    },
  });

  // Activity log + push to all on-shift staff
  try {
    await (db as any).activityLog.create({
      data: {
        user_id: String(user.id),
        user_name: String((user as any).full_name || user.email || ''),
        action_type: 'goal_activate',
        page: '/EmployeeHome',
        label: `${tmpl.name} (target ${goal.target})`,
        target_id: goal.id,
      },
    });
  } catch { /* best-effort */ }
  await pushoverToActiveShift(
    `🎯 יעד חדש: ${goal.target} ${goal.dish_label}`,
    `קדימה צוות! ${goal.coins_per_sale} 🪙 פר מכירה`,
  );
  return { goal };
});

```

- [ ] **Step 2: Typecheck**

Run:
```
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
cd ../..
git add apps/api/src/functions/load.ts
git commit -m "feat(sales-gamification): activateSalesGoal endpoint"
```

### Task 1.6: Add `creditSale` registerFn

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Append registerFn right after `activateSalesGoal`**

Insert after the closing `});` of `activateSalesGoal`:

```typescript
registerFn('creditSale', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if (!(await isShiftSupervisor(user.id))) throw new Error('only shift supervisors can credit sales');
  const b = (body || {}) as any;
  const goalId = String(b.goal_id || '');
  const waiterId = String(b.waiter_id || '');
  if (!goalId || !waiterId) throw new Error('goal_id and waiter_id required');

  const goal: any = await (db as any).salesGoal.findUnique({ where: { id: goalId } });
  if (!goal) throw new Error('goal not found');
  if (goal.status === 'closed') throw new Error('היעד נסגר');
  // 'completed' goals still accept sales, with bonus

  const waiter: any = await (db as any).employee.findUnique({ where: { id: waiterId } });
  if (!waiter) throw new Error('waiter not found');

  const isBonus = goal.status === 'completed';
  const coins = isBonus ? goal.coins_per_sale * 2 : goal.coins_per_sale;

  // Coin transaction first so we have the id to link
  const ct: any = await (db as any).coinTransaction.create({
    data: {
      employee_id: waiter.id,
      employee_name: waiter.full_name,
      amount: coins,
      reason: `מכירת ${goal.dish_label}${isBonus ? ' (בונוס)' : ''}`,
      type: 'sale_bonus',
      trigger: `sales_goal:${goal.id}`,
      status: 'approved',
      approved_by: String((user as any).full_name || user.email || ''),
    },
  });

  // Sale event
  const event: any = await (db as any).saleEvent.create({
    data: {
      goal_id: goal.id,
      waiter_id: waiter.id,
      waiter_name: waiter.full_name,
      credited_by_id: String(user.id),
      credited_by_name: String((user as any).full_name || user.email || ''),
      coins_amount: coins,
      is_bonus: isBonus,
      coin_transaction_id: ct.id,
    },
  });

  // Atomic increment + completion flip
  const newCount = goal.current_count + 1;
  const justCompleted = !isBonus && newCount === goal.target;
  await (db as any).salesGoal.update({
    where: { id: goal.id },
    data: {
      current_count: { increment: 1 },
      status: justCompleted ? 'completed' : goal.status,
      completed_at: justCompleted ? new Date() : undefined,
    },
  });

  // Activity log
  try {
    await (db as any).activityLog.create({
      data: {
        user_id: String(user.id),
        user_name: String((user as any).full_name || user.email || ''),
        action_type: 'sale_credit',
        page: '/EmployeeHome',
        label: `+1 ${goal.dish_label} → ${waiter.full_name}`,
        target_id: goal.id,
        metadata: { waiter_id: waiter.id, coins },
      },
    });
  } catch { /* best-effort */ }

  // Push to the credited waiter (always), then group push on completion
  await pushoverToActiveShift(
    `+${coins} 🪙 על ${goal.dish_label}!`,
    isBonus ? 'בונוס כפול 🔥' : 'יפה מאוד!',
    waiter.id,
  );
  if (justCompleted) {
    await pushoverToActiveShift(
      `🎉 הצוות עשה את זה!`,
      `${goal.target} ${goal.dish_label} — בונוס כפול על מכירות נוספות`,
    );
  }

  return { event, new_count: newCount, just_completed: justCompleted };
});

```

- [ ] **Step 2: Typecheck**

Run:
```
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
cd ../..
git add apps/api/src/functions/load.ts
git commit -m "feat(sales-gamification): creditSale endpoint with bonus + push + completion flip"
```

### Task 1.7: Add `undoLastSale` + `closeSalesGoal` registerFns

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Append both registerFns right after `creditSale`**

Insert after the closing `});` of `creditSale`:

```typescript
registerFn('undoLastSale', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if (!(await isShiftSupervisor(user.id))) throw new Error('only shift supervisors can undo');
  const b = (body || {}) as any;
  const goalId = String(b.goal_id || '');
  const waiterId = String(b.waiter_id || '');
  if (!goalId || !waiterId) throw new Error('goal_id and waiter_id required');

  const last: any = await (db as any).saleEvent.findFirst({
    where: { goal_id: goalId, waiter_id: waiterId, undone_at: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!last) throw new Error('אין מכירה לבטל');
  const ageMs = Date.now() - new Date(last.createdAt).getTime();
  if (ageMs > 60_000) throw new Error('חלון ביטול נסגר');

  await (db as any).saleEvent.update({
    where: { id: last.id },
    data: { undone_at: new Date() },
  });
  // Reverse coins via a negative CoinTransaction so audit trail is preserved
  if (last.coin_transaction_id) {
    await (db as any).coinTransaction.create({
      data: {
        employee_id: last.waiter_id,
        employee_name: last.waiter_name,
        amount: -Math.abs(last.coins_amount),
        reason: `ביטול מכירה`,
        type: 'sale_undo',
        trigger: `sales_goal:${goalId}`,
        status: 'approved',
        approved_by: String((user as any).full_name || user.email || ''),
      },
    });
  }
  await (db as any).salesGoal.update({
    where: { id: goalId },
    data: { current_count: { decrement: 1 } },
  });
  return { undone: true };
});

registerFn('closeSalesGoal', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  if (!(await isShiftSupervisor(user.id))) throw new Error('only shift supervisors can close');
  const goalId = String((body as any)?.goal_id || '');
  if (!goalId) throw new Error('goal_id required');

  const goal: any = await (db as any).salesGoal.findUnique({ where: { id: goalId } });
  if (!goal) throw new Error('goal not found');
  if (goal.status === 'closed') return { goal };

  // Compute leaderboard for the auto-Story
  const events: any[] = await (db as any).saleEvent.findMany({
    where: { goal_id: goal.id, undone_at: null },
  });
  const perWaiter = new Map<string, { id: string; name: string; count: number }>();
  for (const e of events) {
    const cur = perWaiter.get(e.waiter_id) || { id: e.waiter_id, name: e.waiter_name, count: 0 };
    cur.count++;
    perWaiter.set(e.waiter_id, cur);
  }
  const ranked = [...perWaiter.values()].sort((a, b) => b.count - a.count);
  const leader = ranked[0];

  const updated = await (db as any).salesGoal.update({
    where: { id: goal.id },
    data: {
      status: 'closed',
      closed_at: new Date(),
      closed_by_id: String(user.id),
    },
  });

  // Auto-Story
  if (leader) {
    try {
      await (db as any).employeeStory.create({
        data: {
          title: `👑 המוביל ב-${goal.dish_label}`,
          content: `${leader.name} עם ${leader.count} מכירות (${ranked.length} מלצרים השתתפו, סה״כ ${events.length} ${goal.dish_label})`,
          image_url: null,
          author_id: String(user.id),
          author_name: String((user as any).full_name || user.email || ''),
          published_at: new Date(),
        },
      });
    } catch (e: any) {
      console.warn('[closeSalesGoal] story create failed:', e?.message);
    }
  }
  return { goal: updated, leaderboard: ranked };
});

```

- [ ] **Step 2: Typecheck**

Run:
```
cd apps/api && npx tsc --noEmit
```

Expected: no errors. If `employeeStory` is reported missing, check the model name — it may be `Story` or similar. Search `model.*Story` in `schema.prisma` and use the camelCase of whichever matches.

- [ ] **Step 3: Commit**

```
cd ../..
git add apps/api/src/functions/load.ts
git commit -m "feat(sales-gamification): undoLastSale (60s window) + closeSalesGoal with auto-Story"
```

### Task 1.8: Add query endpoints (getActiveSalesGoals, getShiftLeaderboard, getMyWeeklyGoal, getActiveRewardsForMe)

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Append the 4 query endpoints**

Insert after the closing `});` of `closeSalesGoal`:

```typescript
registerFn('getActiveSalesGoals', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const b = (body || {}) as any;
  const explicit = b.shift_date && b.shift_type ? { date: String(b.shift_date), type: String(b.shift_type) } : null;
  const shift = explicit || resolveCurrentShift(new Date());
  if (!shift) return { shift: null, goals: [] };

  const goals: any[] = await (db as any).salesGoal.findMany({
    where: { shift_date: shift.date, shift_type: shift.type, status: { not: 'closed' } },
    orderBy: { activated_at: 'asc' },
  });
  // For each goal, leaderboard + caller's slot
  const callerEmp: any = await (db as any).employee.findFirst({ where: { email: user.email } });
  const callerId = callerEmp?.id || null;

  const enriched = await Promise.all(goals.map(async (g) => {
    const events: any[] = await (db as any).saleEvent.findMany({
      where: { goal_id: g.id, undone_at: null },
    });
    const perWaiter = new Map<string, { id: string; name: string; count: number }>();
    for (const e of events) {
      const cur = perWaiter.get(e.waiter_id) || { id: e.waiter_id, name: e.waiter_name, count: 0 };
      cur.count++;
      perWaiter.set(e.waiter_id, cur);
    }
    const ranked = [...perWaiter.values()].sort((a, b) => b.count - a.count);
    const myCount = callerId ? (perWaiter.get(callerId)?.count || 0) : 0;
    const myPosition = callerId ? ranked.findIndex(r => r.id === callerId) + 1 : 0;
    return { ...g, leaderboard: ranked.slice(0, 5), my_count: myCount, my_position: myPosition };
  }));
  return { shift, goals: enriched };
});

registerFn('getShiftLeaderboard', async ({ body, user }) => {
  if (!user) throw new Error('auth required');
  const b = (body || {}) as any;
  const explicit = b.shift_date && b.shift_type ? { date: String(b.shift_date), type: String(b.shift_type) } : null;
  const shift = explicit || resolveCurrentShift(new Date());
  if (!shift) return { shift: null, board: [] };
  const goals: any[] = await (db as any).salesGoal.findMany({
    where: { shift_date: shift.date, shift_type: shift.type },
    select: { id: true },
  });
  if (goals.length === 0) return { shift, board: [] };
  const events: any[] = await (db as any).saleEvent.findMany({
    where: { goal_id: { in: goals.map(g => g.id) }, undone_at: null },
  });
  const perWaiter = new Map<string, { id: string; name: string; sales: number; coins: number }>();
  for (const e of events) {
    const cur = perWaiter.get(e.waiter_id) || { id: e.waiter_id, name: e.waiter_name, sales: 0, coins: 0 };
    cur.sales++;
    cur.coins += e.coins_amount;
    perWaiter.set(e.waiter_id, cur);
  }
  const board = [...perWaiter.values()].sort((a, b) => b.coins - a.coins);
  return { shift, board };
});

registerFn('getMyWeeklyGoal', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const emp: any = await (db as any).employee.findFirst({ where: { email: user.email } });
  if (!emp) return { goal: null };
  // Find current week start (Sunday) in IL
  const now = new Date();
  const ilDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(now);
  const daysFromSun = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(ilDay);
  const sunday = new Date(now.getTime() - daysFromSun * 24 * 60 * 60 * 1000);
  const weekStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(sunday);
  const goal: any = await (db as any).weeklyPersonalGoal.findFirst({
    where: { employee_id: emp.id, week_start_date: weekStart },
  });
  return { goal };
});

registerFn('getActiveRewardsForMe', async ({ user }) => {
  if (!user) throw new Error('auth required');
  const emp: any = await (db as any).employee.findFirst({ where: { email: user.email } });
  if (!emp) return { affordable: [], locked: [], balance: 0 };
  const txs: any[] = await (db as any).coinTransaction.findMany({
    where: { employee_id: emp.id, status: 'approved' },
    select: { amount: true },
  });
  const balance = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
  const rewards: any[] = await (db as any).reward.findMany({
    where: { is_active: true },
    orderBy: { cost: 'asc' },
  });
  const affordable = rewards.filter(r => Number(r.cost || 0) <= balance);
  const locked = rewards.filter(r => Number(r.cost || 0) > balance).slice(0, 4);
  return { affordable, locked, balance };
});

```

- [ ] **Step 2: Typecheck**

Run:
```
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit + push to deploy backend so far**

```
cd ../..
git add apps/api/src/functions/load.ts
git commit -m "feat(sales-gamification): 4 query endpoints (active goals, leaderboard, weekly, rewards)"
git push origin migration
```

Wait ~4 minutes for Hetzner deploy. **Smoke test:**

Run:
```
curl -s -m 10 -X POST https://topalena.com/api/fn/getActiveSalesGoals -H "Content-Type: application/json" -d '{}'
```

Expected: `{"error":"unauthorized"}` (auth required is normal — proves the route is registered).

### Task 1.9: Seed 5 default SalesGoalTemplate rows

**Files:**
- Create: `apps/api/scripts/seed-sales-templates.ts`

- [ ] **Step 1: Create seed script**

Create `apps/api/scripts/seed-sales-templates.ts`:

```typescript
import { prisma } from '../src/db.js';

async function main() {
  const templates = [
    { name: 'מבצע קינוחים', dish_label: 'קינוח', emoji: '🍰', default_target: 30, default_coins_per_sale: 50, sort_order: 1 },
    { name: 'ספיישל יומי', dish_label: 'ספיישל יומי', emoji: '⭐', default_target: 20, default_coins_per_sale: 60, sort_order: 2 },
    { name: 'שדרוג ליין', dish_label: 'שדרוג ליין', emoji: '🍷', default_target: 15, default_coins_per_sale: 75, sort_order: 3 },
    { name: 'מנה ראשונה לכולם', dish_label: 'מנה ראשונה', emoji: '🥗', default_target: 25, default_coins_per_sale: 40, sort_order: 4 },
    { name: 'בקבוק יין', dish_label: 'בקבוק יין', emoji: '🍾', default_target: 10, default_coins_per_sale: 100, sort_order: 5 },
  ];
  for (const t of templates) {
    const existing = await (prisma as any).salesGoalTemplate.findFirst({ where: { name: t.name } });
    if (existing) {
      console.log(`SKIP ${t.name} (exists)`);
      continue;
    }
    await (prisma as any).salesGoalTemplate.create({ data: t });
    console.log(`CREATED ${t.name}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run seed locally against production DB**

Make sure `apps/api/.env` has the production `DATABASE_URL`. Run:

```
cd apps/api && npx tsx scripts/seed-sales-templates.ts
```

Expected: 5 "CREATED" lines first run, all "SKIP" on re-runs.

- [ ] **Step 3: Commit**

```
cd ../..
git add apps/api/scripts/seed-sales-templates.ts
git commit -m "chore(sales-gamification): seed script for 5 default templates"
```

### Task 1.10: Admin page to manage SalesGoalTemplate rows

**Files:**
- Create: `src/pages/SalesGoalTemplates.jsx`
- Modify: `src/pages.config.js`

- [ ] **Step 1: Find how pages register**

Run:
```
grep -n "RewardsManager\|RestaurantInfo" src/pages.config.js
```

Note the exact format of the export (one line per page, typically `{ url, title, component, ... }`).

- [ ] **Step 2: Create the admin page**

Create `src/pages/SalesGoalTemplates.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Save } from 'lucide-react';

const EMPTY = { name: '', dish_label: '', emoji: '🍰', default_target: 30, default_coins_per_sale: 50, is_active: true, sort_order: 0 };

export default function SalesGoalTemplates() {
    const [rows, setRows] = useState([]);
    const [draft, setDraft] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        const list = await base44.entities.SalesGoalTemplate.list('sort_order');
        setRows(list || []);
    };
    useEffect(() => { load(); }, []);

    const create = async () => {
        setSaving(true);
        try {
            await base44.entities.SalesGoalTemplate.create({
                ...draft,
                default_target: Number(draft.default_target) || 1,
                default_coins_per_sale: Number(draft.default_coins_per_sale) || 1,
                sort_order: Number(draft.sort_order) || 0,
            });
            setDraft(EMPTY);
            await load();
        } finally { setSaving(false); }
    };

    const update = async (row, field, value) => {
        const next = { ...row, [field]: value };
        await base44.entities.SalesGoalTemplate.update(row.id, { [field]: value });
        setRows(rows.map(r => r.id === row.id ? next : r));
    };

    const remove = async (id) => {
        if (!confirm('למחוק את התבנית?')) return;
        await base44.entities.SalesGoalTemplate.delete(id);
        await load();
    };

    return (
        <div className="p-6 max-w-4xl mx-auto" dir="rtl">
            <h1 className="text-2xl font-bold mb-6">🎯 תבניות יעדי מכירה</h1>

            <Card className="mb-6 bg-blue-50 border-blue-200">
                <CardContent className="p-4">
                    <h2 className="font-bold mb-3 flex items-center gap-2"><Plus className="w-4 h-4" /> תבנית חדשה</h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div><Label>שם</Label><Input value={draft.name} onChange={e => setDraft(p => ({ ...p, name: e.target.value }))} placeholder="מבצע קינוחים" /></div>
                        <div><Label>שם המנה</Label><Input value={draft.dish_label} onChange={e => setDraft(p => ({ ...p, dish_label: e.target.value }))} placeholder="קינוח" /></div>
                        <div><Label>אימוג'י</Label><Input value={draft.emoji} onChange={e => setDraft(p => ({ ...p, emoji: e.target.value }))} maxLength={4} /></div>
                        <div><Label>יעד ברירת מחדל</Label><Input type="number" value={draft.default_target} onChange={e => setDraft(p => ({ ...p, default_target: e.target.value }))} /></div>
                        <div><Label>מטבעות פר מכירה</Label><Input type="number" value={draft.default_coins_per_sale} onChange={e => setDraft(p => ({ ...p, default_coins_per_sale: e.target.value }))} /></div>
                        <div><Label>סדר</Label><Input type="number" value={draft.sort_order} onChange={e => setDraft(p => ({ ...p, sort_order: e.target.value }))} /></div>
                    </div>
                    <Button onClick={create} disabled={saving || !draft.name || !draft.dish_label} className="mt-4">צור</Button>
                </CardContent>
            </Card>

            <div className="space-y-3">
                {rows.map(r => (
                    <Card key={r.id} className={r.is_active ? '' : 'opacity-50'}>
                        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
                            <span className="text-2xl">{r.emoji}</span>
                            <div className="flex-1 min-w-[160px]">
                                <Input value={r.name} onChange={e => update(r, 'name', e.target.value)} />
                                <Input className="mt-2" value={r.dish_label} onChange={e => update(r, 'dish_label', e.target.value)} />
                            </div>
                            <div className="flex flex-col gap-2 w-24">
                                <Label className="text-xs">יעד</Label>
                                <Input type="number" value={r.default_target} onChange={e => update(r, 'default_target', Number(e.target.value))} />
                            </div>
                            <div className="flex flex-col gap-2 w-24">
                                <Label className="text-xs">🪙/מכירה</Label>
                                <Input type="number" value={r.default_coins_per_sale} onChange={e => update(r, 'default_coins_per_sale', Number(e.target.value))} />
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <Label className="text-xs">פעיל</Label>
                                <Switch checked={r.is_active} onCheckedChange={v => update(r, 'is_active', v)} />
                            </div>
                            <Button variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
```

- [ ] **Step 3: Register the page in pages.config.js**

Open `src/pages.config.js`. Find where similar admin pages like `RewardsManager` are registered. Add a matching entry for `SalesGoalTemplates` — use the same `{ url, title, component }` shape used by surrounding entries, with:
- `url`: `/SalesGoalTemplates`
- `title`: `'תבניות יעדי מכירה'`
- `component`: lazy import of `./pages/SalesGoalTemplates.jsx` (match the import style used by the other entries)
- Role: admin-only (use whatever flag the file uses, e.g. `admin: true` or category 'admin')

- [ ] **Step 4: Build**

Run:
```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
```

Expected: EXIT=0.

- [ ] **Step 5: Commit + push**

```
git add src/pages/SalesGoalTemplates.jsx src/pages.config.js
git commit -m "feat(sales-gamification): admin page to manage SalesGoalTemplate rows"
git push origin migration
```

Wait ~4 min for deploy. Manual smoke: navigate to `/SalesGoalTemplates` as admin, verify the 5 seeded rows are visible and you can edit/toggle/delete.

**Phase 1 complete.** Backend foundation + seed + admin page live.

---

## Phase 2 — Shift Supervisor Panel

### Task 2.1: Add `salesShift.js` helper consumers + role-gate helper

**Files:**
- Create: `src/lib/roleGates.js`

- [ ] **Step 1: Create the helper**

Create `src/lib/roleGates.js`:

```js
// Centralized role gates so every sales-gamification component agrees on
// who sees what. Keep in sync with the backend SUPERVISOR_POSITIONS set.
const SUPERVISOR_POSITIONS = new Set(['אחראי משמרת', 'מנהלת משמרת', 'מנהל משמרת', 'אחמש']);
const WAITSTAFF_POSITIONS = new Set([
    'מלצר', 'מלצרית', 'ברמן', 'ברמנית', 'מארחת', 'מארח',
    'ראנר', 'אחראי משמרת', 'מנהלת משמרת', 'מנהל משמרת',
]);
const NON_SALES_POSITIONS = new Set([
    'טבח', 'טבחת', 'מנהל מטבח', 'שוטף כלים', 'שליח',
]);

function rolesOf(employee, user) {
    const roles = [];
    if (user?.role) roles.push(user.role);
    if (employee?.role) roles.push(employee.role);
    if (Array.isArray(employee?.positions)) roles.push(...employee.positions);
    return roles.map(r => String(r || '').trim()).filter(Boolean);
}

export function isShiftSupervisor(employee, user) {
    const roles = rolesOf(employee, user);
    if (roles.includes('admin') || roles.includes('manager') || roles.includes('owner')) return true;
    return roles.some(r => SUPERVISOR_POSITIONS.has(r));
}

export function isWaitstaff(employee, user) {
    const roles = rolesOf(employee, user);
    return roles.some(r => WAITSTAFF_POSITIONS.has(r));
}

export function isNonSalesRole(employee, user) {
    const roles = rolesOf(employee, user);
    if (roles.some(r => WAITSTAFF_POSITIONS.has(r))) return false;
    return roles.some(r => NON_SALES_POSITIONS.has(r));
}
```

- [ ] **Step 2: Build**

Run:
```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
```

Expected: EXIT=0.

- [ ] **Step 3: Commit**

```
git add src/lib/roleGates.js
git commit -m "feat(sales-gamification): isShiftSupervisor/isWaitstaff/isNonSalesRole role gates"
```

### Task 2.2: Build `ActivateGoalDialog.jsx`

**Files:**
- Create: `src/components/sales/ActivateGoalDialog.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/sales/ActivateGoalDialog.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function ActivateGoalDialog({ open, onClose, onActivated }) {
    const [templates, setTemplates] = useState([]);
    const [picked, setPicked] = useState(null);
    const [target, setTarget] = useState('');
    const [coins, setCoins] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!open) return;
        base44.entities.SalesGoalTemplate.filter({ is_active: true }, 'sort_order').then(list => {
            setTemplates(list || []);
        });
    }, [open]);

    const pick = (t) => {
        setPicked(t);
        setTarget(String(t.default_target));
        setCoins(String(t.default_coins_per_sale));
        setError(null);
    };

    const activate = async () => {
        if (!picked) return;
        setSubmitting(true);
        setError(null);
        try {
            const result = await base44.functions.activateSalesGoal({
                template_id: picked.id,
                target: Number(target),
                coins_per_sale: Number(coins),
            });
            onActivated?.(result.goal);
            setPicked(null);
            onClose();
        } catch (e) {
            setError(e?.message || 'שגיאה');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-md" dir="rtl">
                <DialogHeader><DialogTitle>הפעלת יעד חדש</DialogTitle></DialogHeader>
                {!picked && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                        {templates.map(t => (
                            <Card key={t.id} className="cursor-pointer hover:shadow-md" onClick={() => pick(t)}>
                                <CardContent className="p-3 text-center">
                                    <div className="text-3xl">{t.emoji}</div>
                                    <div className="font-bold mt-1">{t.name}</div>
                                    <div className="text-xs text-gray-500 mt-1">{t.default_target} · {t.default_coins_per_sale}🪙</div>
                                </CardContent>
                            </Card>
                        ))}
                        {templates.length === 0 && <p className="col-span-2 text-center text-gray-500">אין תבניות פעילות. צור ב-/SalesGoalTemplates</p>}
                    </div>
                )}
                {picked && (
                    <div className="space-y-3 mt-3">
                        <div className="text-center text-3xl">{picked.emoji}</div>
                        <div className="text-center font-bold">{picked.name}</div>
                        <div>
                            <Label>יעד</Label>
                            <Input type="number" value={target} onChange={e => setTarget(e.target.value)} />
                        </div>
                        <div>
                            <Label>מטבעות פר מכירה</Label>
                            <Input type="number" value={coins} onChange={e => setCoins(e.target.value)} />
                        </div>
                        {error && <div className="text-sm text-red-600">{error}</div>}
                        <div className="flex gap-2 pt-2">
                            <Button onClick={activate} disabled={submitting} className="flex-1">
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                הפעל
                            </Button>
                            <Button variant="outline" onClick={() => setPicked(null)}>חזור</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
```

- [ ] **Step 2: Build**

Run:
```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
```

Expected: EXIT=0.

- [ ] **Step 3: Commit**

```
git add src/components/sales/ActivateGoalDialog.jsx
git commit -m "feat(sales-gamification): ActivateGoalDialog with template picker + editable defaults"
```

### Task 2.3: Build `ShiftSupervisorPanel.jsx` (the +1 panel)

**Files:**
- Create: `src/components/sales/ShiftSupervisorPanel.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/sales/ShiftSupervisorPanel.jsx`:

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import ActivateGoalDialog from './ActivateGoalDialog';

export default function ShiftSupervisorPanel() {
    const [goals, setGoals] = useState([]);
    const [shiftStaff, setShiftStaff] = useState([]);
    const [showActivate, setShowActivate] = useState(false);
    const [busyKey, setBusyKey] = useState(null);
    const lastTapRef = useRef({}); // goalId -> { waiterId, ts } for long-press undo

    const load = async () => {
        try {
            const data = await base44.functions.getActiveSalesGoals({});
            setGoals(data.goals || []);
            // Load on-shift staff so we can render per-waiter buttons even if they
            // haven't sold yet.
            if (data.shift) {
                const shifts = await base44.entities.WorkShift.filter({ date: data.shift.date, shift_type: data.shift.type });
                const staffMap = new Map();
                for (const ws of (shifts || [])) {
                    for (const a of (ws.assigned_staff || [])) {
                        if (a.employee_id && !staffMap.has(a.employee_id)) {
                            staffMap.set(a.employee_id, { id: a.employee_id, name: a.employee_name });
                        }
                    }
                }
                setShiftStaff([...staffMap.values()]);
            }
        } catch (e) { console.warn('[ShiftSupervisorPanel] load failed', e); }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        window.addEventListener('sales:goal-activated', onChange);
        window.addEventListener('sales:goal-completed', onChange);
        const interval = setInterval(load, 15000);
        return () => {
            window.removeEventListener('sales:credited', onChange);
            window.removeEventListener('sales:goal-activated', onChange);
            window.removeEventListener('sales:goal-completed', onChange);
            clearInterval(interval);
        };
    }, []);

    const countFor = (goal, waiterId) =>
        goal.leaderboard?.find(l => l.id === waiterId)?.count || 0;

    const tap = async (goal, waiter) => {
        const key = `${goal.id}-${waiter.id}`;
        if (busyKey === key) return;
        setBusyKey(key);
        try {
            await base44.functions.creditSale({ goal_id: goal.id, waiter_id: waiter.id });
            lastTapRef.current[goal.id] = { waiterId: waiter.id, ts: Date.now() };
            window.dispatchEvent(new CustomEvent('sales:credited', { detail: { goal_id: goal.id } }));
        } catch (e) {
            console.warn('[creditSale] failed', e);
            alert(e?.message || 'שגיאה');
        } finally {
            setBusyKey(null);
        }
    };

    const undo = async (goal) => {
        const last = lastTapRef.current[goal.id];
        if (!last) return alert('אין מכירה לבטל');
        if (Date.now() - last.ts > 60_000) return alert('חלון ביטול נסגר (60 שניות)');
        try {
            await base44.functions.undoLastSale({ goal_id: goal.id, waiter_id: last.waiterId });
            window.dispatchEvent(new CustomEvent('sales:credited', { detail: { goal_id: goal.id } }));
            delete lastTapRef.current[goal.id];
        } catch (e) {
            alert(e?.message || 'שגיאה');
        }
    };

    const close = async (goal) => {
        if (!confirm(`לסגור את היעד "${goal.dish_label}"? זה ייצור Story מסכמת.`)) return;
        try {
            await base44.functions.closeSalesGoal({ goal_id: goal.id });
            await load();
        } catch (e) {
            alert(e?.message || 'שגיאה');
        }
    };

    if (goals.length === 0 && shiftStaff.length === 0) {
        return (
            <Card className="mb-4 border-2 border-dashed border-gray-300">
                <CardContent className="p-4 text-center">
                    <p className="text-gray-600 mb-3">הצוות שלך עוד לא מתחרה.</p>
                    <Button onClick={() => setShowActivate(true)}><Plus className="w-4 h-4 ml-1" /> הפעל יעד</Button>
                </CardContent>
                <ActivateGoalDialog open={showActivate} onClose={() => setShowActivate(false)} onActivated={load} />
            </Card>
        );
    }

    return (
        <Card className="mb-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold">🎯 יעדי המשמרת</h3>
                    <Button size="sm" onClick={() => setShowActivate(true)}><Plus className="w-4 h-4 ml-1" /> יעד</Button>
                </div>
                {goals.map(goal => (
                    <div key={goal.id} className="mb-4 last:mb-0 bg-white rounded-lg p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-bold">{goal.emoji} {goal.dish_label} — {goal.current_count}/{goal.target}</span>
                            <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => undo(goal)} title="ביטול אחרון (60s)"><X className="w-4 h-4" /></Button>
                                <Button size="sm" variant="outline" onClick={() => close(goal)}>סגור</Button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {shiftStaff.map(w => (
                                <Button
                                    key={w.id}
                                    size="sm"
                                    variant={countFor(goal, w.id) > 0 ? 'default' : 'outline'}
                                    onClick={() => tap(goal, w)}
                                    disabled={busyKey === `${goal.id}-${w.id}`}
                                    className="text-xs"
                                >
                                    {w.name} {countFor(goal, w.id)}
                                </Button>
                            ))}
                            {shiftStaff.length === 0 && <span className="text-xs text-gray-500">אין צוות משובץ למשמרת</span>}
                        </div>
                    </div>
                ))}
            </CardContent>
            <ActivateGoalDialog open={showActivate} onClose={() => setShowActivate(false)} onActivated={load} />
        </Card>
    );
}
```

- [ ] **Step 2: Build**

Run:
```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
```

Expected: EXIT=0.

- [ ] **Step 3: Commit**

```
git add src/components/sales/ShiftSupervisorPanel.jsx
git commit -m "feat(sales-gamification): ShiftSupervisorPanel — +1 per waiter, undo, close, activate"
```

### Task 2.4: Wire `ShiftSupervisorPanel` into EmployeeHome (managers only)

**Files:**
- Modify: `src/pages/EmployeeHome.jsx`
- Modify: `src/hooks/useDashboardLayout.js`

- [ ] **Step 1: Open `EmployeeHome.jsx` and add the import**

Find the existing imports for dashboard components (the cluster around `MyTipsWidget`, `MyRankWidget`, etc.). After the last one, add:

```jsx
import ShiftSupervisorPanel from '../components/sales/ShiftSupervisorPanel';
import { isShiftSupervisor } from '@/lib/roleGates';
```

- [ ] **Step 2: Register a new widget entry**

Find the `widgets` object (around line 108). Add a new entry near the top of the object:

```jsx
supervisor_panel: isVisible('supervisor_panel') && isShiftSupervisor(currentEmployee, user) && (
    <ShiftSupervisorPanel key="supervisor_panel" />
),
```

- [ ] **Step 3: Add to default layout**

Open `src/hooks/useDashboardLayout.js`. Find the default layout array for `'employee'`. Add `{ id: 'supervisor_panel', visible: true }` near the top (right after `stories` or `daily_challenge`).

- [ ] **Step 4: Build + push**

```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
git add src/pages/EmployeeHome.jsx src/hooks/useDashboardLayout.js
git commit -m "feat(sales-gamification): mount ShiftSupervisorPanel on EmployeeHome for managers"
git push origin migration
```

Wait ~4 min for deploy. **Manual smoke:**
- Log in as a shift supervisor (or admin) → home page shows the panel with "+ הפעל יעד" button.
- Click → dialog opens, picks template, activates → goal appears.
- Tap a waiter button → count goes up to 1, coins credited (check via `/GamificationCenter` for that waiter).
- Long-press equivalent: hit the X button → undo works if within 60s.
- Close → confirms, Story should appear in StoriesBar within minutes.
- Log in as a non-supervisor → panel does NOT show.

**Phase 2 complete.** Managers can run the competition; employees don't see anything new yet.

---

## Phase 3 — Employee Surface

### Task 3.1: `SalesGoalsBanner.jsx`

**Files:**
- Create: `src/components/sales/SalesGoalsBanner.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/sales/SalesGoalsBanner.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

function gradientForPct(pct) {
    if (pct >= 100) return 'from-purple-500 to-fuchsia-600 animate-pulse';
    if (pct >= 75) return 'from-green-500 to-emerald-600';
    if (pct >= 40) return 'from-yellow-500 to-amber-600';
    return 'from-red-400 to-orange-500';
}

export default function SalesGoalsBanner() {
    const [goals, setGoals] = useState([]);
    const [shift, setShift] = useState(null);

    const load = async () => {
        try {
            const data = await base44.functions.getActiveSalesGoals({});
            setGoals(data.goals || []);
            setShift(data.shift);
        } catch { /* swallow */ }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        window.addEventListener('sales:goal-activated', onChange);
        window.addEventListener('sales:goal-completed', onChange);
        const interval = setInterval(load, 20000);
        return () => {
            window.removeEventListener('sales:credited', onChange);
            window.removeEventListener('sales:goal-activated', onChange);
            window.removeEventListener('sales:goal-completed', onChange);
            clearInterval(interval);
        };
    }, []);

    if (!shift || goals.length === 0) return null;

    return (
        <Card className="mb-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
            <CardContent className="p-4">
                <h3 className="font-bold mb-3 text-center">🔥 הצוות מתחרה — {shift.type === 'lunch' ? 'צהריים' : 'ערב'}!</h3>
                {goals.map(g => {
                    const pct = Math.min(100, Math.round((g.current_count / Math.max(1, g.target)) * 100));
                    const myMsg = g.my_position === 1
                        ? `👑 אתה מוביל עם ${g.my_count}`
                        : g.my_position > 0
                            ? `אתה במקום #${g.my_position} עם ${g.my_count}${g.leaderboard[0] ? ` · עוד ${g.leaderboard[0].count - g.my_count + 1} ותעקוף את ${g.leaderboard[0].name}` : ''}`
                            : null;
                    return (
                        <div key={g.id} className="mb-3 last:mb-0">
                            <div className="flex justify-between text-sm font-bold mb-1">
                                <span>{g.emoji} {g.dish_label}</span>
                                <span>{g.current_count}/{g.target}</span>
                            </div>
                            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full bg-gradient-to-r ${gradientForPct(pct)} transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            {myMsg && <p className="text-xs mt-1 text-amber-200">{myMsg}</p>}
                            {!myMsg && g.leaderboard[0] && (
                                <p className="text-xs mt-1 text-amber-200">👑 המוביל: {g.leaderboard[0].name} ({g.leaderboard[0].count})</p>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Build**

Run:
```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
```

Expected: EXIT=0.

- [ ] **Step 3: Commit**

```
git add src/components/sales/SalesGoalsBanner.jsx
git commit -m "feat(sales-gamification): SalesGoalsBanner with adaptive gradient + personal position"
```

### Task 3.2: `ShiftLeaderboard.jsx`

**Files:**
- Create: `src/components/sales/ShiftLeaderboard.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/sales/ShiftLeaderboard.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

export default function ShiftLeaderboard({ myEmployeeId }) {
    const [board, setBoard] = useState([]);

    const load = async () => {
        try {
            const data = await base44.functions.getShiftLeaderboard({});
            setBoard(data.board || []);
        } catch { /* swallow */ }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        const interval = setInterval(load, 30000);
        return () => {
            window.removeEventListener('sales:credited', onChange);
            clearInterval(interval);
        };
    }, []);

    if (board.length === 0) return null;

    const myIdx = myEmployeeId ? board.findIndex(b => b.id === myEmployeeId) : -1;
    const showSelfRow = myIdx >= 5;
    const visible = board.slice(0, 5);

    return (
        <Card className="mb-4">
            <CardContent className="p-4">
                <h3 className="font-bold mb-3">🏆 לוח המשמרת</h3>
                <div className="space-y-2">
                    {visible.map((row, i) => {
                        const mine = row.id === myEmployeeId;
                        return (
                            <div
                                key={row.id}
                                className={`flex items-center justify-between p-2 rounded-lg ${mine ? 'bg-yellow-50 border-2 border-yellow-400' : 'bg-gray-50'}`}
                            >
                                <span className="font-bold">{MEDALS[i]} {row.name}{mine ? ' (אתה)' : ''}</span>
                                <span className="text-sm text-gray-700">{row.sales} מכירות · {row.coins} 🪙</span>
                            </div>
                        );
                    })}
                    {showSelfRow && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-yellow-50 border-2 border-yellow-400 mt-3">
                            <span className="font-bold">#{myIdx + 1} {board[myIdx].name} (אתה)</span>
                            <span className="text-sm text-gray-700">{board[myIdx].sales} מכירות · {board[myIdx].coins} 🪙</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Build + commit**

```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
git add src/components/sales/ShiftLeaderboard.jsx
git commit -m "feat(sales-gamification): ShiftLeaderboard with top-5 + self-row fallback"
```

### Task 3.3: `RewardShowcase.jsx` + `CompactCoinWidget.jsx`

**Files:**
- Create: `src/components/sales/RewardShowcase.jsx`
- Create: `src/components/sales/CompactCoinWidget.jsx`

- [ ] **Step 1: Create `RewardShowcase.jsx`**

Create `src/components/sales/RewardShowcase.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function RewardShowcase() {
    const [data, setData] = useState({ affordable: [], locked: [], balance: 0 });
    const [redeeming, setRedeeming] = useState(null);

    const load = async () => {
        try {
            const d = await base44.functions.getActiveRewardsForMe({});
            setData(d);
        } catch { /* swallow */ }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        return () => window.removeEventListener('sales:credited', onChange);
    }, []);

    const redeem = async (reward) => {
        setRedeeming(reward.id);
        try {
            // Same redemption flow as GamificationCenter — pending_approval CoinTransaction
            const me = await base44.entities.User.me();
            const emps = await base44.entities.Employee.filter({ status: 'active' });
            const emp = (emps || []).find(e => e.email?.toLowerCase() === me.email?.toLowerCase());
            if (!emp) throw new Error('עובד לא נמצא');
            await base44.entities.CoinTransaction.create({
                employee_id: emp.id,
                employee_name: emp.full_name,
                amount: -Number(reward.cost || 0),
                reason: `בקשת פדיון: ${reward.title}`,
                type: 'redeemed',
                trigger: 'redemption',
                status: 'pending_approval',
                redemption_reward: reward.id || reward.title,
            });
            alert('🎉 הבקשה נשלחה למנהל');
            await load();
        } catch (e) {
            alert(e?.message || 'שגיאה');
        } finally {
            setRedeeming(null);
        }
    };

    return (
        <Card className="mb-4">
            <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold">💎 הפרסים שלך</h3>
                    <span className="text-sm font-bold text-amber-600">{data.balance} 🪙</span>
                </div>

                {data.affordable.length > 0 && (
                    <>
                        <p className="text-xs text-gray-500 mb-2">✅ זמינים עכשיו</p>
                        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                            {data.affordable.slice(0, 6).map(r => (
                                <div key={r.id} className="flex-shrink-0 w-28 bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                                    <div className="text-2xl">{r.emoji || '🎁'}</div>
                                    <div className="text-xs font-bold mt-1 line-clamp-2">{r.title}</div>
                                    <div className="text-xs text-gray-600">{r.cost} 🪙</div>
                                    <Button size="sm" className="mt-2 w-full text-xs h-7" onClick={() => redeem(r)} disabled={redeeming === r.id}>
                                        קנה
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {data.locked.length > 0 && (
                    <>
                        <p className="text-xs text-gray-500 mb-2">🔒 קצת עוד</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {data.locked.map(r => {
                                const pct = Math.min(100, Math.round((data.balance / Math.max(1, r.cost)) * 100));
                                const need = Math.max(0, Number(r.cost || 0) - data.balance);
                                return (
                                    <div key={r.id} className="flex-shrink-0 w-28 bg-gray-50 border rounded-lg p-2 text-center">
                                        <div className="text-2xl opacity-60">{r.emoji || '🎁'}</div>
                                        <div className="text-xs font-bold mt-1 line-clamp-2">{r.title}</div>
                                        <div className="text-xs text-gray-600">{r.cost} 🪙</div>
                                        <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                                            <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-1">עוד {need}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {data.affordable.length === 0 && data.locked.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">אין פרסים זמינים. דבר עם המנהל.</p>
                )}

                <Link to="/GamificationCenter" className="block text-center text-xs text-blue-600 mt-3 underline">
                    כל הפרסים →
                </Link>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Create `CompactCoinWidget.jsx`**

Create `src/components/sales/CompactCoinWidget.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

export default function CompactCoinWidget() {
    const [balance, setBalance] = useState(0);

    const load = async () => {
        try {
            const d = await base44.functions.getActiveRewardsForMe({});
            setBalance(d.balance || 0);
        } catch { /* swallow */ }
    };

    useEffect(() => { load(); }, []);

    return (
        <Card className="mb-4 bg-gradient-to-r from-amber-100 to-yellow-100 border-amber-300">
            <CardContent className="p-3 flex items-center justify-between">
                <span className="font-bold">💰 יתרתך: {balance} 🪙</span>
                <Link to="/GamificationCenter" className="text-xs text-blue-700 underline">צפה בפרסים →</Link>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 3: Build + commit**

```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
git add src/components/sales/RewardShowcase.jsx src/components/sales/CompactCoinWidget.jsx
git commit -m "feat(sales-gamification): RewardShowcase (affordable + locked) + CompactCoinWidget"
```

### Task 3.4: `WeeklyPersonalGoal.jsx`

**Files:**
- Create: `src/components/sales/WeeklyPersonalGoal.jsx`

- [ ] **Step 1: Create the component**

Create `src/components/sales/WeeklyPersonalGoal.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

export default function WeeklyPersonalGoal() {
    const [goal, setGoal] = useState(null);

    const load = async () => {
        try {
            const data = await base44.functions.getMyWeeklyGoal();
            setGoal(data.goal);
        } catch { /* swallow */ }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        return () => window.removeEventListener('sales:credited', onChange);
    }, []);

    if (!goal) return null;
    const pct = Math.min(100, Math.round((goal.current_count / Math.max(1, goal.target)) * 100));
    const remaining = Math.max(0, goal.target - goal.current_count);

    return (
        <Card className="mb-4 bg-blue-50 border-blue-200">
            <CardContent className="p-3">
                <div className="flex justify-between text-sm font-bold mb-1">
                    <span>🎯 היעד שלך לשבוע: {goal.target} מכירות</span>
                    <span>{goal.current_count}/{goal.target}</span>
                </div>
                <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-blue-700 mt-1">
                    {goal.awarded
                        ? '🏆 השגת את היעד! בונוס שולם.'
                        : `עוד ${remaining} ותקבל בונוס ${goal.reward_coins} 🪙`}
                </p>
            </CardContent>
        </Card>
    );
}
```

- [ ] **Step 2: Build + commit**

```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
git add src/components/sales/WeeklyPersonalGoal.jsx
git commit -m "feat(sales-gamification): WeeklyPersonalGoal progress widget"
```

### Task 3.5: Wire all employee widgets into `EmployeeHome.jsx`

**Files:**
- Modify: `src/pages/EmployeeHome.jsx`
- Modify: `src/hooks/useDashboardLayout.js`

- [ ] **Step 1: Add imports**

Open `src/pages/EmployeeHome.jsx`. After the `ShiftSupervisorPanel` import you added in Task 2.4, add:

```jsx
import SalesGoalsBanner from '../components/sales/SalesGoalsBanner';
import ShiftLeaderboard from '../components/sales/ShiftLeaderboard';
import RewardShowcase from '../components/sales/RewardShowcase';
import CompactCoinWidget from '../components/sales/CompactCoinWidget';
import WeeklyPersonalGoal from '../components/sales/WeeklyPersonalGoal';
import { isWaitstaff, isNonSalesRole } from '@/lib/roleGates';
```

- [ ] **Step 2: Register the new widgets**

In the `widgets` object, alongside `supervisor_panel`, add:

```jsx
sales_banner: isVisible('sales_banner') && !isNonSalesRole(currentEmployee, user) && (
    <SalesGoalsBanner key="sales_banner" />
),
shift_leaderboard: isVisible('shift_leaderboard') && !isNonSalesRole(currentEmployee, user) && (
    <ShiftLeaderboard key="shift_leaderboard" myEmployeeId={currentEmployee?.id} />
),
reward_showcase: isVisible('reward_showcase') && !isNonSalesRole(currentEmployee, user) && (
    <RewardShowcase key="reward_showcase" />
),
compact_coin: isVisible('compact_coin') && isNonSalesRole(currentEmployee, user) && (
    <CompactCoinWidget key="compact_coin" />
),
weekly_goal: isVisible('weekly_goal') && isWaitstaff(currentEmployee, user) && (
    <WeeklyPersonalGoal key="weekly_goal" />
),
```

- [ ] **Step 3: Add to default layout**

Open `src/hooks/useDashboardLayout.js`. In the default employee layout array, add (in this order, right after `stories`):
```js
{ id: 'sales_banner', visible: true },
{ id: 'shift_leaderboard', visible: true },
{ id: 'weekly_goal', visible: true },
{ id: 'reward_showcase', visible: true },
{ id: 'compact_coin', visible: true },
{ id: 'supervisor_panel', visible: true },  // already added in 2.4 — ensure it's still there
```

- [ ] **Step 4: Build + push**

```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
git add src/pages/EmployeeHome.jsx src/hooks/useDashboardLayout.js
git commit -m "feat(sales-gamification): wire SalesGoalsBanner/Leaderboard/Showcase/Weekly/Compact into EmployeeHome"
git push origin migration
```

Wait ~4 min for deploy. **Manual smoke:**
- Log in as a waiter → home shows banner + leaderboard + weekly goal + reward showcase. NO supervisor panel.
- Log in as a manager → also sees the supervisor panel above.
- Log in as kitchen staff → sees CompactCoinWidget only, no banner/leaderboard/showcase.
- From another device as a manager, tap "+1" on a goal → waiter's dashboard refreshes within 20s and shows the updated count.

**Phase 3 complete.** Full employee gamification UI live.

---

## Phase 4 — Voice + PWA + Push + Cron + Auto-Tracker

### Task 4.1: Add 4 sales voice intents

**Files:**
- Modify: `src/components/voice/voiceIntents.js`
- Modify: `src/components/voice/handleVoiceCommand.js`
- Modify: `apps/api/src/functions/load.ts` (LLM prompt)

- [ ] **Step 1: Add MATCHERS to voiceIntents.js**

Open `src/components/voice/voiceIntents.js`. Find the `// ========== Help ==========` block at the end of MATCHERS. Insert BEFORE it:

```js
// ========== Sales gamification ==========
{ re: /^\+?\s*1?\s+(.+?)\s+ל(.+)$/, intent: 'sale_credit', extract: m => ({ dish: m[1].trim(), name: m[2].trim() }) },
{ re: /^(תוסיף|הוסף)\s+(.+?)\s+ל(.+)$/, intent: 'sale_credit', extract: m => ({ dish: m[2].trim(), name: m[3].trim() }) },
{ re: /^(תפעיל|הפעל|פתח)\s+יעד\s+(.+)$/, intent: 'sales_goal_activate', extract: m => ({ template: m[2].trim() }) },
{ re: /(?:כמה\s+(.+?)\s+(?:מכרנו|מכרו)|סטטוס\s+(?:ה?)מכירות)/, intent: 'q_sales_status', extract: m => ({ dish: (m[1] || '').trim() }) },
{ re: /(?:מי\s+המוביל|מי\s+מוביל\s+ב?מכירות)/, intent: 'q_sales_leader' },
```

- [ ] **Step 2: Add COMMAND_GROUPS entry**

In the same file, find the `🆘 עזרה` group at the bottom of `COMMAND_GROUPS`. Insert BEFORE it:

```js
{
    title: '🎯 מכירות',
    cmds: [
        'תוסיף קינוח לרן',
        '+1 קינוח לרן',
        'תפעיל יעד מבצע קינוחים',
        'כמה קינוחים מכרנו',
        'מי המוביל',
    ],
},
```

- [ ] **Step 3: Add handlers to handleVoiceCommand.js**

Open `src/components/voice/handleVoiceCommand.js`. Add to the `MUTATING_INTENTS` Set: `'sale_credit', 'sales_goal_activate'`.

Then BEFORE `default:`, insert these 4 cases:

```js
case 'sale_credit': {
    try {
        const data = await base44.functions.getActiveSalesGoals({});
        const goal = (data.goals || []).find(g =>
            g.dish_label && cmd.dish && (g.dish_label.includes(cmd.dish) || cmd.dish.includes(g.dish_label))
        );
        if (!goal) return { ok: false, message: `אין יעד פעיל ל-${cmd.dish}` };
        const emps = await base44.entities.Employee.list();
        const waiter = (emps || []).find(e => (e.full_name || '').includes(cmd.name));
        if (!waiter) return { ok: false, message: `${cmd.name} לא נמצא` };
        const r = await base44.functions.creditSale({ goal_id: goal.id, waiter_id: waiter.id });
        broadcastDataChange('sales:credited');
        return { ok: true, message: `בוצע ✓ +1 ${goal.dish_label} ל-${waiter.full_name} (${r.new_count}/${goal.target})` };
    } catch (e) { return { ok: false, message: e?.message || 'שגיאה' }; }
}
case 'sales_goal_activate': {
    try {
        const templates = await base44.entities.SalesGoalTemplate.filter({ is_active: true });
        const t = (templates || []).find(t =>
            (t.name || '').includes(cmd.template) || (t.dish_label || '').includes(cmd.template)
        );
        if (!t) return { ok: false, message: `תבנית ${cmd.template} לא נמצאה` };
        await base44.functions.activateSalesGoal({ template_id: t.id });
        broadcastDataChange('sales:goal-activated');
        return { ok: true, message: `בוצע ✓ יעד ${t.name} הופעל` };
    } catch (e) { return { ok: false, message: e?.message || 'שגיאה' }; }
}
case 'q_sales_status': {
    try {
        const data = await base44.functions.getActiveSalesGoals({});
        const goals = data.goals || [];
        if (goals.length === 0) return { ok: true, message: 'אין יעדים פעילים' };
        const target = cmd.dish
            ? goals.find(g => g.dish_label.includes(cmd.dish))
            : goals[0];
        if (!target) return { ok: true, message: `אין יעד ל-${cmd.dish}` };
        const leader = target.leaderboard[0];
        const leaderMsg = leader ? ` המוביל ${leader.name} עם ${leader.count}` : '';
        return { ok: true, message: `${target.dish_label}: ${target.current_count} מתוך ${target.target}.${leaderMsg}` };
    } catch (e) { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
}
case 'q_sales_leader': {
    try {
        const data = await base44.functions.getShiftLeaderboard({});
        const board = data.board || [];
        if (board.length === 0) return { ok: true, message: 'אין נתוני מכירות עדיין' };
        const top = board[0];
        return { ok: true, message: `${top.name}, ${top.sales} מכירות, ${top.coins} מטבעות` };
    } catch (e) { return { ok: false, message: 'לא הצלחתי לבדוק' }; }
}
```

- [ ] **Step 4: Extend LLM prompt in load.ts**

Open `apps/api/src/functions/load.ts`. Find the `OPS:` block in the LLM prompt (search for `incident_open {description}`). Insert AFTER the `task_add` line:

```
SALES:
- sale_credit {dish, name}: זיכוי מכירה למלצר ספציפי
- sales_goal_activate {template}: פתיחת יעד מכירות
- q_sales_status {dish?}: כמה נמכר היום
- q_sales_leader: מי המוביל
```

In the EXAMPLES block, find the line `"משימות לרן" → ...` and insert below it:

```
"תוסיף קינוח לרן" → {"intent":"sale_credit","dish":"קינוח","name":"רן"}
"+1 ספיישל לשירה" → {"intent":"sale_credit","dish":"ספיישל","name":"שירה"}
"תפעיל יעד מבצע קינוחים" → {"intent":"sales_goal_activate","template":"מבצע קינוחים"}
"כמה קינוחים מכרנו" → {"intent":"q_sales_status","dish":"קינוח"}
"מי המוביל" → {"intent":"q_sales_leader"}
```

In the responseSchema properties block, add: `dish: { type: 'string' }, template: { type: 'string' },`

- [ ] **Step 5: Typecheck + build**

```
cd apps/api && npx tsc --noEmit && cd ../.. && npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
```

Expected: EXIT=0 and no TS errors.

- [ ] **Step 6: Commit**

```
git add src/components/voice/voiceIntents.js src/components/voice/handleVoiceCommand.js apps/api/src/functions/load.ts
git commit -m "feat(sales-gamification): 4 voice intents (sale_credit, goal_activate, q_status, q_leader)"
```

### Task 4.2: PWA shortcuts + `?voice=1` auto-start

**Files:**
- Modify: `public/manifest.json` (or wherever the manifest lives)
- Modify: `src/components/voice/VoiceControl.jsx`

- [ ] **Step 1: Find the manifest**

Run:
```
ls public/manifest.json public/manifest.webmanifest 2>/dev/null
```

Note the actual filename.

- [ ] **Step 2: Add shortcuts to manifest**

Open the manifest. Add a top-level `"shortcuts"` array (or extend if it exists):

```json
"shortcuts": [
  {
    "name": "🎤 הקלטה מהירה",
    "short_name": "Voice",
    "url": "/?voice=1",
    "description": "פתח הקלטת קול מיד",
    "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" }]
  },
  {
    "name": "🪑 מפת הושבה",
    "short_name": "Seating",
    "url": "/SeatingSetup",
    "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" }]
  },
  {
    "name": "🏆 הלוח שלי",
    "short_name": "Dashboard",
    "url": "/Dashboard",
    "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" }]
  }
]
```

Use whatever icon path the existing manifest uses for its main `icons` entry.

- [ ] **Step 3: Add auto-start to VoiceControl.jsx**

Open `src/components/voice/VoiceControl.jsx`. Find `const handleFinalTranscript = async (txt) => {` and insert this useEffect BEFORE it (after the existing `const supported = !!SpeechRecognition;`):

```jsx
// Auto-start recording when launched via PWA shortcut ?voice=1
useEffect(() => {
    if (!supported) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('voice') === '1') {
        const t = setTimeout(() => {
            start();
            // Clean the URL so refresh doesn't re-trigger
            history.replaceState(null, '', window.location.pathname);
        }, 500);
        return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, [supported]);
```

You may need to add `useEffect` to the existing `import` from 'react' at the top.

- [ ] **Step 4: Build + commit**

```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
git add public/manifest.json src/components/voice/VoiceControl.jsx
git commit -m "feat(pwa): manifest shortcuts (voice/seating/dashboard) + ?voice=1 auto-start"
```

### Task 4.3: Daily cron — auto-close sales goals at 03:00 IL

**Files:**
- Modify: `apps/api/src/functions/load.ts`
- Modify: `apps/api/src/routes/cron.ts`

- [ ] **Step 1: Add cron at end of load.ts**

Open `apps/api/src/functions/load.ts`. At the very bottom (after the Auto-Tracker cron block), append:

```typescript
// === Sales-goal auto-close cron =============================================
// Lunch goals close at 18:00 IL of their shift_date.
// Dinner goals close at 03:00 IL of (shift_date + 1 day).
// Idempotent: only goals with status='active' or 'completed' are touched.
export async function runSalesAutoClose() {
  const now = new Date();
  const goals: any[] = await (db as any).salesGoal.findMany({
    where: { status: { in: ['active', 'completed'] } },
  });
  let closed = 0;
  for (const g of goals) {
    let closeTimeIso: string;
    if (g.shift_type === 'lunch') {
      closeTimeIso = `${g.shift_date}T18:00:00+03:00`;
    } else {
      const [y, m, d] = g.shift_date.split('-').map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      const nextStr = next.toISOString().slice(0, 10);
      closeTimeIso = `${nextStr}T03:00:00+03:00`;
    }
    if (now.getTime() < new Date(closeTimeIso).getTime()) continue;
    try {
      // Use the same close logic as the manual endpoint
      const events: any[] = await (db as any).saleEvent.findMany({
        where: { goal_id: g.id, undone_at: null },
      });
      const perWaiter = new Map<string, { id: string; name: string; count: number }>();
      for (const e of events) {
        const cur = perWaiter.get(e.waiter_id) || { id: e.waiter_id, name: e.waiter_name, count: 0 };
        cur.count++;
        perWaiter.set(e.waiter_id, cur);
      }
      const ranked = [...perWaiter.values()].sort((a, b) => b.count - a.count);
      await (db as any).salesGoal.update({
        where: { id: g.id },
        data: { status: 'closed', closed_at: now, closed_by_id: 'cron' },
      });
      if (ranked[0]) {
        try {
          await (db as any).employeeStory.create({
            data: {
              title: `👑 המוביל ב-${g.dish_label}`,
              content: `${ranked[0].name} עם ${ranked[0].count} מכירות (${events.length} סה״כ ${g.dish_label})`,
              author_id: 'cron',
              author_name: 'מערכת',
              published_at: now,
            },
          });
        } catch (err: any) { console.warn('[salesAutoClose] story failed:', err?.message); }
      }
      closed++;
    } catch (err: any) {
      console.warn('[salesAutoClose] close failed for', g.id, err?.message);
    }
  }
  return { scanned: goals.length, closed };
}

if (!(globalThis as any).__salesAutoCloseTimer) {
  (globalThis as any).__salesAutoCloseTimer = setTimeout(function loop() {
    void runSalesAutoClose()
      .then(r => { if (r.closed > 0) console.log('[salesAutoClose]', JSON.stringify(r)); })
      .catch(e => console.warn('[salesAutoClose] failed:', e?.message))
      .finally(() => {
        (globalThis as any).__salesAutoCloseTimer = setTimeout(loop, 30 * 60 * 1000);
      });
  }, 2 * 60 * 1000);
}
```

- [ ] **Step 2: Add cron route**

Open `apps/api/src/routes/cron.ts`. Add `runSalesAutoClose` to the import list. Add a new route:

```typescript
app.post('/sales-auto-close', async () => {
    return runSalesAutoClose();
});
```

- [ ] **Step 3: Typecheck + commit**

```
cd apps/api && npx tsc --noEmit && cd ../..
git add apps/api/src/functions/load.ts apps/api/src/routes/cron.ts
git commit -m "feat(sales-gamification): auto-close cron at 03:00 IL (lunch 18:00, dinner 03:00 next day)"
```

### Task 4.4: Weekly cron — assign personal goals every Sunday

**Files:**
- Modify: `apps/api/src/functions/load.ts`
- Modify: `apps/api/src/routes/cron.ts`

- [ ] **Step 1: Add `runWeeklyPersonalGoals` at the end of load.ts**

Append:

```typescript
// === Weekly personal goals cron =============================================
// Sunday 06:00 IL: for each active employee with sales role, compute last
// week's total sales count and create a new WeeklyPersonalGoal with
// target = last_week + 15% (rounded), reward_coins = 200.
// Idempotent per week_start_date.
export async function runWeeklyPersonalGoals() {
  const now = new Date();
  const ilDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short' }).format(now);
  const daysFromSun = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(ilDay);
  const sunday = new Date(now.getTime() - daysFromSun * 24 * 60 * 60 * 1000);
  const weekStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(sunday);
  const prevSunday = new Date(sunday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevWeekStart = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(prevSunday);

  const employees: any[] = await (db as any).employee.findMany({ where: { status: 'active' } });
  let created = 0, skipped = 0;
  const SALES_KEYWORDS = ['מלצר', 'ברמן', 'מארח', 'ראנר'];

  for (const emp of employees) {
    const role = String(emp.role || '');
    if (!SALES_KEYWORDS.some(k => role.includes(k))) continue;
    const existing = await (db as any).weeklyPersonalGoal.findFirst({
      where: { employee_id: emp.id, week_start_date: weekStart },
    });
    if (existing) { skipped++; continue; }
    // Count last week's events for this waiter
    const lastWeekStart = new Date(`${prevWeekStart}T00:00:00+03:00`);
    const thisWeekStart = new Date(`${weekStart}T00:00:00+03:00`);
    const prevCount = await (db as any).saleEvent.count({
      where: {
        waiter_id: emp.id,
        undone_at: null,
        createdAt: { gte: lastWeekStart, lt: thisWeekStart },
      },
    });
    const target = Math.max(5, Math.round(prevCount * 1.15));
    try {
      await (db as any).weeklyPersonalGoal.create({
        data: {
          employee_id: emp.id,
          employee_name: emp.full_name,
          week_start_date: weekStart,
          target,
          reward_coins: 200,
        },
      });
      created++;
    } catch (e: any) {
      console.warn('[weeklyPersonalGoals] create failed for', emp.id, e?.message);
    }
  }
  return { week_start: weekStart, created, skipped };
}

if (!(globalThis as any).__weeklyPersonalGoalTimer) {
  (globalThis as any).__weeklyPersonalGoalTimer = setTimeout(function loop() {
    void (async () => {
      try {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date());
        const day = parts.find(p => p.type === 'weekday')?.value;
        const hour = parts.find(p => p.type === 'hour')?.value;
        const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
        const lastRun = (globalThis as any).__weeklyPersonalGoalLastRun;
        if (day === 'Sun' && hour === '06' && lastRun !== dateStr) {
          (globalThis as any).__weeklyPersonalGoalLastRun = dateStr;
          const r = await runWeeklyPersonalGoals();
          console.log('[weeklyPersonalGoals]', JSON.stringify(r));
        }
      } catch (e: any) { console.warn('[weeklyPersonalGoals cron] failed:', e?.message); }
      (globalThis as any).__weeklyPersonalGoalTimer = setTimeout(loop, 30 * 60 * 1000);
    })();
  }, 3 * 60 * 1000);
}
```

- [ ] **Step 2: Add cron route**

Open `apps/api/src/routes/cron.ts`. Add `runWeeklyPersonalGoals` to the import. Add the route:

```typescript
app.post('/weekly-personal-goals', async () => {
    return runWeeklyPersonalGoals();
});
```

- [ ] **Step 3: Typecheck + commit + push**

```
cd apps/api && npx tsc --noEmit && cd ../..
git add apps/api/src/functions/load.ts apps/api/src/routes/cron.ts
git commit -m "feat(sales-gamification): weekly personal goal cron (Sun 06:00 IL, target = prev+15%)"
git push origin migration
```

Wait ~4 min for deploy. **Manual smoke:**
- Trigger weekly cron manually:
  ```
  curl -s -m 30 -X POST "https://topalena.com/api/cron/weekly-personal-goals?secret=$CRON_SECRET"
  ```
  (replace `$CRON_SECRET` with the real value from `.env`)
- Expected: `{"week_start":"...","created":N,"skipped":0}` first time.
- Check `WeeklyPersonalGoal` rows via Prisma Studio or your DB tool.

### Task 4.5: Install-app banner

**Files:**
- Create: `src/components/sales/InstallAppBanner.jsx`
- Modify: `src/Layout.jsx`

- [ ] **Step 1: Create the banner**

Create `src/components/sales/InstallAppBanner.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

const DISMISS_KEY = 'install_app_dismissed_until';

export default function InstallAppBanner() {
    const [promptEvent, setPromptEvent] = useState(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (Date.now() < dismissedUntil) return;
        const handler = (e) => {
            e.preventDefault();
            setPromptEvent(e);
            setShow(true);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const install = async () => {
        if (!promptEvent) return;
        promptEvent.prompt();
        await promptEvent.userChoice;
        setShow(false);
    };

    const dismiss = () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
        setShow(false);
    };

    if (!show) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[60] bg-white border-2 border-blue-300 rounded-2xl shadow-2xl p-3 max-w-xs" dir="rtl">
            <div className="flex items-start gap-2">
                <span className="text-2xl">📲</span>
                <div className="flex-1">
                    <p className="text-sm font-bold">התקן את עלינא במסך הבית</p>
                    <p className="text-xs text-gray-500 mt-1">קיצור דרך עם הקלטה מהירה ועוד</p>
                    <div className="flex gap-2 mt-2">
                        <Button size="sm" onClick={install}>התקן</Button>
                        <Button size="sm" variant="ghost" onClick={dismiss}>אחר כך</Button>
                    </div>
                </div>
                <Button size="sm" variant="ghost" onClick={dismiss}><X className="w-4 h-4" /></Button>
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Mount in Layout**

Open `src/Layout.jsx`. Find an existing import block of mounted components (e.g. `PopupManager`). Add:

```jsx
import InstallAppBanner from './components/sales/InstallAppBanner';
```

Find where `<PopupManager />` is rendered (search the JSX). Add `<InstallAppBanner />` right next to it.

- [ ] **Step 3: Build + commit**

```
npx vite build > b.txt 2>&1; echo "EXIT=$?"; tail -3 b.txt; rm b.txt
git add src/components/sales/InstallAppBanner.jsx src/Layout.jsx
git commit -m "feat(pwa): InstallAppBanner with 7-day dismiss persistence"
git push origin migration
```

**Phase 4 complete. Full feature live.**

---

## Final Verification (after Phase 4 deploys)

- [ ] **Phase 1 — Backend:** `/SalesGoalTemplates` shows 5 seeded rows. Endpoints respond with auth errors when called without token (proves routes registered).
- [ ] **Phase 2 — Supervisor:** Activate a goal as a supervisor, tap +1 on a waiter, verify CoinTransaction appears for that waiter (check `/GamificationCenter`).
- [ ] **Phase 3 — Employee surface:** As the credited waiter, refresh home, see your name on the leaderboard with the coins. Check RewardShowcase shows affordable rewards.
- [ ] **Phase 4 — Voice:** Say "תוסיף קינוח לרן" via the mic. Goal count should go up, waiter gets push.
- [ ] **Phase 4 — PWA:** On Android Chrome, long-press the app icon — verify "🎤 הקלטה מהירה" shortcut appears. Tap it → app opens with mic recording.
- [ ] **Phase 4 — Cron:** `curl -X POST` the two cron endpoints, verify they return JSON with reasonable counts.
- [ ] **Update PROJECT_BRIEF.md:** Mark "Sales Gamification Dashboard" as shipped, link to this plan and spec.

---

## Spec Coverage Self-Review

Every spec section is covered:

- **Data model (4 entities)** → Task 1.1 + 1.2.
- **Shift date resolution** → Task 1.3.
- **`activateSalesGoal`** → Task 1.5.
- **`creditSale`** with bonus + push + completion flip → Task 1.6.
- **`undoLastSale` + `closeSalesGoal`** + auto-Story → Task 1.7.
- **4 query endpoints** → Task 1.8.
- **Admin template page** → Task 1.9 + 1.10.
- **Role gating helpers** → Task 2.1.
- **ActivateGoalDialog** → Task 2.2.
- **ShiftSupervisorPanel** with +1 / undo / close → Task 2.3.
- **EmployeeHome integration (manager-only widget)** → Task 2.4.
- **SalesGoalsBanner** → Task 3.1.
- **ShiftLeaderboard** → Task 3.2.
- **RewardShowcase + CompactCoinWidget** → Task 3.3.
- **WeeklyPersonalGoal** → Task 3.4.
- **EmployeeHome integration (all roles)** → Task 3.5.
- **Voice intents (4)** → Task 4.1.
- **PWA shortcuts + ?voice=1** → Task 4.2.
- **Auto-close cron** → Task 4.3.
- **Weekly personal goal cron** → Task 4.4.
- **Install banner** → Task 4.5.

All endpoints/components referenced exist as concrete code in tasks. No placeholders. Method/field names are consistent: `creditSale`, `activateSalesGoal`, `goal.dish_label`, `goal.current_count`, `goal.target` used identically across backend, frontend, voice handlers.
