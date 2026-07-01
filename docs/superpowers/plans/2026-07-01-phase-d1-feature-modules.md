# Phase D1 — Feature Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each tenant a per-schema `ModuleSetting` table and a `/PlatformSettings` UI so a restaurant owner can turn optional modules on/off. Alena remains 100% unchanged (all modules default to enabled).

**Architecture:** A single source of truth (`MODULE_CATALOG` constant in `apps/api/src/lib/modules.ts`) lists every module with the pages it owns. Each tenant has its own copy of a per-tenant Prisma model `ModuleSetting(module_key, enabled)`. Backend function `getMyTenantModules` returns catalog + enabled state. Frontend hook `useTenantModules` caches the response and filters `Layout.jsx` sidebar entries and `PageGuard` routes accordingly. Toggle UI at `/PlatformSettings` writes back through `updateMyTenantModule`.

**Tech Stack:** Prisma (per-tenant schema), Fastify + `registerFn` backend, React + Vite frontend, `localStorage` cache, existing `base44` client shim.

**Spec:** `docs/superpowers/specs/2026-07-01-per-tenant-platform-design.md` (section 5.1)

---

## File Structure Summary

**Create:**
- `apps/api/src/lib/modules.ts` — `MODULE_CATALOG` constant + `getModuleForPage()` helper. Source of truth.
- `src/hooks/useTenantModules.js` — React hook with 5-min localStorage cache.
- `src/pages/PlatformSettings.jsx` — toggle grid page.
- `src/components/platform/ModuleToggleGrid.jsx` — reusable toggle UI grouped by category.

**Modify:**
- `apps/api/prisma/schema.prisma` — add `ModuleSetting` model.
- `apps/api/src/functions/load.ts` — register `getMyTenantModules`, `updateMyTenantModule`, `seedMyTenantModules`.
- `src/Layout.jsx` — filter sidebar entries by enabled modules.
- `src/components/shared/PageGuard.jsx` — redirect to `/Dashboard` if module for current page is disabled.
- `src/pages.config.js` — add `PlatformSettings` import + PAGES entry.

**Untouched (verify no regression):**
- `apps/api/src/routes/entities.ts` — no change.
- `apps/api/src/routes/publicFunctions.ts` — no change.
- All existing pages and backend functions — no change.

---

## Task 1: Add `ModuleSetting` model to Prisma schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma` — append at end of file

- [ ] **Step 1: Add the model definition**

Open `apps/api/prisma/schema.prisma` and append the following at the bottom (after the last existing `model`):

```prisma
model ModuleSetting {
  id          String   @id @default(cuid())
  module_key  String   @unique
  enabled     Boolean  @default(true)
  enabled_at  DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Note: this model lives in each tenant's own schema (per the CLAUDE.md architecture — Prisma models are all per-tenant). No `tenant_id` column needed — the schema selection at the DB connection is the tenant scope.

- [ ] **Step 2: Regenerate the Prisma client locally**

Run:
```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx prisma generate
```

Expected: `✔ Generated Prisma Client (v.X.X.X) to ./node_modules/@prisma/client`.

- [ ] **Step 3: Type-check to confirm no downstream breakage**

Run:
```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc --noEmit
```

Expected: no new errors. Existing warnings (if any) unchanged.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add apps/api/prisma/schema.prisma
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): add ModuleSetting model for per-tenant module toggles"
```

---

## Task 2: Create `MODULE_CATALOG` — the source of truth

**Files:**
- Create: `apps/api/src/lib/modules.ts`

- [ ] **Step 1: Create the catalog file**

Create `apps/api/src/lib/modules.ts` with the following content:

