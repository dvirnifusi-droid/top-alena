# TOP ALENA — Project Memory for Claude

This file is auto-loaded by Claude Code at session start. **Read every section before responding.** Most of the gotchas below cost real time when missed.

---

## 0. ⚠️ FIRST: verify you're in the right repo

The owner has **two checkouts** on the same machine and they are NOT interchangeable:

| Path | Branch | Purpose |
|---|---|---|
| `C:\Users\97253\top-alena-migration` | `migration` | ✅ **THIS IS THE PROJECT.** All live code, all features built post-migration. |
| `C:\Users\97253\TOP ALENA` | `main` | ❌ Old checkout. Base44-reverted placeholder. **Do not edit.** |

If you opened in `TOP ALENA`, **stop immediately** and ask the user to reopen Claude from `C:\Users\97253\top-alena-migration`. Don't try to edit files there — you'll be working in the wrong tree and nothing will reach production.

First action of every session: `cd /c/Users/97253/top-alena-migration && git status -sb && git log --oneline -1`. If `git status` shows `## migration...origin/migration`, you're in the right place. Production is at https://topalena.com on branch `migration`; pushes auto-deploy in ~2 min.

---

## 1. What this is

**TOP ALENA / עלינא** — a multi-page restaurant management web app for a kosher restaurant in Rishon LeZion, Israel. The owner is Dvir Nifusi (dvirnifusi@gmail.com).

The app was originally built on the no-code platform **Base44**. We migrated it to a fully self-hosted stack on the owner's own VPS. The migration is *complete and in production* at **https://topalena.com**. Auto-deploy from `origin/migration` is live; pushing a commit there ships it in ~2 minutes.

Communication with the user is **always in Hebrew** (RTL). The owner wants velocity and clear answers, not long disclaimers.

---

## 2. Repo layout (monorepo)

```
top-alena-migration/
├─ apps/api/              # Fastify + Prisma backend (TypeScript)
│  ├─ src/
│  │  ├─ index.ts         # Fastify boot, route registration, preSerialization hook
│  │  ├─ db.ts            # prisma client
│  │  ├─ middleware/auth.ts
│  │  ├─ routes/
│  │  │  ├─ entities.ts           # generic /api/entities/* CRUD (alias layer)
│  │  │  ├─ functions.ts          # /api/fn/* (auth) — function handlers
│  │  │  ├─ publicFunctions.ts    # /api/public/fn/* (no auth) + /api/public/entities
│  │  │  ├─ auth.ts               # /api/auth/login, /google, /me
│  │  │  ├─ integrations.ts       # /api/integrations/* (upload, llm, etc.)
│  │  │  ├─ files.ts              # /api/files/* — streams uploads from MinIO
│  │  │  ├─ cron.ts               # /api/cron/* — guarded by CRON_SECRET
│  │  │  └─ import.ts             # /api/import/* — Base44 → Supabase seed
│  │  ├─ functions/load.ts        # ALL registerFn(...) calls live here (one big file)
│  │  └─ lib/
│  │     ├─ twilio.ts             # sendSms, sendWhatsApp, normalizeIsraeliPhone
│  │     ├─ pushover.ts           # pushover(), pushoverToAdmins()
│  │     ├─ telegram.ts           # sendTelegramMessage
│  │     ├─ email.ts              # sendEmail (Resend)
│  │     ├─ llm.ts                # invokeLLM (Gemini) — supports fileUrls + responseSchema
│  │     ├─ gdrive.ts             # driveAccessToken, listDriveFiles, downloadDriveFile
│  │     ├─ storage.ts            # MinIO client, uploadStreamToS3, createSignedUrl
│  │     ├─ urlRewrite.ts         # rewrites legacy internal MinIO URLs -> /api/files/*
│  │     ├─ triggers.ts           # entity event handlers (Pushover + WebPush)
│  │     └─ notifications.ts      # notifyEmployee (free Web Push, replaces SMS)
│  ├─ prisma/schema.prisma        # one file, all models (auto-generated header)
│  └─ Dockerfile                  # CMD runs `prisma db push --skip-generate` then node
├─ src/                  # React + Vite frontend (JSX, RTL)
│  ├─ pages/             # all top-level pages
│  ├─ components/        # shared + per-feature components
│  ├─ api/base44Client.js         # SDK shim — preserves @base44/sdk surface
│  ├─ lib/publicFetch.js          # invokePublic(name, payload) for public function calls
│  ├─ pages.config.js             # explicit page registry (NOT auto-generated despite header)
│  └─ Layout.jsx                  # admin/employee sidebar, search, color-coded categories
├─ public/
│  ├─ sw.js              # service worker (push + offline shell)
│  ├─ manifest.json      # PWA manifest
│  └─ icons/             # 192/512/maskable/apple-touch
├─ docker-compose.yml    # minio, api, web, caddy
├─ Caddyfile             # @api /api/* → api:3001, fallback → web:80
├─ Dockerfile.web        # vite build → nginx
├─ nginx.conf            # SPA fallback
├─ setup-autodeploy.sh   # installs the systemd cron + the per-feature crons + CRON_SECRET
├─ scripts/generate-icons.cjs    # pure-Node PNG generator for PWA icons
└─ docs/superpowers/specs/        # design docs from past brainstorming sessions
```

