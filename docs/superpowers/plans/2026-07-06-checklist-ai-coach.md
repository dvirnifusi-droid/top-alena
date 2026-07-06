# Checklist AI Coach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manager define per-task references (photos + text criteria) on a checklist; give the employee real-time advisory AI feedback per task photo (never blocking) plus an end-of-run summary before manager sign-off; and learn from manager corrections so the AI grows less rigid over time.

**Architecture:** Reference/criteria + per-task AI verdicts live in the existing Json fields (`Checklist.items[]`, `ChecklistExecution.results[]`) so no migration there. A new `ChecklistItemExample` table accumulates labeled good/bad photos per task (the learning corpus), and one new `ChecklistExecution.ai_summary` column holds the end report. Backend functions call the existing `invokeLLM` (Gemini vision) for per-task review and text summary; a pure helper module handles example selection + label mapping and is unit-tested. Frontend adds reference fields to the editor, live review to the execution flow, and override buttons to the archive.

**Tech Stack:** Prisma + Fastify (apps/api), React/Vite SPA (src/ at repo root, base44-compat client + `UploadFile`), Gemini vision via `invokeLLM`, vitest. Repo: `C:\Users\97253\top-alena-migration`, branch `migration`. ALL paths relative to that root.

**Conventions (from codebase):**
- Prisma access in libs/functions: `(prisma as any).modelName`.
- New models hand-added to `apps/api/prisma/schema.prisma`. Do NOT run `npm run schema:build`. Prod schema applied as **additive raw SQL**, never `prisma db push` (drift). Tenant schemas get the same SQL (see `DEPLOY_BRIEF.md`).
- Functions register via `registerFn(name, handler)` in files imported by `apps/api/src/functions/load.ts`; handler `({ body, user, req }) => Promise<unknown>`; errors become `{ error:'function_error', message }`.
- Frontend calls `base44.functions.<name>(payload)` → `{ data }`; entity files under `src/entities/`; photo upload via `UploadFile({ file })` → `{ file_url }` (a `/api/files/<key>` URL); `invokeLLM` supports `fileUrls: string[]` (Gemini vision, `gemini-2.5-flash` for cheap calls).
- `ChecklistExecution.results` is keyed in the frontend by `item.order`; each entry has `{ checked, notes, performed_by, photo_urls[] }`.
- Hebrew UI strings, English code/comments. Tests under `apps/api/src/**/__tests__/`, run `npx vitest run` from `apps/api`. Commit after every task; NEVER push until the deploy task.

**File structure:**
- `apps/api/prisma/schema.prisma` — new `ChecklistItemExample` model + `ChecklistExecution.ai_summary`.
- `apps/api/src/lib/checklistReview.ts` — pure: `selectExamplesForReview`, `overrideToLabel`, `attentionItems`, `REVIEW_SCHEMA`, `buildReviewPrompt`.
- `apps/api/src/functions/checklistAi.ts` — `reviewChecklistItem`, `summarizeChecklistExecution`, `overrideChecklistItemReview`, `addChecklistItemExample`.
- `apps/api/src/functions/load.ts` — one import line.
- `src/components/checklists/ChecklistEditDialog.jsx` — per-item reference photos + criteria + AI toggle.
- `src/components/checklists/ChecklistExecution.jsx` — real-time review + reference display + end summary.
- `src/components/checklists/ChecklistArchive.jsx` — manager override (👍/👎) → learning.
- `src/entities/all.js` — export `ChecklistItemExample`.

---

### Task 1: Schema — `ChecklistItemExample` + `ChecklistExecution.ai_summary`

**Files:** Modify `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Append the new model** at the END of `apps/api/prisma/schema.prisma`:

```prisma
model ChecklistItemExample {
  id           String   @id @default(cuid())
  checklist_id String
  item_order   Int
  photo_url    String
  label        String   // 'good' | 'bad'
  note         String?
  source       String   @default("override") // manager_reference | approved_execution | override
  created_by   String?
  createdAt    DateTime @default(now())

  @@index([checklist_id, item_order])
}
```

- [ ] **Step 2: Add the column to `ChecklistExecution`.** Find `model ChecklistExecution` (around line 486); add after its `status` field:

```prisma
  ai_summary                   String?
