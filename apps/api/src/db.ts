import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'node:events';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __realtimeMiddleware: boolean | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

// ---------------------------------------------------------------------------
// Realtime change bus (Server-Sent Events source).
//
// This API process serves exactly one tenant (its own DATABASE_URL / container),
// so an in-process EventEmitter is naturally tenant-scoped — no cross-tenant
// leakage is possible. The SSE route (/api/events/stream) subscribes to this
// bus and pushes a lightweight "something changed, refetch" signal to connected
// clients (the seating map + queue), so new online reservations / walk-ins
// appear instantly instead of on the next poll.
export const realtimeBus = new EventEmitter();
realtimeBus.setMaxListeners(0); // many concurrent SSE clients

const REALTIME_MODELS = new Set(['Reservation', 'TableSession', 'QueueEntry']);
const REALTIME_WRITES = new Set([
  'create', 'update', 'delete', 'upsert', 'createMany', 'updateMany', 'deleteMany',
]);

// A single Prisma middleware is the one choke point every write flows through —
// the generic entities route, function handlers (db.reservation.create, queue
// join…) and cron all use this client. Emit a fire-and-forget signal after any
// write to a live model; never affects the query result. Guarded so a dev HMR
// re-eval can't register it twice (which would double-emit).
if (!globalThis.__realtimeMiddleware) {
  globalThis.__realtimeMiddleware = true;
  prisma.$use(async (params, next) => {
    const result = await next(params);
    try {
      if (params.model && REALTIME_MODELS.has(params.model) && REALTIME_WRITES.has(params.action)) {
        realtimeBus.emit('change', { kind: params.model, action: params.action, at: Date.now() });
      }
    } catch { /* never let realtime break a write */ }
    return result;
  });
}
