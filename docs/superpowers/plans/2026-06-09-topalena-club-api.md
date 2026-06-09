# TOPALENA Club API — תכנית מימוש (תכנית 1 מתוך 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** הוספת 4 endpoints חדשים ל-API של TOPALENA (`/api/club/*`), שמאפשרים לאתר המשלוחים (וורדפרס + WooCommerce + פלאגין Alena-TOPALENA-Bridge) לחפש לקוחות לפי טלפון, לרשום לקוחות חדשים, לדווח על הזמנות (שמעלות נקודות), ולקבל הטבות פעילות.

**Architecture:** הוספת קובץ route חדש `apps/api/src/routes/club.ts` שמאזין תחת `/api/club`, מוגן ע"י API key משותף (header `X-Alena-Club-Key`). הקובץ קורא/כותב למודלים הקיימים `Customer` ו-`CustomerBenefit` דרך Prisma. אין שינוי בסכמה. אימות הסקריפטים נעשה ע"י סקריפט integration `scripts/test-club-api.ts` שמפעיל קריאות אמיתיות מול ה-API.

**Tech Stack:** Fastify 4 · Prisma 5 · TypeScript · zod (validation) · tsx (run scripts)

**Worktree:** `C:/Users/97253/top-alena-migration` (production worktree, branch: `migration`)

**Important context:**
- `Customer.phone` הוא לא unique בסכמה הקיימת. יש לטפל ב-duplicates ע"י `findFirst` במקום `findUnique`. אם מתגלים duplicates בריצה — מוחזר ה-record הוותיק ביותר.
- מודל `Customer` ו-`CustomerBenefit` כבר קיימים — אין צורך ב-`prisma migrate`.
- ה-API key נשמר ב-env var `CLUB_API_KEY`. הוא לא נמצא ב-`.env` הקיים — צריך להוסיף.
- אין test runner קיים בפרויקט. אימות נעשה ע"י סקריפט integration שמופעל מול שרת dev.

---

## File Structure

| נתיב | פעולה | אחריות |
|------|------|--------|
| `apps/api/src/middleware/clubAuth.ts` | יצירה | preHandler שמוודא `X-Alena-Club-Key` תואם ל-`CLUB_API_KEY` |
| `apps/api/src/routes/club.ts` | יצירה | 4 endpoints: lookup, register, orders, benefits |
| `apps/api/src/lib/clubTier.ts` | יצירה | פונקציית חישוב tier מ-coin_balance + visit_count |
| `apps/api/src/index.ts` | שינוי | רישום הראוט החדש תחת `/api/club` |
| `apps/api/.env.example` | שינוי (אם קיים) או יצירה | הוספת `CLUB_API_KEY=` |
| `apps/api/scripts/test-club-api.ts` | יצירה | סקריפט integration — מפעיל את כל 4 ה-endpoints מול שרת dev |
| `docs/api/club-api.md` | יצירה | תיעוד 4 ה-endpoints (request/response/errors) — בשביל הפלאגין WP בתכנית 3 |

---

## Task 1: API key middleware

**Files:**
- Create: `apps/api/src/middleware/clubAuth.ts`

- [ ] **Step 1: Create the middleware file**

```typescript
// apps/api/src/middleware/clubAuth.ts
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireClubKey(req: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.CLUB_API_KEY;
  if (!expected) {
    req.log.error('CLUB_API_KEY env var missing — club endpoints disabled');
    return reply.code(503).send({ error: 'club_api_disabled' });
  }
  const got = req.headers['x-alena-club-key'];
  if (typeof got !== 'string' || got !== expected) {
    return reply.code(401).send({ error: 'invalid_club_key' });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd C:/Users/97253/top-alena-migration/apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors (file isn't imported anywhere yet — that's fine).

- [ ] **Step 3: Commit**

```bash
cd C:/Users/97253/top-alena-migration
git add apps/api/src/middleware/clubAuth.ts
git commit -m "feat(club-api): API-key middleware for /api/club/*"
```

---

## Task 2: Loyalty tier helper

**Files:**
- Create: `apps/api/src/lib/clubTier.ts`

Tier rules (גרסה ראשונה — נשתנה בהמשך לפי החלטות עסקיות):
- `regular`: ברירת מחדל
- `silver`: visit_count >= 10 או coin_balance >= 100
- `gold`: visit_count >= 25 או coin_balance >= 300

- [ ] **Step 1: Create the helper**

```typescript
// apps/api/src/lib/clubTier.ts
export type ClubTier = 'regular' | 'silver' | 'gold';

