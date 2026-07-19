// The customer club: what a member is actually given, and how they use it.
//
// Before this, the club was a mailing list wearing a club's clothes. 19,296
// people were signed up, exactly one had a coin balance, and the CustomerBenefit
// table was empty — not sparse, empty. Nobody had ever been given anything. The
// signup page meanwhile promised "הטבות והפתעות ביום ההולדת", which made it the
// only part of the app that told customers something untrue.
//
// So the missing piece was never a feature. It was that joining bought you
// nothing and you could not see what you had. This module supplies both halves:
// benefits that are really issued, and a code the restaurant can honour.
import { prisma } from '../db.js';

const dbx = () => prisma as any;
const rid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export type ClubConfig = {
  welcome_enabled: boolean;
  welcome_text: string;
  welcome_valid_days: number;
  game_coins: number;
  birthday_enabled: boolean;
  birthday_text: string;
};

// Defaults chosen with the owner rather than for him: the welcome benefit is a
// choice of three because a fixed item suits fewer guests than it turns away,
// and the game payout is deliberately small enough to cost little and large
// enough to be worth playing for. Both are editable from the club screen.
export const CLUB_DEFAULTS: ClubConfig = {
  welcome_enabled: true,
  welcome_text: 'קינוח, מנה ראשונה או 2 צ׳ייסרים — על חשבון הבית',
  welcome_valid_days: 90,
  game_coins: 5,
  birthday_enabled: false,
  birthday_text: 'קינוח יום הולדת על חשבון הבית 🎂',
};

