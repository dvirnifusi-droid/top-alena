# WhatsApp Onboarding v4 — "העוזר החכם" (design)

**Goal:** Make setting up a brand-new restaurant as easy as texting a helpful
human on WhatsApp. One AI brain guides the owner **one atomic question at a
time**, accepts any input (text / voice / files), auto-embeds everything into
the right place in the tenant's system, answers questions like real customer
service, and hands over the app link only when the core is set up. This is the
pilot-critical flow.

## Why replace v3

v3 works but uses a numbered module menu ("send 1 for checklists") + grouped
questions. That is cognitive load for a busy owner. v4 removes the menu and the
grouping: natural Hebrew, single-focus micro-questions, files accepted anytime.

## Principles

- **One atomic question per turn.** Name is its own question. Address its own.
  Hours its own. Never "tell me name, address and cuisine" together.
- **Human & contextual.** Warm, real Hebrew. Understands free-form answers,
  context, and corrections. Not a form.
- **Dual-mode.** Guides step-by-step BUT is open to questions. If the owner asks
  "how do I add an employee later?" / "what's a checklist?" / pricing, the brain
  answers helpfully, then gently returns to where it was.
- **Any input, anytime.** Text, voice note (transcribed), or a file (PDF / Word /
  image / PNG) — a menu photo, work schedule, employee list, checklist doc. A
  file sent mid-question is classified, embedded, acknowledged, then the brain
  resumes.
- **Embed in the right place, dynamically.** Menu photo → MenuItems. Work
  schedule → Roles. Employee list → Employees. Checklist doc → Checklists.
  Supplier list → Suppliers. Knowledge docs → KnowledgeBase.
- **Skippable.** Anything non-core can be skipped ("אחר כך" / "דלג").

## Architecture — 3 components

### 1. `onboardingBrain(tenant, history, message, state)` → `{ reply, extraction, next_field, done }`

The conversation engine. Each inbound text turn, the LLM receives:
- conversation history
- `state`: what's already collected (profile fields set, counts of
  menu/employees/checklists/etc.) and what's still missing
- the owner's latest message

It returns:
- `reply`: the natural Hebrew message to send (either the next atomic question,
  or an answer to the owner's question + a gentle nudge back)
- `extraction`: structured data the owner just provided, if any
  (e.g. `{ field: 'restaurant_name', value: 'חמארה' }` or
  `{ employees: [...] }`) — applied by component 3
- `is_question`: true if the owner asked something (brain answered it)
- `done`: true when the owner is finished

The brain is **checklist-guided**: it holds an ordered list of fields to cover
so it never loops or forgets, but phrases them naturally and one at a time.
Core order: name → address → hours → cuisine → menu → employees → tables.
Optional (offered after core, each skippable): checklists, suppliers, roles,
training, customer club, knowledge base, invoice-collection email.

### 2. `classifyAndImport(tenant, mediaUrl, contentType, state)` → `{ kind, summary, count }`

File/voice handler. On inbound media:
- **Voice** → transcribe (existing `transcribeWhatsAppVoice`) → feed transcript
  to the brain as a text turn.
- **File/image** → an AI classifier decides the kind: `menu | work_schedule |
  employee_list | checklist | supplier_list | customer_list | knowledge | other`,
  then routes to the matching extractor (all already built in v3), embeds, and
  returns a human summary ("קלטתי 34 מנות"). The brain acknowledges it and
  continues from where it was.

### 3. `applyExtraction(tenant, extraction, state)` → updated state

Writes structured data from the brain to the tenant schema, in the right place,
reusing v3's persist helpers (RestaurantProfile fields, Employee, MenuItem,
Checklist, Supplier, Role, Customer, KnowledgeBase, SeatingLayout). Idempotent
where it matters (dedupe employees/customers). Returns the updated `state` so the
next brain turn knows what's now covered.

## State & storage

Reuse `OnboardingState` (tenant_id, current_step→now "phase", collected_data
JSONB, counts). `collected_data` holds the profile fields + per-module counts so
the brain always knows progress. Core profile is persisted as it's collected (so
a drop-off still yields a set-up app).

## "Go live" threshold

Minimum to send the app link automatically: **name + address**. Everything else
is offered but optional. The owner can always say "סיימתי" to finish early, and
can keep adding later in the app or by messaging the agent again.

## Reuse (already built in v3)

Extractors and persist helpers exist: menu, checklists (tasks-keyword fixed),
roles, employees, suppliers, customers, knowledge, seating; plus the
`/JoinTeam` employee self-signup link. v4 changes the ORCHESTRATION (menu →
natural brain) and adds the file classifier + voice path; the embed layer is
largely reused.

## Out of scope (YAGNI)

- No new frontend. This is WhatsApp-only.
- No change to the provisioning pipeline. v4 starts after a tenant is live and
  the welcome message's wa.me link is tapped (same trigger as v3).
- No multi-language. Hebrew only for now.

## Files

- `apps/api/src/lib/whatsappOnboarding.ts` — rewritten to the 3-component brain
  model (replaces the v3 STEPS state machine + module menu).
- `apps/api/src/routes/twilioWebhook.ts` — media + text both route to v4 (text →
  brain, media → classifyAndImport). Onboarding still takes priority over the
  admin agent for owners mid-onboarding.
- Reuses `apps/api/src/lib/llm.ts` (invokeLLM), `twilio.ts` (send/transcribe).

## Risk notes

- LLM drift: mitigated by checklist-guided state injected every turn + explicit
  "ask ONE atomic question" instruction.
- Gemini `items`-keyword collision: all extractor schemas already renamed
  (tasks/dishes/lines) — do NOT reintroduce a property named `items`.
- Concurrent edits: this rewrite touches whatsappOnboarding.ts heavily; land it
  in one focused commit.