export function computeTier(visitCount: number, coinBalance: number): ClubTier {
  if (visitCount >= 25 || coinBalance >= 300) return 'gold';
  if (visitCount >= 10 || coinBalance >= 100) return 'silver';
  return 'regular';
}

// 1 ש"ח = 1 נקודה (ניתן לכוונון בעתיד מבלי לשבור clients)
export function coinsForOrder(orderTotalIls: number): number {
  if (!Number.isFinite(orderTotalIls) || orderTotalIls <= 0) return 0;
  return Math.floor(orderTotalIls);
}
```

- [ ] **Step 2: Self-verify with a quick repl**

Run:
```bash
cd C:/Users/97253/top-alena-migration/apps/api
npx tsx -e "import('./src/lib/clubTier.ts').then(m => { console.log(m.computeTier(0,0)); console.log(m.computeTier(12,50)); console.log(m.computeTier(0,350)); console.log(m.coinsForOrder(149.5)); })"
```
Expected output:
```
regular
silver
gold
149
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/clubTier.ts
git commit -m "feat(club-api): tier + coin-earn helpers"
```

---

## Task 3: Skeleton route file + register under `/api/club`

**Files:**
- Create: `apps/api/src/routes/club.ts` (skeleton — full handlers in Tasks 4-7)
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create skeleton route**

```typescript
// apps/api/src/routes/club.ts
import type { FastifyInstance } from 'fastify';
import { requireClubKey } from '../middleware/clubAuth.js';

export async function clubRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireClubKey);

  // Health check for the WP plugin to verify connectivity (still key-gated)
  app.get('/ping', async () => ({ ok: true, ts: Date.now() }));
}
```

- [ ] **Step 2: Register the route in `index.ts`**

Open `apps/api/src/index.ts`. Find the block of `app.register(...)` calls (around the `siriRoutes` line). Add:

```typescript
import { clubRoutes } from './routes/club.js';
// ... existing imports ...

// after siriRoutes registration:
await app.register(clubRoutes, { prefix: '/api/club' });
```

- [ ] **Step 3: Start dev server, verify ping**

Terminal A:
```bash
cd C:/Users/97253/top-alena-migration/apps/api
$env:CLUB_API_KEY="test-key-local-dev-only"
npm run dev
```

Terminal B (or via curl):
```bash
# Should 401 — no key
curl -i http://localhost:8787/api/club/ping
# Expected: HTTP/1.1 401 with {"error":"invalid_club_key"}

# Should 200 — correct key
curl -i -H "X-Alena-Club-Key: test-key-local-dev-only" http://localhost:8787/api/club/ping
# Expected: HTTP/1.1 200 with {"ok":true,"ts":...}
```

> ⚠️ אם הפורט שונה (לא 8787) — להחליף לפי `apps/api/src/index.ts` בסוף הקובץ (`app.listen`). הפלאן מניח 8787.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/club.ts apps/api/src/index.ts
git commit -m "feat(club-api): register /api/club route with key-gated ping"
```

---

## Task 4: `POST /api/club/lookup` — חיפוש לקוח לפי טלפון

**Request:** `{ phone: string }`
**Response 200:** `{ found: true, name, coin_balance, loyalty_tier, visit_count, marketing_consent }`
**Response 200 (לא נמצא):** `{ found: false }` (לא 404 — מקל על קוד הפלאגין)