```

- [ ] **Step 3: Regenerate + typecheck**

Run: `cd apps/api; npx prisma generate` → "Generated Prisma Client", no errors.
Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit` → no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(checklist-ai): ChecklistItemExample model + ChecklistExecution.ai_summary"
```

---

### Task 2: Pure review logic (`checklistReview.ts`) — TDD

**Files:**
- Create `apps/api/src/lib/checklistReview.ts`
- Test `apps/api/src/lib/__tests__/checklistReview.test.ts`

- [ ] **Step 1: Write the failing test** — create `apps/api/src/lib/__tests__/checklistReview.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { selectExamplesForReview, overrideToLabel, attentionItems } from '../checklistReview.js';

const ex = (id: string, label: string, createdAt: string) => ({ id, label, photo_url: `u/${id}`, createdAt: new Date(createdAt) });

describe('selectExamplesForReview', () => {
  const rows = [
    ex('g1', 'good', '2026-06-01'), ex('g2', 'good', '2026-06-03'), ex('g3', 'good', '2026-06-02'),
    ex('b1', 'bad', '2026-06-01'), ex('b2', 'bad', '2026-06-04'),
  ];
  it('splits good/bad and keeps the most-recent up to the cap', () => {
    const r = selectExamplesForReview(rows, 2);
    expect(r.good).toEqual(['u/g2', 'u/g3']); // newest two good
    expect(r.bad).toEqual(['u/b2', 'u/b1']);  // newest two bad
  });
  it('handles empty', () => {
    expect(selectExamplesForReview([], 5)).toEqual({ good: [], bad: [] });
  });
});

describe('overrideToLabel', () => {
  it('approved → good, rejected → bad', () => {
    expect(overrideToLabel('approved')).toBe('good');
    expect(overrideToLabel('rejected')).toBe('bad');
  });
});

