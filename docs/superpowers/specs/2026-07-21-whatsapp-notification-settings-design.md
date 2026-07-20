# WhatsApp / Notification Settings — Design Spec

**Date:** 2026-07-21
**Author:** Claude + Dvir
**Status:** Approved scope ("build it all" — toggle + text + schedule for every message)

## Goal

Turn the read-only WhatsApp catalog (58 business-initiated messages) into an **in-app settings page** where the owner can, per message:

1. **Turn it on/off** — silence a message that annoys them.
2. **Edit the message text** — reword it in their own words.
3. **Edit the timing** — change the day/time of scheduled messages.

Multi-tenant, owner-gated, and **zero-risk to existing behavior**: if the owner never touches a message, it behaves exactly as it does today.

## Non-goals

- No change to *which* data a message reports (we edit wording/timing/on-off, not the underlying computation).
- No new Meta template submissions for the wrapper messages (custom text flows into the already-approved `{{3}}` variable — see Text tiering).
- No cross-tenant / platform-admin editing. Per-tenant only.

## Core safety guarantee

The whole feature is an **isolated table** (`NotificationSetting`) read with raw SQL, mirroring the proven `MarketingPixelSetting` / `EventThanksSetting` pattern (`apps/api/src/functions/eventThanks.ts`). **An empty table = today's behavior, byte-for-byte.** Every read merges the DB row *over* a hardcoded default that already lives in code. Nothing changes until the owner saves an override. "Reset to default" = delete the row.

---

## Architecture

### 1. Data — `NotificationSetting` table (one row per message key)

Created via additive SQL (`CREATE TABLE IF NOT EXISTS`, `.catch(()=>{})`), read/written via `$queryRawUnsafe` / `$executeRawUnsafe`. Prisma-invisible by design.

```sql
CREATE TABLE IF NOT EXISTS "NotificationSetting" (
  key           TEXT PRIMARY KEY,   -- matches the registry key
  enabled       BOOLEAN,            -- NULL => use registry default
  custom_text   TEXT,               -- NULL => use registry default template
  schedule_json JSONB,              -- NULL => use registry default schedule
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_by    TEXT
);
```

`schedule_json` shape:
- Single-time messages: `{ "time": "09:00" }`
- Per-weekday messages (e.g. daily hours report): `{ "slots": { "0":"01:00", "1":"01:00", ... , "4":"03:30" } }`
- Interval messages (drips, reminders): schedule not editable — see Schedule tiering.

### 2. Registry — `apps/api/src/lib/notificationRegistry.ts` (source of truth for defaults + metadata)

One declarative entry per message. This is also the machine-readable version of the catalog artifact.

```ts
export type NotifKind = 'cron' | 'event' | 'action';
export type NotifAudience = 'owner' | 'staff' | 'customer' | 'vendor' | 'tenant';
export type TextEditability = 'full' | 'none' | 'meta_reapproval';

export interface NotifDef {
  key: string;                 // 'daily_hours_report'
  audience: NotifAudience;
  label: string;               // Hebrew label shown in UI
  description: string;         // Hebrew "when / to whom"
  kind: NotifKind;
  defaultEnabled: boolean;
  // schedule
  scheduleEditable: boolean;   // true only for kind==='cron' with a wall-clock slot
  scheduleShape: 'time' | 'slots' | 'none';
  defaultSchedule?: { time?: string; slots?: Record<string,string> };
  // text
  textEditability: TextEditability;
  defaultText?: string;        // template with {tokens}; omitted for composite reports
  variables?: { token: string; label: string }[]; // insertable tokens for the editor
  // provenance (so we can audit wiring)
  source: string;              // 'dailyHoursReport.ts:247'
}
export const NOTIFICATIONS: NotifDef[] = [ /* 58 entries */ ];
export const byKey = (k: string) => NOTIFICATIONS.find(n => n.key === k);
```

### 3. Merge lib — `apps/api/src/lib/notificationSettings.ts`

Reads the table once, caches ~60s (like `getNudgeConfig` / `isApproved`), merges over the registry.

```ts
isNotifEnabled(key): Promise<boolean>              // registry.defaultEnabled unless overridden
renderNotifText(key, vars): Promise<string>        // owner template or registry.defaultText, {tokens} filled
notifSchedule(key, fallback): Promise<Schedule>    // owner schedule or registry default
// admin surface:
listNotifSettings(): Promise<Array<NotifDef & {enabled, text, schedule, overridden}>>
setNotifSetting(key, patch, userId): Promise<void>  // upsert
resetNotifSetting(key): Promise<void>               // delete row
```

`renderNotifText` does simple `{token}` replacement. For composite reports (`textEditability:'none'`) it's not called — those keep building their string in code.

### 4. Wiring the 58 send sites

- **Enable gate** — added once at the *dispatcher* level (not per-recipient), early-return `{skipped:true}` when disabled. Scheduled sends gate inside their `check*Schedule` gate; event/action sends gate at function entry.
- **Text** — sites with editable text stop hardcoding the Hebrew string and instead `const text = await renderNotifText(key, vars)`. The wrapper (`notifyOwner`/`notifyStaff`/`sendClubMessage`) already routes `text` into the approved `{{3}}` variable, so **rewording needs no Meta re-approval**.
- **Schedule** — cron gates read `notifSchedule(key, DEFAULT)` instead of the hardcoded `SLOTS`/time constant.