```typescript
// Catalog of every toggleable module.
// This is the SINGLE SOURCE OF TRUTH — the frontend consumes this via
// getMyTenantModules(). Do not duplicate module keys or page mappings elsewhere.
//
// Rules:
//  - `core: true` → cannot be disabled. Modules the app depends on structurally.
//  - `core: false` → optional, tenant can turn off in /PlatformSettings.
//  - `pages` → array of page names as they appear in src/pages.config.js.
//    A page not listed in any module is considered "core / always visible".

export type ModuleCategory = 'core' | 'operations' | 'customer' | 'ai' | 'advanced';

export interface ModuleDef {
  key: string;
  name_he: string;
  description_he: string;
  category: ModuleCategory;
  icon: string;         // lucide-react icon name
  core: boolean;
  pages: string[];
}

export const MODULE_CATALOG: ModuleDef[] = [
  // ── CORE (cannot be disabled) ─────────────────────────────────────────
  {
    key: 'dashboard',
    name_he: 'לוח בקרה',
    description_he: 'המסך הראשי של המסעדה — סיכום היום, הזמנות, הכנסות, התראות.',
    category: 'core',
    icon: 'LayoutDashboard',
    core: true,
    pages: ['Dashboard'],
  },
  {
    key: 'employees',
    name_he: 'ניהול עובדים',
    description_he: 'רשימת עובדים, פרטים אישיים, ביצועים, הרשאות.',
    category: 'core',
    icon: 'Users',
    core: true,
    pages: ['Employees', 'EmployeeDetails', 'EmployeesHub', 'EmployeeReports', 'EmployeeHome', 'EmployeeFeedback', 'MyPerformance'],
  },
  {
    key: 'work_scheduling',
    name_he: 'סידור עבודה',
    description_he: 'תכנון משמרות, שיבוץ עובדים, חילופי משמרות.',
    category: 'core',
    icon: 'Calendar',
    core: true,
    pages: ['WorkScheduling', 'MySchedule', 'AvailabilityForm', 'AvailabilityRequests', 'AvailabilityFormSettings', 'LeaveRequests', 'ShiftChat', 'ShiftEndReport', 'ShiftEndReportDetails'],
  },
  {
    key: 'suppliers',
    name_he: 'ספקים',
    description_he: 'ניהול ספקים, הזמנות, חוזים.',
    category: 'core',
    icon: 'Truck',
    core: true,
    pages: ['Suppliers', 'SupplierDetails'],
  },
  {
    key: 'invoices',
    name_he: 'חשבוניות',
    description_he: 'סריקת חשבוניות, ניהול הוצאות.',
    category: 'core',
    icon: 'FileText',
    core: true,
    pages: ['Invoices', 'InvoiceDetails'],
  },
  {
    key: 'inventory',
    name_he: 'מלאי',
    description_he: 'ניהול מלאי, התראות מלאי נמוך, מתכונים.',
    category: 'core',
    icon: 'Package',
    core: true,
    pages: ['Recipes'],
  },

  // ── OPERATIONS (optional) ─────────────────────────────────────────────
  {
    key: 'reservations',
    name_he: 'הזמנת מקומות',
    description_he: 'ניהול הזמנות שולחנות, ישיבה, טופס הזמנה ציבורי.',
    category: 'operations',
    icon: 'BookOpen',
    core: false,
    pages: ['ReservationView', 'PublicReservationSettings', 'SeatingSetup', 'TablesManagement', 'DepositSettings'],
  },
  {
    key: 'queue',
    name_he: 'תור וירטואלי',
    description_he: 'ניהול תור לקוחות בכניסה למסעדה, משחקי המתנה, ביקורות.',
    category: 'operations',
    icon: 'Users',
    core: false,
    pages: ['QueueHub', 'QueueDashboard', 'QueueAnalytics', 'QueueHistory', 'GamesAdmin', 'GameQuestionsAdmin'],
  },
  {
    key: 'delivery',
    name_he: 'משלוחים',
    description_he: 'ניהול משלוחים, נהגים, מעקב אחר משלוח.',
    category: 'operations',
    icon: 'Bike',
    core: false,
    pages: ['Deliveries', 'DeliveriesHub', 'Couriers', 'CourierDashboard', 'CourierTracking', 'DeliveryCustomerClub'],
  },
  {
    key: 'events',
    name_he: 'אירועים פרטיים',
    description_he: 'לידים לאירועים, חוזי אירועים, ניהול ספקים לאירועים, ערכת מכירה.',
    category: 'operations',
    icon: 'PartyPopper',
    core: false,
    pages: ['EventsHub', 'EventsInquiry', 'EventsPayment', 'EventsPrivate', 'EventsSalesKit', 'EventContracts', 'EventContractSign', 'EventVendorCampaign', 'EventVendorDetails'],
  },
  {
    key: 'restroom_cleaning',
    name_he: 'ניקיון שירותים',
    description_he: 'תזכורות ניקיון שעתיות לצוות עם תמונת אישור.',
    category: 'operations',
    icon: 'Sparkles',
    core: false,
    pages: ['RestroomCleaning'],
  },
  {
    key: 'checklists',
    name_he: 'צ׳ק-ליסטים',
    description_he: 'משימות פתיחה/סגירה יומיות, ביקורת ביצוע.',
    category: 'operations',
    icon: 'ListChecks',
    core: false,
    pages: ['Checklists', 'UploadChecklists'],
  },
  {
    key: 'waiter',
    name_he: 'אפליקציית מלצר',
    description_he: 'ממשק מלצר בטבלט, שולחנות, הזמנות.',
    category: 'operations',
    icon: 'ConciergeBell',
    core: false,
    pages: ['Waiter', 'WaiterAdmin', 'WaiterTables'],
  },
  {
    key: 'kitchen_screen',
    name_he: 'מסך מטבח',
    description_he: 'תצוגה למסך מטבח לצוות הכנת האוכל.',
    category: 'operations',
    icon: 'ChefHat',
    core: false,
    pages: ['KitchenScreen'],
  },

  // ── CUSTOMER (optional) ────────────────────────────────────────────────
  {
    key: 'customer_club',
    name_he: 'מועדון לקוחות',
    description_he: 'לקוחות רשומים, הטבות, גמיפיקציה, מסרים ממוקדים.',
    category: 'customer',
    icon: 'HeartHandshake',
    core: false,
    pages: ['CustomerClub', 'CustomerDetails', 'CustomerSurvey', 'CustomerSurveys', 'SurveyQRCodes', 'GamificationCenter', 'Leaderboard', 'DailyChallenge'],
  },
  {
    key: 'gamification',
    name_he: 'גמיפיקציה לעובדים',
    description_he: 'הישגים, מטבעות, טבלת מובילים, אתגרים לצוות.',
    category: 'customer',
    icon: 'Trophy',
    core: false,
    pages: ['GamificationAdmin'],
  },

  // ── AI (optional) ──────────────────────────────────────────────────────
  {
    key: 'ai_assistant',
    name_he: 'עוזר AI (סוכן הבעלים)',
    description_he: 'צ׳אט AI לבעלים, סריקת מסמכים, ידע פרטני של המסעדה.',
    category: 'ai',
    icon: 'Bot',
    core: false,
    pages: ['AIHub', 'AiDashboard'],
  },
  {
    key: 'ceo_agent',
    name_he: 'CEO Agent (23 סוכנים)',
    description_he: 'מערכת סוכנים אוטונומית — Marketing, Events, CFO וכו׳.',
    category: 'ai',
    icon: 'Brain',
    core: false,
    pages: ['AgentInbox', 'AgentPrompts'],
  },
  {
    key: 'marketing_advisor',
    name_he: 'יועץ שיווק AI',
    description_he: 'תוכנית שיווק חודשית מוגדרת AI, משימות שיווק, מעקב יעדים.',
    category: 'ai',
    icon: 'Megaphone',
    core: false,
    pages: ['MarketingAdvisor', 'MarketingHub', 'MarketingCampaigns', 'MarketingAgentsHub', 'MarketingDashboard'],
  },
  {
    key: 'stories',
    name_he: 'סטוריז אינסטגרם',
    description_he: 'סטודיו סטוריז, אנליטיקה, לוח מובילים.',
    category: 'ai',
    icon: 'Instagram',
    core: false,
    pages: ['StoriesHub', 'StoriesArchive', 'StoriesAnalytics', 'StoriesLeaderboard', 'StoriesNotifications', 'InstagramStudio'],
  },

  // ── ADVANCED (optional) ────────────────────────────────────────────────
  {
    key: 'recruitment',
    name_he: 'גיוס וראיונות',
    description_he: 'הגשת מועמדות, ראיונות, הכשרה, שלבי קליטה.',
    category: 'advanced',
    icon: 'UserPlus',
    core: false,
    pages: ['RecruitmentHub', 'RecruitmentInterviews', 'InterviewSettings', 'JobApplication', 'Training', 'TrainingVideos'],
  },
  {
    key: 'financial',
    name_he: 'פיננסי מתקדם',
    description_he: 'תזרים מזומנים, יעדי מכירה, תחזיות הכנסה, יעדים חודשיים.',
    category: 'advanced',
    icon: 'TrendingUp',
    core: false,
    pages: ['CashFlow', 'RevenueForecasting', 'SalesGoalTemplates', 'AccountantExportView', 'DataExport', 'SmartPrediction', 'Tips', 'TipReportDetails', 'Reports'],
  },
];

/**
 * Given a page name (e.g. "QueueDashboard"), return the module that owns it,
 * or null if the page is core (not attached to any toggleable module).
 */
export function getModuleForPage(pageName: string): ModuleDef | null {
  for (const m of MODULE_CATALOG) {
    if (m.pages.includes(pageName)) return m;
  }
  return null;
}

/**
 * Read the tenant's current ModuleSetting rows and merge with the catalog:
 * modules explicitly set to disabled=false are off; everything else defaults on.
 */
export async function getEnabledModuleKeys(prisma: any): Promise<Set<string>> {
  const rows: { module_key: string; enabled: boolean }[] =
    await prisma.moduleSetting.findMany({ select: { module_key: true, enabled: true } });
  const disabled = new Set(rows.filter(r => !r.enabled).map(r => r.module_key));
  return new Set(MODULE_CATALOG.filter(m => m.core || !disabled.has(m.key)).map(m => m.key));
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add apps/api/src/lib/modules.ts
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): add MODULE_CATALOG source of truth"
```

