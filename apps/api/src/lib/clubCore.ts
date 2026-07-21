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
import { isNotifEnabled } from './notificationSettings.js';

const dbx = () => prisma as any;
const rid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

export type ClubConfig = {
  welcome_enabled: boolean;
  welcome_text: string;
  welcome_valid_days: number;
  game_coins: number;
  birthday_enabled: boolean;
  birthday_text: string;
  tournament_enabled: boolean;
  tournament_winners: number;
  tournament_prize: string;
  /**
   * How much more a game played in the restaurant counts toward the tournament.
   *
   * Applied to the standings, never to the score the player sees. Someone who
   * scores 600 and is shown 1200 thinks the game is broken; someone who scores
   * 600 and reads "נספר כפול כי שיחקת אצלנו" understands exactly what happened
   * and why it is worth coming in.
   */
  queue_multiplier: number;
  /**
   * Whether joining sends the new member their card and their benefit code.
   *
   * Without it the club is invisible: someone signs up, is granted a real
   * benefit, and the only place that code has ever appeared is a success screen
   * they close after two seconds. This is the invitation.
   */
  join_message_enabled: boolean;
  join_message_text: string;
  /**
   * When the current round started.
   *
   * A round runs from the last award to whenever the owner presses the button —
   * not Sunday to Saturday. The owner asked that the system stop doing things on
   * its own schedule, and handing out prizes is a decision, not a clock tick. It
   * also means a week he forgets about simply becomes a longer round rather than
   * a round nobody won.
   */
  tournament_started_at: string | null;
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
  tournament_enabled: true,
  tournament_winners: 3,
  tournament_prize: 'קינוח על חשבון הבית 🏆',
  tournament_started_at: null,
  queue_multiplier: 2,
  join_message_enabled: true,
  join_message_text:
    'היי {name}, אתם רשומים למועדון של {brand} 🎉\n\n' +
    'מחכה לכם: {benefit}\n' +
    'הקוד להצגה למלצר: {code}\n\n' +
    'הכרטיס שלכם, עם ההטבות והנקודות: {card}',
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
  for (const col of [
    `ADD COLUMN IF NOT EXISTS tournament_enabled BOOLEAN DEFAULT true`,
    `ADD COLUMN IF NOT EXISTS tournament_winners INT DEFAULT 3`,
    `ADD COLUMN IF NOT EXISTS tournament_prize TEXT`,
    `ADD COLUMN IF NOT EXISTS tournament_started_at TIMESTAMPTZ`,
    `ADD COLUMN IF NOT EXISTS queue_multiplier INT DEFAULT 2`,
    `ADD COLUMN IF NOT EXISTS join_message_enabled BOOLEAN DEFAULT true`,
    `ADD COLUMN IF NOT EXISTS join_message_text TEXT`,
  ]) {
    await dbx().$executeRawUnsafe(`ALTER TABLE "ClubConfig" ${col}`).catch(() => {});
  }

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
  // Whose points these are. A session used to be anonymous or, at best, tied to
  // a queue entry — which meant a member who played could not accumulate
  // anything across visits, and the leaderboard was a list of nicknames.
  await dbx().$executeRawUnsafe(
    `ALTER TABLE "QueueGameSession" ADD COLUMN IF NOT EXISTS customer_id TEXT`).catch(() => {});
  await dbx().$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "QueueGameSession_customer_idx" ON "QueueGameSession"(customer_id)`).catch(() => {});
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
    tournament_enabled: r.tournament_enabled !== false,
    tournament_winners: Number(r.tournament_winners) || CLUB_DEFAULTS.tournament_winners,
    tournament_prize: r.tournament_prize || CLUB_DEFAULTS.tournament_prize,
    tournament_started_at: r.tournament_started_at ? new Date(r.tournament_started_at).toISOString() : null,
    queue_multiplier: Number(r.queue_multiplier) || CLUB_DEFAULTS.queue_multiplier,
    join_message_enabled: r.join_message_enabled !== false,
    join_message_text: r.join_message_text || CLUB_DEFAULTS.join_message_text,
  };
}

export async function saveClubConfig(patch: Partial<ClubConfig>): Promise<ClubConfig> {
  const next = { ...(await getClubConfig()), ...patch };
  // Clamped, not trusted: a typo in the payout box should not mint a fortune,
  // and a negative one should not silently drain balances.
  next.game_coins = Math.max(0, Math.min(500, Math.round(Number(next.game_coins) || 0)));
  next.welcome_valid_days = Math.max(1, Math.min(3650, Math.round(Number(next.welcome_valid_days) || 90)));
  // Prize count is a direct multiplier on what a round costs, so it is bounded
  // for the same reason the payout box is.
  next.tournament_winners = Math.max(1, Math.min(50, Math.round(Number(next.tournament_winners) || 3)));
  // At least 1 — a multiplier below 1 would make coming in worth LESS, which is
  // the opposite of the point. Not `Number(x) || 2`: a typed 0 is falsy, so that
  // form quietly restores the default instead of honouring "no bonus".
  const mult = Number(next.queue_multiplier);
  next.queue_multiplier = Number.isFinite(mult)
    ? Math.max(1, Math.min(10, Math.round(mult)))
    : CLUB_DEFAULTS.queue_multiplier;
  await dbx().$executeRawUnsafe(
    `INSERT INTO "ClubConfig"
       (id, welcome_enabled, welcome_text, welcome_valid_days, game_coins, birthday_enabled, birthday_text,
        tournament_enabled, tournament_winners, tournament_prize, tournament_started_at,
        queue_multiplier, join_message_enabled, join_message_text, updated_date)
     VALUES ('default', $1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamptz, NOW()), $11, $12, $13, NOW())
     ON CONFLICT (id) DO UPDATE SET
       welcome_enabled = EXCLUDED.welcome_enabled,
       welcome_text = EXCLUDED.welcome_text,
       welcome_valid_days = EXCLUDED.welcome_valid_days,
       game_coins = EXCLUDED.game_coins,
       birthday_enabled = EXCLUDED.birthday_enabled,
       birthday_text = EXCLUDED.birthday_text,
       tournament_enabled = EXCLUDED.tournament_enabled,
       tournament_winners = EXCLUDED.tournament_winners,
       tournament_prize = EXCLUDED.tournament_prize,
       tournament_started_at = EXCLUDED.tournament_started_at,
       queue_multiplier = EXCLUDED.queue_multiplier,
       join_message_enabled = EXCLUDED.join_message_enabled,
       join_message_text = EXCLUDED.join_message_text,
       updated_date = NOW()`,
    next.welcome_enabled, next.welcome_text, next.welcome_valid_days,
    next.game_coins, next.birthday_enabled, next.birthday_text,
    next.tournament_enabled, next.tournament_winners, next.tournament_prize,
    next.tournament_started_at, next.queue_multiplier,
    next.join_message_enabled, next.join_message_text,
  );
  return await getClubConfig();
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

// ── the invitation ─────────────────────────────────────────────────────────

/**
 * Tell a new member what they just got, and where to find it.
 *
 * The club could issue a benefit and show a card long before anyone was told
 * either existed: the code appeared once, on a success screen, and then never
 * again. This closes that gap from both doors — the in-app form and the delivery
 * site — so a member's first message is the one that makes the club real.
 *
 * Sent only to someone who has just consented, and it is not marketing: it
 * confirms a thing they signed up for seconds ago and hands them their own
 * property. It still carries the opt-out line, because the cheapest moment to
 * offer someone the exit is the moment they walked in.
 *
 * Never allowed to fail a signup. A member is worth more than a message.
 */
export async function sendJoinMessage(opts: {
  customerId: string;
  name?: string | null;
  phone?: string | null;
  consented: boolean;
  benefit?: { description: string; code: string | null } | null;
  brand?: string;
}): Promise<{ sent: boolean; reason?: string; channel?: 'whatsapp' | 'sms' }> {
  if (!opts.phone) return { sent: false, reason: 'no_phone' };
  if (!opts.consented) return { sent: false, reason: 'no_consent' };
  const cfg = await getClubConfig();
  if (!cfg.join_message_enabled) return { sent: false, reason: 'disabled' };
  if (!(await isNotifEnabled('club_welcome'))) return { sent: false, reason: 'disabled_setting' };

  const { memberCardUrl, withOptOut } = await import('./marketingBlast.js');
  const first = (opts.name || '').trim().split(' ')[0] || 'אורח/ת';
  let text = cfg.join_message_text
    .replace(/\{name\}/g, first)
    .replace(/\{brand\}/g, opts.brand || 'המסעדה')
    .replace(/\{card\}/g, memberCardUrl(opts.customerId))
    .replace(/\{benefit\}/g, opts.benefit?.description || '')
    .replace(/\{code\}/g, opts.benefit?.code || '');

  // With benefits switched off the template's benefit lines collapse to
  // "מחכה לכם:" followed by nothing, which reads like a bug. Drop any line left
  // holding only its label.
  if (!opts.benefit?.code) {
    text = text.split('\n').filter((l) => !/^(מחכה לכם|הקוד להצגה למלצר):\s*$/.test(l.trim())).join('\n');
  }
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  const body = withOptOut(text, opts.customerId);

  // An approved WhatsApp template when one exists, SMS when it does not.
  //
  // Free-form WhatsApp is skipped deliberately. A brand-new member has never
  // written to the business, so the 24-hour window is closed and the message
  // cannot arrive — and Twilio would still report success, because it accepts
  // the request and only marks it undelivered asynchronously. Trying it would
  // lose the message and tell us it went.
  //
  // SMS is the paid certainty until the template is approved. It is genuinely
  // expensive: Hebrew encodes at 70 characters a segment and this account is
  // billed about $1.35 a message, so the SMS wording below is deliberately much
  // shorter than the WhatsApp one — the benefit and the code both live on the
  // card the link opens, and repeating them costs real money per signup.
  const { sendTemplated } = await import('./waTemplates.js');
  const cardUrl = memberCardUrl(opts.customerId);
  const smsText = withOptOut(
    `היי ${first}, ההרשמה למועדון ${opts.brand || 'שלנו'} הושלמה. ההטבה והקוד שלך: ${cardUrl}`,
    opts.customerId,
  );

  const r = await sendTemplated({
    kind: 'club_welcome',
    to: opts.phone,
    // Order must match the template body exactly: brand, first name, benefit,
    // code, card link. The template was reworded and its first two variables
    // swapped; sending them in the old order would greet a member by the
    // restaurant's name.
    vars: [opts.brand || '', first, opts.benefit?.description || '', opts.benefit?.code || '', cardUrl],
    freeformText: body,
    smsText,
    skipFreeform: true,
    smsFallback: true,
  });
  return r.sent
    ? { sent: true, channel: r.via === 'sms' ? 'sms' : 'whatsapp' }
    : { sent: false, reason: r.reason };
}

// ── the tournament ─────────────────────────────────────────────────────────
// Points and coins are deliberately different things. Points come from playing,
// anywhere, without limit — they cost nothing and they are what makes the game
// worth opening at home. Coins are money (₪4 each) and are still earned only in
// the restaurant.
//
// That split is what lets home play be completely open. If every game paid coins
// the club would be a mint: five hundred people playing a week would be ten
// thousand shekels of liability. A round instead costs exactly the prizes the
// owner set, no matter how many people played or how hard.

export type Standing = {
  customer_id: string; name: string; points: number; games: number;
  here_games: number; rank: number;
};

/**
 * Standings for the round in progress, best first.
 *
 * A game played in the restaurant — one with a queue entry behind it — counts
 * for more. Otherwise the tournament rewards precisely the members who did not
 * come in, which is backwards for a business whose prize is a dish served at a
 * table. The weighting lives here rather than in the stored score, so the number
 * the player saw during the game stays the number they scored.
 */
export async function tournamentStandings(limit = 20): Promise<{
  since: string | null; multiplier: number; standings: Standing[];
}> {
  const cfg = await getClubConfig();
  const since = cfg.tournament_started_at;
  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT g.customer_id,
            COALESCE(MAX(c.name), MAX(g.player_name)) AS name,
            SUM(COALESCE(g.score, 0) *
                CASE WHEN g.queue_entry_id IS NOT NULL THEN $3::int ELSE 1 END)::int AS points,
            COUNT(*)::int AS games,
            COUNT(*) FILTER (WHERE g.queue_entry_id IS NOT NULL)::int AS here_games
       FROM "QueueGameSession" g
       LEFT JOIN "Customer" c ON c.id = g.customer_id
      WHERE g.customer_id IS NOT NULL
        AND g.finished = true
        AND ($1::timestamptz IS NULL OR g."createdAt" >= $1::timestamptz)
      GROUP BY g.customer_id
      HAVING SUM(COALESCE(g.score, 0)) > 0
      ORDER BY points DESC, games ASC
      LIMIT $2`,
    since, Math.max(1, Math.min(100, limit)), cfg.queue_multiplier,
  ).catch(() => []);
  return {
    since,
    multiplier: cfg.queue_multiplier,
    standings: (rows || []).map((r, i) => ({
      customer_id: r.customer_id,
      name: r.name || 'אורח',
      points: Number(r.points) || 0,
      games: Number(r.games) || 0,
      here_games: Number(r.here_games) || 0,
      rank: i + 1,
    })),
  };
}

