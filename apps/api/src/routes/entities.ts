import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

// Generic CRUD over any Prisma model. The entity name in the URL is the
// PascalCase model name as it appears in schema.prisma (e.g. Customer,
// DeliveryCustomer). We map it to prisma[modelKey] where modelKey is the
// camelCase delegate (customer, deliveryCustomer).
function modelDelegate(name: string): any {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) return null;
  const key = name[0].toLowerCase() + name.slice(1);
  const delegate = (prisma as any)[key];
  return delegate ?? null;
}

function parseSort(sort: string | undefined) {
  if (!sort) return undefined;
  // Base44 SDK convention: "-field" means desc, "field" means asc.
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return { [field]: desc ? 'desc' : 'asc' } as const;
}

export const entitiesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // List: GET /api/entities/:name?limit=&sort=&...filters
  app.get('/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });

    const q = req.query as Record<string, string | undefined>;
    const { limit, skip, sort, where: whereStr, ...rest } = q;
    let where: Record<string, unknown> = {};
    if (whereStr) {
      try {
        where = JSON.parse(whereStr);
      } catch {
        return reply.code(400).send({ error: 'invalid_where_json' });
      }
    }
    // Allow simple equality filters as bare query params too (back-compat)
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      where[k] = v;
    }

    const items = await delegate.findMany({
      where,
      orderBy: parseSort(sort),
      take: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
    return items;
  });

  // Get by id: GET /api/entities/:name/:id
  app.get('/:name/:id', async (req, reply) => {
    const { name, id } = req.params as { name: string; id: string };
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });
    const item = await delegate.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return item;
  });

  // Create: POST /api/entities/:name
  app.post('/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });
    const created = await delegate.create({ data: req.body as object });
    return reply.code(201).send(created);
  });

  // Update: PUT /api/entities/:name/:id
  app.put('/:name/:id', async (req, reply) => {
    const { name, id } = req.params as { name: string; id: string };
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });
    const updated = await delegate.update({ where: { id }, data: req.body as object });
    return updated;
  });

  // Delete: DELETE /api/entities/:name/:id
  app.delete('/:name/:id', async (req, reply) => {
    const { name, id } = req.params as { name: string; id: string };
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });
    await delegate.delete({ where: { id } });
    return reply.code(204).send();
  });
};
