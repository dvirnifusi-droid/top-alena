# Employee Pay Model + Salary Privacy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store each employee's pay (hourly/monthly/tips + optional employer cost) in an isolated table, entered in the employee card, with department-scoped privacy — owner sees/edits all, a department manager sees/edits only their department, an employee sees only their own (read-only), and pay is never reachable through the generic entities API.

**Architecture:** New `EmployeePay` Prisma table (separate from `Employee` for isolation). A pure permission module (`payAccess.ts`) decides view/edit; dedicated guarded functions (`employeePay.ts`) are the ONLY way to read/write pay; the generic `/api/entities` route is hardened to block `EmployeePay` and to strip the `pay_access_scope` field from `Employee` writes. Frontend adds a pay section to `EmployeeDetails` that hides itself when the API forbids access.

**Tech Stack:** Prisma + Fastify (apps/api), React/Vite SPA (src/ at repo root, base44-compat client), vitest. Repo: `C:\Users\97253\top-alena-migration`, branch `migration`. ALL paths below are relative to that root.

**Conventions (from codebase):**
- Prisma access in libs/functions: `(prisma as any).modelName`.
- New models are hand-added to `apps/api/prisma/schema.prisma`. Do NOT run `npm run schema:build`.
- Prod schema is applied as **additive raw SQL** (`prisma db execute --stdin`), never `prisma db push` (destructive drift). Tenant schemas get the same SQL.
- Functions register via `registerFn(name, handler)` in files imported by `apps/api/src/functions/load.ts`; handler signature `({ body, user, req }) => Promise<unknown>`, where `user: { id, email, role? }` (owner role is the string `'owner'`).
- Frontend calls functions via `base44.functions.<name>(payload)` → returns `{ data, status }` (axios-style; read `res.data`). `base44.auth.me()` returns the current user incl. `role`. Entity files under `src/entities/` re-export `base44.entities.<Name>`.
- Hebrew UI strings, English code/comments. Tests under `apps/api/src/**/__tests__/`, run `npx vitest run` from `apps/api`.
- Commit after every task. NEVER push until the deploy task.

**File structure this plan creates/changes:**
- `apps/api/prisma/schema.prisma` — new `EmployeePay` model + `Employee.pay_access_scope` field.
- `apps/api/src/lib/payAccess.ts` — pure: `canViewPay`, `canEditPay`, `computeEmployerCost`, types.
- `apps/api/src/routes/entityGuards.ts` — pure: `READ_BLOCKED_ENTITIES`, `stripProtectedFields`.
- `apps/api/src/functions/employeePay.ts` — `getEmployeePay`, `listEmployeePay`, `setEmployeePay`, `setPayAccessScope`.
- `apps/api/src/functions/load.ts` — one import line.
- `apps/api/src/routes/entities.ts` — wire the guards.
- `src/components/employees/EmployeePaySection.jsx` — pay view/edit + owner scope-grant.
- `src/pages/EmployeeDetails.jsx` — render the section.

---

### Task 1: Prisma schema — `EmployeePay` model + `Employee.pay_access_scope`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the field to `Employee`**

In `model Employee` (around line 1051), add after the `department` line:

```prisma
  pay_access_scope             String?  // null=self only | 'all' | '<department name>' — salary view/edit scope for managers
```

- [ ] **Step 2: Append the new model** at the end of `apps/api/prisma/schema.prisma`:

```prisma
model EmployeePay {
  id                  String   @id @default(cuid())
  employee_id         String   @unique
  pay_type            String   @default("hourly") // hourly | monthly | tips
  hourly_rate         Float?
  monthly_salary      Float?
  employer_pct        Float?   // optional employer-cost % on gross ("mode א")
  employer_components Json?    // optional detailed components ("mode ב")
  currency            String   @default("ILS")
  notes               String?
  updated_by          String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

- [ ] **Step 3: Regenerate client + typecheck**

Run: `cd apps/api; npx prisma generate`
Expected: "Generated Prisma Client", no validation errors.
Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit`
Expected: no new errors vs baseline.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(pay): EmployeePay model + Employee.pay_access_scope"
```

---

### Task 2: Pure permission + employer-cost logic (`payAccess.ts`) — TDD

**Files:**
- Create: `apps/api/src/lib/payAccess.ts`
- Test: `apps/api/src/lib/__tests__/payAccess.test.ts`

- [ ] **Step 1: Write the failing test** — create `apps/api/src/lib/__tests__/payAccess.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canViewPay, canEditPay, computeEmployerCost } from '../payAccess.js';