/** One member's own position, for their card. */
export async function myStanding(customerId: string): Promise<{
  points: number; games: number; here_games: number; rank: number | null; multiplier: number;
}> {
  const cfg = await getClubConfig();
  const { standings } = await tournamentStandings(100);
  const me = standings.find((s) => s.customer_id === customerId);
  if (me) {
    return { points: me.points, games: me.games, here_games: me.here_games, rank: me.rank, multiplier: cfg.queue_multiplier };
  }
  // Outside the top hundred, or zero points — still their real figure, so the
  // card never tells someone who played that they have nothing.
  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT SUM(COALESCE(score,0) *
                CASE WHEN queue_entry_id IS NOT NULL THEN $3::int ELSE 1 END)::int AS points,
            COUNT(*)::int AS games,
            COUNT(*) FILTER (WHERE queue_entry_id IS NOT NULL)::int AS here_games
       FROM "QueueGameSession"
      WHERE customer_id = $1 AND finished = true
        AND ($2::timestamptz IS NULL OR "createdAt" >= $2::timestamptz)`,
    customerId, cfg.tournament_started_at, cfg.queue_multiplier,
  ).catch(() => []);
  return {
    points: Number(rows?.[0]?.points) || 0,
    games: Number(rows?.[0]?.games) || 0,
    here_games: Number(rows?.[0]?.here_games) || 0,
    rank: null,
    multiplier: cfg.queue_multiplier,
  };
}

/**
 * Tonight's board — the tables competing with each other right now.
 *
 * Not a duel. With five to fifteen tables an hour and roughly one in nine
 * playing at all, two tables being mid-game in the same minute AND both opting
 * into a match is rare enough that the feature would mostly not fire. A shared
 * board needs no coordination: play whenever during your wait, and see where you
 * stand against the others waiting.
 *
 * Everyone who joined the queue today stays listed even after being seated —
 * otherwise the leader vanishes the moment they get a table, which is precisely
 * when the people still waiting want to see the score to beat.
 */
export async function tonightBoard(): Promise<{
  rows: Array<{ entry_id: string; name: string; points: number; games: number; waiting: boolean; customer_id: string | null }>;
  waiting_now: number;
}> {
  await ensureClubTables();
  const rows: any[] = await dbx().$queryRawUnsafe(
    `SELECT e.id AS entry_id,
            e.customer_name AS name,
            e.status,
            MAX(g.customer_id) AS customer_id,
            COALESCE(SUM(g.score), 0)::int AS points,
            COUNT(g.id)::int AS games
       FROM "QueueEntry" e
       JOIN "QueueGameSession" g
         ON g.queue_entry_id = e.id AND g.finished = true
      WHERE e."createdAt" >= NOW() - INTERVAL '14 hours'
      GROUP BY e.id, e.customer_name, e.status
      HAVING COALESCE(SUM(g.score), 0) > 0
      ORDER BY points DESC
      LIMIT 25`,
  ).catch(() => []);
  const out = (rows || []).map((r) => ({
    entry_id: r.entry_id,
    // First name only — this board hangs in front of strangers in a waiting area.
    name: String(r.name || 'שולחן').trim().split(' ')[0],
    points: Number(r.points) || 0,
    games: Number(r.games) || 0,
    waiting: r.status !== 'seated' && r.status !== 'abandoned',
    customer_id: r.customer_id || null,
  }));
  return { rows: out, waiting_now: out.filter((r) => r.waiting).length };
}

/**
 * End the round: give the winners their prize and start the next one.
 *
 * Deliberately not on a timer. The owner asked that the app stop acting on its
 * own schedule, and giving away food is a decision — he presses the button, sees
 * exactly who won, and the next round starts from that moment. A week he forgets
 * about becomes a longer round rather than a round nobody won.
 *
 * `dryRun` is the preview behind the confirmation, so nobody discovers who won
 * by having already given it away.
 */
export async function closeTournamentRound(opts: { dryRun?: boolean } = {}): Promise<{
  winners: Array<Standing & { code?: string | null }>;
  prize: string;
  awarded: boolean;
}> {
  const cfg = await getClubConfig();
  const { standings } = await tournamentStandings(cfg.tournament_winners);
  const winners = standings.slice(0, cfg.tournament_winners);
  if (opts.dryRun) return { winners, prize: cfg.tournament_prize, awarded: false };

  const out: Array<Standing & { code?: string | null }> = [];
  for (const w of winners) {
    // Unique source per round start, so pressing the button twice by accident
    // does not issue a second prize for the same round.
    const b = await grantBenefit({
      customerId: w.customer_id,
      description: cfg.tournament_prize,
      source: `tournament:${cfg.tournament_started_at || 'first'}:${w.rank}`,
      validDays: cfg.welcome_valid_days,
    });
    out.push({ ...w, code: b?.code ?? null });
  }
  await saveClubConfig({ tournament_started_at: new Date().toISOString() });
  return { winners: out, prize: cfg.tournament_prize, awarded: true };
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