**Files:**
- Modify: `apps/api/src/routes/club.ts`

- [ ] **Step 1: Normalize phone helper (inline in the same file)**

Open `apps/api/src/routes/club.ts`. Add this helper above the route function:

```typescript
// Israeli phone normalization — keeps only digits, strips leading 972/0
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) return '0' + digits.slice(3);
  return digits;
}
```

- [ ] **Step 2: Add the lookup endpoint**

Inside `clubRoutes`, after the `/ping` line, add:

```typescript
import { z } from 'zod';
import { prisma } from '../db.js';
import { computeTier } from '../lib/clubTier.js';

const LookupBody = z.object({ phone: z.string().min(8).max(20) });

app.post('/lookup', async (req, reply) => {
  const parsed = LookupBody.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'bad_phone' });

  const phone = normalizePhone(parsed.data.phone);
  // findFirst — phone is NOT unique in schema; oldest wins on duplicates
  const customer = await prisma.customer.findFirst({
    where: { phone },
    orderBy: { createdAt: 'asc' },
  });

  if (!customer) return { found: false };

  return {
    found: true,
    name: customer.name ?? null,
    coin_balance: customer.coin_balance ?? 0,
    loyalty_tier: customer.loyalty_tier ?? computeTier(customer.visit_count ?? 0, customer.coin_balance ?? 0),
    visit_count: customer.visit_count ?? 0,
    marketing_consent: customer.marketing_consent,
  };
});
```

> הערה: ה-`import`-ים בראש הקובץ — הוסף אותם פעם אחת בלבד ל-imports הקיימים, אל תכפיל.

- [ ] **Step 3: Manual smoke test**

Restart dev server (Ctrl+C → `npm run dev` שוב כי הוספנו import חדש).

```bash
# לקוח שלא קיים — מצופה: {"found":false}
curl -s -X POST http://localhost:8787/api/club/lookup `
  -H "X-Alena-Club-Key: test-key-local-dev-only" `
  -H "Content-Type: application/json" `
  -d '{"phone":"0500000000"}'

# טלפון לא תקין — מצופה: 400 {"error":"bad_phone"}
curl -s -X POST http://localhost:8787/api/club/lookup `
  -H "X-Alena-Club-Key: test-key-local-dev-only" `
  -H "Content-Type: application/json" `
  -d '{"phone":"x"}'
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/club.ts
git commit -m "feat(club-api): POST /api/club/lookup — find customer by phone"
```

---

## Task 5: `POST /api/club/register` — רישום לקוח חדש

**Request:** `{ phone: string, name?: string, marketing_consent: boolean }`
**Response 201:** customer object (same shape as lookup `found:true`)
**Response 200 (כבר קיים):** customer object + `{ existing: true }` (idempotency — הפלאגין יכול לקרוא גם אם המשתמש כבר רשום)

**Files:**
- Modify: `apps/api/src/routes/club.ts`

- [ ] **Step 1: Add the endpoint**

Add to `clubRoutes` (under the lookup endpoint):

```typescript
const RegisterBody = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().trim().min(1).max(120).optional(),
  marketing_consent: z.boolean(),
});

