import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import { functionHandlers, publicFunctions } from '../functions/index.js';

/**
 * Whitelist of entities that public/unauthenticated pages may READ.
 * Add carefully — anything here is world-readable.
 */
const PUBLIC_READ_ENTITIES = new Set([
  'QueueEntry',
  'RestaurantProfile',
  'RestaurantInfo',
  'ReservationSettings',
  'AvailabilityFormSettings',
  'GameQuestion',
  'Apparel',
  'MenuItem',
]);

function modelDelegate(name: string): any {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return null;
  const key = name[0].toLowerCase() + name.slice(1);
  return (prisma as any)[key] ?? null;
}

function parseSort(sort: string | undefined) {
  if (!sort) return undefined;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return { [field]: desc ? 'desc' : 'asc' } as const;
}

export const publicFunctionsRoutes: FastifyPluginAsync = async (app) => {
  // ---- public functions ----
  app.post('/fn/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!publicFunctions.has(name)) {
      return reply.code(404).send({ error: 'unknown_or_protected_function', name });
    }
    const handler = functionHandlers[name];
    if (!handler) return reply.code(404).send({ error: 'unknown_function', name });
    try {
      return await handler({ body: req.body, user: null, req });
    } catch (err: any) {
      req.log.error({ err, fn: name }, 'public function failed');
      return reply.code(500).send({ error: 'function_error', message: err?.message });
    }
  });

  // ---- public read-only entities (used by /QueueJoin etc. via asServiceRole) ----
  app.get('/entities/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!PUBLIC_READ_ENTITIES.has(name)) {
      return reply.code(403).send({ error: 'entity_not_public', name });
    }
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });

    const q = req.query as Record<string, string | undefined>;
    const { limit, sort, where: whereStr } = q;
    let where: Record<string, unknown> = {};
    if (whereStr) {
      try {
        where = JSON.parse(whereStr);
      } catch {
        return reply.code(400).send({ error: 'invalid_where_json' });
      }
    }
    return delegate.findMany({
      where,
      orderBy: parseSort(sort),
      take: limit ? Number(limit) : 500,
    });
  });

  app.get('/entities/:name/:id', async (req, reply) => {
    const { name, id } = req.params as { name: string; id: string };
    if (!PUBLIC_READ_ENTITIES.has(name)) {
      return reply.code(403).send({ error: 'entity_not_public', name });
    }
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });
    const item = await delegate.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return item;
  });
};
