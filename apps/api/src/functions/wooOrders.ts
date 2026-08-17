// Kitchen-facing read of the WooCommerce orders taken in by
// src/routes/wooOrders.ts. Phase 1 of docs/WOO-TOPALENA-ORDERS-SPEC.md.
//
// Exposed through the function layer rather than the raw route so it inherits
// the same authentication and per-tier page allowlist as every other screen --
// order contents include a customer's name, phone and address.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { requirePageAccess } from '../lib/pagePermissions.js';

const ACTIVE = ['received', 'accepted', 'ready', 'out'];

registerFn('getWooOrders', async ({ body, user }) => {
  if (!user) throw new Error('forbidden');
  // Anyone on shift may see the queue -- that was the owner's call. The page
  // allowlist still decides which tiers get the screen at all.
  await requirePageAccess(user, 'KitchenOrders');

  const showAll = Boolean((body as any)?.all);
  const orders = await prisma.wooOrder.findMany({
    where: showAll ? {} : { stage: { in: ACTIVE } },
    orderBy: { placedAt: 'asc' },
    take: 100,
  });

  const now = Date.now();
  return {
    orders: orders.map((o) => ({
      id: o.id,
      number: o.wooNumber,
      stage: o.stage,
      fulfillment: o.fulfillment,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      address: o.address,
      total: o.total,
      items: o.items,
      placedAt: o.placedAt,
      prepMinutes: o.prepMinutes,
      promisedAt: o.promisedAt,
      // Minutes since it arrived, and how far past the promise we are. The
      // kitchen screen colours on these; computing here keeps every device
      // agreeing on the same clock instead of trusting the tablet's.
      waitingMin: Math.max(0, Math.round((now - new Date(o.placedAt).getTime()) / 60000)),
      lateMin: o.promisedAt
        ? Math.round((now - new Date(o.promisedAt).getTime()) / 60000)
        : null,
    })),
    serverTime: new Date().toISOString(),
  };
});