app.post('/register', async (req, reply) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'bad_body', detail: parsed.error.flatten() });

  const phone = normalizePhone(parsed.data.phone);
  const existing = await prisma.customer.findFirst({
    where: { phone },
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    return reply.code(200).send({
      existing: true,
      found: true,
      name: existing.name ?? null,
      coin_balance: existing.coin_balance ?? 0,
      loyalty_tier: existing.loyalty_tier ?? 'regular',
      visit_count: existing.visit_count ?? 0,
      marketing_consent: existing.marketing_consent,
    });
  }

  const created = await prisma.customer.create({
    data: {
      phone,
      name: parsed.data.name ?? null,
      visit_count: 0,
      coin_balance: 0,
      loyalty_tier: 'regular',
      marketing_consent: parsed.data.marketing_consent,
      marketing_consent_at: parsed.data.marketing_consent ? new Date() : null,
    },
  });

  return reply.code(201).send({
    found: true,
    name: created.name,
    coin_balance: created.coin_balance ?? 0,
    loyalty_tier: created.loyalty_tier ?? 'regular',
    visit_count: created.visit_count ?? 0,
    marketing_consent: created.marketing_consent,
  });
});
```

- [ ] **Step 2: Manual smoke test**

```bash
# רישום חדש — מצופה: 201 + שדות לקוח
curl -i -X POST http://localhost:8787/api/club/register `
  -H "X-Alena-Club-Key: test-key-local-dev-only" `
  -H "Content-Type: application/json" `
  -d '{"phone":"0521234567","name":"בדיקה","marketing_consent":true}'

# קריאה שנייה עם אותו טלפון — מצופה: 200 + existing:true
curl -i -X POST http://localhost:8787/api/club/register `
  -H "X-Alena-Club-Key: test-key-local-dev-only" `
  -H "Content-Type: application/json" `
  -d '{"phone":"0521234567","name":"בדיקה","marketing_consent":true}'

# lookup מאמת שהלקוח באמת נשמר
curl -s -X POST http://localhost:8787/api/club/lookup `
  -H "X-Alena-Club-Key: test-key-local-dev-only" `
  -H "Content-Type: application/json" `
  -d '{"phone":"0521234567"}'
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/club.ts
git commit -m "feat(club-api): POST /api/club/register — idempotent customer creation"
```

---

## Task 6: `POST /api/club/orders` — דיווח הזמנה + צבירת נקודות

**Request:** `{ phone: string, order_total: number, order_id: string, items?: Array<{name, qty, price}> }`
**Response 200:** `{ coins_earned, new_balance, new_tier, visit_count }`

**Files:**
- Modify: `apps/api/src/routes/club.ts`

- [ ] **Step 1: Add the endpoint**

Add to `clubRoutes`:

```typescript
import { coinsForOrder } from '../lib/clubTier.js';

const OrderBody = z.object({
  phone: z.string().min(8).max(20),
  order_total: z.number().positive().finite(),
  order_id: z.string().min(1).max(120),
  items: z.array(z.object({
    name: z.string(),
    qty: z.number().int().positive(),
    price: z.number().nonnegative(),
  })).optional(),
});

app.post('/orders', async (req, reply) => {
  const parsed = OrderBody.safeParse(req.body);
  if (!parsed.success) return reply.code(400).send({ error: 'bad_body', detail: parsed.error.flatten() });

  const phone = normalizePhone(parsed.data.phone);
  const customer = await prisma.customer.findFirst({
    where: { phone },
    orderBy: { createdAt: 'asc' },
  });

  if (!customer) return reply.code(404).send({ error: 'customer_not_found' });

  const coinsEarned = coinsForOrder(parsed.data.order_total);
  const newBalance = (customer.coin_balance ?? 0) + coinsEarned;
  const newVisitCount = (customer.visit_count ?? 0) + 1;
  const newTier = computeTier(newVisitCount, newBalance);

  await prisma.customer.update({
    where: { id: customer.id },
    data: {
      coin_balance: newBalance,
      visit_count: newVisitCount,
      loyalty_tier: newTier,
      last_visit: new Date(),
    },
  });

  // הערת tracking: לא שומרים order log כרגע. בעתיד — table חדש Order שמקושר.
  // התיעוד הזה ב-WooCommerce בכל מקרה (הוא מקור האמת להזמנות).

  req.log.info({ phone, order_id: parsed.data.order_id, coinsEarned, newBalance }, 'club_order_received');

  return {
    coins_earned: coinsEarned,
    new_balance: newBalance,
    new_tier: newTier,
    visit_count: newVisitCount,
  };
});
```

- [ ] **Step 2: Manual smoke test**

```bash
# הזמנה של 150 ש"ח — מצופה: coins_earned:150, new_balance:150, new_tier:silver
curl -i -X POST http://localhost:8787/api/club/orders `
  -H "X-Alena-Club-Key: test-key-local-dev-only" `
  -H "Content-Type: application/json" `
  -d '{"phone":"0521234567","order_total":150,"order_id":"wc-test-1"}'