export async function ensureClubTables(): Promise<void> {
  await dbx().$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ClubConfig" (
      id TEXT PRIMARY KEY,
      welcome_enabled BOOLEAN DEFAULT true,
      welcome_text TEXT,
      welcome_valid_days INT DEFAULT 90,
      game_coins INT DEFAULT 5,
      birthday_enabled BOOLEAN DEFAULT false,
      birthday_text TEXT,
      updated_date TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});

  // CustomerBenefit predates this work and is declared in the Prisma schema, so
  // it is extended in place rather than replaced — the three admin screens that
  // already write benefits by hand keep working untouched. Added additively;
  // Prisma cannot see these columns, so everything here reads them by raw SQL.
  for (const col of [
    `ADD COLUMN IF NOT EXISTS code TEXT`,
    `ADD COLUMN IF NOT EXISTS source TEXT`,
    `ADD COLUMN IF NOT EXISTS redeemed_at TIMESTAMPTZ`,
    `ADD COLUMN IF NOT EXISTS redeemed_by TEXT`,
  ]) {
    await dbx().$executeRawUnsafe(`ALTER TABLE "CustomerBenefit" ${col}`).catch(() => {});
  }
  await dbx().$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "CustomerBenefit_code_key" ON "CustomerBenefit"(code) WHERE code IS NOT NULL`
  ).catch(() => {});

  // Credit a game session only once, however many times the finish call arrives.
  await dbx().$executeRawUnsafe(
    `ALTER TABLE "QueueGameSession" ADD COLUMN IF NOT EXISTS coins_awarded INT DEFAULT 0`).catch(() => {});
}

export async function getClubConfig(): Promise<ClubConfig> {
  await ensureClubTables();
  const rows: any[] = await dbx()
    .$queryRawUnsafe(`SELECT * FROM "ClubConfig" WHERE id = 'default' LIMIT 1`)
    .catch(() => []);
  const r = rows?.[0];
  if (!r) return { ...CLUB_DEFAULTS };
  return {
    welcome_enabled: r.welcome_enabled !== false,
    welcome_text: r.welcome_text || CLUB_DEFAULTS.welcome_text,
    welcome_valid_days: Number(r.welcome_valid_days) || CLUB_DEFAULTS.welcome_valid_days,
    game_coins: Number.isFinite(Number(r.game_coins)) ? Number(r.game_coins) : CLUB_DEFAULTS.game_coins,
    birthday_enabled: r.birthday_enabled === true,
    birthday_text: r.birthday_text || CLUB_DEFAULTS.birthday_text,
  };
}

export async function saveClubConfig(patch: Partial<ClubConfig>): Promise<ClubConfig> {
  const next = { ...(await getClubConfig()), ...patch };
  // Clamped, not trusted: a typo in the payout box should not mint a fortune,
  // and a negative one should not silently drain balances.
  next.game_coins = Math.max(0, Math.min(500, Math.round(Number(next.game_coins) || 0)));
  next.welcome_valid_days = Math.max(1, Math.min(3650, Math.round(Number(next.welcome_valid_days) || 90)));
  await dbx().$executeRawUnsafe(
    `INSERT INTO "ClubConfig"
       (id, welcome_enabled, welcome_text, welcome_valid_days, game_coins, birthday_enabled, birthday_text, updated_date)
     VALUES ('default', $1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       welcome_enabled = EXCLUDED.welcome_enabled,
       welcome_text = EXCLUDED.welcome_text,
       welcome_valid_days = EXCLUDED.welcome_valid_days,
       game_coins = EXCLUDED.game_coins,
       birthday_enabled = EXCLUDED.birthday_enabled,
       birthday_text = EXCLUDED.birthday_text,
       updated_date = NOW()`,
    next.welcome_enabled, next.welcome_text, next.welcome_valid_days,
    next.game_coins, next.birthday_enabled, next.birthday_text,
  );
  return next;
}

// ── redeem codes ───────────────────────────────────────────────────────────
// Read aloud across a counter in a noisy room and typed by a waiter mid-shift,
// so one of every confusable pair is dropped rather than both: O/0 → neither,
// I/1/L → none, S/5 → none, B/8 → 8, G/6 → 6, Z/2 → 2.
const ALPHABET = 'ACDEFHJKMNPQRTUVWXY2346789';

function makeCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export type Benefit = {
  id: string;
  customer_id: string;
  description: string;
  type_: string;
  status: string;
  code: string | null;
  source: string | null;
  expiry_date: string | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
};

function rowToBenefit(r: any): Benefit {
  return {
    id: r.id,
    customer_id: r.customer_id,
    description: r.description,
    type_: r.type ?? r.type_ ?? 'gift',
    status: r.status || 'active',
    code: r.code ?? null,
    source: r.source ?? null,
    expiry_date: r.expiry_date ? new Date(r.expiry_date).toISOString().slice(0, 10) : null,
    redeemed_at: r.redeemed_at ? new Date(r.redeemed_at).toISOString() : null,
    redeemed_by: r.redeemed_by ?? null,
  };
}

/**
 * Issue a benefit to a customer.
 *
 * `source` names why it was given ('welcome', 'birthday', 'manual'). Passing one
 * makes the grant idempotent for that reason: a second welcome benefit is not
 * issued while the first is still unredeemed, so a customer who re-submits the
 * signup form does not walk away with a stack of free desserts.
 */
export async function grantBenefit(opts: {
  customerId: string;
  description: string;
  source?: string;
  type_?: string;
  validDays?: number;
}): Promise<Benefit | null> {
  if (!opts.customerId || !opts.description) return null;
  await ensureClubTables();

  if (opts.source) {
    const existing: any[] = await dbx().$queryRawUnsafe(
      `SELECT * FROM "CustomerBenefit"
        WHERE customer_id = $1 AND source = $2 AND status = 'active'
          AND (expiry_date IS NULL OR expiry_date >= NOW())
        LIMIT 1`,
      opts.customerId, opts.source,
    ).catch(() => []);
    if (existing?.length) return rowToBenefit(existing[0]);
  }

  const days = Math.max(1, Math.min(3650, Math.round(opts.validDays ?? 90)));
  // Retry on collision rather than trusting 27^6 to be lucky forever; the unique
  // index is the real guarantee, this just keeps a rare clash from surfacing.
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = rid('ben');
    const code = makeCode();
    try {
      await dbx().$executeRawUnsafe(
        `INSERT INTO "CustomerBenefit"
           (id, customer_id, description, type, status, code, source, expiry_date, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, 'active', $5, $6, NOW() + ($7 || ' days')::interval, NOW(), NOW())`,
        id, opts.customerId, opts.description, opts.type_ || 'gift', code, opts.source || null, String(days),
      );
      const rows: any[] = await dbx().$queryRawUnsafe(
        `SELECT * FROM "CustomerBenefit" WHERE id = $1`, id);
      return rows?.[0] ? rowToBenefit(rows[0]) : null;
    } catch (e: any) {
      if (!/duplicate key|unique/i.test(String(e?.message || ''))) throw e;
    }
  }
  return null;
}

export async function listBenefits(customerId: string): Promise<{ active: Benefit[]; used: Benefit[] }> {
  await ensureClubTables();
  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT * FROM "CustomerBenefit"
      WHERE customer_id = $1
      ORDER BY "createdAt" DESC
      LIMIT 50`,
    customerId,
  ).catch(() => []);
  const all = (rows || []).map(rowToBenefit);
  const now = Date.now();
  const alive = (b: Benefit) =>
    b.status === 'active' && (!b.expiry_date || new Date(`${b.expiry_date}T23:59:59`).getTime() >= now);
  return { active: all.filter(alive), used: all.filter((b) => !alive(b)).slice(0, 10) };
}

