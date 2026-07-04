# Email Invoice Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically pull supplier invoices from two Gmail inboxes (dvirnifusi@gmail.com, nivnin@gmail.com), create pending-review Invoice rows with line items + inventory suggestions, and give the owner a one-click approve/reject screen that also updates inventory.

**Architecture:** IMAP polling (Gmail app passwords, NOT OAuth — see "Why IMAP" below) via a new cron endpoint every 10 min. Extraction reuses the existing WhatsApp-invoice LLM pipeline (refactored into a shared lib, extended with line items). Approval is a Prisma transaction: invoice update + inventory increments + learning (product aliases, sender rules). Notifications go to admins via the existing Twilio WhatsApp channel.

**Tech Stack:** Fastify + Prisma (apps/api), React/Vite SPA (src/ at repo root, base44-compat client), `imapflow` + `mailparser` (new deps), vitest (new dev dep) for pure-logic tests only. Repo: `C:\Users\97253\top-alena-migration` on branch `migration`. ALL paths below are relative to that worktree root.

**Why IMAP, not Gmail OAuth (spec deviation, approved 2026-07-04):** `gmail.readonly` is a Google *restricted* scope. In "Testing" publishing status refresh tokens expire every 7 days (breaks automation weekly); production status requires Google app verification + CASA security assessment (weeks, overkill for a private tool). Gmail app passwords over IMAP have none of these problems: one-time setup per mailbox, never expire, no Google Cloud project needed. Requires 2-Step Verification enabled on each Google account.

**Conventions to follow (from codebase):**
- Prisma model access in libs uses `(prisma as any).modelName` (see `apps/api/src/lib/whatsappInvoice.ts`).
- New models ARE added by hand to `apps/api/prisma/schema.prisma` (recent commits c5a9ca62, 6d223358 do exactly this). Do NOT run `npm run schema:build` — it regenerates from base44/entities and is not used for these hand-added models.
- DB schema is applied to prod with `prisma db push` (no migrations folder).
- Hebrew user-facing strings, English code/comments.
- Commit after every task. Never push until the deploy task.

---

### Task 1: Prisma schema — new models + Invoice/InvoiceItem fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add new models**

Append at the end of `apps/api/prisma/schema.prisma`:

```prisma
model EmailAccount {
  id              String    @id @default(cuid())
  email           String    @unique
  app_password    String    // AES-256-GCM encrypted (iv:tag:cipher hex) — see lib/emailCrypto.ts
  status          String    @default("active") // active | disconnected | error
  last_checked_at DateTime?
  last_error      String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model EmailSenderRule {
  id           String   @id @default(cuid())
  sender_email String   @unique
  rule         String   @default("auto") // auto | allow | block
  reject_count Int      @default(0)
  supplier_id  String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model EmailMessageLog {
  id            String   @id @default(cuid())
  message_id    String   @unique // RFC822 Message-ID header
  account_email String
  sender_email  String?
  subject       String?
  outcome       String   // imported | not_invoice | blocked | duplicate | no_attachment | error
  invoice_id    String?
  error         String?
  createdAt     DateTime @default(now())
}

model ProductAlias {
  id                String   @id @default(cuid())
  alias_name        String   @unique // normalized product name as it appears on invoices
  inventory_item_id String
  supplier_id       String?
  createdAt         DateTime @default(now())
}
```

- [ ] **Step 2: Extend Invoice model**

In `model Invoice` (around line 1340), add after `payment_status`:

```prisma
  source                       String?  @default("manual") // manual | whatsapp | email
  email_message_id             String?  @unique
  email_account                String?
  email_sender                 String?
  inventory_applied            Boolean  @default(false)
```

- [ ] **Step 3: Extend InvoiceItem model**

In `model InvoiceItem` (around line 1358), add after `unit_price`:

```prisma
  unit                         String?
  inventory_action             String?  // add_existing | create_new | skip
  inventory_item_id            String?
```

- [ ] **Step 4: Regenerate client and verify it compiles**

Run: `cd apps/api; npx prisma generate`
Expected: "Generated Prisma Client" with no schema validation errors.

Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit`
Expected: exit 0 (same error count as before the change, if any pre-existing).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(email-invoices): schema — EmailAccount, EmailSenderRule, EmailMessageLog, ProductAlias + invoice source fields"
```

---

### Task 2: Vitest setup + emailCrypto (encrypted app-password storage)

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/lib/emailCrypto.ts`
- Test: `apps/api/src/lib/__tests__/emailCrypto.test.ts`

- [ ] **Step 1: Install dev dependency**

Run: `cd apps/api; npm install -D vitest`

- [ ] **Step 2: Add test script + vitest config**

In `apps/api/package.json` scripts, add: `"test": "vitest run"`.

Create `apps/api/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Write the failing test**

Create `apps/api/src/lib/__tests__/emailCrypto.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { encryptToken, decryptToken } from '../emailCrypto.js';

beforeAll(() => {
  process.env.EMAIL_TOKEN_ENC_KEY = 'a'.repeat(64); // 32 bytes hex, test-only
});

describe('emailCrypto', () => {
  it('round-trips a secret', () => {
    const enc = encryptToken('abcd wxyz 1234');
    expect(enc).not.toContain('abcd');
    expect(decryptToken(enc)).toBe('abcd wxyz 1234');
  });

  it('produces different ciphertext per call (random IV)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });

  it('throws on tampered ciphertext', () => {
    const enc = encryptToken('secret');
    const parts = enc.split(':');
    parts[2] = parts[2].replace(/^../, parts[2].startsWith('00') ? '11' : '00');
    expect(() => decryptToken(parts.join(':'))).toThrow();
  });

  it('throws when key env is missing or malformed', () => {
    const saved = process.env.EMAIL_TOKEN_ENC_KEY;
    process.env.EMAIL_TOKEN_ENC_KEY = 'short';
    expect(() => encryptToken('x')).toThrow();
    process.env.EMAIL_TOKEN_ENC_KEY = saved;
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/api; npx vitest run src/lib/__tests__/emailCrypto.test.ts`
Expected: FAIL — cannot resolve `../emailCrypto.js`.

- [ ] **Step 5: Implement emailCrypto**

Create `apps/api/src/lib/emailCrypto.ts`:

```ts
// AES-256-GCM encryption for stored mailbox app-passwords.
// Key: EMAIL_TOKEN_ENC_KEY env — 64 hex chars (32 bytes). Generate once with:
//   openssl rand -hex 32
// Stored format: <iv-hex>:<authTag-hex>:<ciphertext-hex>
import crypto from 'node:crypto';

function key(): Buffer {
  const hex = process.env.EMAIL_TOKEN_ENC_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('EMAIL_TOKEN_ENC_KEY must be 64 hex chars (openssl rand -hex 32)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

export function decryptToken(stored: string): string {
  const [ivH, tagH, dataH] = stored.split(':');
  if (!ivH || !tagH || !dataH) throw new Error('bad_encrypted_token_format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivH, 'hex'));
  decipher.setAuthTag(Buffer.from(tagH, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataH, 'hex')), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api; npx vitest run src/lib/__tests__/emailCrypto.test.ts`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/vitest.config.ts apps/api/src/lib/emailCrypto.ts apps/api/src/lib/__tests__/emailCrypto.test.ts
git commit -m "feat(email-invoices): vitest setup + AES-256-GCM crypto for stored app passwords"
```

---

### Task 3: Shared invoice extraction lib (refactor out of whatsappInvoice.ts, add line items + inventory matching)

**Files:**
- Create: `apps/api/src/lib/invoiceExtraction.ts`
- Modify: `apps/api/src/lib/whatsappInvoice.ts`
- Test: `apps/api/src/lib/__tests__/invoiceMatching.test.ts`

- [ ] **Step 1: Write the failing test (pure matching logic)**

Create `apps/api/src/lib/__tests__/invoiceMatching.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeForMatch, similarity, matchInventoryItem } from '../invoiceExtraction.js';

describe('normalizeForMatch', () => {
  it('strips punctuation, collapses spaces, lowercases', () => {
    expect(normalizeForMatch('  ביסקוטי-קלאסי  200 גר\'!')).toBe('ביסקוטי קלאסי 200 גר');
  });
});

