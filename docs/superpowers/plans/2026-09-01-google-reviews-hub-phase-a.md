# Google Reviews Hub — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new back-office page "ניהול ביקורות גוגל" (GoogleReviewsHub) with Module 1 (dashboard + gap calculator) and Module 2 (QR generator, T+24 status, date/event-targeted review-request broadcast) — all reusing existing infrastructure, with no automatic sends.

**Architecture:** Pure, testable logic (rating-gap math + phone/audience resolution) lives in `apps/api/src/lib/*.ts` with Vitest tests. Thin `registerFn` handlers in `load.ts` do the Prisma/DB wiring and delegate to the libs. The React page under `src/pages/GoogleReviewsHub.jsx` (+ components in `src/components/reviews/`) calls `base44.functions.X`. Broadcast reuses the existing `sendCustomerCampaign` pipeline with `segment:'manual'` — nothing new for the actual send.

**Tech Stack:** Fastify + Prisma (apps/api), React + Vite (src), Vitest (apps/api tests), `qrcode.react` (client QR).

**Key constraints (from spec):**
- No automatic broadcasts. Every send: preview → recipient count → owner confirm.
- Audience = satisfied + marketing consent only (enforced by existing `buildSegmentWhere` baseGate).
- Use the live link `https://g.page/r/CReDn7f8zub7EBM/review` everywhere.
- One tenant per API process — `load.ts` fns do NOT filter by tenant (DB connection is the boundary).
- No Prisma schema push on prod. Persist current Google rating/count via the existing `IntegrationSecret` KV (`getSecret`/`setIntegrationSecret`), NOT a new table.

---

## File Structure

**Create:**
- `apps/api/src/lib/reviewMath.ts` — pure: how many 5★ reviews to reach a target rating.
- `apps/api/src/lib/__tests__/reviewMath.test.ts`
- `apps/api/src/lib/reviewAudience.ts` — pure: phone normalization + resolve reservation/event rows → deduped customer ids.
- `apps/api/src/lib/__tests__/reviewAudience.test.ts`
- `src/pages/GoogleReviewsHub.jsx` — the page shell (tabs/sections), calls backend.
- `src/components/reviews/ReviewDashboard.jsx` — Module 1 UI.
- `src/components/reviews/ReviewQrCard.jsx` — Module 2a UI.
- `src/components/reviews/TargetedReviewBroadcast.jsx` — Module 2c UI.

**Modify:**
- `apps/api/src/functions/load.ts` — add 3 registerFns: `getReviewsHubDashboard`, `setReviewCurrentStats`, `previewReviewAudienceByDate`.
- `src/pages.config.js` — import + PAGES entry.
- `src/Layout.jsx` — nav item in `adminLinks`.

---

## Task 1: Rating-gap math (pure lib, TDD)

**Files:**
- Create: `apps/api/src/lib/reviewMath.ts`
- Test: `apps/api/src/lib/__tests__/reviewMath.test.ts`

Google displays ratings rounded to 1 decimal, so a displayed `target` is reached when the true average ≥ `target - 0.05`. Given current average `avg` over `count` reviews, the number `x` of new 5★ reviews needed satisfies `(avg*count + 5x)/(count+x) ≥ target-0.05`, i.e. `x ≥ count*(T-avg)/(5-T)` where `T = target-0.05`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/__tests__/reviewMath.test.ts
import { describe, it, expect } from 'vitest';
import { reviewsToTarget, nextMilestones } from '../reviewMath.js';

describe('reviewsToTarget', () => {
  it('4.1 over 521 reviews needs 31 fives to display 4.2', () => {
    expect(reviewsToTarget(4.1, 521, 4.2)).toBe(31);
  });
  it('4.1 over 521 needs 105 for 4.3 and 332 for 4.5', () => {
    expect(reviewsToTarget(4.1, 521, 4.3)).toBe(105);
    expect(reviewsToTarget(4.1, 521, 4.5)).toBe(332);
  });
  it('returns 0 when already at or above target', () => {
    expect(reviewsToTarget(4.2, 521, 4.2)).toBe(0);
    expect(reviewsToTarget(4.6, 521, 4.5)).toBe(0);
  });
  it('handles a fresh listing (0 reviews)', () => {
    expect(reviewsToTarget(0, 0, 4.5)).toBe(0); // 0 reviews, 5s only -> already fine
  });
  it('target 5.0 is effectively unreachable -> returns null', () => {
    expect(reviewsToTarget(4.1, 521, 5.0)).toBeNull();
  });
});