describe('attentionItems', () => {
  it('returns items whose ai_review verdict is attention', () => {
    const results = [
      { item_order: 1, task: 'בר', ai_review: { verdict: 'ok' } },
      { item_order: 2, task: 'מקרר', ai_review: { verdict: 'attention', feedback: 'לא סגור' } },
      { item_order: 3, task: 'רצפה', ai_review: { verdict: 'unknown' } },
    ];
    const a = attentionItems(results);
    expect(a.map(i => i.item_order)).toEqual([2]);
    expect(a[0].feedback).toBe('לא סגור');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd apps/api; npx vitest run src/lib/__tests__/checklistReview.test.ts` → cannot resolve `../checklistReview.js`.

- [ ] **Step 3: Implement** — create `apps/api/src/lib/checklistReview.ts`:

```ts
// Pure helpers for the checklist AI coach — example selection, label mapping,
// attention extraction, and the review response schema/prompt. DB-free & tested.

export type ExampleRow = { id: string; label: string; photo_url: string; createdAt: Date };

// Most-recent up to `cap` per label. Returns photo URL lists for the prompt.
export function selectExamplesForReview(rows: ExampleRow[], cap: number): { good: string[]; bad: string[] } {
  const byNewest = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const good = byNewest.filter(r => r.label === 'good').slice(0, cap).map(r => r.photo_url);
  const bad = byNewest.filter(r => r.label === 'bad').slice(0, cap).map(r => r.photo_url);
  return { good, bad };
}

export function overrideToLabel(decision: string): 'good' | 'bad' {
  return decision === 'approved' ? 'good' : 'bad';
}

// From an execution's results array, the items the AI flagged for attention.
export function attentionItems(results: any[]): { item_order: number; task?: string; feedback?: string }[] {
  return (Array.isArray(results) ? results : [])
    .filter(r => r?.ai_review?.verdict === 'attention')
    .map(r => ({ item_order: r.item_order ?? r.order, task: r.task, feedback: r?.ai_review?.feedback }));
}

// Response schema for the per-task vision review.
export const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ok', 'attention', 'unknown'], description: 'ok=תקין, attention=יש מה לתקן, unknown=אין מספיק מידע' },
    confidence: { type: 'number', description: '0-100' },
    feedback: { type: 'string', description: 'משוב קצר וידידותי בעברית — מה טוב ומה לשפר' },
  },
  required: ['verdict', 'confidence', 'feedback'],
};

// Build the Hebrew instruction text for a single-task review. Photos are passed
// separately as fileUrls (references first, good/bad examples, then the actual).
export function buildReviewPrompt(item: { area?: string; task?: string; description?: string; help_text?: string; expected_criteria?: string }, counts: { refs: number; good: number; bad: number }): string {
  const lines = [
    'אתה מאמן שירות למסעדה. עובד ביצע משימה מצ\'ק ליסט וצילם. תפקידך לתת משוב מייעץ — לא לפסול.',
    `משימה: ${item.task || ''}${item.area ? ` (אזור: ${item.area})` : ''}`,
  ];
  if (item.description) lines.push(`תיאור: ${item.description}`);
  if (item.help_text) lines.push(`טקסט עזר: ${item.help_text}`);
  if (item.expected_criteria) lines.push(`קריטריונים לביצוע תקין: ${item.expected_criteria}`);
  lines.push(
    `התמונות המצורפות: ${counts.refs} תמונות ייחוס, ${counts.good} דוגמאות "תקין", ${counts.bad} דוגמאות "לא תקין", ואז התמונה של העובד (האחרונה).`,
    'קבל וריאציות סבירות בזווית/תאורה/סידור. אם אין מול מה להשוות או שאתה לא בטוח — verdict=unknown והסבר.',
    'ענה בעברית, קצר וחיובי: מה טוב, ומה (אם בכלל) כדאי לתקן.',
  );
  return lines.join('\n');
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `cd apps/api; npx vitest run src/lib/__tests__/checklistReview.test.ts` → all pass. Also `npx tsc -p tsconfig.json --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/checklistReview.ts apps/api/src/lib/__tests__/checklistReview.test.ts
git commit -m "feat(checklist-ai): pure review helpers (example selection, schema, prompt)"
```

---

### Task 3: Backend functions (`checklistAi.ts`)

**Files:**
- Create `apps/api/src/functions/checklistAi.ts`
- Modify `apps/api/src/functions/load.ts` (one import line)

- [ ] **Step 1: Implement** — create `apps/api/src/functions/checklistAi.ts`:

```ts
// Checklist AI coach API. reviewChecklistItem = per-task advisory vision review;
// summarizeChecklistExecution = end-of-run report; overrideChecklistItemReview =
// manager correction that also becomes a learning example; addChecklistItemExample
// = manual example. Advisory only — nothing here blocks an execution.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { invokeLLM } from '../lib/llm.js';
import { selectExamplesForReview, overrideToLabel, attentionItems, REVIEW_SCHEMA, buildReviewPrompt } from '../lib/checklistReview.js';

const EXAMPLE_CAP = 5;

function findItem(checklist: any, itemOrder: number): any | null {
  const items = Array.isArray(checklist?.items) ? checklist.items : [];
  return items.find((i: any) => Number(i.order) === Number(itemOrder)) || null;
}

registerFn('reviewChecklistItem', async ({ body }) => {
  const p = (body as any) || {};
  const checklistId = String(p.checklist_id || '');
  const itemOrder = Number(p.item_order);
  const photoUrl = String(p.photo_url || '');
  if (!checklistId || !Number.isFinite(itemOrder) || !photoUrl) {
    return { verdict: 'unknown', confidence: 0, feedback: 'חסרים פרטים לבדיקה.' };
  }
  const checklist: any = await (prisma as any).checklist.findUnique({ where: { id: checklistId } }).catch(() => null);
  const item = findItem(checklist, itemOrder);
  if (!item) return { verdict: 'unknown', confidence: 0, feedback: 'לא נמצאה המשימה.' };

  const refs: string[] = Array.isArray(item.reference_photo_urls) ? item.reference_photo_urls.slice(0, EXAMPLE_CAP) : [];
  const rows: any[] = await (prisma as any).checklistItemExample.findMany({
    where: { checklist_id: checklistId, item_order: itemOrder },
  }).catch(() => []);
  const { good, bad } = selectExamplesForReview(rows, EXAMPLE_CAP);

  if (!refs.length && !good.length && !bad.length && !item.expected_criteria) {
    return { verdict: 'unknown', confidence: 0, feedback: 'לא הוגדר ייחוס או קריטריונים למשימה הזו — אין מול מה להשוות.' };
  }

  const prompt = buildReviewPrompt(item, { refs: refs.length, good: good.length, bad: bad.length });
  // Order matters: references, good, bad, then the employee photo LAST.
  const fileUrls = [...refs, ...good, ...bad, photoUrl];
  try {
    const res: any = await invokeLLM({ prompt, fileUrls, responseSchema: REVIEW_SCHEMA, model: 'gemini-2.5-flash', maxOutputTokens: 500 });
    return {
      verdict: ['ok', 'attention', 'unknown'].includes(res?.verdict) ? res.verdict : 'unknown',
      confidence: Math.max(0, Math.min(100, Number(res?.confidence) || 0)),
      feedback: String(res?.feedback || '').slice(0, 600),
    };
  } catch {
    return { verdict: 'unknown', confidence: 0, feedback: 'לא הצלחתי לבדוק את התמונה כרגע.' };
  }
});

registerFn('summarizeChecklistExecution', async ({ body }) => {
  const p = (body as any) || {};
  const results: any[] = Array.isArray(p.results) ? p.results : [];
  const reviewed = results.filter(r => r?.ai_review);
  if (!reviewed.length) return { ai_summary: '' };
  const attention = attentionItems(results);
  const okCount = reviewed.filter(r => r.ai_review.verdict === 'ok').length;
  const prompt = [
    'סכם בקצרה בעברית, בטון חיובי ומכבד, את איכות ביצוע הצ\'ק ליסט לפי חוות-דעת ה-AI לכל משימה.',
    `סה"כ ${reviewed.length} משימות נבדקו, ${okCount} מצוינות, ${attention.length} עם הערה.`,
    attention.length ? `משימות להערה: ${attention.map(a => `${a.task || a.item_order}: ${a.feedback || ''}`).join(' | ')}` : 'אין הערות.',
    'משפט-שניים בלבד, ואז רשימת ההערות (אם יש). זו סקירה למנהל לפני חתימה.',
  ].join('\n');
  try {
    const text: any = await invokeLLM({ prompt, maxOutputTokens: 500 });
    const summary = typeof text === 'string' ? text : (text?.text || JSON.stringify(text));
    const out = String(summary).slice(0, 1500);
    if (p.execution_id) {
      await (prisma as any).checklistExecution.update({ where: { id: String(p.execution_id) }, data: { ai_summary: out } }).catch(() => {});
    }
    return { ai_summary: out };
  } catch {
    // Fall back to a deterministic summary if the LLM call fails.
    const out = `נבדקו ${reviewed.length} משימות · ${okCount} מצוינות · ${attention.length} להערה` +
      (attention.length ? `:\n${attention.map(a => `• ${a.task || a.item_order}: ${a.feedback || ''}`).join('\n')}` : '.');
    if (p.execution_id) await (prisma as any).checklistExecution.update({ where: { id: String(p.execution_id) }, data: { ai_summary: out } }).catch(() => {});
    return { ai_summary: out };
  }
});