### 5. Backend API (registered in `apps/api/src/functions`)

- `getNotificationSettings` — authed read; returns `listNotifSettings()` grouped by audience for the UI.
- `setNotificationSetting` — owner/back-office gated (`isAdminRole(user.role)`, mirror `setMarketingPixels`); `{key, enabled?, custom_text?, schedule_json?}`.
- `resetNotificationSetting` — owner-gated; `{key}`.
- `previewNotificationText` — authed; renders a template with sample vars for the edit modal.

### 6. Frontend — `src/pages/NotificationSettings.jsx`

- Wrapped in `<PageGuard pageName="NotificationSettings" pageTitle="התראות וואטסאפ 🔔">`.
- Registered in `src/pages.config.js` (import + `PAGES` entry) and `src/Layout.jsx` `adminLinks` settings category; added to `MANAGER_EXCLUDE` (owner-only).
- Layout mirrors the catalog artifact: grouped by audience (בעלים / עובדים / לקוחות / ספקים / טננט חדש), each message a `Card` with:
  - `Switch` (enabled) — **per-row autosave** (like `LocationSettings.jsx`), calls `setNotificationSetting`.
  - "when" line: for cron messages, inline `TimePicker` (single) or a per-weekday grid (slots) — Save on the row.
  - **[ערוך טקסט]** button → `Dialog` (mirror `MessageTemplates.jsx`) with a `Textarea`, insertable **variable chips**, a live preview, and — for `meta_reapproval` messages — a clear note that a reworded version goes to Meta review (24–72h) and meanwhile falls back to SMS.
  - **[אפס לברירת מחדל]** → `resetNotificationSetting`.
  - `textEditability:'none'` messages show no text editor, only toggle + schedule, with a short "מורכב מנתונים חיים" note.

---

## Text-editability tiering (the honest part)

| Tier | Meaning | Which messages | Count (approx) |
|---|---|---|---|
| `full` | Reword freely, no Meta approval — text rides in the approved `{{3}}` variable, or it's SMS/free-form | Owner alerts & reminders, staff nudges, club drips (birthday/anniversary/welcome/NPS/pre-birthday), broadcasts | ~30 |
| `meta_reapproval` | Editable, but a reworded version must pass Meta review (24–72h); SMS fallback meanwhile | Dedicated templates: reservation confirmed, table-ready/waitlist, club welcome-benefit, employee invite | ~5 |
| `none` | Toggle + schedule only (assembled from live data) | Composite reports: daily hours, morning brief, end-of-day brief, weekly insights, CEO daily brief | ~6 |

The remaining sends are event/action messages whose text is `full`.

## Schedule-editability tiering

| Editable? | Which |
|---|---|
| **Yes — time / per-weekday** | The scheduled owner reports & staff nudges that fire at a wall-clock slot (daily hours, morning/EoD brief, weekly insights, weekly-schedule open/reminder/final, birthday/anniversary campaign, T24 survey, etc.) |
| **No — interval/event/action** | Drip campaigns (every 30m by design), reservation day-of reminder (proximity-gated), no-show watcher, and all event/owner-action sends. These get toggle (+ text) only. |

**Crontab-driven reports** (morning brief, EoD, weekly insights, T24 — time currently lives in the server crontab): add a self-gating in-process timer (5-min tick, reads configured time) so the app can change their time; leave the existing crontab ping as a dedup-guarded backup (the 12h `last_*_at` guards already prevent double-sends). Most other scheduled sends already use the in-process self-gating timer, so they need only to read the configured slot.

---

## RBAC

- Page: `PageGuard pageName="NotificationSettings"` (owner/allowed-tier only), + `MANAGER_EXCLUDE`.
- Write functions: `isAdminRole(user.role)` gate (owner/admin/manager) — but since it's owner-only in the sidebar, effectively owner. Read function: authed.

## Rollout / risk

- New isolated table + new registry/lib + new page. **No existing table touched.** Empty table ⇒ identical behavior.
- Wiring is additive: a gate that defaults to "enabled=true" and text that defaults to the current hardcoded string.
- Deploy path: `npx vite build` + `git add -f dist apps/api/dist` + `cd apps/api && npm run build` + commit + push → autodeploy. Per-tenant DB migration runs lazily via `CREATE TABLE IF NOT EXISTS` on first read.
- Verify on live: toggle one low-stakes message off, confirm the scheduled send skips; edit one drip's text, confirm the rendered message.

## Build order (file-by-file)

1. `notificationRegistry.ts` — the 58 declarations (biggest file; data already gathered).
2. `notificationSettings.ts` — table bootstrap + merge/cache + get/set/reset/render.
3. Backend functions — get/set/reset/preview, registered + gated.
4. Wire send sites — enable gate + `renderNotifText` + schedule reads, in tiers (owner → staff → customer → vendor/tenant).
5. `NotificationSettings.jsx` + register (pages.config, Layout) + PageGuard.
6. Build + deploy + verify on live.