---

## 3. Stack

| Layer | Tool |
|---|---|
| Backend runtime | Node 20-alpine in Docker |
| Web framework | Fastify (`@fastify/cors`, `@fastify/jwt`, `@fastify/multipart`) |
| ORM | Prisma → Supabase Postgres |
| Object storage | MinIO (in compose), served via `/api/files/*` not directly |
| TLS / reverse proxy | Caddy (origin self-signed) ← Cloudflare proxy ("Full" mode) |
| LLM | Google Gemini (`invokeLLM` with responseSchema for structured JSON; supports fileUrls for vision) |
| Auth | JWT (Google ID-token login via `/api/auth/google`; password login also supported) |
| Push | `web-push` (VAPID) — both customer (QueueEntry) and staff (Employee.push_subscription) |
| SMS / WhatsApp | Twilio |
| Pushover | direct REST |
| Email | Resend |
| Frontend | React 18 + Vite + Tailwind + shadcn/ui + lucide-react |
| Domain | Cloudflare-registered topalena.com → server IP (Hetzner) |

---

## 4. Critical conventions / gotchas

### 4.1 The base44Client shim (`src/api/base44Client.js`)

The whole frontend was written against `@base44/sdk`. We replaced the SDK with a thin shim that talks to our own API. **Surface preserved 1:1** for entities, auth, integrations.Core, and functions.

Key behaviors:
- `base44.entities.X.list(sort, limit, skip) / filter(where, sort, limit, skip) / get(id) / create(data) / update(id, data) / delete(id)` → `/api/entities/X*`
- `base44.entities.X.subscribe(cb)` → **no-op**, returns `() => {}`. The migration uses 5s polling instead.
- `base44.asServiceRole.entities.X.*` → `/api/public/entities/X*` (read-only, public). Use this when an unauthenticated page needs to read a whitelisted entity.
- `base44.functions.NAME(payload)` → axios-style `{ data, status }` response wrap. **Components read `res.data.X`** — do not return raw bodies from the function and expect old code to work.
- `invokePublic('NAME', payload)` (from `src/lib/publicFetch.js`) → `/api/public/fn/NAME`, returns raw body. Used by **public pages only** (`QueueJoin`, `QueueFeedback`, `QueueGame`, `PublicReservation`, `JobApplication`).

### 4.2 Field-name aliasing in the entities route

The Prisma client has fields named `type_` (because `type` is reserved JS), mapped via `@map("type")`. The Base44 frontend was written using `type`. The entities route (`apps/api/src/routes/entities.ts`) **translates in both directions automatically** using `Prisma.dmmf.datamodel.models[].fields[].dbName`:

- **WRITE** (data, where, sort): incoming `{type: "earned"}` → `{type_: "earned"}` for Prisma.
- **READ** (responses): outgoing `{type_: "earned"}` → `{type: "earned"}` for the frontend.

This works for `type_` (multiple models) and `u_notified_abandoned` (QueueEntry). **If you add another `@map`'d field, no extra code is needed** — the alias map is built from the DMMF at boot.

### 4.3 `coerceData` drops unknown fields