describe('nextMilestones', () => {
  it('lists the next 0.1 steps above the current displayed rating with counts', () => {
    const m = nextMilestones(4.1, 521);
    expect(m[0]).toEqual({ target: 4.2, reviews: 31 });
    expect(m.find(x => x.target === 4.3)).toEqual({ target: 4.3, reviews: 105 });
    // stops before 5.0 (unreachable)
    expect(m.some(x => x.target === 5.0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/reviewMath.test.ts`
Expected: FAIL — cannot find module `../reviewMath.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/lib/reviewMath.ts
// Pure helpers for "how many 5-star reviews to reach a target Google rating".
// Google displays ratings rounded to 1 decimal, so a displayed target is
// reached when the true average >= target - 0.05.

export function reviewsToTarget(avg: number, count: number, target: number): number | null {
  if (!(count >= 0) || !(avg >= 0)) return 0;
  const T = target - 0.05;
  if (T >= 5) return null;          // target 5.0 (or higher) is unreachable with 5s
  if (avg >= T) return 0;           // already displays >= target
  const x = Math.ceil((count * (T - avg)) / (5 - T));
  return Math.max(0, x);
}

export function nextMilestones(avg: number, count: number): Array<{ target: number; reviews: number }> {
  const out: Array<{ target: number; reviews: number }> = [];
  // start at the next 0.1 above the current displayed value
  let t = Math.round(avg * 10) / 10 + 0.1;
  t = Math.round(t * 10) / 10;
  while (t <= 4.9 + 1e-9) {
    const reviews = reviewsToTarget(avg, count, t);
    if (reviews !== null) out.push({ target: Math.round(t * 10) / 10, reviews });
    t = Math.round((t + 0.1) * 10) / 10;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/reviewMath.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/reviewMath.ts apps/api/src/lib/__tests__/reviewMath.test.ts
git commit -m "feat(reviews): pure rating-gap math (reviewsToTarget/nextMilestones)"
```

---

## Task 2: Audience resolution (pure lib, TDD)

Resolve "guests who dined/had an event on date D" (as fetched rows) into a deduped list of `Customer` ids. Phone normalization mirrors existing code (`String(x).replace(/\D/g,'')`) plus Israeli `972`→`0` folding so reservation phones match `Customer.phone`.

**Files:**
- Create: `apps/api/src/lib/reviewAudience.ts`
- Test: `apps/api/src/lib/__tests__/reviewAudience.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/lib/__tests__/reviewAudience.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePhone, resolveAudienceCustomerIds } from '../reviewAudience.js';

describe('normalizePhone', () => {
  it('strips non-digits', () => {
    expect(normalizePhone('054-123-4567')).toBe('0541234567');
  });
  it('folds +972 / 972 to a leading 0', () => {
    expect(normalizePhone('+972541234567')).toBe('0541234567');
    expect(normalizePhone('972541234567')).toBe('0541234567');
  });
  it('returns empty for junk', () => {
    expect(normalizePhone(null as any)).toBe('');
    expect(normalizePhone('abc')).toBe('');
  });
});

describe('resolveAudienceCustomerIds', () => {
  const customers = [
    { id: 'c1', phone: '0541234567' },
    { id: 'c2', phone: '972-52-999-0000' },
  ];
  it('matches reservations by customer_id first', () => {
    const ids = resolveAudienceCustomerIds({
      reservations: [{ customer_id: 'c1', customer_phone: '' }],
      events: [],
      customers,
    });
    expect(ids).toEqual(['c1']);
  });
  it('matches by normalized phone when no id', () => {
    const ids = resolveAudienceCustomerIds({
      reservations: [{ customer_id: null, customer_phone: '+972541234567' }],
      events: [{ customer_phone: '052-999-0000' }],
      customers,
    });
    expect(ids.sort()).toEqual(['c1', 'c2']);
  });
  it('dedupes a guest appearing in both a reservation and an event', () => {
    const ids = resolveAudienceCustomerIds({
      reservations: [{ customer_id: 'c1', customer_phone: '0541234567' }],
      events: [{ customer_phone: '0541234567' }],
      customers,
    });
    expect(ids).toEqual(['c1']);
  });
  it('ignores phones with no matching customer', () => {
    const ids = resolveAudienceCustomerIds({
      reservations: [{ customer_id: null, customer_phone: '0500000000' }],
      events: [],
      customers,
    });
    expect(ids).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx vitest run src/lib/__tests__/reviewAudience.test.ts`
Expected: FAIL — cannot find module `../reviewAudience.js`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/lib/reviewAudience.ts
// Pure resolution of a day's reservation/event rows into deduped Customer ids.

export function normalizePhone(raw: unknown): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return d;
}

type ResRow = { customer_id?: string | null; customer_phone?: string | null };
type EvtRow = { customer_phone?: string | null };
type CustRow = { id: string; phone: string };

export function resolveAudienceCustomerIds(input: {
  reservations: ResRow[];
  events: EvtRow[];
  customers: CustRow[];
}): string[] {
  const byPhone = new Map<string, string>();
  for (const c of input.customers) {
    const p = normalizePhone(c.phone);
    if (p) byPhone.set(p, c.id);
  }
  const ids = new Set<string>();
  for (const r of input.reservations) {
    if (r.customer_id) { ids.add(r.customer_id); continue; }
    const cid = byPhone.get(normalizePhone(r.customer_phone));
    if (cid) ids.add(cid);
  }
  for (const e of input.events) {
    const cid = byPhone.get(normalizePhone(e.customer_phone));
    if (cid) ids.add(cid);
  }
  return [...ids];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx vitest run src/lib/__tests__/reviewAudience.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/reviewAudience.ts apps/api/src/lib/__tests__/reviewAudience.test.ts
git commit -m "feat(reviews): pure audience resolution (phone-normalize + dedupe to customer ids)"
```

---

## Task 3: Backend functions in load.ts (manual verify)

Add three `registerFn`s. There is no test harness for `registerFn`/DB code — verify manually (Task 5). Insert these near the existing review code (after `getReviewTracking`, ~`load.ts:7558`). `getSecret` (`load.ts:20363`) and the `db.integrationSecret` upsert pattern (`load.ts:21065` `setIntegrationSecret`) already exist — reuse them. Import the libs at the top of load.ts alongside the other lib imports.

**Files:**
- Modify: `apps/api/src/functions/load.ts`

- [ ] **Step 1: Add lib imports** (near the other `from './lib/...` or `from '../lib/...'` imports at the top of load.ts — match the existing relative style used for e.g. laborCost):

```ts
import { reviewsToTarget, nextMilestones } from '../lib/reviewMath.js';
import { resolveAudienceCustomerIds } from '../lib/reviewAudience.js';
```

- [ ] **Step 2: Add `setReviewCurrentStats` + `getReviewsHubDashboard`**

```ts
// --- Google Reviews Hub -------------------------------------------------
// Current Google rating/count are entered by the owner (no Google API yet in
// Phase A) and persisted in IntegrationSecret so they survive restarts.
registerFn('setReviewCurrentStats', async ({ body, user }) => {
  await requireBackOffice(user, 'setReviewCurrentStats');
  const rating = Number((body as any)?.rating);
  const count = Number((body as any)?.count);
  if (!(rating >= 0 && rating <= 5)) throw new Error('rating must be 0..5');
  if (!(count >= 0)) throw new Error('count must be >= 0');
  for (const [key, value] of [['GOOGLE_REVIEW_RATING', String(rating)], ['GOOGLE_REVIEW_COUNT', String(Math.round(count))]]) {
    const existing = await db.integrationSecret.findFirst({ where: { key } });
    if (existing) await db.integrationSecret.update({ where: { id: existing.id }, data: { value, updated_at: new Date() } });
    else await db.integrationSecret.create({ data: { key, value, note: 'Google reviews hub', updated_at: new Date() } });
  }
  return { ok: true, rating, count: Math.round(count) };
});

registerFn('getReviewsHubDashboard', async ({ body, user }) => {
  await requireBackOffice(user, 'getReviewsHubDashboard');
  const days = Math.min(365, Math.max(1, Number((body as any)?.days) || 30));
  // Reuse the existing funnel computation by calling the handler logic inline:
  const tracking = await (functionHandlers['getReviewTracking'] as any)({ body: { days }, user, req: (body as any)?.req });
  const rating = Number(await getSecret('GOOGLE_REVIEW_RATING')) || null;
  const count = Number(await getSecret('GOOGLE_REVIEW_COUNT')) || null;
  const link = (await getSecret('GOOGLE_REVIEW_URL')) || 'https://g.page/r/CReDn7f8zub7EBM/review';
  const milestones = (rating != null && count != null) ? nextMilestones(rating, count) : [];
  const toNext = (rating != null && count != null && milestones[0])
    ? { target: milestones[0].target, reviews: milestones[0].reviews }
    : null;
  return { tracking, current: { rating, count }, review_link: link, milestones, to_next: toNext };
});
```

Note: `functionHandlers` is the registry from `apps/api/src/functions/index.ts`; it is already imported/in-scope in load.ts (that is where fns are registered). If it is not in module scope, instead copy the ~30 lines of `getReviewTracking`'s body into a small local `async function computeReviewFunnel(days)` and call it from both `getReviewTracking` and here (DRY via a shared helper). Prefer the shared-helper refactor if `functionHandlers` is not directly referenceable.

- [ ] **Step 3: Add `previewReviewAudienceByDate`**

Reservation.date is a real `DateTime` (query by day range); EventBooking.event_date is a `String` `'YYYY-MM-DD'` (query by equality). Fetch only that day's guests (small set), then resolve to customer ids via the pure lib, then reuse the SAME preview shape as `previewCustomerSegment` (consent gate lives in `buildSegmentWhere('manual', ...)` baseGate).

```ts
registerFn('previewReviewAudienceByDate', async ({ body, user }) => {
  await requireBackOffice(user, 'previewReviewAudienceByDate');
  const dateStr = String((body as any)?.date || '').trim(); // 'YYYY-MM-DD'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('date must be YYYY-MM-DD');
  const start = new Date(dateStr + 'T00:00:00');
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const reservations = await db.reservation.findMany({
    where: { date: { gte: start, lt: next } },
    select: { customer_id: true, customer_phone: true },
  });
  const events = await db.eventBooking.findMany({
    where: { event_date: dateStr },
    select: { customer_phone: true },
  });
  const phones = [
    ...reservations.map((r: any) => r.customer_phone),
    ...events.map((e: any) => e.customer_phone),
  ].map((p) => String(p || '').replace(/\D/g, '')).filter(Boolean);
  const idHints = reservations.map((r: any) => r.customer_id).filter(Boolean);

  // Fetch only candidate customers (by phone or id), never the whole table.
  const candidates = await db.customer.findMany({
    where: { OR: [{ phone: { in: phones } }, { id: { in: idHints } }] },
    select: { id: true, phone: true },
  });
  const customerIds = resolveAudienceCustomerIds({ reservations, events, customers: candidates });

  if (customerIds.length === 0) return { count: 0, throttled_out: 0, sample: [], customer_ids: [] };

  // Apply the same consent + satisfaction gate + 24h throttle the campaign uses.
  const where = buildSegmentWhere('manual', { customer_ids: customerIds });
  const gated = { AND: [where, { satisfaction_status: 'satisfied' }] };
  const matched = await db.customer.findMany({
    where: gated,
    select: { id: true, name: true, phone: true, visit_count: true, loyalty_tier: true, last_visit: true, last_marketing_sent_at: true },
  });
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const eligible = matched.filter((c: any) => !c.last_marketing_sent_at || c.last_marketing_sent_at < cutoff);
  const throttledOut = matched.length - eligible.length;
  return {
    count: eligible.length,
    throttled_out: throttledOut,
    sample: eligible.slice(0, 5),
    customer_ids: eligible.map((c: any) => c.id),
  };
});
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/api && npx tsc --noEmit` (or the repo's `npm run typecheck` if that is the configured script)
Expected: no new type errors from the added code.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/functions/load.ts
git commit -m "feat(reviews): backend fns getReviewsHubDashboard/setReviewCurrentStats/previewReviewAudienceByDate"
```

---

## Task 4: Frontend — page + components

The page has 3 sections. Broadcast SEND reuses the existing `sendCustomerCampaign` with `segment:'manual'` + `custom_filter:{ customer_ids }` returned by the preview — no new send fn. Every send goes through a confirm dialog showing the recipient count.

**Files:**
- Create: `src/pages/GoogleReviewsHub.jsx`
- Create: `src/components/reviews/ReviewDashboard.jsx`
- Create: `src/components/reviews/ReviewQrCard.jsx`
- Create: `src/components/reviews/TargetedReviewBroadcast.jsx`

- [ ] **Step 1: Create `ReviewDashboard.jsx`** (Module 1: current rating input + gap + funnel)

```jsx
// src/components/reviews/ReviewDashboard.jsx
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function ReviewDashboard({ data, onSaved }) {
  const cur = data?.current || {};
  const [rating, setRating] = useState(cur.rating ?? '');
  const [count, setCount] = useState(cur.count ?? '');
  const [saving, setSaving] = useState(false);
  const t = data?.tracking || {};
  const toNext = data?.to_next;

  const save = async () => {
    setSaving(true);
    try {
      await base44.functions.setReviewCurrentStats({ rating: Number(rating), count: Number(count) });
      onSaved && onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4 bg-white">
        <div className="text-sm text-gray-500 mb-2">הדירוג הנוכחי בגוגל (עדכן ידנית עד שיהיה חיבור API)</div>
        <div className="flex gap-2 items-end">
          <label className="text-sm">דירוג
            <input type="number" step="0.1" min="0" max="5" value={rating}
              onChange={(e) => setRating(e.target.value)} className="border rounded px-2 py-1 w-24 block" />
          </label>
          <label className="text-sm">מס׳ ביקורות
            <input type="number" min="0" value={count}
              onChange={(e) => setCount(e.target.value)} className="border rounded px-2 py-1 w-28 block" />
          </label>
          <button onClick={save} disabled={saving} className="bg-emerald-600 text-white rounded px-3 py-1">שמור</button>
        </div>
      </div>

      {toNext && (
        <div className="rounded-xl border p-4 bg-emerald-50">
          <div className="text-lg font-semibold">כדי להגיע ל-{toNext.target}⭐ צריך עוד ~{toNext.reviews} ביקורות 5⭐</div>
          {Array.isArray(data.milestones) && (
            <ul className="text-sm text-gray-600 mt-2">
              {data.milestones.slice(0, 4).map((m) => (
                <li key={m.target}>ל-{m.target}⭐ → ~{m.reviews} ביקורות</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="סריקות (30 יום)" value={t.scans} />
        <Stat label="השלימו סקר" value={t.completed} />
        <Stat label="הופנו לגוגל" value={t.sent_to_google} />
        <Stat label="דירוג ממוצע בסקר" value={t.avg_rating} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border p-3 bg-white text-center">
      <div className="text-2xl font-bold">{value ?? '—'}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create `ReviewQrCard.jsx`** (Module 2a: printable QR to the review link)

```jsx
// src/components/reviews/ReviewQrCard.jsx
import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

export default function ReviewQrCard({ link }) {
  const ref = useRef(null);
  const download = () => {
    const canvas = ref.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'alena-google-review-qr.png';
    a.click();
  };
  return (
    <div className="rounded-xl border p-4 bg-white flex flex-col items-center gap-3">
      <div className="text-sm text-gray-600">QR לשלט / חשבון — סריקה פותחת ישר את כתיבת הביקורת</div>
      <div ref={ref}><QRCodeCanvas value={link} size={220} includeMargin /></div>
      <button onClick={download} className="bg-emerald-600 text-white rounded px-3 py-1">הורד PNG להדפסה</button>
      <a href={link} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline break-all">{link}</a>
    </div>
  );
}
```

- [ ] **Step 3: Create `TargetedReviewBroadcast.jsx`** (Module 2c: date → preview → confirm → send)

```jsx
// src/components/reviews/TargetedReviewBroadcast.jsx
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const DEFAULT_MSG = 'היי {name}! תודה שביקרת אצלנו בעלינא 🙏 נשמח מאוד אם תשאיר/י לנו ביקורת בגוגל, זה עוזר לנו המון: ';

export default function TargetedReviewBroadcast({ reviewLink }) {
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState(DEFAULT_MSG + reviewLink);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const doPreview = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await base44.functions.previewReviewAudienceByDate({ date });
      setPreview(res.data);
    } finally { setBusy(false); }
  };

  const doSend = async () => {
    if (!preview?.customer_ids?.length) return;
    if (!window.confirm(`לשלוח בקשת ביקורת ל-${preview.count} לקוחות מרוצים?`)) return;
    setBusy(true);
    try {
      const res = await base44.functions.sendCustomerCampaign({
        segment: 'manual',
        custom_filter: { customer_ids: preview.customer_ids },
        message_template: msg,
        channel: 'whatsapp',
        campaign_key: 'review_request',
        campaign_label: `בקשת ביקורת - ${date}`,
      });
      setResult(res.data);
      setPreview(null);
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border p-4 bg-white space-y-3">
      <div className="font-semibold">תפוצה ממוקדת לפי תאריך ביקור</div>
      <div className="flex gap-2 items-end">
        <label className="text-sm">תאריך הביקור/אירוע
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1 block" />
        </label>
        <button onClick={doPreview} disabled={!date || busy} className="bg-gray-800 text-white rounded px-3 py-1">בדוק כמה נמענים</button>
      </div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} className="border rounded w-full px-2 py-1 text-sm" />

      {preview && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm">
          <div>נמצאו <b>{preview.count}</b> לקוחות מרוצים עם הסכמת שיווק{preview.throttled_out ? ` (${preview.throttled_out} דולגו בגלל הגבלת 24 שעות)` : ''}.</div>
          {preview.sample?.length > 0 && (
            <ul className="text-xs text-gray-600 mt-1">{preview.sample.map((c) => <li key={c.id}>{c.name} · {c.phone}</li>)}</ul>
          )}
          <button onClick={doSend} disabled={busy || !preview.count} className="mt-2 bg-emerald-600 text-white rounded px-3 py-1">
            שלח ל-{preview.count} לקוחות
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-blue-50 p-3 text-sm">נשלח: {result.sent} · נכשל: {result.failed} · דולגו: {result.skipped_throttled}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the page `GoogleReviewsHub.jsx`**

```jsx
// src/pages/GoogleReviewsHub.jsx
import React, { useEffect, useState } from 'react';
import PageGuard from '../components/shared/PageGuard';
import { base44 } from '@/api/base44Client';
import ReviewDashboard from '../components/reviews/ReviewDashboard';
import ReviewQrCard from '../components/reviews/ReviewQrCard';
import TargetedReviewBroadcast from '../components/reviews/TargetedReviewBroadcast';

export default function GoogleReviewsHub() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getReviewsHubDashboard({ days: 30 });
      setData(res.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const link = data?.review_link || 'https://g.page/r/CReDn7f8zub7EBM/review';

  return (
    <PageGuard pageName="GoogleReviewsHub" pageTitle="ניהול ביקורות גוגל">
      <div className="max-w-4xl mx-auto p-4 space-y-6" dir="rtl">
        <h1 className="text-2xl font-bold">⭐ ניהול ביקורות גוגל</h1>
        {loading ? <div>טוען…</div> : <ReviewDashboard data={data} onSaved={load} />}
        <div className="grid md:grid-cols-2 gap-4">
          <ReviewQrCard link={link} />
          <div className="rounded-xl border p-4 bg-white">
            <div className="font-semibold mb-1">וואטסאפ יום אחרי ביקור</div>
            <div className="text-sm text-gray-600">בקשת דירוג אוטומטית נשלחת יום אחרי כל ביקור. לניהול הטקסט וההפעלה עבור לעמוד הגדרות ההתראות.</div>
            <a href="/NotificationSettings" className="text-blue-600 underline text-sm">פתח הגדרות התראות</a>
          </div>
        </div>
        <TargetedReviewBroadcast reviewLink={link} />
      </div>
    </PageGuard>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/GoogleReviewsHub.jsx src/components/reviews/
git commit -m "feat(reviews): GoogleReviewsHub page + dashboard/QR/targeted-broadcast components"
```

---

## Task 5: Register page + nav, then verify in browser

**Files:**
- Modify: `src/pages.config.js`
- Modify: `src/Layout.jsx`

- [ ] **Step 1: Register the page in `src/pages.config.js`**

Add an import alongside the others (e.g. near line 190):
```js
import GoogleReviewsHub from './pages/GoogleReviewsHub';
```
Add to the `PAGES` map (e.g. near the other back-office entries, ~line 355):
```js
  "GoogleReviewsHub": GoogleReviewsHub,
```

- [ ] **Step 2: Add the nav item in `src/Layout.jsx`**

In the `adminLinks` array, under the marketing/customers category, add:
```jsx
{ title: "⭐ ביקורות גוגל", url: createPageUrl("GoogleReviewsHub"), icon: Star, isSubItem: true, color: "olive" },
```
Ensure `Star` is imported from `lucide-react` at the top of Layout.jsx (add to the existing `lucide-react` import if not already present).

- [ ] **Step 3: Build the front-end**

Run: `npm run build`
Expected: build succeeds, no import errors for the new page/components.

- [ ] **Step 4: Verify in the browser preview**

Start the dev server (preview_start with the project's dev config), log in as owner on the עלינא tenant, navigate to `/GoogleReviewsHub`. Verify:
- Page loads (no console errors — check read_console_messages).
- Dashboard shows the funnel stats; entering rating 4.1 / count 521 and saving then shows "כדי להגיע ל-4.2⭐ צריך עוד ~31 ביקורות".
- QR renders and the link matches `...EBM`; PNG download works.
- Targeted broadcast: pick a past date with known diners → "בדוק כמה נמענים" returns a count and sample; the send button shows the count. (Do NOT actually send during verification unless on the demo/QA tenant with OUTBOUND_DISABLED.)

- [ ] **Step 5: Commit**

```bash
git add src/pages.config.js src/Layout.jsx
git commit -m "feat(reviews): register GoogleReviewsHub page + sidebar nav"
```

---

## Deployment note
Front-end changes ship via committed `dist` (autodeploy builds nothing server-side). After Task 5, run `npm run build` at repo root and commit the `dist` output per the project's frontend-deploy process (see memory `frontend_deploy_incident`). Backend `load.ts` changes deploy via the api container rebuild + redeploy-all-tenants (see memory `backend_deploy_all_tenants`). Coordinate both before the owner tests live.

## Self-review notes (done)
- Spec coverage: Module 1 → Tasks 1,3,4(Step1). Module 2a QR → Task 4 Step2. Module 2b T+24 → Task 4 Step4 (status card + link; no new send, reuses existing cron). Module 2c targeted broadcast → Tasks 2,3(Step3),4(Step3). Link fix (Module 4) intentionally excluded per owner.
- No automatic send: send is behind an explicit confirm dialog in `TargetedReviewBroadcast` + reuses `sendCustomerCampaign` throttle/consent gate.
- Type consistency: `previewReviewAudienceByDate` returns `{count, throttled_out, sample, customer_ids}` — consumed exactly in `TargetedReviewBroadcast` (`preview.count/throttled_out/sample/customer_ids`). `getReviewsHubDashboard` returns `{tracking,current,review_link,milestones,to_next}` — consumed in `ReviewDashboard`/page.
- Deferred to Phase B: Module 3 (read Google page + AI replies), Google API application.