---

## Task 3: Register `getMyTenantModules` backend function

**Files:**
- Modify: `apps/api/src/functions/load.ts` — append near the end of file (before final export if any)

- [ ] **Step 1: Add the import at the top of load.ts**

Find the imports section near the top of `apps/api/src/functions/load.ts` (around line 1-50). Add this import next to the other `../lib/` imports:

```typescript
import { MODULE_CATALOG, getModuleForPage } from '../lib/modules.js';
```

- [ ] **Step 2: Register the function**

Append this block near the end of `load.ts` (find the section for tenant/platform functions — after `getMyOnboardingStatus`, or at the very end):

```typescript
// ── D1: Feature Modules ────────────────────────────────────────────────
//
// Returns the full MODULE_CATALOG merged with the tenant's ModuleSetting rows.
// Every module has an `enabled` boolean. Core modules are always enabled.
// Missing ModuleSetting row → enabled=true (safe default).
registerFn('getMyTenantModules', async ({ user }) => {
  if (!user?.id) throw new Error('unauthorized');
  const rows = await prisma.moduleSetting.findMany({
    select: { module_key: true, enabled: true },
  });
  const settingByKey = new Map(rows.map(r => [r.module_key, r.enabled]));
  const modules = MODULE_CATALOG.map(m => ({
    key: m.key,
    name_he: m.name_he,
    description_he: m.description_he,
    category: m.category,
    icon: m.icon,
    core: m.core,
    pages: m.pages,
    enabled: m.core ? true : (settingByKey.get(m.key) ?? true),
  }));
  return { modules };
});
```