`coerceData` in entities.ts **silently discards** keys that aren't real Prisma fields on the model. Base44 tolerated extra UI-only fields (e.g. `Incident.photo_url`); Prisma rejects them. Dropping is the lesser evil — admin forms work, and missing data is a known compromise. If you need a UI-only field persisted, **add the column** to schema.prisma.

### 4.4 Legacy MinIO URL rewrite (`lib/urlRewrite.ts` + preSerialization hook)

A lot of stored `file_url`s look like `http://localhost:9000/top-alena/<key>` or `http://minio:9000/...` or `https://topalena.com/storage/<key>` — none of which the browser can actually reach. A **Fastify preSerialization hook in `index.ts` walks every JSON response and rewrites these strings** in place to `/api/files/<key>` (which is then streamed by `routes/files.ts` from MinIO over HTTPS via Caddy). New uploads go directly through `storage.ts` which already returns `/api/files/<key>`.

### 4.5 Auth response shape — `full_name` (snake_case) only

The User column is `fullName`. The frontend reads `user.full_name`. `/api/auth/me`, `/login`, `/google`, `/register` all return `full_name` falling back to email so it's **never null** (downstream `employee_name` columns are `String` not `String?`).

### 4.6 Auto-deploy (no manual deploys needed)

System cron on the server runs every 2 min:
```bash
*/2 * * * * /usr/local/bin/topalena-autodeploy.sh
```
which does `git fetch + reset --hard origin/migration` and `docker compose up -d --build` **only if** the remote SHA changed. **Do not push code and then tell the user to deploy** — `git push origin migration` is enough. Wait ~2 min and verify via `https://topalena.com/api/public/fn/deployInfo` (bump the version string in `load.ts` when you want explicit proof a specific commit landed).

The auto-deploy worker is installed by **`setup-autodeploy.sh`** — the owner has already run it. It also provisions `CRON_SECRET` and the hourly restroom-reminder cron line. If you add a new cron (system-level), extend this script and the user re-runs it once.

### 4.7 Prisma schema changes auto-apply

The API container's CMD is:
```sh
npx prisma db push --skip-generate || echo 'skipped'; node dist/index.js
```
So **additive** schema changes (new model / new nullable column) reach Supabase automatically on next deploy. Destructive changes are refused (non-interactive). When you add a column the code uses, **wrap the create/update in a retry that omits the new field on Prisma errors** so a single deploy that's slow to push the schema doesn't lose data — see the kashrut retry in `chatJobApplication` for the pattern.

### 4.8 Public read-entity whitelist

`PUBLIC_READ_ENTITIES` in `routes/publicFunctions.ts` is a `Set` of model names that are reachable via `/api/public/entities/*` without auth. Add to this only when an unauthenticated page genuinely needs the data. Current members: `QueueEntry, RestaurantProfile, RestaurantInfo, ReservationSettings, AvailabilityFormSettings, GameQuestion, TriviaQuestion, QueueGameSession, Apparel, MenuItem`.

### 4.9 Public function whitelist (auth bypass)

When `registerFn('name', handler, { public: true })`, the function is callable via `/api/public/fn/name`. Most functions are private — only the customer-facing flow (QueueJoin, QueueGame, QueueFeedback, PublicReservation, JobApplication) uses public ones. Audit before flipping public on a new function.

### 4.10 Dropdown of auto-triggered side effects (`lib/triggers.ts`)

After every entities-route `create` or `update`, `fireTriggers(model, event, row, prev)` runs **fire-and-forget**. Each handler is wrapped in its own try/catch and never blocks the response. Currently registered:

| Model.event | Side effect |
|---|---|
| Incident.created | Pushover to admins |
| ChecklistExecution.updated → completed | Pushover |
| TipReport.updated → locked | Pushover |
| ShiftEndReport.created | Pushover |
| EmployeeAvailability.created | Pushover |
| ShiftTracking.created | Pushover (clock-in) |
| ShiftTracking.updated → >10h | Pushover (overtime) |
| DailyBrief.updated → published | Pushover |
| ShiftSwapRequest.created | Pushover |
| LeaveRequest.created | Pushover |
| LeaveRequest.updated → status change | Pushover **and** notifyEmployee (Web Push, was SMS) |
| WorkShift.created | notifyEmployee for each assigned employee |
| ShiftSwapRequest.updated → status change | notifyEmployee for the requester |