registerFn('overrideChecklistItemReview', async ({ body, user }) => {
  const p = (body as any) || {};
  const executionId = String(p.execution_id || '');
  const itemOrder = Number(p.item_order);
  const decision = p.decision === 'approved' ? 'approved' : 'rejected';
  const note = p.note ? String(p.note).slice(0, 500) : null;
  const exec: any = await (prisma as any).checklistExecution.findUnique({ where: { id: executionId } }).catch(() => null);
  if (!exec) throw new Error('execution_not_found');

  // Update the per-item result with the manager's override.
  const results: any[] = Array.isArray(exec.results) ? exec.results : [];
  const idx = results.findIndex((r: any) => Number(r.item_order ?? r.order) === itemOrder);
  if (idx >= 0) {
    results[idx] = { ...results[idx], manager_override: decision, manager_note: note };
    await (prisma as any).checklistExecution.update({ where: { id: executionId }, data: { results } }).catch(() => {});
  }
  // The correction becomes a learning example (if there's a photo for that item).
  const r = idx >= 0 ? results[idx] : null;
  const photoUrl = r?.photo_urls?.[0] || r?.photo_url || null;
  if (photoUrl && exec.checklist_id) {
    await (prisma as any).checklistItemExample.create({
      data: {
        checklist_id: exec.checklist_id, item_order: itemOrder, photo_url: photoUrl,
        label: overrideToLabel(decision), note, source: 'override', created_by: user?.id ?? null,
      },
    }).catch(() => {});
  }
  return { ok: true };
});