- [ ] **Step 3: Type-check**

```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add apps/api/src/functions/load.ts
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): register getMyTenantModules"
```

---

## Task 4: Register `updateMyTenantModule` backend function

**Files:**
- Modify: `apps/api/src/functions/load.ts` — add below `getMyTenantModules`

- [ ] **Step 1: Find the `isAdmin` helper**

Grep for the existing admin gate to make sure we use the same helper:

```bash
grep -n "isAdmin\|assertAdmin" /c/Users/97253/top-alena-migration/apps/api/src/functions/load.ts | head -10
```

Expected: an existing helper like `isAdmin(user)` or `assertAdmin(user)`. Use whichever is already in use for admin-only backend fns.

- [ ] **Step 2: Register the function**

Append this block below `getMyTenantModules`:

```typescript
// Owner/admin only. Toggles a single module for this tenant.
// Core modules cannot be toggled — the function throws for them.
registerFn('updateMyTenantModule', async ({ user, body }) => {
  if (!user?.id) throw new Error('unauthorized');
  if (!isAdmin(user)) throw new Error('admin only');
  const b = (body || {}) as any;
  const module_key = String(b.module_key || '');
  const enabled = !!b.enabled;
  if (!module_key) throw new Error('module_key required');
  const def = MODULE_CATALOG.find(m => m.key === module_key);
  if (!def) throw new Error('unknown module');
  if (def.core) throw new Error('core module cannot be toggled');
  await prisma.moduleSetting.upsert({
    where: { module_key },
    update: { enabled, enabled_at: new Date() },
    create: { module_key, enabled, enabled_at: new Date() },
  });
  return { ok: true, module_key, enabled };
});
```

(If the existing admin helper is named differently — e.g. `isOwner`, `assertOwner` — substitute the correct name.)

- [ ] **Step 3: Type-check**

```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add apps/api/src/functions/load.ts
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): register updateMyTenantModule"
```

---

## Task 5: Create `useTenantModules` React hook

**Files:**
- Create: `src/hooks/useTenantModules.js`

- [ ] **Step 1: Verify `src/hooks/` exists (or create it)**

```bash
ls /c/Users/97253/top-alena-migration/src/hooks/ 2>/dev/null || mkdir -p /c/Users/97253/top-alena-migration/src/hooks
```

- [ ] **Step 2: Create the hook**

Create `src/hooks/useTenantModules.js`:

```javascript
import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const CACHE_KEY = 'tenant_modules_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.data)) return null;
    if (Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* localStorage full or blocked — ignore */
  }
}

/**
 * Loads the tenant's module catalog + enabled state.
 * Cached in localStorage for 5 minutes to avoid a network call on every page.
 *
 * Returns:
 *   modules      — array of { key, name_he, ..., enabled }, or null while loading
 *   loading      — true until first response returns
 *   isEnabled(k) — cheap lookup. Unknown key → true (safe default).
 *   pageEnabled(pageName) — true if the page's owning module is enabled, or
 *                           the page is core (unassigned).
 *   refresh()    — force a network reload + cache write.
 */
export function useTenantModules() {
  const cached = readCache();
  const [modules, setModules] = useState(cached);
  const [loading, setLoading] = useState(!cached);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.getMyTenantModules({});
      const data = (res?.data || res)?.modules || [];
      setModules(data);
      writeCache(data);
    } catch (e) {
      console.error('[useTenantModules] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isEnabled = useCallback(
    (key) => {
      if (!modules) return true;
      const m = modules.find((x) => x.key === key);
      return m ? m.enabled : true;
    },
    [modules],
  );

  const pageEnabled = useCallback(
    (pageName) => {
      if (!modules) return true;
      const m = modules.find((x) => Array.isArray(x.pages) && x.pages.includes(pageName));
      if (!m) return true; // page not attached to any module = core
      return m.enabled;
    },
    [modules],
  );

  return { modules, loading, isEnabled, pageEnabled, refresh: load };
}
```

