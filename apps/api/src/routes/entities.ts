import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { fireTriggers } from '../lib/triggers.js';

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

// --- Field metadata, built once from the Prisma schema ---
const FIELD_TYPE: Record<string, Record<string, string>> = {};
for (const model of Prisma.dmmf.datamodel.models) {
  FIELD_TYPE[model.name] = {};
  for (const f of model.fields) FIELD_TYPE[model.name][f.name] = f.type;
}
function fieldsOf(modelName: string) {
  return FIELD_TYPE[modelName] ?? {};
}

// Bidirectional alias maps for @map'd fields. The frontend (Base44) uses the
// DB column name (e.g. "type"), while the Prisma client field is "type_".
// ALIAS_IN: frontend name -> prisma name (for write data, where, sort).
// ALIAS_OUT: prisma name -> frontend name (to rename in responses).
const ALIAS_IN: Record<string, Record<string, string>> = {};
const ALIAS_OUT: Record<string, Record<string, string>> = {};
for (const model of Prisma.dmmf.datamodel.models) {
  ALIAS_IN[model.name] = {};
  ALIAS_OUT[model.name] = {};
  for (const f of model.fields) {
    if (f.dbName && f.dbName !== f.name) {
      ALIAS_IN[model.name][f.dbName] = f.name;
      ALIAS_OUT[model.name][f.name] = f.dbName;
    }
  }
}
function aliasInKey(modelName: string, key: string): string {
  return ALIAS_IN[modelName]?.[key] ?? key;
}
// Rename prisma field names back to the frontend (Base44) names in a row.
// (Internal-file-URL rewriting is applied app-wide in a preSerialization hook,
// so it covers entities, functions and public function responses uniformly.)
function toFrontend(modelName: string, row: any): any {
  const out = ALIAS_OUT[modelName];
  if (!row || typeof row !== 'object' || !out || !Object.keys(out).length) return row;
  const r: any = { ...row };
  for (const [prismaName, frontendName] of Object.entries(out)) {
    if (prismaName in r) { r[frontendName] = r[prismaName]; delete r[prismaName]; }
  }
  return r;
}
function toFrontendMany(modelName: string, rows: any[]): any[] {
  const out = ALIAS_OUT[modelName];
  if (!out || !Object.keys(out).length) return rows;
  return rows.map((r) => toFrontend(modelName, r));
}

// Mongo-style operators (Base44 SDK) -> Prisma operators.
const OP_MAP: Record<string, string> = {
  $gte: 'gte', $gt: 'gt', $lte: 'lte', $lt: 'lt',
  $ne: 'not', $eq: 'equals', $in: 'in', $nin: 'notIn',
  $contains: 'contains', $startsWith: 'startsWith', $endsWith: 'endsWith',
};