describe('similarity', () => {
  it('exact match is 1', () => {
    expect(similarity('קמח כוסמין', 'קמח כוסמין')).toBe(1);
  });
  it('substring is high', () => {
    expect(similarity('ביסקוטי קלאסי', 'ביסקוטי קלאסי 200 גרם')).toBeGreaterThanOrEqual(0.9);
  });
  it('unrelated is low', () => {
    expect(similarity('קמח', 'שמן זית')).toBeLessThan(0.5);
  });
});

describe('matchInventoryItem', () => {
  const inventory = [
    { id: 'inv1', item_name: 'ביסקוטי קלאסי' },
    { id: 'inv2', item_name: 'קמח כוסמין מלא' },
  ];
  const aliases = [{ alias_name: normalizeForMatch('ביסקוטי קלאסיק 200 גר'), inventory_item_id: 'inv1' }];

  it('alias hit wins over fuzzy', () => {
    expect(matchInventoryItem('ביסקוטי קלאסיק 200 גר', aliases, inventory))
      .toEqual({ action: 'add_existing', inventory_item_id: 'inv1', via: 'alias' });
  });

  it('fuzzy match >= 0.75 maps to existing item', () => {
    const r = matchInventoryItem('קמח כוסמין', [], inventory);
    expect(r.action).toBe('add_existing');
    expect(r.inventory_item_id).toBe('inv2');
  });

  it('no match suggests create_new', () => {
    expect(matchInventoryItem('שמן קוקוס אורגני', [], inventory)).toEqual({ action: 'create_new' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; npx vitest run src/lib/__tests__/invoiceMatching.test.ts`
Expected: FAIL — cannot resolve `../invoiceExtraction.js`.

- [ ] **Step 3: Create the shared lib**

Create `apps/api/src/lib/invoiceExtraction.ts`. `normalizeForMatch`, `similarity`, and `fuzzyFindSupplier` are MOVED verbatim from `whatsappInvoice.ts` (lines 84-121); the schema is the WhatsApp one (lines 54-69) plus `line_items`:

```ts
// Shared invoice extraction — used by both the WhatsApp flow (whatsappInvoice.ts)
// and the email import cron (emailInvoiceScan.ts).
import { invokeLLM } from './llm.js';
import { prisma } from '../db.js';

export const INVOICE_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    supplier_name: { type: 'string', description: 'שם הספק כפי שמופיע בחשבונית' },
    supplier_tax_id: { type: 'string', description: 'ח.פ. / עוסק מורשה (9 ספרות), אם מופיע' },
    invoice_number: { type: 'string', description: 'מספר החשבונית' },
    invoice_date: { type: 'string', description: 'תאריך החשבונית בפורמט YYYY-MM-DD' },
    due_date: { type: 'string', description: 'תאריך פירעון בפורמט YYYY-MM-DD, אם מופיע' },
    total_amount: { type: 'number', description: 'הסכום הסופי לתשלום (כולל מע"מ)' },
    vat_amount: { type: 'number', description: 'סכום מע"מ בנפרד, אם מופיע' },
    currency: { type: 'string', description: 'מטבע (ILS/USD/EUR). ברירת מחדל ILS' },
    category_guess: { type: 'string', description: 'קטגוריה משוערת: ירקות, בשר, אלכוהול, ניקיון, ציוד, שירותים, אחר' },
    confidence_notes: { type: 'string', description: 'הערות אם משהו לא ברור (חסר שדה / קושי קריאה)' },
    line_items: {
      type: 'array',
      description: 'שורות הפריטים בחשבונית. השמט אם אין פירוט שורות.',
      items: {
        type: 'object',
        properties: {
          product_name: { type: 'string', description: 'שם הפריט' },
          quantity: { type: 'number', description: 'כמות' },
          unit: { type: 'string', description: 'יחידת מידה (ק"ג, יח\', ליטר...)' },
          unit_price: { type: 'number', description: 'מחיר ליחידה לפני מע"מ אם מפורט, אחרת המחיר בשורה' },
        },
        required: ['product_name'],
      },
    },
  },
  required: ['supplier_name', 'total_amount'],
};

export type ExtractedLineItem = {
  product_name: string;
  quantity?: number;
  unit?: string;
  unit_price?: number;
};

export type ExtractedInvoice = {
  supplier_name: string;
  supplier_tax_id?: string;
  invoice_number?: string;
  invoice_date?: string;
  due_date?: string;
  total_amount: number;
  vat_amount?: number;
  currency?: string;
  category_guess?: string;
  confidence_notes?: string;
  line_items?: ExtractedLineItem[];
};

export function normalizeForMatch(s: string): string {
  return String(s || '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function similarity(a: string, b: string): number {
  const A = normalizeForMatch(a);
  const B = normalizeForMatch(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.includes(B) || B.includes(A)) return 0.92;
  const At = new Set(A.split(' ').filter(w => w.length >= 2));
  const Bt = new Set(B.split(' ').filter(w => w.length >= 2));
  if (!At.size || !Bt.size) return 0;
  const inter = [...At].filter(t => Bt.has(t)).length;
  const union = new Set([...At, ...Bt]).size;
  return inter / union;
}

export async function fuzzyFindSupplier(name: string, taxId?: string): Promise<{ match?: any; confidence: number }> {
  if (taxId) {
    const exact = await (prisma as any).supplier.findFirst({ where: { supplier_id: String(taxId).trim() } }).catch(() => null);
    if (exact) return { match: exact, confidence: 1 };
  }
  const all: any[] = await (prisma as any).supplier.findMany({ take: 500 }).catch(() => []);
  let best: { sup: any; sim: number } | null = null;
  for (const s of all) {
    const sim = similarity(name, s.company_name);
    if (!best || sim > best.sim) best = { sup: s, sim };
  }
  if (!best || best.sim < 0.5) return { confidence: 0 };
  return { match: best.sup, confidence: best.sim };
}

// OCR + structured extraction. fileUrl MUST be the internal /api/files/<key>
// form (see whatsappInvoice.ts comments — the public URL serves SPA HTML).
export async function extractInvoiceFromFile(fileUrl: string): Promise<ExtractedInvoice> {
  return (await invokeLLM({
    prompt: [
      'אתה מנתח חשבוניות לעסק מסעדה ישראלי. הקובץ המצורף הוא חשבונית מספק.',
      'חלץ את השדות לפי הסכמה. תאריכים בפורמט YYYY-MM-DD. סכומים כמספרים (בלי ₪ או פסיקים).',
      'אם שדה אינו קיים בחשבונית — השמט אותו במקום להמציא ערך.',
      'חלץ גם את שורות הפריטים (line_items) אם קיימות בחשבונית.',
      'קטגוריה משוערת: ירקות, פירות, בשר, דגים, חלב וביצים, יבש (קמח/אורז/וכו), משקאות, אלכוהול, ניקיון, ציוד מטבח, שירותים (חשבונאות, ביטוח, שכירות), אחר.',
    ].join('\n'),
    fileUrls: [fileUrl],
    responseSchema: INVOICE_EXTRACTION_SCHEMA,
    maxOutputTokens: 4000,
  })) as ExtractedInvoice;
}

// ── Inventory matching ──────────────────────────────────────────────────────

export type InventoryMatch = {
  action: 'add_existing' | 'create_new';
  inventory_item_id?: string;
  via?: 'alias' | 'fuzzy';
};

// Pure — testable without DB. Alias hit wins; else best fuzzy >= 0.75; else create_new.
export function matchInventoryItem(
  productName: string,
  aliases: Array<{ alias_name: string; inventory_item_id: string }>,
  inventoryItems: Array<{ id: string; item_name: string }>,
): InventoryMatch {
  const norm = normalizeForMatch(productName);
  const alias = aliases.find(a => a.alias_name === norm);
  if (alias) return { action: 'add_existing', inventory_item_id: alias.inventory_item_id, via: 'alias' };
  let best: { id: string; sim: number } | null = null;
  for (const it of inventoryItems) {
    const sim = similarity(productName, it.item_name);
    if (!best || sim > best.sim) best = { id: it.id, sim };
  }
  if (best && best.sim >= 0.75) return { action: 'add_existing', inventory_item_id: best.id, via: 'fuzzy' };
  return { action: 'create_new' };
}

// DB wrapper used by the scan job.
export async function suggestInventoryAction(productName: string): Promise<InventoryMatch> {
  const [aliases, items] = await Promise.all([
    (prisma as any).productAlias.findMany({ take: 2000 }).catch(() => []),
    (prisma as any).inventory.findMany({ take: 2000, select: { id: true, item_name: true } }).catch(() => []),
  ]);
  return matchInventoryItem(productName, aliases, items);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api; npx vitest run src/lib/__tests__/invoiceMatching.test.ts`
Expected: all pass.

- [ ] **Step 5: Refactor whatsappInvoice.ts to use the shared lib**

In `apps/api/src/lib/whatsappInvoice.ts`:
1. Add import: `import { extractInvoiceFromFile, fuzzyFindSupplier, type ExtractedInvoice } from './invoiceExtraction.js';`
2. Delete the local `INVOICE_SCHEMA` const (lines 54-69), the local `ExtractedInvoice` type (lines 71-82), `normalizeForMatch`, `similarity`, and `fuzzyFindSupplier` (lines 84-121).
3. Remove the now-unused `invokeLLM` import.
4. In `handleAdminInvoiceMedia`, replace the inline `invokeLLM({...})` call (lines 268-278) with:

```ts
    extracted = await extractInvoiceFromFile(internalUrl);
```

Behavior is unchanged — the shared prompt/schema is a superset (adds `line_items`, which the WhatsApp reply simply doesn't display).

- [ ] **Step 6: Typecheck**

Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit`
Expected: no NEW errors versus baseline.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/lib/invoiceExtraction.ts apps/api/src/lib/whatsappInvoice.ts apps/api/src/lib/__tests__/invoiceMatching.test.ts
git commit -m "refactor(email-invoices): shared invoice extraction lib + line items + inventory matching"
```

---

### Task 4: Sender-rule decision logic (pure) — learn from rejections

**Files:**
- Create: `apps/api/src/lib/emailInvoiceRules.ts`
- Test: `apps/api/src/lib/__tests__/emailInvoiceRules.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/__tests__/emailInvoiceRules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideMessageAction, nextRuleAfterRejection, BLOCK_AFTER_REJECTS } from '../emailInvoiceRules.js';

describe('decideMessageAction', () => {
  it('blocked sender → skip', () => {
    expect(decideMessageAction({ rule: 'block' }, true)).toBe('skip_blocked');
  });
  it('no attachment → skip regardless of rule', () => {
    expect(decideMessageAction({ rule: 'allow' }, false)).toBe('skip_no_attachment');
    expect(decideMessageAction(null, false)).toBe('skip_no_attachment');
  });
  it('allowed sender with attachment → process directly', () => {
    expect(decideMessageAction({ rule: 'allow' }, true)).toBe('process');
  });
  it('unknown/auto sender with attachment → needs AI classification', () => {
    expect(decideMessageAction(null, true)).toBe('classify');
    expect(decideMessageAction({ rule: 'auto' }, true)).toBe('classify');
  });
});

describe('nextRuleAfterRejection', () => {
  it('first rejection keeps auto', () => {
    expect(nextRuleAfterRejection({ rule: 'auto', reject_count: 0 }))
      .toEqual({ rule: 'auto', reject_count: 1 });
  });
  it(`rejection #${BLOCK_AFTER_REJECTS} blocks the sender`, () => {
    expect(nextRuleAfterRejection({ rule: 'auto', reject_count: BLOCK_AFTER_REJECTS - 1 }))
      .toEqual({ rule: 'block', reject_count: BLOCK_AFTER_REJECTS });
  });
  it('rejecting an allowed sender demotes to auto first', () => {
    expect(nextRuleAfterRejection({ rule: 'allow', reject_count: 0 }))
      .toEqual({ rule: 'auto', reject_count: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api; npx vitest run src/lib/__tests__/emailInvoiceRules.test.ts`
Expected: FAIL — cannot resolve `../emailInvoiceRules.js`.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/emailInvoiceRules.ts`:

```ts
// Pure decision logic for the email invoice scanner. Kept DB-free for testing.

export const BLOCK_AFTER_REJECTS = 2;

export type SenderRuleLike = { rule: string; reject_count?: number } | null | undefined;

export type MessageAction = 'skip_blocked' | 'skip_no_attachment' | 'process' | 'classify';

export function decideMessageAction(rule: SenderRuleLike, hasAllowedAttachment: boolean): MessageAction {
  if (rule?.rule === 'block') return 'skip_blocked';
  if (!hasAllowedAttachment) return 'skip_no_attachment';
  if (rule?.rule === 'allow') return 'process';
  return 'classify';
}

// Owner rejected an invoice from this sender. Two strikes → block.
// An 'allow' sender drops back to 'auto' on first strike (was probably
// auto-promoted by an approval that the owner now regrets).
export function nextRuleAfterRejection(rule: { rule: string; reject_count: number }): { rule: string; reject_count: number } {
  const count = (rule.reject_count || 0) + 1;
  if (count >= BLOCK_AFTER_REJECTS) return { rule: 'block', reject_count: count };
  return { rule: 'auto', reject_count: count };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api; npx vitest run src/lib/__tests__/emailInvoiceRules.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/emailInvoiceRules.ts apps/api/src/lib/__tests__/emailInvoiceRules.test.ts
git commit -m "feat(email-invoices): sender rule decision logic (2 rejections = block)"
```

---

### Task 5: IMAP fetch lib

**Files:**
- Modify: `apps/api/package.json` (deps)
- Create: `apps/api/src/lib/emailFetch.ts`

No unit tests — this file is a thin I/O wrapper around imapflow/mailparser; it is exercised by the live end-to-end test in Task 11.

- [ ] **Step 1: Install deps**

Run: `cd apps/api; npm install imapflow mailparser; npm install -D @types/mailparser`

- [ ] **Step 2: Implement**

Create `apps/api/src/lib/emailFetch.ts`:

```ts
// Gmail-over-IMAP fetcher. Auth = app passwords (2FA required on the Google
// account). We only ever READ (no flags changed, no deletes).
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { decryptToken } from './emailCrypto.js';

export const ALLOWED_ATTACHMENT_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export type FetchedAttachment = { filename: string; contentType: string; content: Buffer };
export type FetchedEmail = {
  messageId: string;
  sender: string; // lowercased address
  subject: string;
  snippet: string; // first 500 chars of text body — used by the AI classifier
  attachments: FetchedAttachment[];
};

function client(email: string, passPlain: string): ImapFlow {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: email, pass: passPlain },
    logger: false,
  });
}

// Validates credentials on the settings screen (plaintext password, pre-save).
export async function testConnection(email: string, appPasswordPlain: string): Promise<void> {
  const c = client(email, appPasswordPlain);
  await c.connect();
  await c.logout();
}

export function isAuthError(e: any): boolean {
  return /auth|login|credentials|Invalid credentials|AUTHENTICATIONFAILED/i.test(String(e?.responseText || e?.message || ''));
}

function pickAttachments(parsed: ParsedMail): FetchedAttachment[] {
  return (parsed.attachments || [])
    .filter(a =>
      ALLOWED_ATTACHMENT_MIME.has(String(a.contentType || '').toLowerCase()) &&
      a.content && a.content.length > 0 && a.content.length <= MAX_ATTACHMENT_BYTES)
    .map(a => ({
      filename: a.filename || 'attachment',
      contentType: String(a.contentType).toLowerCase(),
      content: a.content as Buffer,
    }));
}

// Fetch messages since `since`, skipping Message-IDs in `known`.
// Two passes: ENVELOPE-only scan to find new Message-IDs cheaply, then full
// source download + parse only for the new ones.
export async function fetchNewMessages(
  account: { email: string; app_password: string },
  since: Date,
  known: Set<string>,
): Promise<FetchedEmail[]> {
  const c = client(account.email, decryptToken(account.app_password));
  await c.connect();
  const out: FetchedEmail[] = [];
  try {
    const lock = await c.getMailboxLock('INBOX');
    try {
      const uids = (await c.search({ since }, { uid: true })) || [];
      const fresh: number[] = [];
      for await (const msg of c.fetch(uids, { envelope: true }, { uid: true })) {
        const mid = msg.envelope?.messageId || `<uid-${msg.uid}@${account.email}>`;
        if (!known.has(mid)) fresh.push(msg.uid);
        if (fresh.length >= 100) break; // safety cap per run; the next run picks up the rest
      }
      for (const uid of fresh) {
        const fetched = await c.fetchOne(String(uid), { source: true }, { uid: true });
        if (!fetched || !fetched.source) continue;
        const parsed = await simpleParser(fetched.source);
        out.push({
          messageId: parsed.messageId || `<uid-${uid}@${account.email}>`,
          sender: (parsed.from?.value?.[0]?.address || '').toLowerCase(),
          subject: parsed.subject || '',
          snippet: (parsed.text || '').slice(0, 500),
          attachments: pickAttachments(parsed),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await c.logout().catch(() => {});
  }
  return out;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit`
Expected: no new errors. (If `imapflow` lacks bundled types and tsc complains about the import, add `apps/api/src/types/imapflow.d.ts` containing `declare module 'imapflow';` and include it — check first, recent imapflow versions ship their own types.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/lib/emailFetch.ts
git commit -m "feat(email-invoices): IMAP fetch lib (imapflow + mailparser, read-only)"
```

---

### Task 6: Scan job — email → pending Invoice (+ WhatsApp alert)

**Files:**
- Create: `apps/api/src/lib/emailInvoiceScan.ts`
- Modify: `apps/api/src/lib/whatsappAlerts.ts`

- [ ] **Step 1: Export broadcastToAdmins + add two alert builders**

In `apps/api/src/lib/whatsappAlerts.ts`: change `async function broadcastToAdmins` to `export async function broadcastToAdmins`, and append at the end of the file:

```ts
export async function alertEmailInvoicesImported(count: number): Promise<void> {
  await broadcastToAdmins([
    `📬 *נקלטו ${count} חשבוניות חדשות מהמייל*`,
    'ממתינות לבדיקה ואישור בדף /Invoices.',
  ].join('\n'));
}

export async function alertEmailAccountDisconnected(email: string): Promise<void> {
  await broadcastToAdmins([
    `⚠️ *תיבת המייל ${email} נותקה*`,
    'סיסמת האפליקציה בוטלה או השתנתה. חבר מחדש בדף /EmailInvoiceSettings.',
  ].join('\n'));
}
```

- [ ] **Step 2: Implement the scan job**

Create `apps/api/src/lib/emailInvoiceScan.ts`:

```ts
// Cron job: pull invoices from connected mailboxes into pending_review
// Invoices. Called every 10 min from /api/cron/email-invoice-scan.
import { Readable } from 'node:stream';
import { prisma } from '../db.js';
import { invokeLLM } from './llm.js';
import { uploadStreamToS3 } from './storage.js';
import { fetchNewMessages, isAuthError, type FetchedEmail } from './emailFetch.js';
import { decideMessageAction } from './emailInvoiceRules.js';
import { extractInvoiceFromFile, fuzzyFindSupplier, suggestInventoryAction } from './invoiceExtraction.js';
import { alertEmailInvoicesImported, alertEmailAccountDisconnected } from './whatsappAlerts.js';

const FIRST_RUN_LOOKBACK_MS = 30 * 24 * 3600 * 1000; // backfill 30 days on first connect
const OVERLAP_MS = 24 * 3600 * 1000; // IMAP SINCE is day-granular; overlap + dedupe-by-Message-ID

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    is_supplier_invoice: { type: 'boolean', description: 'האם זו חשבונית/חשבונית-מס מספק לעסק' },
    confidence: { type: 'number', description: '0-1' },
  },
  required: ['is_supplier_invoice', 'confidence'],
};

async function classifyEmail(msg: FetchedEmail): Promise<{ is_supplier_invoice: boolean; confidence: number }> {
  const res: any = await invokeLLM({
    prompt: [
      'לפניך פרטי מייל שהתקבל בתיבת הדואר של מסעדה. קבע האם סביר שזהו מייל של חשבונית ספק',
      '(חשבונית מס, חשבונית עסקה, קבלה מספק סחורה/שירות לעסק).',
      'קבלות על רכישות פרטיות, ניוזלטרים, חוזים, הצעות מחיר ופרסומות אינם חשבונית ספק.',
      `שולח: ${msg.sender}`,
      `נושא: ${msg.subject}`,
      `קבצים מצורפים: ${msg.attachments.map(a => a.filename).join(', ')}`,
      `תחילת גוף המייל: ${msg.snippet}`,
    ].join('\n'),
    responseSchema: CLASSIFY_SCHEMA,
    maxOutputTokens: 200,
  });
  return { is_supplier_invoice: !!res?.is_supplier_invoice, confidence: Number(res?.confidence) || 0 };
}

type ScanResults = { imported: number; skipped: number; errors: number; accounts: number };

async function processMessage(acct: { email: string }, msg: FetchedEmail, results: ScanResults): Promise<void> {
  const log = (outcome: string, extra: Record<string, unknown> = {}) =>
    (prisma as any).emailMessageLog.create({
      data: {
        message_id: msg.messageId,
        account_email: acct.email,
        sender_email: msg.sender || null,
        subject: msg.subject.slice(0, 200) || null,
        outcome,
        ...extra,
      },
    }).catch(() => {});

  const rule = msg.sender
    ? await (prisma as any).emailSenderRule.findUnique({ where: { sender_email: msg.sender } }).catch(() => null)
    : null;

  const action = decideMessageAction(rule, msg.attachments.length > 0);
  if (action === 'skip_blocked') { await log('blocked'); return; }
  if (action === 'skip_no_attachment') { await log('no_attachment'); return; }

  let autoDetected = false;
  if (action === 'classify') {
    const cls = await classifyEmail(msg).catch(() => ({ is_supplier_invoice: false, confidence: 0 }));
    if (!cls.is_supplier_invoice || cls.confidence < 0.7) { await log('not_invoice'); return; }
    autoDetected = true;
  }

  // Largest allowed attachment is almost always the invoice itself.
  const att = [...msg.attachments].sort((a, b) => b.content.length - a.content.length)[0];
  const ext = att.contentType === 'application/pdf' ? '.pdf' : '.' + (att.contentType.split('/')[1] || 'jpg');
  const { key } = await uploadStreamToS3(`email-invoice${ext}`, att.contentType, Readable.from(att.content));
  const storedUrl = `/api/files/${key}`;

  let extracted;
  try {
    extracted = await extractInvoiceFromFile(storedUrl);
  } catch {
    try { extracted = await extractInvoiceFromFile(storedUrl); } // one retry
    catch (e2: any) { await log('error', { error: String(e2?.message || e2).slice(0, 300) }); results.errors++; return; }
  }
  if (!extracted?.supplier_name || !extracted?.total_amount) {
    await log('error', { error: 'extract_incomplete' }); results.errors++; return;
  }

  // Supplier: reuse existing high-confidence match, else create pending_approval.
  const { match, confidence } = await fuzzyFindSupplier(extracted.supplier_name, extracted.supplier_tax_id);
  let supplierId: string;
  if (match && confidence >= 0.9) {
    supplierId = match.id;
  } else {
    const sup = await (prisma as any).supplier.create({
      data: {
        company_name: String(extracted.supplier_name).slice(0, 200),
        supplier_id: String(extracted.supplier_tax_id || '').slice(0, 30),
        contact_person: '',
        email: msg.sender || '',
        phone: '',
        category: String(extracted.category_guess || 'אחר').slice(0, 60),
        status: 'pending_approval',
      },
    });
    supplierId = sup.id;
  }

  // Duplicate guard: same supplier + invoice number (catches the WhatsApp-scanned copy too).
  if (extracted.invoice_number) {
    const dupe = await (prisma as any).invoice.findFirst({
      where: { supplier_id: supplierId, invoice_number: String(extracted.invoice_number) },
    }).catch(() => null);
    if (dupe) { await log('duplicate', { invoice_id: dupe.id }); results.skipped++; return; }
  }

  const isoOk = typeof extracted.invoice_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(extracted.invoice_date);
  const invoice = await (prisma as any).invoice.create({
    data: {
      supplier_id: supplierId,
      invoice_number: String(extracted.invoice_number || '').slice(0, 60) || null,
      invoice_date: isoOk ? new Date(`${extracted.invoice_date}T00:00:00.000Z`) : new Date(),
      total_amount: Number(extracted.total_amount) || 0,
      file_url: storedUrl,
      status: 'pending_review',
      payment_status: 'unpaid',
      source: 'email',
      email_message_id: msg.messageId,
      email_account: acct.email,
      email_sender: msg.sender || null,
      // note for the review UI when the sender was auto-detected (new supplier flow)
      ...(autoDetected ? {} : {}),
    },
  });

  for (const li of extracted.line_items || []) {
    if (!li.product_name) continue;
    const suggestion = await suggestInventoryAction(li.product_name);
    await (prisma as any).invoiceItem.create({
      data: {
        invoice_id: invoice.id,
        product_name: String(li.product_name).slice(0, 200),
        quantity: Number(li.quantity) || 1,
        unit_price: Number(li.unit_price) || 0,
        unit: li.unit ? String(li.unit).slice(0, 30) : null,
        inventory_action: suggestion.action,
        inventory_item_id: suggestion.inventory_item_id || null,
      },
    }).catch(() => {});
  }

  await log('imported', { invoice_id: invoice.id });
  results.imported++;
}

export async function scanEmailInvoices(): Promise<ScanResults> {
  const accounts: any[] = await (prisma as any).emailAccount.findMany({ where: { status: 'active' } }).catch(() => []);
  const results: ScanResults = { imported: 0, skipped: 0, errors: 0, accounts: accounts.length };
  const scanStart = new Date();

  for (const acct of accounts) {
    try {
      const since = acct.last_checked_at
        ? new Date(new Date(acct.last_checked_at).getTime() - OVERLAP_MS)
        : new Date(Date.now() - FIRST_RUN_LOOKBACK_MS);
      const knownRows: any[] = await (prisma as any).emailMessageLog.findMany({
        where: { account_email: acct.email },
        select: { message_id: true },
      }).catch(() => []);
      const known = new Set<string>(knownRows.map(r => r.message_id));

      const messages = await fetchNewMessages(acct, since, known);
      for (const msg of messages) {
        try { await processMessage(acct, msg, results); }
        catch (e: any) {
          results.errors++;
          console.warn('[email-invoice-scan] message failed', { mid: msg.messageId, err: e?.message });
        }
      }
      await (prisma as any).emailAccount.update({
        where: { id: acct.id },
        data: { last_checked_at: scanStart, last_error: null },
      });
    } catch (e: any) {
      results.errors++;
      if (isAuthError(e)) {
        await (prisma as any).emailAccount.update({
          where: { id: acct.id },
          data: { status: 'disconnected', last_error: String(e?.message || e).slice(0, 300) },
        }).catch(() => {});
        await alertEmailAccountDisconnected(acct.email).catch(() => {});
      } else {
        await (prisma as any).emailAccount.update({
          where: { id: acct.id },
          data: { last_error: String(e?.message || e).slice(0, 300) },
        }).catch(() => {});
        console.warn('[email-invoice-scan] account failed', { email: acct.email, err: e?.message });
      }
    }
  }

  if (results.imported > 0) await alertEmailInvoicesImported(results.imported).catch(() => {});
  return results;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/emailInvoiceScan.ts apps/api/src/lib/whatsappAlerts.ts
git commit -m "feat(email-invoices): scan job — IMAP → classify → extract → pending invoice + WhatsApp alert"
```

---

### Task 7: API routes — email accounts CRUD + cron endpoint

**Files:**
- Create: `apps/api/src/routes/emailAccounts.ts`
- Modify: `apps/api/src/routes/cron.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create the accounts route**

Create `apps/api/src/routes/emailAccounts.ts`:

```ts
// Mailbox management for the email→invoice importer. App-password based
// (Gmail IMAP); passwords stored AES-encrypted, never returned to the client.
import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../db.js';
import { encryptToken } from '../lib/emailCrypto.js';
import { testConnection } from '../lib/emailFetch.js';
import { scanEmailInvoices } from '../lib/emailInvoiceScan.js';

export const emailAccountsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  app.get('/', async () => {
    return (prisma as any).emailAccount.findMany({
      select: { id: true, email: true, status: true, last_checked_at: true, last_error: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  });

  // Connect (or reconnect) a mailbox. Validates the app password live
  // against Gmail IMAP before saving.
  app.post('/', async (req, reply) => {
    const { email, app_password } = (req.body as any) || {};
    const addr = String(email || '').trim().toLowerCase();
    const pass = String(app_password || '').replace(/\s+/g, ''); // Google displays app passwords with spaces
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr) || pass.length < 8) {
      return reply.code(400).send({ error: 'bad_input', message: 'כתובת מייל או סיסמת אפליקציה לא תקינים' });
    }
    try {
      await testConnection(addr, pass);
    } catch (e: any) {
      return reply.code(400).send({ error: 'imap_login_failed', message: 'ההתחברות לתיבה נכשלה — ודא שסיסמת האפליקציה נכונה ושאימות דו-שלבי פעיל' });
    }
    const row = await (prisma as any).emailAccount.upsert({
      where: { email: addr },
      update: { app_password: encryptToken(pass), status: 'active', last_error: null },
      create: { email: addr, app_password: encryptToken(pass) },
    });
    return { id: row.id, email: row.email, status: row.status };
  });

  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await (prisma as any).emailAccount.delete({ where: { id } }).catch(() => {});
    return reply.code(204).send();
  });

  // Manual "scan now" from the settings screen.
  app.post('/scan-now', async () => {
    return scanEmailInvoices();
  });
};
```

- [ ] **Step 2: Add the cron endpoint**

In `apps/api/src/routes/cron.ts`, add to the imports:

```ts
import { scanEmailInvoices } from '../lib/emailInvoiceScan.js';
```

and add next to the other endpoints (e.g. after the `/crisis-agent` route):

```ts
  // Every 10 min — pull supplier invoices from connected Gmail inboxes.
  app.post('/email-invoice-scan', async () => scanEmailInvoices());
```

- [ ] **Step 3: Register the route plugin**

In `apps/api/src/index.ts`, add with the other imports:

```ts
import { emailAccountsRoutes } from './routes/emailAccounts.js';
```

and after line 61 (`googleSyncRoutes` registration):

```ts
await app.register(emailAccountsRoutes, { prefix: '/api/email-accounts' });
```

- [ ] **Step 4: Typecheck + boot smoke test**

Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/emailAccounts.ts apps/api/src/routes/cron.ts apps/api/src/index.ts
git commit -m "feat(email-invoices): email-accounts routes + 10-min cron endpoint"
```

---

### Task 8: Approve / Reject functions (invoice + inventory transaction + learning)

**Files:**
- Create: `apps/api/src/functions/emailInvoices.ts`
- Modify: `apps/api/src/functions/load.ts` (one import line)

- [ ] **Step 1: Implement the functions**

Create `apps/api/src/functions/emailInvoices.ts`:

```ts
// Approve/reject flow for email-imported invoices (called from the
// InvoiceReviewModal via base44.functions.*). Approve = one transaction:
// invoice fields + line items + inventory apply + learning (aliases, sender
// rule, supplier activation).
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { normalizeForMatch } from '../lib/invoiceExtraction.js';
import { nextRuleAfterRejection } from '../lib/emailInvoiceRules.js';

type ApproveItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit?: string | null;
  inventory_action: 'add_existing' | 'create_new' | 'skip';
  inventory_item_id?: string | null;
};

registerFn('emailInvoiceApprove', async ({ body }) => {
  const p = (body as any) || {};
  const inv: any = await (prisma as any).invoice.findUnique({ where: { id: String(p.invoice_id || '') } });
  if (!inv) throw new Error('invoice_not_found');
  if (inv.inventory_applied) throw new Error('inventory_already_applied');

  const items: ApproveItem[] = Array.isArray(p.items) ? p.items : [];

  await (prisma as any).$transaction(async (tx: any) => {
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        invoice_number: p.invoice_number != null ? String(p.invoice_number).slice(0, 60) : inv.invoice_number,
        invoice_date: p.invoice_date && /^\d{4}-\d{2}-\d{2}$/.test(p.invoice_date)
          ? new Date(`${p.invoice_date}T00:00:00.000Z`) : inv.invoice_date,
        total_amount: p.total_amount != null ? Number(p.total_amount) : inv.total_amount,
        supplier_id: p.supplier_id ? String(p.supplier_id) : inv.supplier_id,
        payment_status: p.payment_status === 'paid' ? 'paid' : 'unpaid',
        status: 'processed',
        inventory_applied: true,
      },
    });

    for (const it of items) {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      await tx.invoiceItem.update({
        where: { id: it.id },
        data: {
          product_name: String(it.product_name).slice(0, 200),
          quantity: qty,
          unit_price: price,
          unit: it.unit ? String(it.unit).slice(0, 30) : null,
          inventory_action: it.inventory_action,
          inventory_item_id: it.inventory_item_id || null,
        },
      });

      const finalSupplierId = p.supplier_id ? String(p.supplier_id) : inv.supplier_id;

      if (it.inventory_action === 'add_existing' && it.inventory_item_id) {
        await tx.inventory.update({
          where: { id: it.inventory_item_id },
          data: {
            current_stock: { increment: qty },
            ...(price > 0 ? { cost_per_unit: price } : {}),
            last_updated: new Date(),
          },
        });
        // Learning: remember this invoice-name → inventory-item mapping.
        await tx.productAlias.upsert({
          where: { alias_name: normalizeForMatch(it.product_name) },
          update: { inventory_item_id: it.inventory_item_id },
          create: {
            alias_name: normalizeForMatch(it.product_name),
            inventory_item_id: it.inventory_item_id,
            supplier_id: finalSupplierId,
          },
        });
      } else if (it.inventory_action === 'create_new') {
        const created = await tx.inventory.create({
          data: {
            item_name: String(it.product_name).slice(0, 200),
            category: String(p.category || 'אחר').slice(0, 60),
            current_stock: qty,
            unit: it.unit ? String(it.unit).slice(0, 30) : 'יח\'',
            cost_per_unit: price,
            supplier_id: finalSupplierId,
            last_updated: new Date(),
          },
        });
        await tx.productAlias.upsert({
          where: { alias_name: normalizeForMatch(it.product_name) },
          update: { inventory_item_id: created.id },
          create: {
            alias_name: normalizeForMatch(it.product_name),
            inventory_item_id: created.id,
            supplier_id: finalSupplierId,
          },
        });
      }
      // 'skip' → nothing.
    }

    // Learning: sender becomes trusted; auto-created supplier becomes active.
    if (inv.email_sender) {
      await tx.emailSenderRule.upsert({
        where: { sender_email: inv.email_sender },
        update: { rule: 'allow', reject_count: 0, supplier_id: inv.supplier_id },
        create: { sender_email: inv.email_sender, rule: 'allow', supplier_id: inv.supplier_id },
      });
    }
    await tx.supplier.updateMany({
      where: { id: p.supplier_id ? String(p.supplier_id) : inv.supplier_id, status: 'pending_approval' },
      data: { status: 'active' },
    });
  });

  return { ok: true };
});

registerFn('emailInvoiceReject', async ({ body }) => {
  const p = (body as any) || {};
  const inv: any = await (prisma as any).invoice.findUnique({ where: { id: String(p.invoice_id || '') } });
  if (!inv) throw new Error('invoice_not_found');

  await (prisma as any).invoice.update({ where: { id: inv.id }, data: { status: 'rejected' } });

  // Learning: strike the sender; two strikes → block.
  let senderBlocked = false;
  if (inv.email_sender) {
    const existing: any = await (prisma as any).emailSenderRule.findUnique({
      where: { sender_email: inv.email_sender },
    }).catch(() => null);
    const next = nextRuleAfterRejection(existing || { rule: 'auto', reject_count: 0 });
    await (prisma as any).emailSenderRule.upsert({
      where: { sender_email: inv.email_sender },
      update: { rule: next.rule, reject_count: next.reject_count },
      create: { sender_email: inv.email_sender, rule: next.rule, reject_count: next.reject_count },
    });
    senderBlocked = next.rule === 'block';
  }

  // Clean up an auto-created supplier that has no other invoices.
  const others = await (prisma as any).invoice.count({
    where: { supplier_id: inv.supplier_id, id: { not: inv.id } },
  }).catch(() => 1);
  if (others === 0) {
    await (prisma as any).supplier.deleteMany({
      where: { id: inv.supplier_id, status: 'pending_approval' },
    }).catch(() => {});
  }

  return { ok: true, sender_blocked: senderBlocked };
});
```

- [ ] **Step 2: Wire registration**

In `apps/api/src/functions/load.ts`, add at the very top (with the other imports):

```ts
import './emailInvoices.js';
```

- [ ] **Step 3: Typecheck + run all tests**

Run: `cd apps/api; npx tsc -p tsconfig.json --noEmit; npx vitest run`
Expected: typecheck clean, all vitest suites pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/functions/emailInvoices.ts apps/api/src/functions/load.ts
git commit -m "feat(email-invoices): approve/reject fns — inventory transaction + alias & sender learning"
```

---

### Task 9: Frontend — EmailInvoiceSettings page

**Files:**
- Create: `src/pages/EmailInvoiceSettings.jsx`
- Modify: `src/pages.config.js`

- [ ] **Step 1: Create the page**

Create `src/pages/EmailInvoiceSettings.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Mail, Trash2, RefreshCw, ShieldOff, Plus } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api';

async function api(path, opts = {}) {
  const tok = localStorage.getItem('auth_token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data;
}

export default function EmailInvoiceSettingsPage() {
  const [accounts, setAccounts] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [form, setForm] = useState({ email: '', app_password: '' });
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const [accs, rules] = await Promise.all([
        api('/email-accounts'),
        base44.entities.EmailSenderRule.filter({ rule: 'block' }),
      ]);
      setAccounts(accs || []);
      setBlocked(rules || []);
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      await api('/email-accounts', { method: 'POST', body: JSON.stringify(form) });
      setForm({ email: '', app_password: '' });
      setMsg({ kind: 'ok', text: 'התיבה חוברה בהצלחה! הסריקה הראשונה (30 יום אחורה) תרוץ בדקות הקרובות.' });
      load();
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    } finally { setBusy(false); }
  };

  const disconnect = async (id, email) => {
    if (!window.confirm(`לנתק את ${email}?`)) return;
    await api(`/email-accounts/${id}`, { method: 'DELETE' });
    load();
  };

  const scanNow = async () => {
    setScanBusy(true); setMsg(null);
    try {
      const r = await api('/email-accounts/scan-now', { method: 'POST' });
      setMsg({ kind: 'ok', text: `סריקה הסתיימה: ${r.imported} נקלטו, ${r.skipped} כפולות, ${r.errors} שגיאות.` });
      load();
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    } finally { setScanBusy(false); }
  };

  const unblock = async (rule) => {
    await base44.entities.EmailSenderRule.update(rule.id, { rule: 'auto', reject_count: 0 });
    load();
  };

  const statusBadge = (a) => {
    if (a.status === 'active') return <Badge className="bg-green-100 text-green-800">מחובר</Badge>;
    if (a.status === 'disconnected') return <Badge className="bg-red-100 text-red-800">מנותק — חבר מחדש</Badge>;
    return <Badge className="bg-yellow-100 text-yellow-800">{a.status}</Badge>;
  };

  return (
    <div className="p-4 sm:p-8 bg-gray-50 min-h-screen" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Mail className="w-8 h-8" />
            תיבות מייל לחשבוניות
          </h1>
          <p className="text-lg text-slate-600 mt-2">
            המערכת סורקת את התיבות המחוברות כל 10 דקות ומכניסה חשבוניות ספקים ל"בהמתנה".
          </p>
        </div>

        {msg && (
          <div className={`p-3 rounded-lg text-sm ${msg.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {msg.text}
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>תיבות מחוברות</CardTitle>
            <Button variant="outline" size="sm" onClick={scanNow} disabled={scanBusy}>
              <RefreshCw className={`w-4 h-4 ml-2 ${scanBusy ? 'animate-spin' : ''}`} />
              סרוק עכשיו
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <div className="font-medium">{a.email}</div>
                  <div className="text-sm text-slate-500">
                    {a.last_checked_at ? `נבדק לאחרונה: ${new Date(a.last_checked_at).toLocaleString('he-IL')}` : 'טרם נסרק'}
                    {a.last_error ? ` · שגיאה: ${a.last_error}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(a)}
                  <Button variant="ghost" size="sm" onClick={() => disconnect(a.id, a.email)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
            {accounts.length === 0 && <p className="text-slate-500 text-sm">אין תיבות מחוברות עדיין.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>חיבור תיבה (Gmail)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              נדרשת <b>סיסמת אפליקציה</b> של Google (לא הסיסמה הרגילה): היכנס ל-
              <a className="text-blue-600 underline mx-1" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
                myaccount.google.com/apppasswords
              </a>
              (דורש אימות דו-שלבי פעיל), צור סיסמה חדשה בשם "TopAlena" והדבק אותה כאן.
            </p>
            <Input placeholder="כתובת Gmail" dir="ltr" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Input placeholder="סיסמת אפליקציה (16 תווים)" dir="ltr" type="password" value={form.app_password}
              onChange={e => setForm(f => ({ ...f, app_password: e.target.value }))} />
            <Button onClick={connect} disabled={busy || !form.email || !form.app_password}>
              <Plus className="w-4 h-4 ml-2" />
              {busy ? 'בודק חיבור…' : 'חבר תיבה'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldOff className="w-5 h-5" />שולחים חסומים</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-slate-600">שולח נחסם אוטומטית אחרי שתי דחיות. אפשר להחזיר אותו כאן.</p>
            {blocked.map(r => (
              <div key={r.id} className="flex items-center justify-between border rounded-lg p-2">
                <span dir="ltr" className="text-sm">{r.sender_email}</span>
                <Button variant="outline" size="sm" onClick={() => unblock(r)}>הסר חסימה</Button>
              </div>
            ))}
            {blocked.length === 0 && <p className="text-slate-500 text-sm">אין שולחים חסומים.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the page**

In `src/pages.config.js`:
- Add import (alphabetical position, near line 74): `import EmailInvoiceSettings from './pages/EmailInvoiceSettings';`
- Add to the PAGES map (near line 200): `"EmailInvoiceSettings": EmailInvoiceSettings,`

- [ ] **Step 3: Verify the SPA builds**

Run (worktree root): `npx vite build`
Expected: build completes without errors. (Do NOT commit `dist/` yet — that happens in the deploy task.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/EmailInvoiceSettings.jsx src/pages.config.js
git commit -m "feat(email-invoices): mailbox settings page (connect via app password, blocked senders)"
```

---

### Task 10: Frontend — InvoiceReviewModal + Invoices page integration

**Files:**
- Create: `src/components/invoices/InvoiceReviewModal.jsx`
- Modify: `src/pages/Invoices.jsx`

- [ ] **Step 1: Create the review modal**

Create `src/components/invoices/InvoiceReviewModal.jsx`:

```jsx
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { InvoiceItem } from '@/entities/InvoiceItem';
import { Inventory } from '@/entities/Inventory';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

// Review screen for an email-imported invoice: editable fields, per-line
// inventory action, one Approve that commits invoice + inventory together.
export default function InvoiceReviewModal({ invoice, supplierName, onClose, onDone }) {
  const [fields, setFields] = useState({
    invoice_number: invoice.invoice_number || '',
    invoice_date: invoice.invoice_date ? String(invoice.invoice_date).slice(0, 10) : '',
    total_amount: invoice.total_amount ?? 0,
    payment_status: invoice.payment_status || 'unpaid',
  });
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [its, inv] = await Promise.all([
          InvoiceItem.filter({ invoice_id: invoice.id }),
          Inventory.list(),
        ]);
        setItems((its || []).map(it => ({ ...it, inventory_action: it.inventory_action || 'create_new' })));
        setInventory(inv || []);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [invoice.id]);

  const setItem = (idx, patch) =>
    setItems(list => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const invNameById = Object.fromEntries(inventory.map(i => [i.id, i.item_name]));

  const approve = async () => {
    setBusy(true); setError(null);
    try {
      await base44.functions.emailInvoiceApprove({
        invoice_id: invoice.id,
        invoice_number: fields.invoice_number,
        invoice_date: fields.invoice_date,
        total_amount: Number(fields.total_amount) || 0,
        payment_status: fields.payment_status,
        items: items.map(it => ({
          id: it.id,
          product_name: it.product_name,
          quantity: Number(it.quantity) || 0,
          unit_price: Number(it.unit_price) || 0,
          unit: it.unit || null,
          inventory_action: it.inventory_action,
          inventory_item_id: it.inventory_action === 'add_existing' ? it.inventory_item_id : null,
        })),
      });
      onDone();
    } catch (e) {
      setError(e.message); setBusy(false);
    }
  };

  const reject = async () => {
    if (!window.confirm('לדחות את החשבונית? היא לא תיכנס למערכת והמלאי לא יעודכן.')) return;
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.emailInvoiceReject({ invoice_id: invoice.id });
      if (res?.data?.sender_blocked) {
        window.alert('השולח נחסם אחרי שתי דחיות — מיילים ממנו לא ייסרקו יותר (ניתן לבטל בהגדרות תיבות מייל).');
      }
      onDone();
    } catch (e) {
      setError(e.message); setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            בדיקת חשבונית — {supplierName || 'ספק לא ידוע'}
            <Badge variant="outline">נקלט ממייל</Badge>
          </DialogTitle>
        </DialogHeader>

        {error && <div className="p-3 rounded bg-red-50 text-red-800 text-sm">{error}</div>}

        <div className="grid md:grid-cols-2 gap-4">
          {invoice.file_url && (
            <iframe title="invoice-file" src={invoice.file_url} className="w-full h-96 border rounded-lg bg-white" />
          )}
          <div className="space-y-3">
            <label className="block text-sm">
              מספר חשבונית
              <Input dir="ltr" value={fields.invoice_number}
                onChange={e => setFields(f => ({ ...f, invoice_number: e.target.value }))} />
            </label>
            <label className="block text-sm">
              תאריך
              <Input type="date" value={fields.invoice_date}
                onChange={e => setFields(f => ({ ...f, invoice_date: e.target.value }))} />
            </label>
            <label className="block text-sm">
              סכום כולל (₪)
              <Input type="number" dir="ltr" value={fields.total_amount}
                onChange={e => setFields(f => ({ ...f, total_amount: e.target.value }))} />
            </label>
            <label className="block text-sm">
              סטטוס תשלום
              <Select value={fields.payment_status} onValueChange={v => setFields(f => ({ ...f, payment_status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">לא שולם</SelectItem>
                  <SelectItem value="paid">שולם</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
        </div>

        <div>
          <h3 className="font-semibold mb-2">פריטים ועדכון מלאי</h3>
          {items.length === 0 && (
            <p className="text-sm text-slate-500">לא זוהו שורות פריטים בחשבונית — אישור יכניס את החשבונית בלבד, בלי עדכון מלאי.</p>
          )}
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={it.id} className="grid grid-cols-12 gap-2 items-center border rounded-lg p-2">
                <Input className="col-span-3" value={it.product_name}
                  onChange={e => setItem(idx, { product_name: e.target.value })} />
                <Input className="col-span-1" type="number" dir="ltr" value={it.quantity}
                  onChange={e => setItem(idx, { quantity: e.target.value })} />
                <Input className="col-span-2" type="number" dir="ltr" value={it.unit_price} placeholder="מחיר ליח'"
                  onChange={e => setItem(idx, { unit_price: e.target.value })} />
                <div className="col-span-3">
                  <Select value={it.inventory_action} onValueChange={v => setItem(idx, { inventory_action: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="add_existing">הוסף לפריט קיים</SelectItem>
                      <SelectItem value="create_new">פריט מלאי חדש</SelectItem>
                      <SelectItem value="skip">דלג (בלי מלאי)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  {it.inventory_action === 'add_existing' && (
                    <Select value={it.inventory_item_id || ''} onValueChange={v => setItem(idx, { inventory_item_id: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="בחר פריט מלאי">{invNameById[it.inventory_item_id] || 'בחר פריט מלאי'}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {it.inventory_action === 'create_new' && <span className="text-sm text-green-700">ייווצר פריט חדש במלאי</span>}
                  {it.inventory_action === 'skip' && <span className="text-sm text-slate-400">ללא עדכון מלאי</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={reject} disabled={busy}>
            <XCircle className="w-4 h-4 ml-2" />דחה
          </Button>
          <Button className="bg-green-600 hover:bg-green-700" onClick={approve}
            disabled={busy || items.some(it => it.inventory_action === 'add_existing' && !it.inventory_item_id)}>
            {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <CheckCircle className="w-4 h-4 ml-2" />}
            אשר חשבונית + עדכן מלאי
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Note: if `src/entities/Inventory.js` does not exist, check `ls src/entities/` — every entity file there is one line re-exporting from base44Client (e.g. `export const Inventory = base44.entities.Inventory;`). Create it in the same style if missing.

- [ ] **Step 2: Integrate into the Invoices page**

In `src/pages/Invoices.jsx`:

1. Add imports:

```jsx
import { Mail, ClipboardCheck } from 'lucide-react';
import InvoiceReviewModal from '../components/invoices/InvoiceReviewModal';
```

(merge `Mail`, `ClipboardCheck` into the existing lucide-react import on line 9.)

2. Add state next to `showExportDialog` (line 28):

```jsx
    const [reviewInvoice, setReviewInvoice] = useState(null);
```

3. In `statusInfo` (line 89), add a `rejected` entry:

```jsx
        rejected: { icon: AlertCircle, color: 'text-gray-400', label: 'נדחתה' },
```

4. In the supplier `TableCell` (line 152), show an email badge — replace the cell with:

```jsx
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    {supplier?.company_name || 'לא ידוע'}
                                                    {invoice.source === 'email' && (
                                                        <Badge variant="outline" className="text-blue-600 border-blue-200 gap-1">
                                                            <Mail className="w-3 h-3" />מייל
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
```

5. In the actions `TableCell` (line 176-183), add a review button before the existing "צפה" button:

```jsx
                                                {invoice.source === 'email' && invoice.status === 'pending_review' && (
                                                    <Button size="sm" className="bg-amber-500 hover:bg-amber-600 ml-2"
                                                        onClick={() => setReviewInvoice(invoice)}>
                                                        <ClipboardCheck className="w-4 h-4 ml-2" />
                                                        בדוק ואשר
                                                    </Button>
                                                )}
```

6. Before the closing `</div>` of the page (line 198), render the modal:

```jsx
            {reviewInvoice && (
                <InvoiceReviewModal
                    invoice={reviewInvoice}
                    supplierName={suppliers[reviewInvoice.supplier_id]?.company_name}
                    onClose={() => setReviewInvoice(null)}
                    onDone={() => { setReviewInvoice(null); loadData(); }}
                />
            )}
```

- [ ] **Step 3: Build check**

Run (worktree root): `npx vite build`
Expected: builds clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/invoices/InvoiceReviewModal.jsx src/pages/Invoices.jsx src/entities/Inventory.js
git commit -m "feat(email-invoices): review modal (approve+inventory / reject) + Invoices page integration"
```

(drop `src/entities/Inventory.js` from the add list if it already existed.)

---

### Task 11: Deploy + one-time setup + live end-to-end test

**Files:** none new — deployment and configuration.

Deploy topology (memory `vps-deploy`): app root `/opt/top-alena` on 91.98.45.253, docker compose, **web bundle is built locally and dist/ is committed** (VPS has 2GB RAM, vite OOMs there). SSH from this workstation was broken on 2026-07-01 (port 22 timeout) — test first; if still broken, give Dvir the commands to paste in his VPS terminal.

- [ ] **Step 1: Full local verification**

```bash
cd apps/api && npx tsc -p tsconfig.json --noEmit && npx vitest run
```
Expected: clean typecheck, all tests pass.

- [ ] **Step 2: Build web bundle locally and commit dist/**

```bash
npx vite build
git add dist/
git commit -m "build: web bundle for email invoice import"
```

- [ ] **Step 3: Push**

```bash
git push origin migration
```

- [ ] **Step 4: Server-side env + deploy**

Test SSH first: `ssh -o BatchMode=yes -o ConnectTimeout=10 root@91.98.45.253 'echo alive'`.
If SSH works run the commands below directly; otherwise send them to Dvir to paste in his VPS terminal:

```bash
# 1. Add encryption key to the api env (once):
cd /opt/top-alena
grep -q EMAIL_TOKEN_ENC_KEY .env || echo "EMAIL_TOKEN_ENC_KEY=$(openssl rand -hex 32)" >> .env

# 2. Pull + rebuild:
git fetch origin migration && git reset --hard origin/migration && docker compose up -d --build api web

# 3. Apply schema (after api container is up):
docker compose exec api npx prisma db push --skip-generate

# 4. Cron — every 10 minutes (append to root crontab):
( crontab -l; echo '*/10 * * * * curl -s -X POST "https://topalena.com/api/cron/email-invoice-scan?secret='"$(grep ^CRON_SECRET .env | cut -d= -f2)"'" >/dev/null 2>&1' ) | crontab -
```

Check the .env variable name conventions on the server before step 4 — CRON_SECRET must match how existing cron lines pass it (look at `crontab -l` first and copy the existing style).

Verify deploy: `curl -s https://topalena.com/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'` matches the new `dist/assets/` filename.

- [ ] **Step 5: One-time mailbox setup with Dvir**

For each of dvirnifusi@gmail.com and nivnin@gmail.com:
1. Enable 2-Step Verification if not already on (myaccount.google.com/security).
2. Create an app password at myaccount.google.com/apppasswords, name it "TopAlena".
3. In the app: open /EmailInvoiceSettings, enter the address + app password, click "חבר תיבה".

- [ ] **Step 6: Live end-to-end test**

1. In /EmailInvoiceSettings click "סרוק עכשיו" — expect the 30-day backfill to import at least one real invoice (both mailboxes receive supplier invoices today).
2. Verify a WhatsApp message arrived: "📬 נקלטו X חשבוניות חדשות מהמייל".
3. Open /Invoices — email-tagged rows in "בהמתנה" with the "בדוק ואשר" button.
4. Open the review modal: file preview renders, extracted fields editable, line items show inventory suggestions.
5. Approve one invoice with at least one `add_existing` line and one `create_new` line → verify in /Inventory (or via DB) that stock incremented and the new item exists; invoice status flips to "עובדה".
6. Reject one invoice twice from the same test sender (send two dummy "invoices" from a personal address) → verify the sender appears under "שולחים חסומים" and a third email from it logs outcome `blocked`.
7. Re-run "סרוק עכשיו" → the already-imported messages must NOT duplicate (EmailMessageLog dedupe).

- [ ] **Step 7: Final commit of any fixes + update memory**

Fix anything the E2E test surfaced (each fix = its own commit). Then update the memory file `project_topalena_architecture.md` (or create a new memory) noting: email invoice import shipped, mailboxes connected via app passwords, cron every 10 min, EMAIL_TOKEN_ENC_KEY lives in /opt/top-alena/.env.

---

## Self-Review Notes

- **Spec coverage:** connection management (T1/T7/T9), 10-min scan + 30-day backfill (T6/T11), combined detection known-senders + AI classify with "ספק חדש" via pending_approval supplier (T6), review modal with full editing + per-line inventory action + payment status (T10), approve transaction incl. aliases + sender allow (T8), 2-rejections block + unblock UI (T4/T8/T9), WhatsApp notifications not push (T6), dedupe vs WhatsApp scans by supplier+invoice_number and by Message-ID (T6), auth-revoked handling (T6), oversized/unsupported attachments skipped (T5), per-account try/catch isolation (T6).
- **Spec deviation (approved):** Gmail OAuth replaced with IMAP app passwords (restricted-scope/7-day-token problem); spec updated accordingly.
- **Known simplifications:** only the largest attachment per email is processed; HTML-body-only invoices are out of scope (per spec); `unit` was added to InvoiceItem because line items carry units.