- [ ] **Step 3: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add src/hooks/useTenantModules.js
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): useTenantModules hook with 5min localStorage cache"
```

---

## Task 6: Filter sidebar in `Layout.jsx`

**Files:**
- Modify: `src/Layout.jsx`

- [ ] **Step 1: Read the sidebar-building code**

Read lines 200-350 of `src/Layout.jsx` to understand where sidebar entries are assembled (categories, POSITION_SIDEBAR, etc.):

```bash
sed -n '200,350p' /c/Users/97253/top-alena-migration/src/Layout.jsx
```

Identify the array-building point where each sidebar entry has a `page` or `pageName` property.

- [ ] **Step 2: Import the hook at the top**

Add near the other hook imports at the top of `Layout.jsx`:

```javascript
import { useTenantModules } from '@/hooks/useTenantModules';
```

- [ ] **Step 3: Use the hook inside the Layout component**

Inside the main `Layout` component function, near the other `useState`/`useEffect` calls, add:

```javascript
const { pageEnabled } = useTenantModules();
```

- [ ] **Step 4: Filter each sidebar entry**

Find the sidebar-entries array assembly. For each place that maps entries into JSX (or into a flat entries list), wrap the entry filter with `pageEnabled`:

```javascript
// Example pattern — apply wherever sidebar entries are produced:
const filteredEntries = entries.filter(e => pageEnabled(e.page || e.pageName));
```

If the sidebar renders in multiple sections (categories), filter each section's items individually. Category headers that have zero items after filtering should also be hidden — add:

```javascript
// only render category if at least one entry survives the filter
if (filteredEntries.length === 0) return null;
```

- [ ] **Step 5: Preserve behavior for department-manager overrides**

The `POSITION_SIDEBAR` and department-manager overrides (documented in CLAUDE.md §7) must still work. They are per-role, not per-module. Rule: apply the module filter AFTER the role filter. A page that belongs to a disabled module never appears, regardless of role.

- [ ] **Step 6: Build the frontend to verify**

```bash
cd /c/Users/97253/top-alena-migration && timeout 280 npx vite build
```

Expected: build succeeds, no new errors related to `useTenantModules`.

- [ ] **Step 7: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add src/Layout.jsx
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): filter sidebar by enabled modules in Layout"
```

---

## Task 7: Add module check to `PageGuard`

**Files:**
- Modify: `src/components/shared/PageGuard.jsx`

- [ ] **Step 1: Read the guard's current signature**

```bash
sed -n '1,80p' /c/Users/97253/top-alena-migration/src/components/shared/PageGuard.jsx
```

Identify how the guard determines the current page name (probably from `useLocation` + `createPageUrl` or similar).

- [ ] **Step 2: Import the hook**

Add at the top:

```javascript
import { useTenantModules } from '@/hooks/useTenantModules';
import { useNavigate, useLocation } from 'react-router-dom';
```

(If `useNavigate`/`useLocation` are already imported, skip that line.)

- [ ] **Step 3: Add the module check**

Inside the `PageGuard` component, after existing role checks (or at the top of the function if role checks come from props), add:

```javascript
const { pageEnabled, loading: modulesLoading } = useTenantModules();
const location = useLocation();
const navigate = useNavigate();

// Extract the current page name from the URL. The path is like "/QueueDashboard".
const currentPage = location.pathname.replace(/^\/+/, '').split('/')[0];

useEffect(() => {
  if (modulesLoading) return;
  if (!currentPage) return;
  if (currentPage === 'Dashboard' || currentPage === 'PlatformSettings') return;
  if (!pageEnabled(currentPage)) {
    navigate('/Dashboard', {
      replace: true,
      state: { moduleDisabled: currentPage },
    });
  }
}, [currentPage, modulesLoading, pageEnabled, navigate]);
```

- [ ] **Step 4: Optional — show a toast on Dashboard when arriving after a redirect**

If the codebase uses a toast library (check for `import { toast } from ...` in another page), add a small effect in `Dashboard.jsx`:

