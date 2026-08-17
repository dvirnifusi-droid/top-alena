// Orders from the WooCommerce storefront (alenabepita.co.il) into TOP ALENA.
//
// Phase 1 of docs/WOO-TOPALENA-ORDERS-SPEC.md: intake + list. Promoting an
// order through its stages (phase 2) writes back to WooCommerce and lives
// elsewhere; nothing here mutates the shop.
//
// Security: WooCommerce signs every webhook with HMAC-SHA256 over the raw body
// and sends it base64 in x-wc-webhook-signature. We verify it when
// WOO_WEBHOOK_SECRET is set. Unlike the Twilio route -- which deliberately
// accepts unsigned requests rather than lose a customer message -- this one
// REJECTS on mismatch: an unsigned order is an order anyone on the internet
// could have invented, and it would print in the kitchen.
import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { prisma } from '../db.js';

// Every tenant runs its own database and container, so there is no tenantId
// here -- the container the request reached IS the tenant.

function verifyWooSignature(secret: string, rawBody: Buffer | string, signature: string): boolean {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** WooCommerce status -> our operational stage. Ours is the finer of the two. */
function stageFromWoo(status: string): string {
  switch (status) {
    case 'cancelled':
    case 'failed':
    case 'refunded':
      return 'cancelled';
    case 'completed':
      return 'delivered';
    case 'processing':
      return 'accepted';
    default:
      return 'received';
  }
}

function lineItems(order: any): any {
  const items = Array.isArray(order?.line_items) ? order.line_items : [];
  return items.map((li: any) => ({
    name: li?.name ?? '',
    qty: Number(li?.quantity ?? 0),
    total: String(li?.total ?? '0'),
    // Modifiers arrive as meta_data; keep the readable pairs only.
    options: Array.isArray(li?.meta_data)
      ? li.meta_data
          .filter((m: any) => m?.display_key && m?.display_value)
          .map((m: any) => `${m.display_key}: ${m.display_value}`)
      : [],
  }));
}

export const wooOrdersRoutes: FastifyPluginAsync = async (app) => {
  // Fastify parses JSON before handlers run, so keep the raw body for HMAC.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req: any, body: Buffer, done) => {
    req.rawBody = body;
    try {
      done(null, JSON.parse(body.toString('utf8') || '{}'));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  app.post('/order', async (req: any, reply) => {
    const secret = process.env.WOO_WEBHOOK_SECRET || '';
    const signature = String(req.headers['x-wc-webhook-signature'] || '');

    if (secret) {
      if (!verifyWooSignature(secret, req.rawBody ?? Buffer.from(''), signature)) {
        req.log.warn({ signature }, 'woo webhook: bad signature, rejected');
        return reply.code(401).send({ ok: false, error: 'bad_signature' });
      }
    } else {
      // Loud, because running unverified in production is a real exposure.
      req.log.warn('woo webhook: WOO_WEBHOOK_SECRET is not set — accepting UNVERIFIED');
    }

    const order = req.body || {};
    const wooOrderId = Number(order?.id || 0);
    if (!wooOrderId) return reply.code(400).send({ ok: false, error: 'no_order_id' });

    // WooCommerce also pings the URL once when the webhook is created; that
    // ping carries no order and must not create a row.
    const shipping = order?.shipping || {};
    const billing = order?.billing || {};
    const address = [shipping.address_1 || billing.address_1, shipping.city || billing.city]
      .filter(Boolean)
      .join(', ');

    // Pickup is recorded by the storefront plugin as order meta.
    const meta = Array.isArray(order?.meta_data) ? order.meta_data : [];
    const fulfilmentMeta = meta.find((m: any) => m?.key === '_alena_fulfillment');
    const fulfillment = String(fulfilmentMeta?.value || '') === 'pickup' ? 'pickup' : 'delivery';

    const data = {
      wooNumber: String(order?.number ?? wooOrderId),
      stage: stageFromWoo(String(order?.status || '')),
      fulfillment,
      customerName: [billing.first_name, billing.last_name].filter(Boolean).join(' ').trim() || 'לקוח',
      customerPhone: billing.phone ? String(billing.phone) : null,
      address: address || null,
      total: String(order?.total ?? '0'),
      items: lineItems(order),
      placedAt: order?.date_created ? new Date(order.date_created) : new Date(),
      lastError: null as string | null,
    };

    // Idempotent on purpose: WooCommerce retries, and the 5-minute reconcile in
    // phase 3 will replay the same orders. Same order in, one row.
    const saved = await prisma.wooOrder.upsert({
      where: { wooOrderId },
      create: { wooOrderId, ...data },
      update: data,
    });

    return reply.send({ ok: true, id: saved.id, stage: saved.stage });
  });

  // The kitchen list. Active orders first, oldest first within that -- the one
  // waiting longest is the one that needs a person.
  app.get('/orders', async (req: any, reply) => {
    const showAll = String(req.query?.all || '') === '1';
    const where = showAll ? {} : { stage: { notIn: ['delivered', 'cancelled'] } };
    const orders = await prisma.wooOrder.findMany({
      where,
      orderBy: { placedAt: 'asc' },
      take: 100,
    });
    return reply.send({ ok: true, orders });
  });
};