const owner = { isOwner: true, employeeId: 'v1', department: 'ניהול', payAccessScope: null };
const kitchenMgr = { isOwner: false, employeeId: 'v2', department: 'מטבח', payAccessScope: 'מטבח' };
const floorMgr = { isOwner: false, employeeId: 'v3', department: 'פלור', payAccessScope: 'פלור' };
const allMgr = { isOwner: false, employeeId: 'v4', department: 'ניהול', payAccessScope: 'all' };
const worker = { isOwner: false, employeeId: 'v5', department: 'מטבח', payAccessScope: null };

const kitchenTarget = { employeeId: 't-kitchen', department: 'מטבח' };
const floorTarget = { employeeId: 't-floor', department: 'פלור' };

describe('canEditPay', () => {
  it('owner edits anyone', () => {
    expect(canEditPay(owner, kitchenTarget)).toBe(true);
    expect(canEditPay(owner, floorTarget)).toBe(true);
  });
  it("scope 'all' edits anyone", () => {
    expect(canEditPay(allMgr, floorTarget)).toBe(true);
  });
  it('department manager edits only their department', () => {
    expect(canEditPay(kitchenMgr, kitchenTarget)).toBe(true);
    expect(canEditPay(kitchenMgr, floorTarget)).toBe(false);
    expect(canEditPay(floorMgr, floorTarget)).toBe(true);
  });
  it('plain employee cannot edit — not even themselves', () => {
    expect(canEditPay(worker, { employeeId: 'v5', department: 'מטבח' })).toBe(false);
  });
});

describe('canViewPay', () => {
  it('anyone who can edit can also view', () => {
    expect(canViewPay(kitchenMgr, kitchenTarget)).toBe(true);
  });
  it('employee views only themselves', () => {
    expect(canViewPay(worker, { employeeId: 'v5', department: 'מטבח' })).toBe(true);
    expect(canViewPay(worker, kitchenTarget)).toBe(false);
  });
  it('a manager cannot view another department', () => {
    expect(canViewPay(kitchenMgr, floorTarget)).toBe(false);
  });
});