```javascript
import { useLocation } from 'react-router-dom';
// ... inside Dashboard component:
const location = useLocation();
useEffect(() => {
  const disabled = location.state?.moduleDisabled;
  if (disabled) {
    // toast(`המודול '${disabled}' מכובה. אפשר להפעיל ב-Platform Settings`);
    // If no toast library — use console.warn or a simple alert.
    console.warn('Module disabled redirect:', disabled);
  }
}, [location.state]);
```

If no toast library is used elsewhere, skip this step — the redirect alone is sufficient.

- [ ] **Step 5: Build**

```bash
cd /c/Users/97253/top-alena-migration && timeout 280 npx vite build
```

Expected: build passes.

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add src/components/shared/PageGuard.jsx src/pages/Dashboard.jsx
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): PageGuard redirects disabled-module pages to Dashboard"
```

---

## Task 8: Create `ModuleToggleGrid` component

**Files:**
- Create: `src/components/platform/ModuleToggleGrid.jsx`

- [ ] **Step 1: Verify parent directory**

```bash
mkdir -p /c/Users/97253/top-alena-migration/src/components/platform
```

- [ ] **Step 2: Create the component**

Create `src/components/platform/ModuleToggleGrid.jsx`:

```javascript
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import * as Icons from 'lucide-react';

const CATEGORY_LABELS = {
  core: 'ליבה',
  operations: 'תפעול',
  customer: 'לקוחות',
  ai: 'AI ואוטומציה',
  advanced: 'מתקדם',
};

const CATEGORY_ORDER = ['core', 'operations', 'customer', 'ai', 'advanced'];

function ModuleCard({ mod, onToggle, saving }) {
  const Icon = Icons[mod.icon] || Icons.Box;
  return (
    <Card className={mod.core ? 'opacity-70' : ''}>
      <CardContent className="p-4 flex items-start gap-3">
        <Icon className="w-6 h-6 text-slate-600 shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold text-sm">{mod.name_he}</div>
            {mod.core && <Badge variant="secondary" className="text-xs">חובה</Badge>}
          </div>
          <div className="text-xs text-slate-500 mt-1">{mod.description_he}</div>
        </div>
        <Switch
          checked={mod.enabled}
          disabled={mod.core || saving}
          onCheckedChange={(v) => onToggle(mod.key, v)}
        />
      </CardContent>
    </Card>
  );
}

