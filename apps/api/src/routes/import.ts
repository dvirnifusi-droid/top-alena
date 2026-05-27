import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

const FIELDS_BY_MODEL: Record<string, Set<string>> = {};
for (const m of Prisma.dmmf.datamodel.models) {
  FIELDS_BY_MODEL[m.name] = new Set(m.fields.map((f) => f.name));
}

function delegateFor(name: string): any {
  const key = name[0].toLowerCase() + name.slice(1);
  return (prisma as any)[key] ?? null;
}

function sanitize(modelName: string, raw: any): Record<string, unknown> {
  const allowed = FIELDS_BY_MODEL[modelName];
  if (!allowed) return raw;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (allowed.has(k)) out[k] = v;
  }
  return out;
}

export const importRoutes: FastifyPluginAsync = async (app) => {
  // Token-protected bulk import. POST /api/import { secret, data: { Entity: [...] } }
  app.post('/bulk', async (req, reply) => {
    const { secret, data } = req.body as any;
    if (!process.env.IMPORT_SECRET || secret !== process.env.IMPORT_SECRET) {
      return reply.code(401).send({ error: 'invalid_secret' });
    }
    if (!data || typeof data !== 'object') {
      return reply.code(400).send({ error: 'invalid_data' });
    }
    const summary: Record<string, { inserted: number; failed: number }> = {};
    for (const [modelName, rows] of Object.entries(data) as [string, any[]][]) {
      const delegate = delegateFor(modelName);
      if (!delegate || !Array.isArray(rows)) {
        summary[modelName] = { inserted: 0, failed: rows?.length ?? 0 };
        continue;
      }
      let inserted = 0;
      let failed = 0;
      for (const raw of rows) {
        const cleaned = sanitize(modelName, raw);
        try {
          if (raw?.id) {
            await delegate.upsert({
              where: { id: raw.id },
              update: cleaned,
              create: { id: raw.id, ...cleaned },
            });
          } else {
            await delegate.create({ data: cleaned });
          }
          inserted++;
        } catch (err: any) {
          failed++;
          if (failed <= 3) req.log.warn({ model: modelName, msg: err.message }, 'import row failed');
        }
      }
      summary[modelName] = { inserted, failed };
    }
    return summary;
  });

  // Per-model upload to avoid huge payloads: POST /api/import/:name
  app.post('/entity/:name', async (req, reply) => {
    const { secret, rows } = req.body as any;
    if (!process.env.IMPORT_SECRET || secret !== process.env.IMPORT_SECRET) {
      return reply.code(401).send({ error: 'invalid_secret' });
    }
    const { name } = req.params as { name: string };
    const delegate = delegateFor(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity', name });
    if (!Array.isArray(rows)) return reply.code(400).send({ error: 'rows_must_be_array' });
    let inserted = 0;
    let failed = 0;
    const errors: string[] = [];
    for (const raw of rows) {
      const cleaned = sanitize(name, raw);
      try {
        if (raw?.id) {
          await delegate.upsert({
            where: { id: raw.id },
            update: cleaned,
            create: { id: raw.id, ...cleaned },
          });
        } else {
          await delegate.create({ data: cleaned });
        }
        inserted++;
      } catch (err: any) {
        failed++;
        if (errors.length < 3) errors.push(err.message?.slice(0, 200) ?? 'unknown');
      }
    }
    return { name, total: rows.length, inserted, failed, errors };
  });
};