`notifyEmployee(employee_id, title, body, url)` uses `Employee.push_subscription`. If the employee hasn't enabled push (`EnableStaffPush` banner on Layout) the notification is dropped silently. **Do not fall back to SMS** — that's deliberate, the owner doesn't want Twilio costs for staff.

### 4.11 The single `load.ts` file

`apps/api/src/functions/load.ts` is **the** function registry. It's ~2300 lines and growing. All `registerFn` calls live here, organized into commented sections (Queue, SMS, Pushover, Gemini admin, Reservations, Restroom, Recruitment, Marketing AI, etc.). **Don't split it** — the existing structure works and it's the canonical place anyone looking for a function name will check first.

### 4.12 Hebrew / RTL everywhere

All UI strings are Hebrew. `dir="rtl"` on top-level page containers. Tailwind logical spacing helpers used in places. Date formatting via `date-fns` with `he` locale. Phone numbers normalize to `+972...` via `normalizeIsraeliPhone` in `lib/twilio.ts`.

---

## 5. Working from Windows / Git Bash

The owner's local checkout is at **two different paths**:

- `/c/Users/97253/top-alena-migration` ← **the actual repo. All edits go here. This is the `migration` branch.**
- `/c/Users/97253/TOP ALENA` ← old checkout still containing the `main` branch (Base44-reverted code). **Do not touch.**

The Claude Bash tool's working directory doesn't always persist between calls on Windows Git Bash. **Use explicit `cd /c/Users/97253/top-alena-migration && ...` at the start of every Bash call**, or use `git -C /c/Users/97253/top-alena-migration` for git commands. There's been at least one bug where commits ran in the wrong repo and silently no-op'd.

Line ending warnings (`LF will be replaced by CRLF`) on commit are normal and harmless.

---

## 6. The user's working style (from history)

- **Hebrew only** in responses.
- Strongly action-oriented. After a quick plan, just build and ship. "מה שאתה אומר" / "מה שאתה חושב" is approval.
- Prefers chunked progress over big-bang releases — commit and push frequently so work isn't lost if the session crashes (and it does crash; cwd bugs caused at least one phantom commit).
- Likes to see verification — "תספר מה היה" after every change. Tell them what changed, what to test, and what's still pending.
- Tolerant of "we'll add later" if you're explicit about what's deferred and why.
- Asks for things in pieces — feature creep is the norm. Build the smallest correct thing and iterate.

---

## 7. Major features built post-migration (not in original Base44)

- **PWA**: manifest, icons, offline service worker, "Install app" prompt (Android beforeinstallprompt + iOS Add-to-Home-Screen instructions).
- **Restroom cleaning**: hourly cron pushes the on-shift staff via web-push to mark a check (optional photo).
- **Recruitment AI agent** at `/apply`: anonymous web chat (no WhatsApp needed). Gemini drives the chat with a strict 8-question script + kashrut filter for cooking positions. Auto-books interview slots for score ≥ 80, sends 3-hour-before Pushover reminders.
- **Interview slot system**: weekly recurring templates → actual `Interview` rows with show/no-show status, WhatsApp reminder buttons in dashboard, training pipeline (`hired → learning_menu → menu_exam_scheduled → menu_exam_passed/failed → training (with session counter) → active_waiter`).
- **Position-level kashrut requirement** (`WorkPosition.requires_kashrut`): when the candidate picks one of those positions, the bot asks a single explicit question; "no" answer → score -21 capped at 79 → manual review only. Applied uniformly, not name-based.
- **Marketing AI advisor** (`/MarketingAdvisor`): 8-section business profile → Gemini-generated 6-month strategy + materialized MarketingTasks with full how-to / copy / warnings / KPI. Pulls last 30 days of `ShiftEndReport` data into every prompt for grounded advice. Budget tiers in the persona (0–1.5k / 1.5–3k / 3k+). Menu-photo upload uses Gemini vision to extract structured items.
  - **Strategy ↔ Tasks alignment** (most recent work): every `MarketingTask` carries `strategy_id`, `month_number` (1–6), `week_in_month` (1–4), and `monthly_theme`. The Gemini prompt is forced to distribute 12–16 tasks per month across the 4 weeks (week 1 = launch tasks, week 2 = ongoing content/operations, week 3 = momentum + result-checks, week 4 = advanced + monthly review + next-month prep) and every task must support one of that month's milestones.
  - **Per-month task generation**: separate `generateMonthTasks(month_number)` function. The owner clicks "🚀 התחל חודש N" to materialize the next month's tasks; the function loads what was completed/skipped in the prior month and feeds both lists to Gemini so the next plan is aware of carry-over work.
  - **TasksView** (`src/pages/MarketingAdvisor.jsx`) renders Month selector → Month context card → Week cards with progress bars → Day groups → Task cards. Most recent fix: commit `4512d2d` removed a stale `completed.length` block left over from the refactor (was causing `completed is not defined` runtime error caught by ErrorBoundary).