export default function ModuleToggleGrid({ modules, onToggle, savingKey }) {
  if (!modules) return null;
  const byCat = {};
  for (const m of modules) {
    if (!byCat[m.category]) byCat[m.category] = [];
    byCat[m.category].push(m);
  }
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.filter((c) => byCat[c]?.length).map((cat) => (
        <div key={cat}>
          <h2 className="text-lg font-bold mb-2 text-slate-700">{CATEGORY_LABELS[cat]}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {byCat[cat].map((m) => (
              <ModuleCard
                key={m.key}
                mod={m}
                onToggle={onToggle}
                saving={savingKey === m.key}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify the Switch component exists**

```bash
ls /c/Users/97253/top-alena-migration/src/components/ui/switch.* 2>/dev/null
```

If the file does not exist, the shadcn Switch primitive is missing. Add it by running:

```bash
cd /c/Users/97253/top-alena-migration && npx shadcn@latest add switch --yes 2>/dev/null || \
  echo "shadcn add failed — copy manually from https://ui.shadcn.com/docs/components/switch"
```

If neither works, replace the `<Switch>` element with a plain `<input type="checkbox">` styled with Tailwind — the grid still works.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add src/components/platform/ModuleToggleGrid.jsx src/components/ui/switch.jsx
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): ModuleToggleGrid component"
```

(Include `switch.jsx` in the add only if it was newly created.)

---

## Task 9: Create `/PlatformSettings` page

**Files:**
- Create: `src/pages/PlatformSettings.jsx`

- [ ] **Step 1: Create the page**

Create `src/pages/PlatformSettings.jsx`:

```javascript
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Settings2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import ModuleToggleGrid from '../components/platform/ModuleToggleGrid';
import { useTenantModules } from '@/hooks/useTenantModules';

function PlatformSettingsInner() {
  const { modules, loading, refresh } = useTenantModules();
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState(null);

  const handleToggle = async (module_key, enabled) => {
    setSavingKey(module_key);
    setError(null);
    try {
      await base44.functions.updateMyTenantModule({ module_key, enabled });
      await refresh();
    } catch (e) {
      setError(e?.message || 'שגיאה בעדכון');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto" dir="rtl">
      <div className="bg-gradient-to-l from-slate-700 to-slate-900 text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <Settings2 className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">הגדרות פלטפורמה</h1>
            <p className="text-sm text-white/80 mt-1">
              בחר אילו מודולים להפעיל במסעדה שלך. מודולי ליבה תמיד פעילים ולא ניתנים לכיבוי.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="p-4 text-red-700 text-sm">{error}</CardContent>
        </Card>
      )}

      {loading || !modules ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <ModuleToggleGrid modules={modules} onToggle={handleToggle} savingKey={savingKey} />
      )}

      <div className="text-xs text-slate-400 pt-4">
        השינויים נכנסים לתוקף מיד. הסייד-בר יתעדכן בטעינה הבאה של הדף (עד 5 דקות).
      </div>
    </div>
  );
}

export default function PlatformSettings() {
  return (
    <PageGuard adminOnly>
      <PlatformSettingsInner />
    </PageGuard>
  );
}
```

- [ ] **Step 2: If `PageGuard` does not accept an `adminOnly` prop**

Check by opening `src/components/shared/PageGuard.jsx` and looking for prop handling. If it does not, the simplest fix is to inline the admin check:

```javascript
// Replace the wrapper with:
export default function PlatformSettings() {
  const user = /* however user is fetched — check other admin-only pages for the pattern */;
  if (!user?.is_admin && user?.role !== 'admin') {
    return <div className="p-6 text-center text-slate-500">גישה למנהלים בלבד</div>;
  }
  return (
    <PageGuard>
      <PlatformSettingsInner />
    </PageGuard>
  );
}
```

Match whatever admin-gating pattern other pages like `AdminSettings.jsx` use.

- [ ] **Step 3: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add src/pages/PlatformSettings.jsx
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): PlatformSettings page — module toggle UI"
```

---

## Task 10: Register `PlatformSettings` in `pages.config.js` and add sidebar entry

**Files:**
- Modify: `src/pages.config.js`
- Modify: `src/Layout.jsx` — add sidebar entry

- [ ] **Step 1: Add import and PAGES entry**

Open `src/pages.config.js`. In the alphabetical import block near the top, add:

```javascript
import PlatformSettings from './pages/PlatformSettings';
```

In the `PAGES` object, add:

```javascript
"PlatformSettings": PlatformSettings,
```

Keep the existing order style (alphabetical or whatever the file uses).

- [ ] **Step 2: Add sidebar entry**

In `Layout.jsx`, find the section that assembles the "אדמין" / "ניהול" category entries (grep for `AdminSettings` — the new entry belongs next to it):

```bash
grep -n "AdminSettings" /c/Users/97253/top-alena-migration/src/Layout.jsx
```

Add a new entry there:

```javascript
{
  title: 'הגדרות פלטפורמה',
  page: 'PlatformSettings',
  icon: 'Settings2',
  adminOnly: true,
},
```

Match the exact object shape the existing entries use (property names may differ — e.g. `url`, `name`, `iconName`).

- [ ] **Step 3: Build**

```bash
cd /c/Users/97253/top-alena-migration && timeout 280 npx vite build
```

Expected: build succeeds. If Vite complains about `Settings2` icon not existing, use `Settings` (the older icon name).

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/97253/top-alena-migration add src/pages.config.js src/Layout.jsx
git -C /c/Users/97253/top-alena-migration commit -m "feat(d1): register PlatformSettings page + sidebar entry"
```

---

## Task 11: Local smoke test (Alena + Miha simulation)

**Files:** (none — verification only)

- [ ] **Step 1: Local build sanity**

```bash
cd /c/Users/97253/top-alena-migration && timeout 280 npx vite build
```

Expected: `dist/` regenerates, no errors.

- [ ] **Step 2: Stage `dist/` for commit**

Per CLAUDE.md §9, `dist/` is committed (the server does not build). Stage it:

```bash
git -C /c/Users/97253/top-alena-migration add dist
```

- [ ] **Step 3: Backend type-check**

```bash
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Read-only sanity check — search for any accidental reference to removed things**

```bash
grep -rn "moduleSetting" /c/Users/97253/top-alena-migration/src /c/Users/97253/top-alena-migration/apps/api/src 2>/dev/null | head
```

Expected: only the files we created/modified in this plan. Nothing else.

- [ ] **Step 5: Commit the dist bundle**

```bash
git -C /c/Users/97253/top-alena-migration commit -m "build(d1): rebuild dist with feature modules"
```

---

## Task 12: Deploy — push, verify, confirm Alena is unaffected

**Files:** (none — deployment only)

- [ ] **Step 1: Push to origin**

```bash
git -C /c/Users/97253/top-alena-migration push origin migration
```

The server auto-deploys within ~2 minutes.

- [ ] **Step 2: Wait for the deploy to land**

Wait ~2 minutes, then verify the API is up:

```bash
curl -s -m 10 -X POST https://topalena.com/api/public/fn/deployInfo -H "Content-Type: application/json" -d '{}'
```

Expected: a JSON response with a `sha` field matching the commit SHA you just pushed.

- [ ] **Step 3: Confirm the Prisma schema was applied**

The API container's CMD is `prisma db push --skip-generate` before starting Node. Verify the new table exists in Alena's schema by opening `https://topalena.com/PlatformSettings` while logged in as Dvir:

Expected: page loads. All modules show as "enabled". No modules toggled off.

- [ ] **Step 4: Alena smoke test — the critical check**

Log in as Dvir and click through the following pages. **Every one must load and look identical to before D1:**

1. `/Dashboard`
2. `/Employees`
3. `/WorkScheduling`
4. `/Reservations` (via `ReservationView`)
5. `/QueueDashboard`
6. `/MarketingAdvisor`
7. `/AgentInbox`

If any page throws or renders differently: `git revert HEAD~1..HEAD && git push` immediately, then diagnose from the browser console.

- [ ] **Step 5: Miha smoke test**

Log in to `https://miha.topalena.com/PlatformSettings` (or use the impersonate button from `/PlatformAdmin`). Toggle OFF the "events" module. Verify:

- The "אירועים פרטיים" sidebar category disappears within one page refresh.
- Navigating directly to `/EventsHub` redirects to `/Dashboard`.
- Turning "events" back ON restores the sidebar entry after a refresh.

- [ ] **Step 6: Announce completion in memory**

Update the auto-memory file `project_topalena_architecture.md` (in `C:\Users\97253\.claude\projects\C--Users-97253-TOP-ALENA\memory\`) with one line:

```markdown
- D1 Feature Modules shipped 2026-07-01. `ModuleSetting` per tenant, `/PlatformSettings` toggle UI, sidebar filter in Layout.jsx. Alena defaults to all-enabled.
```

- [ ] **Step 7: Final commit of any last dist artifacts**

If any `dist/` regeneration was needed between steps, ensure it's committed:

```bash
git -C /c/Users/97253/top-alena-migration status
```

If clean → done. If dirty → add + commit + push.

---

## Self-Review (author's fresh-eyes pass)

**1. Spec coverage** — every requirement from spec §5.1 has a task:
- Data model (`TenantModule` — implemented as `ModuleSetting` in this plan, name simplified because it lives per-tenant so no `tenant_id` needed) → Task 1 ✓
- `MODULE_CATALOG` → Task 2 ✓
- `getMyTenantModules` → Task 3 ✓
- `updateMyTenantModule` → Task 4 ✓
- Frontend hook → Task 5 ✓
- Sidebar filtering → Task 6 ✓
- PageGuard integration → Task 7 ✓
- Toggle UI grid → Task 8 ✓
- `/PlatformSettings` page → Task 9 ✓
- Sidebar entry + `pages.config.js` registration → Task 10 ✓
- Alena unchanged verification → Task 11-12 ✓

**2. Placeholder scan** — grepped the plan for TBD/TODO/"implement later"/"handle edge cases":
- Task 4 says "If the existing admin helper is named differently — e.g. `isOwner` — substitute the correct name" — this is a real ambiguity because the codebase's admin helper name was not verified. Acceptable because the plan tells the engineer to grep for it.
- Task 8 Step 3 says "If neither works, replace the `<Switch>` element with a plain `<input type="checkbox">`" — real fallback path, not a placeholder.
- No other placeholders found.

**3. Type consistency** — the model is named `ModuleSetting` in the Prisma schema (Task 1) and referenced as `prisma.moduleSetting` (Prisma's default lowercased-first-letter access) consistently in Tasks 3, 4. The frontend uses `useTenantModules` consistently in Tasks 5, 6, 7, 9. `MODULE_CATALOG` exports `getModuleForPage` — only used inside the API in Task 2's own file (the frontend uses `pageEnabled` from the hook, which encapsulates it).

**4. Naming decision worth flagging** — the spec called the model `TenantModule`. The plan renamed to `ModuleSetting` because the model lives in each tenant's own Postgres schema, making the `tenant_` prefix redundant. The pattern matches `RestaurantProfile` (also per-tenant, no prefix). This is a design refinement, not a spec deviation.

---

## Notes for the executing engineer

- Read `docs/superpowers/specs/2026-07-01-per-tenant-platform-design.md` §5.1 first — it explains WHY each piece is shaped the way it is.
- Read the migration repo's `CLAUDE.md` sections 4.1–4.11 before touching backend code. Especially §4.1 (base44 client shim), §4.7 (Prisma `db push` auto-applies), §4.9 (public function whitelist — this feature is NOT public, so do not add to it).
- Do not push code and then tell the user to deploy — auto-deploy runs on `git push origin migration`.
- When in doubt about which admin helper to use in Task 4, grep for one of the existing admin-only functions like `assertCeoAdmin` — that function's signature is your template.