export async function findBenefitByCode(code: string): Promise<(Benefit & { customer_name?: string; customer_phone?: string }) | null> {
  if (!code) return null;
  await ensureClubTables();
  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT b.*, c.name AS customer_name, c.phone AS customer_phone
       FROM "CustomerBenefit" b
       LEFT JOIN "Customer" c ON c.id = b.customer_id
      WHERE UPPER(b.code) = UPPER($1)
      LIMIT 1`,
    String(code).trim(),
  ).catch(() => []);
  if (!rows?.length) return null;
  return { ...rowToBenefit(rows[0]), customer_name: rows[0].customer_name, customer_phone: rows[0].customer_phone };
}

/**
 * Mark a benefit used.
 *
 * Refuses a second redemption rather than silently succeeding, because the
 * failure mode this guards against is a guest presenting the same code at two
 * tables — and a waiter who is told "already used on Sunday at 20:14" can
 * settle that on the spot.
 */
export async function redeemBenefit(code: string, by: string): Promise<
  { ok: true; benefit: Benefit } | { ok: false; reason: 'not_found' | 'already_used' | 'expired'; benefit?: Benefit }
> {
  const b = await findBenefitByCode(code);
  if (!b) return { ok: false, reason: 'not_found' };
  if (b.status !== 'active' || b.redeemed_at) return { ok: false, reason: 'already_used', benefit: b };
  if (b.expiry_date && new Date(`${b.expiry_date}T23:59:59`).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', benefit: b };
  }
  // Conditional update: two waiters scanning at once, only one wins.
  const n = await dbx().$executeRawUnsafe(
    `UPDATE "CustomerBenefit"
        SET status = 'redeemed', redeemed_at = NOW(), redeemed_by = $2, "updatedAt" = NOW()
      WHERE id = $1 AND status = 'active' AND redeemed_at IS NULL`,
    b.id, by || 'צוות',
  );
  if (!n) return { ok: false, reason: 'already_used', benefit: b };
  const fresh = await findBenefitByCode(code);
  return { ok: true, benefit: fresh || b };
}

// ── tier naming ────────────────────────────────────────────────────────────
// clubTier.ts computes 'silver'/'gold', while the marketing segments and the
// voice commands write 'vip' and 'blacklist' into the same column. Nothing reads
// silver or gold today. Unifying that means touching live marketing segments, so
// this only makes sure the member card never shows a guest a raw English word or
// — worse — the word 'blacklist'.
export function tierLabel(tier?: string | null): string | null {
  switch ((tier || '').toLowerCase()) {
    case 'gold': return 'זהב';
    case 'silver': return 'כסף';
    case 'vip': return 'VIP';
    case 'regular': return null;   // the default rank is not an achievement
    default: return null;
  }
}
