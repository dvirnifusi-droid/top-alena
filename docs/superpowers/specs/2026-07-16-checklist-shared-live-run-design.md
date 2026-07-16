# Checklist: one shared live run for both modes

**Date:** 2026-07-16 · **Requested by:** Dvir (owner) · **Status:** approved in chat

## Problem

A checklist has two run modes that don't talk to each other:

- **📋 תצוגת הכנות (לייב)** (`ChecklistLiveRun.jsx`) — marks save live to a shared
  daily `ChecklistExecution` row (`live_<checklistId>_<ilDate>`), 12s polling,
  multi-user safe (atomic `jsonb_set` per item).
- **🚀 התחל ביצוע** (`ChecklistExecution.jsx` wizard) — all state is local React
  state; a `ChecklistExecution` row is created only at the final "סיים ושמור".
  Page reload loses everything; two employees can't share a run; live view
  can't see wizard progress and vice versa.

They also key items differently: live uses `keyOf(item,i)` =
`item.id || o<order> || i<index>`; the wizard keys by raw `item.order` and saves
`results` as an **array**, so the payloads are mutually unreadable.

## Decision (owner-approved)

One shared daily run per checklist, used by **both** modes. Progress persists
server-side; a checklist resets **only** on:

1. **סיים ושמור** (wizard, with manager signature) → run marked `completed` +
   archived → the next open starts a fresh run;
2. **איפוס צ'קליסט** (per checklist, managers only);
3. **איפוס יום** (all of today's runs, one button, managers only).

Never on reload / re-entry / mode switch.

## Design

### Backend (`apps/api/src/functions/load.ts`)

- `openChecklistLiveRun` — returns today's **active** (non-completed) run;
  if today's run is completed, creates the next one (`live_<id>_<date>_r2`,
  `_r3`, …). Insert stays `ON CONFLICT DO NOTHING` so two simultaneous openers
  join the same run.
- `toggleChecklistLiveItem` — becomes a **merge** (`existing || patch`) instead
  of replace, and accepts an optional `patch` object with the wizard's richer
  fields: `notes`, `performed_by`, `photo_urls`, `ai_review`,
  `requires_followup`. `checked:true` still stamps `checked_by`/`checked_at`
  server-side. Back-compat: existing `checked`/`photo_url` args unchanged.
- `finishChecklistLiveRun` (new) — sets `status` (`completed` /
  `requires_attention`), `overall_score`, `notes`, `ai_summary`,
  `approving_manager_name` on the shared run. Archive row creation stays
  client-side (unchanged).
- `resetChecklistLiveRun` (new, manager-gated) — deletes today's non-completed
  run(s) for one checklist.
- `resetChecklistDay` (new, manager-gated) — deletes ALL of today's
  non-completed live runs.
- Manager gate = app user `role` in `admin|owner` (in-app managers hold admin).

### Wizard (`ChecklistExecution.jsx`)

- Adopt the live view's `keyOf(item, i)` for `results` keys.
- On mount: `openChecklistLiveRun` → hydrate `results` (object) + `notes`.
- Every mutation saves immediately: check/uncheck on tap; notes + performed_by
  on blur; photos + ai_review on upload — all via `toggleChecklistLiveItem`
  merge patches.
- 12s idle-guarded polling (same pattern as live view) pulls others' marks.
- "סיים ושמור" → `finishChecklistLiveRun` + archive (as today) → `onComplete`.
- "התחל מחדש" → `resetChecklistLiveRun` (confirm dialog; manager-only button).

### Page (`Checklists.jsx` + `ChecklistCard.jsx`)

- Header button **"איפוס יום"** (manager-only, confirm) → `resetChecklistDay`.
- Card dropdown item **"איפוס צ'קליסט להיום"** (manager-only, confirm) →
  `resetChecklistLiveRun`.
- Card status prefers today's **active** run over older completed ones so the
  progress bar reflects the current shared run.

### Error handling

- All live saves are optimistic with server echo (existing pattern); failures
  log a console warning and the next poll reconciles.
- Reset fns require auth + manager role; return `{ok, deleted}`.

### Testing

- tsc build for API; vite build for web.
- Live verification on prod: open wizard, mark items, confirm the live view
  shows them (and vice versa); reload wizard mid-run → progress intact;
  finish with signature → archive row exists and next open is clean.