registerFn('addChecklistItemExample', async ({ body, user }) => {
  const p = (body as any) || {};
  if (!p.checklist_id || p.item_order == null || !p.photo_url) throw new Error('missing_fields');
  const label = p.label === 'bad' ? 'bad' : 'good';
  await (prisma as any).checklistItemExample.create({
    data: {
      checklist_id: String(p.checklist_id), item_order: Number(p.item_order), photo_url: String(p.photo_url),
      label, note: p.note ? String(p.note).slice(0, 500) : null,
      source: String(p.source || 'manager_reference'), created_by: user?.id ?? null,
    },
  });
  return { ok: true };
});
```

- [ ] **Step 2: Register** — in `apps/api/src/functions/load.ts`, add at the top with the other side-effect imports:

```ts
import './checklistAi.js';
```

- [ ] **Step 3: Verify**

Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit` → clean.
Run: `cd apps/api; npx vitest run` → all pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/functions/checklistAi.ts apps/api/src/functions/load.ts
git commit -m "feat(checklist-ai): review/summarize/override/add-example functions"
```

---

### Task 4: Entity export + Editor — reference photos, criteria, AI toggle

**Files:**
- Modify `src/entities/all.js`
- Modify `src/components/checklists/ChecklistEditDialog.jsx`

- [ ] **Step 1: Export the entity.** In `src/entities/all.js`, add near the other exports:

```js
export const ChecklistItemExample = base44.entities.ChecklistItemExample;
```

- [ ] **Step 2: Add per-item reference fields.** READ `src/components/checklists/ChecklistEditDialog.jsx` first — the items tab renders each item with fields (order, area, task, description, critical, points, evidence). For each item, add three controls bound to the item object (`items[idx].reference_photo_urls`, `items[idx].expected_criteria`, `items[idx].ai_review`). Use the file's existing item-update pattern (it already updates items via an `updateItem(idx, patch)`-style setter — match its real name). Add, inside the per-item editor block:

```jsx
{/* AI coach config */}
<div className="mt-2 border-t pt-2 space-y-2">
  <label className="flex items-center gap-2 text-sm">
    <input type="checkbox" checked={!!item.ai_review}
      onChange={e => updateItem(idx, { ai_review: e.target.checked })} />
    בדיקת AI למשימה זו (מאמן — לא חוסם)
  </label>
  {item.ai_review && (
    <>
      <Textarea placeholder="קריטריונים לביצוע תקין (למשל: משטח נוקה, גז כבוי, רצפה שטופה)"
        value={item.expected_criteria || ''}
        onChange={e => updateItem(idx, { expected_criteria: e.target.value })} />
      <div>
        <div className="text-xs text-slate-500 mb-1">תמונות ייחוס ("ככה זה נראה תקין"):</div>
        <div className="flex gap-2 flex-wrap">
          {(item.reference_photo_urls || []).map((u, i) => (
            <div key={i} className="relative">
              <img src={u} alt="ref" className="w-16 h-16 object-cover rounded border" />
              <button type="button" className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-4 h-4 text-xs"
                onClick={() => updateItem(idx, { reference_photo_urls: (item.reference_photo_urls || []).filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <label className="w-16 h-16 border-2 border-dashed rounded flex items-center justify-center cursor-pointer text-slate-400">
            +
            <input type="file" accept="image/*" className="hidden" onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              const { file_url } = await UploadFile({ file: f });
              updateItem(idx, { reference_photo_urls: [...(item.reference_photo_urls || []), file_url] });
            }} />
          </label>
        </div>
      </div>
    </>
  )}
</div>
```

Ensure `UploadFile` and `Textarea` are imported in the file (add imports if missing: `import { UploadFile } from '@/integrations/Core';`, `import { Textarea } from '@/components/ui/textarea';`). The three fields save automatically because they mutate the same `items` array the existing save handler persists via `Checklist.update`.

- [ ] **Step 3: Build check**

Run (worktree root): `npx vite build` → builds clean. Do NOT commit `dist/`.

- [ ] **Step 4: Commit**

```bash
git add src/entities/all.js src/components/checklists/ChecklistEditDialog.jsx
git commit -m "feat(checklist-ai): editor — per-item reference photos, criteria, AI toggle"
```

---

### Task 5: Execution — real-time review + reference display + end summary

**Files:** Modify `src/components/checklists/ChecklistExecution.jsx`

- [ ] **Step 1: Add live review after a photo uploads.** READ the file. `handlePhotoUpload` (around line 69) pushes to `results[currentItem.order].photo_urls`. After a successful upload, when `currentItem.ai_review` is on, call the review function and store its result. Add `base44` import (`import { base44 } from '@/api/base44Client';`) and a busy state `const [reviewing, setReviewing] = useState(false);`. Extend `handlePhotoUpload`'s try-block, right after the `setResults(... photo_urls ...)` update:

```jsx
            if (currentItem.ai_review) {
              setReviewing(true);
              try {
                const res = await base44.functions.reviewChecklistItem({
                  checklist_id: checklist.id, item_order: currentItem.order, photo_url: file_url,
                });
                const rev = res?.data || res;
                setResults(prev => ({
                  ...prev,
                  [currentItem.order]: { ...prev[currentItem.order], ai_review: rev },
                }));
              } catch { /* advisory only — ignore */ }
              setReviewing(false);
            }
```

- [ ] **Step 2: Show references + the AI verdict on the item.** In the per-item render (where notes/photo controls are), add a reference block and a verdict block. Insert near the item's photo UI:

```jsx
{currentItem.ai_review && (currentItem.reference_photo_urls?.length || currentItem.expected_criteria) && (
  <div className="mt-2 p-2 bg-slate-50 rounded text-sm">
    {currentItem.expected_criteria && <div className="mb-1">🎯 <b>נדרש:</b> {currentItem.expected_criteria}</div>}
    {!!currentItem.reference_photo_urls?.length && (
      <div className="flex gap-2 flex-wrap">
        {currentItem.reference_photo_urls.map((u, i) => <img key={i} src={u} alt="ייחוס" className="w-16 h-16 object-cover rounded border" />)}
      </div>
    )}
  </div>
)}
{reviewing && <div className="mt-2 text-sm text-slate-500">🔍 בודק את התמונה...</div>}
{results[currentItem.order]?.ai_review && (() => {
  const v = results[currentItem.order].ai_review;
  const style = v.verdict === 'ok' ? 'bg-emerald-50 text-emerald-800' : v.verdict === 'attention' ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-600';
  const icon = v.verdict === 'ok' ? '✓' : v.verdict === 'attention' ? '⚠️' : '❓';
  return <div className={`mt-2 p-2 rounded text-sm ${style}`}>{icon} {v.feedback} <span className="opacity-60">(המלצה בלבד)</span></div>;
})()}
```

- [ ] **Step 3: Produce the end summary before manager sign-off.** In `saveExecution` (around line 127), BEFORE the manager-name check / final save, build the results array with `ai_review` per item and request a summary; store it on the execution data being saved and display it. Add state `const [aiSummary, setAiSummary] = useState('');`. Where the component builds the results array for saving (it maps `results` keyed by order into an array), also call:

```jsx
      // End-of-run AI summary (advisory) shown before the manager signs.
      try {
        const resultsArr = Object.entries(results).map(([order, r]) => ({ item_order: Number(order), task: checklist.items.find(i => i.order === Number(order))?.task, ...r }));
        const s = await base44.functions.summarizeChecklistExecution({ results: resultsArr });
        setAiSummary((s?.data || s)?.ai_summary || '');
      } catch { /* advisory */ }
```

Render `aiSummary` near the manager sign-off field:

```jsx
{aiSummary && (
  <div className="my-2 p-3 bg-indigo-50 border border-indigo-200 rounded text-sm whitespace-pre-line">
    <b>🤖 סיכום AI לפני חתימה:</b>{'\n'}{aiSummary}
  </div>
)}
```

Persist `ai_review` per item into the saved execution `results` and `ai_summary` on the execution (include them in the object passed to `ChecklistExecution.create`). Do NOT block saving on the summary.

- [ ] **Step 4: Build check** — `npx vite build` clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/checklists/ChecklistExecution.jsx
git commit -m "feat(checklist-ai): live per-item review + references + end summary in execution"
```

---

### Task 6: Archive — manager override (learning)

**Files:** Modify `src/components/checklists/ChecklistArchive.jsx`

- [ ] **Step 1: Add override buttons per reviewed item.** READ the file. Where the archive shows each item's detail (`detailed_results`), when an item has an `ai_review`, render the verdict + two buttons that call `overrideChecklistItemReview`. Add `base44` import. In the per-item detail render:

```jsx
{item.ai_review && (
  <div className="mt-1 text-sm">
    <div className="text-slate-600">🤖 {item.ai_review.feedback}</div>
    <div className="flex gap-2 mt-1">
      <Button size="sm" variant="outline" onClick={async () => {
        await base44.functions.overrideChecklistItemReview({ execution_id: archive.original_execution_id, item_order: item.item_order ?? item.order, decision: 'approved' });
        alert('סומן כתקין — המערכת תלמד מזה');
      }}>👍 תקין</Button>
      <Button size="sm" variant="outline" onClick={async () => {
        const note = window.prompt('מה לא היה תקין? (אופציונלי)') || '';
        await base44.functions.overrideChecklistItemReview({ execution_id: archive.original_execution_id, item_order: item.item_order ?? item.order, decision: 'rejected', note });
        alert('סומן כלא תקין — המערכת תלמד מזה');
      }}>👎 לא תקין</Button>
    </div>
  </div>
)}
```

Use the real variable names from the file (the selected archive object and its per-item loop variable). The `execution_id` is `archive.original_execution_id` (the archive stores it, per schema.prisma:508). If the per-item objects in `detailed_results` don't carry `ai_review`, also copy `ai_review` into `detailed_results` when the archive is created in `ChecklistExecution.jsx` (Task 5) — verify and add if missing.

- [ ] **Step 2: Build check** — `npx vite build` clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/checklists/ChecklistArchive.jsx
git commit -m "feat(checklist-ai): manager override buttons in archive (learning loop)"
```

---

### Task 7: Deploy + additive SQL + verification

**Files:** none new. Deploy per `DEPLOY_BRIEF.md`: app root `/opt/top-alena` on `91.98.45.253`; web bundle built locally + `dist/` committed; schema via additive SQL (db push forbidden — drift); tenant schemas share Postgres via `?schema=tenant_<slug>` (container env has TWO `DATABASE_URL` lines — use the LAST). SSH port 22 is intermittently blocked — retry in a loop or hand commands to the Hetzner web console.

- [ ] **Step 1: Full local verification**

```bash
cd apps/api && npx tsc -p tsconfig.json --noEmit && npx vitest run
```
Expected: clean typecheck, all tests pass.

- [ ] **Step 2: Build web bundle + commit dist/**

```bash
npx vite build
git add dist/
git commit -m "build: web bundle for checklist AI coach"
```

- [ ] **Step 3: Push**

```bash
git push origin migration
```

- [ ] **Step 4: Additive SQL** — create `/tmp/checklist-ai.sql`:

```sql
CREATE TABLE IF NOT EXISTS "ChecklistItemExample" (
  "id" TEXT PRIMARY KEY,
  "checklist_id" TEXT NOT NULL,
  "item_order" INTEGER NOT NULL,
  "photo_url" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'override',
  "created_by" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ChecklistItemExample_checklist_id_item_order_idx" ON "ChecklistItemExample"("checklist_id","item_order");
ALTER TABLE "ChecklistExecution" ADD COLUMN IF NOT EXISTS "ai_summary" TEXT;
```

- [ ] **Step 5: Deploy + apply schema** (SSH, else Hetzner console):

```bash
cd /opt/top-alena && git fetch origin migration && git reset --hard origin/migration && docker compose up -d --build api web
docker compose exec -T api npx prisma db execute --stdin --schema prisma/schema.prisma < /tmp/checklist-ai.sql
for c in $(docker ps --format '{{.Names}}' | grep '^tenant-.*-api$'); do
  url=$(docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DATABASE_URL=' | tail -1 | cut -d= -f2-)
  docker compose exec -T api npx prisma db execute --stdin --url "$url" < /tmp/checklist-ai.sql && echo "$c OK"
done
```

Verify bundle: `curl -s https://topalena.com/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'` matches the new `dist/assets/` name.

- [ ] **Step 6: Live E2E**

1. Owner opens a checklist editor → on one item, enable AI review, add a reference photo + criteria, save.
2. Execute that checklist → upload a photo for the item → confirm a real-time verdict (✓/⚠️/❓ + feedback) appears with the reference shown, and it does NOT block.
3. Finish → confirm the AI summary appears above the manager sign-off; sign + save.
4. Open the archive for that execution → 👍/👎 an item → confirm a `ChecklistItemExample` row was created (query DB) with the right label.
5. Re-execute + review the same item → confirm the new example is included (the review reads it).

- [ ] **Step 7: Commit fixes + update memory**

Fix anything the E2E surfaced (each its own commit). Update memory (`project_labor_cost.md`'s siblings or a new `project_checklist_ai.md`) noting: checklist AI coach shipped; advisory per-task review + end summary + learning via ChecklistItemExample; additive SQL applied to Alena + tenants; `gemini-2.5-flash` vision.

---

## Self-Review Notes

- **Spec coverage:** references (photo+criteria) per item + AI toggle (Task 1 Json fields + Task 4 editor); learning corpus `ChecklistItemExample` (Task 1 model, Task 3 override/add, Task 6 UI); real-time advisory per-task review (Task 3 `reviewChecklistItem`, Task 5 UI, never blocks); end summary before sign-off (Task 3 `summarizeChecklistExecution` + `ai_summary` col, Task 5 UI); learning from manager corrections (Task 3 `overrideChecklistItemReview` → example, Task 6 UI); range-of-examples & full context (Task 2 `selectExamplesForReview`/`buildReviewPrompt`); advisory principle (unknown/failure never blocks — Task 3 fallbacks); additive SQL incl. tenants (Task 7).
- **Advisory guarantee:** every AI path returns a verdict object or empty summary on failure; no code path blocks save/next. Verified in Task 3 (try/catch → `unknown`) and Task 5 (ignore errors, don't gate save).
- **Known simplification:** example cap is "most-recent N per label" (Task 2) — no smarter lifecycle; noted out-of-scope in the spec.
