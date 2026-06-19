import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireClubKey } from '../middleware/clubAuth.js';
import { computeTier, coinsForOrder, ILS_PER_COIN_REDEEM } from '../lib/clubTier.js';

// Israeli phone normalization — keeps only digits, strips leading 972
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) return '0' + digits.slice(3);
  return digits;
}

const LookupBody = z.object({ phone: z.string().min(8).max(20) });

const RegisterBody = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().trim().min(1).max(120).optional(),
  marketing_consent: z.boolean(),
  // Optional profile fields — same shape as the topalena.com/Club form
  email: z.string().email().max(180).optional().or(z.literal('')),
  city: z.string().trim().max(120).optional(),
  birthday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  anniversary: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
});

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

const RedeemBody = z.object({
  phone: z.string().min(8).max(20),
  coins_to_redeem: z.number().int().positive(),
  order_id: z.string().max(120).optional(),
});

export async function clubRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireClubKey);

  // Health check for the WP plugin to verify connectivity (still key-gated)
  app.get('/ping', async () => ({ ok: true, ts: Date.now() }));

  // -------- POST /api/club/lookup --------
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

  // -------- POST /api/club/register --------
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

    // Build optional profile fields; tags Json column carries data that has
    // no dedicated column (anniversary lives there for now).
    const tagsExtra: Record<string, unknown> = {};
    if (parsed.data.anniversary) tagsExtra.anniversary = parsed.data.anniversary;
    tagsExtra.source = 'alenabepita.co.il';

    const created = await prisma.customer.create({
      data: {
        phone,
        name: parsed.data.name ?? null,
        email: parsed.data.email || null,
        city:  parsed.data.city  || null,
        birthday: parsed.data.birthday || null,
        tags: Object.keys(tagsExtra).length ? tagsExtra : undefined,
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

  // -------- POST /api/club/orders --------
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

    req.log.info({ phone, order_id: parsed.data.order_id, coinsEarned, newBalance }, 'club_order_received');

    return {
      coins_earned: coinsEarned,
      new_balance: newBalance,
      new_tier: newTier,
      visit_count: newVisitCount,
    };
  });

  // -------- POST /api/club/redeem --------
  // Burn N coins from the customer's balance in exchange for an ILS discount.
  // Idempotency is enforced by the CALLER (the WP plugin) — it stores a flag
  // on the WC order so retries don't double-debit. Keep this endpoint simple.
  app.post('/redeem', async (req, reply) => {
    const parsed = RedeemBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_body', detail: parsed.error.flatten() });

    const phone = normalizePhone(parsed.data.phone);
    const coins = parsed.data.coins_to_redeem;

    const customer = await prisma.customer.findFirst({
      where: { phone },
      orderBy: { createdAt: 'asc' },
    });
    if (!customer) return reply.code(404).send({ error: 'customer_not_found' });

    const balance = customer.coin_balance ?? 0;
    if (balance < coins) {
      return reply.code(400).send({
        error: 'insufficient_balance',
        balance,
        requested: coins,
      });
    }

    const newBalance = balance - coins;
    const ilsDiscount = coins * ILS_PER_COIN_REDEEM;

    await prisma.customer.update({
      where: { id: customer.id },
      data: { coin_balance: newBalance },
    });

    req.log.info(
      { phone, order_id: parsed.data.order_id, coins, newBalance, ilsDiscount },
      'club_coins_redeemed'
    );

    return {
      coins_redeemed: coins,
      new_balance: newBalance,
      ils_discount: ilsDiscount,
    };
  });

  // -------- GET /api/club/benefits/:phone --------
  app.get<{ Params: { phone: string } }>('/benefits/:phone', async (req, reply) => {
    const phone = normalizePhone(req.params.phone);
    const customer = await prisma.customer.findFirst({
      where: { phone },
      orderBy: { createdAt: 'asc' },
    });
    if (!customer) return reply.code(404).send({ error: 'customer_not_found' });

    const now = new Date();
    // Active = status:'active' AND (no expiry OR expiry in future).
    // Schema: CustomerBenefit { customer_id, description, type_ (mapped 'type'), status, expiry_date }
    const benefits = await prisma.customerBenefit.findMany({
      where: {
        customer_id: customer.id,
        status: 'active',
        OR: [{ expiry_date: null }, { expiry_date: { gt: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    return { benefits };
  });
}