- **Sidebar**: 10 color-coded categories, real-time search box (Hebrew), iOS notch-safe header, EnableStaffPush banner above `<main>`.
- **Device preview** (admin desktop only): floating 📱 button opens an iframe at iPhone/Android/iPad widths for layout QA.
- **Entity-event triggers** + **free Web Push for staff** replacing SMS (see §4.10).

---

## 8. Pending / open items

- **#8: Rotate secrets** that passed through chat (Supabase DB password, JWT_SECRET, server root password, Pushover/Twilio/Resend/Telegram/Gemini/Google service-account keys, VAPID private key). The owner is aware. This requires action on each external platform + a one-time console run to update `apps/api/.env` on the server.
- The legacy `pages/MarketingAI.jsx` (and its 9 components in `src/components/marketing/`) is still in the repo but **removed from the sidebar**. Eventually fold the still-useful pieces (MarketingPostLab, GoalsTracker) into MarketingAdvisor as tabs.
- DMARC for alenabepita.co.il for email deliverability is unset.
- iOS web push only works after the PWA is installed (iOS 16.4+); the EnableStaffPush banner shows install instructions, but the owner himself hadn't installed it at last check.
- **Verify the `completed`-error fix actually landed**: commit `4512d2d` was pushed at the end of the last session but the owner hadn't confirmed yet whether the Month → Week → Day TasksView now renders cleanly in production. First thing to do next session: load `/MarketingAdvisor` → tasks tab → confirm no ErrorBoundary banner.

---

## 9. Commands cheatsheet

```bash
# Verify backend types
cd /c/Users/97253/top-alena-migration/apps/api && npx tsc --noEmit

# Build the frontend (always from repo root)
cd /c/Users/97253/top-alena-migration && timeout 280 npx vite build

# Verify a deploy landed
curl -s -m 10 -X POST https://topalena.com/api/public/fn/deployInfo -H "Content-Type: application/json" -d '{}'

# Pulse a public function (no auth)
curl -s -m 15 -X POST https://topalena.com/api/public/fn/<NAME> -H "Content-Type: application/json" -d '{}'

# Generate Prisma client (run in apps/api)
npx prisma generate

# Commit + push (auto-deploys)
git -C /c/Users/97253/top-alena-migration add <files>
git -C /c/Users/97253/top-alena-migration commit -m "..."
git -C /c/Users/97253/top-alena-migration push origin migration
```

The branch is **`migration`** (not `main` — `main` has the reverted Base44 placeholder).

---

## 10. House rules

- Default branch for code changes: `migration`. Never push to `main`.
- Never commit secrets. `.env` files are gitignored; check `git status` before adding.
- Don't run `prisma migrate` — we use `prisma db push`. Migrations folder is intentionally absent.
- Before declaring "done": run tsc on the API, build the frontend, and verify the deploy went live. Especially for changes touching multiple files — a bad import is silent until runtime.
- When the user reports a runtime error, get the actual message (browser console or the Pushover payload) before guessing. Past sessions wasted multiple deploys chasing the wrong cause.
- When you add a column the new code reads, wrap the first create/update in a try/catch that retries without that field. Container restart applies `db push`, but there's a window where the deploy is up and the schema isn't (see §4.7).
- Keep responses short in Hebrew. Bullet points and tables when listing things. Long prose is friction.