describe('computeEmployerCost', () => {
  it('sums detailed components when present', () => {
    expect(computeEmployerCost(10000, { employer_components: { bituach_leumi: 700, pension: 1250 } })).toBe(1950);
  });
  it('falls back to percentage of gross', () => {
    expect(computeEmployerCost(10000, { employer_pct: 30 })).toBe(3000);
  });
  it('is zero when nothing configured', () => {
    expect(computeEmployerCost(10000, {})).toBe(0);
    expect(computeEmployerCost(10000, { employer_components: {} })).toBe(0);
  });
  it('prefers components over percentage when both present', () => {
    expect(computeEmployerCost(10000, { employer_components: { x: 500 }, employer_pct: 30 })).toBe(500);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api; npx vitest run src/lib/__tests__/payAccess.test.ts`
Expected: FAIL — cannot resolve `../payAccess.js`.

- [ ] **Step 3: Implement** — create `apps/api/src/lib/payAccess.ts`:

```ts
// Pure salary-privacy + employer-cost logic. DB-free so it is unit-testable and
// is the single source of truth for who may see/edit pay.

export type Viewer = {
  isOwner: boolean;
  employeeId: string | null;     // the viewer's own Employee id (null if unlinked)
  department: string | null;
  payAccessScope: string | null; // null=self only | 'all' | '<department>'
};
export type PayTarget = { employeeId: string; department: string | null };

// Owner, an 'all'-scoped manager, or a manager scoped to the target's department.
export function canEditPay(v: Viewer, t: PayTarget): boolean {
  if (v.isOwner) return true;
  if (v.payAccessScope === 'all') return true;
  if (v.payAccessScope && t.department && v.payAccessScope === t.department) return true;
  return false;
}

// Anyone who can edit, plus an employee viewing their own record.
export function canViewPay(v: Viewer, t: PayTarget): boolean {
  if (canEditPay(v, t)) return true;
  return !!v.employeeId && v.employeeId === t.employeeId;
}

// Effective employer cost: detailed components (summed) win; else % of gross; else 0.
export function computeEmployerCost(
  gross: number,
  pay: { employer_pct?: number | null; employer_components?: Record<string, number> | null },
): number {
  const comp = pay.employer_components;
  if (comp && typeof comp === 'object') {
    const vals = Object.values(comp).map(Number).filter(n => Number.isFinite(n));
    if (vals.length) return vals.reduce((a, b) => a + b, 0);
  }
  if (pay.employer_pct && Number.isFinite(pay.employer_pct)) return (gross * pay.employer_pct) / 100;
  return 0;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd apps/api; npx vitest run src/lib/__tests__/payAccess.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/payAccess.ts apps/api/src/lib/__tests__/payAccess.test.ts
git commit -m "feat(pay): pure salary-privacy + employer-cost logic"
```

---

### Task 3: Entity-route guards (`entityGuards.ts`) — TDD

**Files:**
- Create: `apps/api/src/routes/entityGuards.ts`
- Test: `apps/api/src/routes/__tests__/entityGuards.test.ts`

- [ ] **Step 1: Write the failing test** — create `apps/api/src/routes/__tests__/entityGuards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { READ_BLOCKED_ENTITIES, stripProtectedFields } from '../entityGuards.js';

describe('READ_BLOCKED_ENTITIES', () => {
  it('blocks EmployeePay from the generic route', () => {
    expect(READ_BLOCKED_ENTITIES.has('EmployeePay')).toBe(true);
  });
  it('does not block ordinary models', () => {
    expect(READ_BLOCKED_ENTITIES.has('Employee')).toBe(false);
    expect(READ_BLOCKED_ENTITIES.has('Invoice')).toBe(false);
  });
});

describe('stripProtectedFields', () => {
  it('removes pay_access_scope from Employee writes', () => {
    expect(stripProtectedFields('Employee', { full_name: 'A', pay_access_scope: 'all' }))
      .toEqual({ full_name: 'A' });
  });
  it('leaves Employee writes without the field untouched', () => {
    expect(stripProtectedFields('Employee', { full_name: 'A' })).toEqual({ full_name: 'A' });
  });
  it('does not touch other models', () => {
    expect(stripProtectedFields('Customer', { pay_access_scope: 'x' })).toEqual({ pay_access_scope: 'x' });
  });
  it('is null-safe', () => {
    expect(stripProtectedFields('Employee', null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api; npx vitest run src/routes/__tests__/entityGuards.test.ts`
Expected: FAIL — cannot resolve `../entityGuards.js`.

- [ ] **Step 3: Implement** — create `apps/api/src/routes/entityGuards.ts`:

```ts
// Guards for the generic /api/entities route so sensitive data can only flow
// through dedicated, permission-checked functions.

// Models that must NEVER be read/written via the generic entities route.
export const READ_BLOCKED_ENTITIES = new Set<string>(['EmployeePay']);

// Fields that must not be settable via a generic write on a given model
// (they are governed by dedicated owner-only functions instead).
const PROTECTED_FIELDS: Record<string, string[]> = {
  Employee: ['pay_access_scope'],
};

export function stripProtectedFields(modelName: string, data: any): any {
  if (!data || typeof data !== 'object') return data;
  const fields = PROTECTED_FIELDS[modelName];
  if (!fields) return data;
  const out = { ...data };
  for (const f of fields) delete out[f];
  return out;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd apps/api; npx vitest run src/routes/__tests__/entityGuards.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/entityGuards.ts apps/api/src/routes/__tests__/entityGuards.test.ts
git commit -m "feat(pay): entity-route guards (block EmployeePay, strip pay_access_scope)"
```

---

### Task 4: Wire the guards into the entities route

**Files:**
- Modify: `apps/api/src/routes/entities.ts`

- [ ] **Step 1: Import the guards**

At the top of `apps/api/src/routes/entities.ts` (with the other imports):

```ts
import { READ_BLOCKED_ENTITIES, stripProtectedFields } from './entityGuards.js';
```

- [ ] **Step 2: Block sensitive entities for the whole plugin**

Immediately after the existing `app.addHook('preHandler', requireAuth);` (line ~160), add a second preHandler:

```ts
  app.addHook('preHandler', async (req, reply) => {
    const name = (req.params as any)?.name;
    if (name && READ_BLOCKED_ENTITIES.has(name)) {
      return reply.code(403).send({ error: 'forbidden_entity', message: 'use the dedicated API' });
    }
  });
```

- [ ] **Step 3: Strip protected fields on writes**

In the `POST /:name` handler, find where it reads the body into the create data and wrap it. The body is `req.body`; change the value passed to `delegate.create({ data: ... })` so the data is `stripProtectedFields(name, <existing body/data expression>)`. Likewise in `PUT /:name/:id`, wrap the update data with `stripProtectedFields(name, <existing data expression>)`.

Concretely — locate the two calls (around lines 205–227). Wherever the handler currently builds `data` from the request body (e.g. `const data = coerce(name, req.body as any)` or passes `req.body` directly), replace that data expression with `stripProtectedFields(name, <that same expression>)`. If the handler already has a named `data` variable, add right before the prisma call:

```ts
    const safeData = stripProtectedFields(name, data);
```

and pass `safeData` to `.create`/`.update`. Read the actual handler first and adapt to its exact variable names — do not invent new coercion.

- [ ] **Step 4: Typecheck + run all API tests**

Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit`
Expected: clean.
Run: `cd apps/api; npx vitest run`
Expected: all suites pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/entities.ts
git commit -m "feat(pay): enforce entity guards in the generic entities route"
```

---

### Task 5: Backend functions (`employeePay.ts`)

**Files:**
- Create: `apps/api/src/functions/employeePay.ts`
- Modify: `apps/api/src/functions/load.ts` (one import line)

- [ ] **Step 1: Implement the functions** — create `apps/api/src/functions/employeePay.ts`:

```ts
// Guarded pay read/write. The ONLY path to EmployeePay data. Every call builds
// a Viewer from the JWT user (owner flag + the viewer's own Employee row for
// department + pay_access_scope) and enforces payAccess rules.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { canViewPay, canEditPay, ALL_SCOPE, type Viewer } from '../lib/payAccess.js';

async function buildViewer(user: { id: string; email: string; role?: string | null } | null): Promise<Viewer> {
  const isOwner = user?.role === 'owner';
  let emp: any = null;
  if (user?.email) {
    emp = await (prisma as any).employee.findFirst({
      where: { email: user.email },
      select: { id: true, department: true, pay_access_scope: true },
    }).catch(() => null);
  }
  return {
    isOwner,
    employeeId: emp?.id ?? null,
    department: emp?.department ?? null,
    payAccessScope: emp?.pay_access_scope ?? null,
  };
}

async function loadTarget(employeeId: string): Promise<{ employeeId: string; department: string | null; full_name: string } | null> {
  const t: any = await (prisma as any).employee.findUnique({
    where: { id: employeeId },
    select: { id: true, department: true, full_name: true },
  }).catch(() => null);
  if (!t) return null;
  return { employeeId: t.id, department: t.department ?? null, full_name: t.full_name };
}

// Returns { pay, can_edit } if the caller may view; throws 'forbidden' otherwise.
registerFn('getEmployeePay', async ({ body, user }) => {
  const employeeId = String((body as any)?.employee_id || '');
  const target = await loadTarget(employeeId);
  if (!target) throw new Error('employee_not_found');
  const viewer = await buildViewer(user);
  if (!canViewPay(viewer, target)) throw new Error('forbidden');
  const pay = await (prisma as any).employeePay.findUnique({ where: { employee_id: employeeId } }).catch(() => null);
  return { pay: pay ?? null, can_edit: canEditPay(viewer, target) };
});

// Returns pay rows the caller may see (owner/all → everyone; dept manager → their
// department; employee → just themselves), each with the employee name.
registerFn('listEmployeePay', async ({ user }) => {
  const viewer = await buildViewer(user);
  const employees: any[] = await (prisma as any).employee.findMany({
    select: { id: true, full_name: true, department: true },
  }).catch(() => []);
  const visibleIds = employees
    .filter(e => canViewPay(viewer, { employeeId: e.id, department: e.department ?? null }))
    .map(e => e.id);
  const pays: any[] = await (prisma as any).employeePay.findMany({
    where: { employee_id: { in: visibleIds } },
  }).catch(() => []);
  const payById = new Map(pays.map(p => [p.employee_id, p]));
  return employees
    .filter(e => visibleIds.includes(e.id))
    .map(e => ({ employee_id: e.id, full_name: e.full_name, department: e.department ?? null, pay: payById.get(e.id) ?? null }));
});

// Upsert pay for an employee. Requires canEditPay. Validates numbers.
registerFn('setEmployeePay', async ({ body, user }) => {
  const p = (body as any) || {};
  const employeeId = String(p.employee_id || '');
  const target = await loadTarget(employeeId);
  if (!target) throw new Error('employee_not_found');
  const viewer = await buildViewer(user);
  if (!canEditPay(viewer, target)) throw new Error('forbidden');

  const payType = ['hourly', 'monthly', 'tips'].includes(p.pay_type) ? p.pay_type : 'hourly';
  const num = (v: any) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
  const hourly = num(p.hourly_rate);
  const monthly = num(p.monthly_salary);
  const pct = num(p.employer_pct);
  if ((hourly !== null && hourly < 0) || (monthly !== null && monthly < 0) || (pct !== null && pct < 0)) {
    throw new Error('invalid_amount');
  }
  const data = {
    pay_type: payType,
    hourly_rate: hourly,
    monthly_salary: monthly,
    employer_pct: pct,
    employer_components: p.employer_components && typeof p.employer_components === 'object' ? p.employer_components : null,
    notes: p.notes ? String(p.notes).slice(0, 500) : null,
    updated_by: user?.id ?? null,
  };
  await (prisma as any).employeePay.upsert({
    where: { employee_id: employeeId },
    update: data,
    create: { employee_id: employeeId, ...data },
  });
  return { ok: true };
});

// Owner-only: set a manager's salary-access scope (self=null | ALL_SCOPE | department).
// ALL_SCOPE is the collision-proof '__ALL__' sentinel from payAccess.ts (a real
// department can never be named that), so import and reuse it here.
registerFn('setPayAccessScope', async ({ body, user }) => {
  if (user?.role !== 'owner') throw new Error('forbidden');
  const p = (body as any) || {};
  const employeeId = String(p.employee_id || '');
  if (!employeeId) throw new Error('employee_required');
  const raw = p.scope;
  const scope = raw === ALL_SCOPE ? ALL_SCOPE : raw && raw !== 'self' ? String(raw).slice(0, 60) : null;
  await (prisma as any).employee.update({ where: { id: employeeId }, data: { pay_access_scope: scope } }).catch(() => {
    throw new Error('employee_not_found');
  });
  return { ok: true, scope };
});
```

- [ ] **Step 2: Register** — in `apps/api/src/functions/load.ts`, add at the top with the other imports:

```ts
import './employeePay.js';
```

- [ ] **Step 3: Typecheck + tests**

Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit`
Expected: clean.
Run: `cd apps/api; npx vitest run`
Expected: all pass (no new suites, but nothing breaks).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/functions/employeePay.ts apps/api/src/functions/load.ts
git commit -m "feat(pay): guarded getEmployeePay/listEmployeePay/setEmployeePay/setPayAccessScope"
```

---

### Task 6: Frontend — `EmployeePaySection` + integrate into `EmployeeDetails`

**Files:**
- Create: `src/components/employees/EmployeePaySection.jsx`
- Modify: `src/pages/EmployeeDetails.jsx`

- [ ] **Step 1: Create the component** — `src/components/employees/EmployeePaySection.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Save, ShieldCheck } from 'lucide-react';

const PAY_TYPE_LABELS = { hourly: 'שעתי', monthly: 'חודשי קבוע', tips: 'טיפים (מחוץ לעלות שכר)' };

// Pay + employer-cost editor for one employee. Hides itself entirely when the
// API forbids access (the backend enforces department-scoped privacy).
export default function EmployeePaySection({ employee }) {
  const employeeId = employee?.id;
  const [state, setState] = useState({ loading: true, allowed: false, canEdit: false });
  const [form, setForm] = useState({ pay_type: 'hourly', hourly_rate: '', monthly_salary: '', employer_pct: '', notes: '' });
  const [me, setMe] = useState(null);
  const [scope, setScope] = useState(employee?.pay_access_scope || 'self');
  const [departments, setDepartments] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    try {
      const res = await base44.functions.getEmployeePay({ employee_id: employeeId });
      const d = res?.data || res;
      const pay = d.pay || {};
      setForm({
        pay_type: pay.pay_type || 'hourly',
        hourly_rate: pay.hourly_rate ?? '',
        monthly_salary: pay.monthly_salary ?? '',
        employer_pct: pay.employer_pct ?? '',
        notes: pay.notes || '',
      });
      setState({ loading: false, allowed: true, canEdit: !!d.can_edit });
    } catch (e) {
      // forbidden / not linked → don't show the section at all
      setState({ loading: false, allowed: false, canEdit: false });
    }
  }, [employeeId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const u = await base44.auth.me();
        setMe(u);
        if (u?.role === 'owner') {
          const emps = await base44.entities.Employee.list();
          setDepartments([...new Set((emps || []).map(e => e.department).filter(Boolean))]);
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const save = async () => {
    setMsg(null);
    try {
      await base44.functions.setEmployeePay({
        employee_id: employeeId,
        pay_type: form.pay_type,
        hourly_rate: form.hourly_rate,
        monthly_salary: form.monthly_salary,
        employer_pct: form.employer_pct,
        notes: form.notes,
      });
      setMsg({ ok: true, text: 'נשמר' });
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'שגיאה' });
    }
  };

  const saveScope = async () => {
    setMsg(null);
    try {
      await base44.functions.setPayAccessScope({ employee_id: employeeId, scope });
      setMsg({ ok: true, text: 'הרשאת שכר עודכנה' });
    } catch (e) {
      setMsg({ ok: false, text: e.message || 'שגיאה' });
    }
  };

  if (state.loading || !state.allowed) return null;

  const readOnly = !state.canEdit;

  return (
    <Card className="mt-6" dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" />שכר ועלות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {msg && <div className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-700'}`}>{msg.text}</div>}

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>סוג תשלום</Label>
            {readOnly
              ? <div className="text-slate-700 mt-1">{PAY_TYPE_LABELS[form.pay_type]}</div>
              : <Select value={form.pay_type} onValueChange={v => setForm(f => ({ ...f, pay_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAY_TYPE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>}
          </div>

          {form.pay_type === 'hourly' && (
            <div>
              <Label>תעריף לשעה (₪)</Label>
              <Input type="number" dir="ltr" readOnly={readOnly} value={form.hourly_rate}
                onChange={e => setForm(f => ({ ...f, hourly_rate: e.target.value }))} />
            </div>
          )}
          {form.pay_type === 'monthly' && (
            <div>
              <Label>משכורת חודשית (₪)</Label>
              <Input type="number" dir="ltr" readOnly={readOnly} value={form.monthly_salary}
                onChange={e => setForm(f => ({ ...f, monthly_salary: e.target.value }))} />
            </div>
          )}

          {form.pay_type !== 'tips' && (
            <div>
              <Label>עלות מעביד (% על הברוטו, אופציונלי)</Label>
              <Input type="number" dir="ltr" readOnly={readOnly} placeholder="למשל 30" value={form.employer_pct}
                onChange={e => setForm(f => ({ ...f, employer_pct: e.target.value }))} />
            </div>
          )}
        </div>

        {!readOnly && (
          <Button onClick={save} className="bg-green-600 hover:bg-green-700">
            <Save className="w-4 h-4 ml-2" />שמור שכר
          </Button>
        )}

        {me?.role === 'owner' && (
          <div className="border-t pt-4 mt-2">
            <Label className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" />הרשאת צפייה/עריכת שכר (למנהל)</Label>
            <div className="flex items-center gap-2 mt-1">
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">עצמו בלבד</SelectItem>
                  {/* value MUST equal ALL_SCOPE ('__ALL__') in apps/api/src/lib/payAccess.ts */}
                  <SelectItem value="__ALL__">כל המחלקות</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={saveScope}>עדכן הרשאה</Button>
            </div>
            <p className="text-xs text-slate-500 mt-1">קובע לאילו עובדים המנהל הזה יכול לראות/לערוך שכר.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render it in `EmployeeDetails.jsx`**

In `src/pages/EmployeeDetails.jsx`:
1. Add import near the top (after the other imports): `import EmployeePaySection from '../components/employees/EmployeePaySection';`
2. Find where the page renders the employee's cards (the main returned JSX for a loaded employee — there is an `employee` state object). Render the section right after the employee's summary/header card:

```jsx
        <EmployeePaySection employee={employee} />
```

Use whatever the loaded employee variable is actually named in that file (read it first — it is the object holding `employee.id`). Place the section inside the main content container so it inherits the page width.

- [ ] **Step 3: Build check**

Run (worktree root): `npx vite build`
Expected: builds without errors. Do NOT commit `dist/` here.

- [ ] **Step 4: Commit**

```bash
git add src/components/employees/EmployeePaySection.jsx src/pages/EmployeeDetails.jsx
git commit -m "feat(pay): employee pay section in the employee card (privacy-aware)"
```

---

### Task 7: Deploy + apply schema + live verification

**Files:** none new — deployment and verification. Deploy topology (memory `vps-deploy`/`email-invoice-import`): app root `/opt/top-alena` on `91.98.45.253`; web bundle is built locally and `dist/` committed; schema applied as additive SQL because `prisma db push` is destructive on the drifted prod DB. Tenant schemas share the same Postgres via `?schema=tenant_<slug>` (container env has TWO `DATABASE_URL` lines — use the LAST one).

- [ ] **Step 1: Full local verification**

```bash
cd apps/api && npx tsc -p tsconfig.json --noEmit && npx vitest run
```
Expected: clean typecheck, all tests pass.

- [ ] **Step 2: Build web bundle + commit dist/**

```bash
npx vite build
git add dist/
git commit -m "build: web bundle for employee pay model"
```

- [ ] **Step 3: Push**

```bash
git push origin migration
```

- [ ] **Step 4: Write the additive SQL** — create `scratch` file `/tmp/employee-pay.sql` (contents below) and apply to the Alena schema + every tenant schema. SQL:

```sql
CREATE TABLE IF NOT EXISTS "EmployeePay" (
  "id" TEXT PRIMARY KEY,
  "employee_id" TEXT NOT NULL,
  "pay_type" TEXT NOT NULL DEFAULT 'hourly',
  "hourly_rate" DOUBLE PRECISION,
  "monthly_salary" DOUBLE PRECISION,
  "employer_pct" DOUBLE PRECISION,
  "employer_components" JSONB,
  "currency" TEXT NOT NULL DEFAULT 'ILS',
  "notes" TEXT,
  "updated_by" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmployeePay_employee_id_key" ON "EmployeePay"("employee_id");
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "pay_access_scope" TEXT;
```

- [ ] **Step 5: Deploy + apply schema**

Test SSH first: `ssh -o BatchMode=yes -o ConnectTimeout=10 root@91.98.45.253 'echo alive'`. If it works, run below directly; otherwise hand the commands to Dvir for the Hetzner web console.

```bash
cd /opt/top-alena && git fetch origin migration && git reset --hard origin/migration && docker compose up -d --build api web
# apply to Alena (public) schema:
docker compose exec -T api npx prisma db execute --stdin --schema prisma/schema.prisma < /tmp/employee-pay.sql
# apply to each tenant schema (uses the schema-qualified DATABASE_URL — the LAST env line):
for c in $(docker ps --format '{{.Names}}' | grep '^tenant-.*-api$'); do
  url=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | tail -1 | cut -d= -f2-)
  docker compose exec -T api npx prisma db execute --stdin --url "$url" < /tmp/employee-pay.sql && echo "$c OK" || echo "$c FAILED"
done
```

Verify bundle live: `curl -s https://topalena.com/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'` matches the new `dist/assets/` name.

- [ ] **Step 6: Live privacy verification (the critical check)**

1. As **owner** (Dvir): open an employee's card at /EmployeeDetails, see the "שכר ועלות" section, set a kitchen employee's pay (hourly + 30% employer), save. Set a kitchen manager's "הרשאת שכר" to `מטבח`.
2. Confirm the generic route is blocked: `curl -s -H "Authorization: Bearer <owner_jwt>" https://topalena.com/api/entities/EmployeePay` → returns `403 forbidden_entity` (NOT the rows).
3. As the **kitchen manager** (log in as that user): open a **kitchen** employee → pay section visible & editable; open a **floor** employee → pay section absent.
4. As a **regular employee**: open own card → pay visible read-only (no save button); open someone else's card → pay section absent.
5. Confirm a non-owner cannot self-grant: as the kitchen manager, `POST /api/fn/setPayAccessScope {employee_id: <self>, scope:'all'}` → `forbidden`.

- [ ] **Step 7: Commit any fixes + update memory**

Fix anything the live test surfaced (each fix its own commit). Update the memory file `project_email_invoice_import.md`'s siblings or create `project_labor_cost.md` noting: sub-project B (employee pay + salary privacy) shipped; EmployeePay table (additive SQL, applied to Alena + tenants); privacy = owner/dept-manager/self via `payAccess.ts`; EmployeePay blocked from generic entities route; C (schedule cost vs actual) and D (labor cost %) still pending.

---

## Self-Review Notes

- **Spec coverage:** pay types hourly/monthly/tips (Task 1 model + Task 6 UI); employer cost infra %+components starting empty (Task 1 fields, Task 2 `computeEmployerCost`, Task 6 optional field); view privacy owner/dept/self (Task 2 `canViewPay`, Task 5 `getEmployeePay`/`listEmployeePay`); edit privacy owner/dept, employee none (Task 2 `canEditPay`, Task 5 `setEmployeePay`); manager scope set by owner only (Task 5 `setPayAccessScope`, Task 6 owner UI); `EmployeePay` blocked from generic route + `pay_access_scope` unsettable via generic Employee write (Tasks 3–4); entry in employee card (Task 6); additive SQL deploy incl. tenants (Task 7).
- **Out of scope (C/D):** cost-from-hours, schedule forecast, deviations, labor-cost % — none built here; `computeEmployerCost` and the rate fields are the seams C/D will consume.
- **Known simplification:** one current pay row per employee (upsert), no rate history/effective-dating in v1 — acceptable; add effective_from later if C needs historical accuracy.