# הזמנה שנייה של 200 ש"ח — מצופה: new_balance:350, new_tier:gold, visit_count:2
curl -i -X POST http://localhost:8787/api/club/orders `
  -H "X-Alena-Club-Key: test-key-local-dev-only" `
  -H "Content-Type: application/json" `
  -d '{"phone":"0521234567","order_total":200,"order_id":"wc-test-2"}'

# lookup מאמת שהמצב שמור
curl -s -X POST http://localhost:8787/api/club/lookup `
  -H "X-Alena-Club-Key: test-key-local-dev-only" `
  -H "Content-Type: application/json" `
  -d '{"phone":"0521234567"}'
# expected: coin_balance:350, loyalty_tier:"gold", visit_count:2
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/routes/club.ts
git commit -m "feat(club-api): POST /api/club/orders — award coins + bump tier"
```

---

## Task 7: `GET /api/club/benefits/:phone` — הטבות פעילות

הפלאגין של WP צריך לדעת אם ללקוח יש קופון/הטבה פעילה (יום הולדת, הצטרפות, ספיישל tier).

לפי הסכמה הקיימת, `CustomerBenefit` הוא מודל קיים. ניצור endpoint שמחזיר את ההטבות הפעילות (לא פגות, לא נוצלו) ללקוח לפי טלפון.

**Files:**
- Modify: `apps/api/src/routes/club.ts`

- [ ] **Step 1: Verify CustomerBenefit schema fields**

Run:
```bash
cd C:/Users/97253/top-alena-migration/apps/api
grep -A 15 "model CustomerBenefit" prisma/schema.prisma
```
לפני כתיבת ה-handler — לאמת שמות שדות (customer_id, benefit_type, expires_at, used_at וכו'). אם השדות שונים — להתאים את ה-handler בצעד 2.

- [ ] **Step 2: Add the endpoint (התאם שדות לפי מה שראית בצעד 1)**

```typescript
app.get<{ Params: { phone: string } }>('/benefits/:phone', async (req, reply) => {
  const phone = normalizePhone(req.params.phone);
  const customer = await prisma.customer.findFirst({
    where: { phone },
    orderBy: { createdAt: 'asc' },
  });
  if (!customer) return reply.code(404).send({ error: 'customer_not_found' });

  const now = new Date();
  // ⚠️ התאם את התנאים לשמות שדות אמיתיים שראית בצעד 1.
  // הדוגמה מניחה: expires_at (DateTime?), used_at (DateTime?).
  const benefits = await prisma.customerBenefit.findMany({
    where: {
      customer_id: customer.id,
      OR: [{ expires_at: null }, { expires_at: { gt: now } }],
      used_at: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  return { benefits };
});
```

- [ ] **Step 3: Manual smoke test**

```bash
# ללקוח לא קיים — 404
curl -i http://localhost:8787/api/club/benefits/0599999999 `
  -H "X-Alena-Club-Key: test-key-local-dev-only"

# ללקוח שלנו — מצופה: 200 {"benefits":[]}
curl -i http://localhost:8787/api/club/benefits/0521234567 `
  -H "X-Alena-Club-Key: test-key-local-dev-only"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/club.ts
git commit -m "feat(club-api): GET /api/club/benefits/:phone — active benefits"
```

---

## Task 8: Integration script — אימות end-to-end

**Files:**
- Create: `apps/api/scripts/test-club-api.ts`

- [ ] **Step 1: Write the script**

```typescript
// apps/api/scripts/test-club-api.ts
// הרצה: $env:CLUB_API_KEY="..."; npx tsx scripts/test-club-api.ts
// דורש שדבר ה-dev server רץ ב-8787 ו-CLUB_API_KEY מוגדר באותו מפתח.

const BASE = process.env.CLUB_API_BASE ?? 'http://localhost:8787/api/club';
const KEY = process.env.CLUB_API_KEY;
if (!KEY) {
  console.error('CLUB_API_KEY env required');
  process.exit(1);
}

const TEST_PHONE = `055${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Alena-Club-Key': KEY! },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('✗', msg); process.exit(1); }
  console.log('✓', msg);
}

console.log('--- club api integration test ---');
console.log('phone:', TEST_PHONE);

// 1. Ping (auth check)
{
  const r = await call('GET', '/ping');
  assert(r.status === 200, 'ping 200');
}

// 2. Lookup unknown customer
{
  const r = await call('POST', '/lookup', { phone: TEST_PHONE });
  assert(r.status === 200 && (r.body as any).found === false, 'lookup returns found:false for unknown');
}

// 3. Register new
{
  const r = await call('POST', '/register', { phone: TEST_PHONE, name: 'בדיקה', marketing_consent: true });
  assert(r.status === 201, 'register returns 201 for new');
  assert((r.body as any).loyalty_tier === 'regular', 'new customer is regular tier');
}

// 4. Register again (idempotent)
{
  const r = await call('POST', '/register', { phone: TEST_PHONE, name: 'בדיקה', marketing_consent: true });
  assert(r.status === 200 && (r.body as any).existing === true, 'register is idempotent');
}

// 5. Lookup now finds
{
  const r = await call('POST', '/lookup', { phone: TEST_PHONE });
  assert((r.body as any).found === true, 'lookup finds registered customer');
}

// 6. First order
{
  const r = await call('POST', '/orders', { phone: TEST_PHONE, order_total: 120, order_id: 'wc-int-1' });
  assert(r.status === 200, 'orders 200');
  assert((r.body as any).coins_earned === 120, 'earned 120 coins for 120 ILS');
  assert((r.body as any).visit_count === 1, 'visit_count=1');
}

// 7. Second order — bump to silver
{
  const r = await call('POST', '/orders', { phone: TEST_PHONE, order_total: 50, order_id: 'wc-int-2' });
  assert((r.body as any).new_balance === 170, 'balance=170');
  assert((r.body as any).new_tier === 'silver', 'tier=silver at 170 coins');
}

// 8. Benefits — empty array for fresh customer
{
  const r = await call('GET', `/benefits/${TEST_PHONE}`);
  assert(r.status === 200, 'benefits 200');
  assert(Array.isArray((r.body as any).benefits), 'benefits is array');
}

// 9. Bad key rejected
{
  const res = await fetch(BASE + '/ping', { headers: { 'X-Alena-Club-Key': 'wrong' } });
  assert(res.status === 401, 'wrong key → 401');
}

console.log('\n✅ all club api checks passed');
```

- [ ] **Step 2: Run it against a live dev server**

Terminal A (אם השרת לא רץ):
```bash
cd C:/Users/97253/top-alena-migration/apps/api
$env:CLUB_API_KEY="test-key-local-dev-only"
npm run dev
```

Terminal B:
```bash
cd C:/Users/97253/top-alena-migration/apps/api
$env:CLUB_API_KEY="test-key-local-dev-only"
npx tsx scripts/test-club-api.ts
```
Expected: 9 ✓ lines + `✅ all club api checks passed`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/scripts/test-club-api.ts
git commit -m "test(club-api): integration script covering all 4 endpoints"
```

---

## Task 9: API documentation for the WP plugin (תכנית 3)

**Files:**
- Create: `docs/api/club-api.md`

- [ ] **Step 1: Write the doc**

```markdown
# TOPALENA Club API

מתחת ל-`/api/club/*`. כל endpoint דורש header `X-Alena-Club-Key`. בלי key תקין — 401.

## POST /api/club/lookup
חיפוש לקוח לפי טלפון.
- Body: `{ "phone": "0521234567" }`
- 200 found: `{ found: true, name, coin_balance, loyalty_tier, visit_count, marketing_consent }`
- 200 not found: `{ found: false }`
- 400 bad phone: `{ error: "bad_phone" }`

## POST /api/club/register
רישום לקוח חדש. אידמפוטנטי — קריאה חוזרת עם אותו טלפון מחזירה את הלקוח הקיים.
- Body: `{ "phone", "name?", "marketing_consent": true|false }`
- 201 new: שדות לקוח
- 200 existing: שדות לקוח + `existing: true`

## POST /api/club/orders
דיווח על הזמנה. מעלה `visit_count`, מצבר `coin_balance` (1 ש"ח = 1 נקודה), מעדכן tier.
- Body: `{ "phone", "order_total" (ILS), "order_id" (WooCommerce order id), "items?" }`
- 200: `{ coins_earned, new_balance, new_tier, visit_count }`
- 404 customer not found

## GET /api/club/benefits/:phone
הטבות פעילות (לא פגות, לא נוצלו).
- 200: `{ benefits: [...] }`
- 404 customer not found

## Tier rules (v1)
- `gold`: visit_count ≥ 25 או coin_balance ≥ 300
- `silver`: visit_count ≥ 10 או coin_balance ≥ 100
- `regular`: ברירת מחדל

(אפשר לכוונן ב-`apps/api/src/lib/clubTier.ts`.)
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/97253/TOP\ ALENA   # main repo (where docs live)
git add docs/api/club-api.md
git commit -m "docs(club-api): public reference for the WP plugin"
```

> שים לב: ה-docs הולכים ל-repo הראשי (`TOP ALENA`), הקוד הולך ל-worktree `top-alena-migration`. שני repo נפרדים בענייני git, אבל אותה משפחה.

---

## Task 10: Environment + deploy prep

**Files:**
- Modify: `apps/api/.env` (לוקלי, **לא** מתקמט ל-git)
- Modify: `apps/api/.env.example` (אם קיים) — להוסיף `CLUB_API_KEY=`

- [ ] **Step 1: Generate a production key**

```bash
# צור מפתח אקראי חזק:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- [ ] **Step 2: שמור את המפתח** במקום בטוח (1Password / כספת סיסמאות).

- [ ] **Step 3: עדכן את `.env` של ה-API ל-production** (השרת בו רץ TOPALENA — לפי `DEPLOYMENT.md`):
```
CLUB_API_KEY=<המפתח שיצרת>
```

- [ ] **Step 4: רסטרט לשרת ה-API ב-production** וודא ש-`/api/club/ping` מחזיר 200 עם המפתח (אבל 401 בלי).

- [ ] **Step 5: עדכן את `.env.example` (אם קיים) להוסיף שורה ריקה:**

```
CLUB_API_KEY=
```

- [ ] **Step 6: Commit**

```bash
cd C:/Users/97253/top-alena-migration
git add apps/api/.env.example
git commit -m "chore(env): document CLUB_API_KEY"
```

---

## Self-Review Checklist (אחרי סיום כל ה-tasks)

- [ ] כל 4 ה-endpoints מהמפרט קיימים: lookup, register, orders, benefits — וגם ping bonus
- [ ] ה-API key מגן על כולם (401 בלי key)
- [ ] טיפול ב-duplicate phones (findFirst, oldest wins)
- [ ] tier מתעדכן אוטומטית אחרי כל הזמנה
- [ ] script integration עובר 100%
- [ ] docs קיים ב-`docs/api/club-api.md` ומוכן לפלאגין WP בתכנית 3
- [ ] `CLUB_API_KEY` מותקן ב-production, ה-ping בענן עובר
- [ ] commits נקיים, אחד לכל endpoint