function coerceDate(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00.000Z`);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)) {
    const d = new Date(v.replace(' ', 'T'));
    return isNaN(d.getTime()) ? v : d;
  }
  return v;
}

// Normalize a Base44-style `where` object into a valid Prisma filter:
// - drops keys that aren't real fields on the model (schema-drift tolerance)
// - translates $-prefixed operators
// - coerces date strings on DateTime fields
function normalizeWhere(modelName: string, raw: Record<string, unknown>): Record<string, unknown> {
  const types = fieldsOf(modelName);
  const out: Record<string, unknown> = {};
  for (const [rawKey, val] of Object.entries(raw)) {
    if (rawKey === 'AND' || rawKey === 'OR' || rawKey === 'NOT') {
      const arr = Array.isArray(val) ? val : [val];
      out[rawKey] = arr.map((c) => normalizeWhere(modelName, c as Record<string, unknown>));
      continue;
    }
    const key = aliasInKey(modelName, rawKey); // type -> type_
    const ftype = types[key];
    if (!ftype) continue; // unknown field -> drop
    const isDate = ftype === 'DateTime';
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const cond: Record<string, unknown> = {};
      for (const [opRaw, opVal] of Object.entries(val as Record<string, unknown>)) {
        const op = OP_MAP[opRaw] ?? (opRaw.startsWith('$') ? null : opRaw);
        if (!op) continue; // unknown operator -> skip
        let coerced: unknown = opVal;
        if (isDate) {
          coerced = Array.isArray(opVal) ? opVal.map(coerceDate) : coerceDate(opVal);
        }
        cond[op] = coerced;
      }
      out[key] = cond;
    } else {
      out[key] = isDate ? coerceDate(val) : val;
    }
  }
  return out;
}

function parseSort(modelName: string, sort: string | undefined) {
  if (!sort) return undefined;
  // Base44 SDK convention: "-field" means desc, "field" means asc.
  const desc = sort.startsWith('-');
  const rawField = desc ? sort.slice(1) : sort;
  const field = aliasInKey(modelName, rawField); // type -> type_
  if (!fieldsOf(modelName)[field]) return undefined; // unknown sort field -> skip
  return { [field]: desc ? 'desc' : 'asc' } as const;
}

// Coerce date-string values in create/update payloads for DateTime fields.
function coerceData(modelName: string, data: Record<string, unknown>): Record<string, unknown> {
  const types = fieldsOf(modelName);
  const out: Record<string, unknown> = {};
  for (const [rawK, v] of Object.entries(data)) {
    const k = aliasInKey(modelName, rawK); // type -> type_, _notified_abandoned -> u_notified_abandoned
    // Drop UI-only fields that aren't columns on this model. Base44 tolerated
    // extra fields; Prisma rejects them, which broke admin create/update forms
    // (e.g. Incident.photo_url). Silently ignore unknown keys instead.
    if (!(k in types)) continue;
    out[k] = types[k] === 'DateTime' ? coerceDate(v) : v;
  }
  return out;
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
    let rawWhere: Record<string, unknown> = {};
    if (whereStr) {
      try {
        rawWhere = JSON.parse(whereStr);
      } catch {
        return reply.code(400).send({ error: 'invalid_where_json' });
      }
    }
    // Allow simple equality filters as bare query params too (back-compat)
    for (const [k, v] of Object.entries(rest)) {
      if (v === undefined) continue;
      rawWhere[k] = v;
    }
    const where = normalizeWhere(name, rawWhere);

    const items = await delegate.findMany({
      where,
      orderBy: parseSort(name, sort),
      take: limit ? Number(limit) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
    return toFrontendMany(name, items);
  });

  // Get by id: GET /api/entities/:name/:id
  app.get('/:name/:id', async (req, reply) => {
    const { name, id } = req.params as { name: string; id: string };
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });
    const item = await delegate.findUnique({ where: { id } });
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return toFrontend(name, item);
  });

  // Create: POST /api/entities/:name
  app.post('/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });
    const created = await delegate.create({ data: coerceData(name, req.body as Record<string, unknown>) });
    // Fire automation triggers fire-and-forget so we never block the response.
    fireTriggers(name, 'created', created).catch((e) => req.log.warn({ err: e }, 'trigger failed'));
    return reply.code(201).send(toFrontend(name, created));
  });

  // Update: PUT /api/entities/:name/:id
  app.put('/:name/:id', async (req, reply) => {
    const { name, id } = req.params as { name: string; id: string };
    const delegate = modelDelegate(name);
    if (!delegate) return reply.code(404).send({ error: 'unknown_entity' });
    // Snapshot the previous state so update triggers can compare and only fire
    // on real status transitions (e.g. status -> completed).
    const prev = await delegate.findUnique({ where: { id } }).catch(() => null);
    const updated = await delegate.update({ where: { id }, data: coerceData(name, req.body as Record<string, unknown>) });
    fireTriggers(name, 'updated', updated, prev).catch((e) => req.log.warn({ err: e }, 'trigger failed'));
    return toFrontend(name, updated);
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
