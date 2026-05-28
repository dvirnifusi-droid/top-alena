/**
 * Loads JSON dumps from scripts/seed-data/<Entity>.json into Postgres.
 * Run after `export-from-base44.ts` and after `prisma migrate deploy`.
 *
 *   npm run seed
 *
 * Strategy:
 *  - Each file name maps to a Prisma model (PascalCase → camelCase delegate).
 *  - Rows are upserted by id when present, otherwise created with a new id.
 *  - Unknown fields are dropped to tolerate schema drift.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, Prisma } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, 'seed-data');

const prisma = new PrismaClient();

function delegateFor(modelName: string): any | null {
  const key = modelName[0].toLowerCase() + modelName.slice(1);
  return (prisma as any)[key] ?? null;
}

const FIELDS_BY_MODEL: Record<string, Set<string>> = {};
const DATETIME_FIELDS: Record<string, Set<string>> = {};
// Map of JSON-side field name -> Prisma-side field name.
// e.g. when schema has `type_ @map("type")`, JSON key `type` -> input key `type_`.
const FIELD_ALIASES: Record<string, Record<string, string>> = {};
for (const model of Prisma.dmmf.datamodel.models) {
  FIELDS_BY_MODEL[model.name] = new Set(model.fields.map((f) => f.name));
  DATETIME_FIELDS[model.name] = new Set(
    model.fields.filter((f) => f.type === 'DateTime').map((f) => f.name),
  );
  const aliases: Record<string, string> = {};
  for (const f of model.fields) {
    if (f.name.endsWith('_')) aliases[f.name.slice(0, -1)] = f.name;
    if (f.dbName && f.dbName !== f.name) aliases[f.dbName] = f.name;
  }
  FIELD_ALIASES[model.name] = aliases;
}

function getModelFields(modelName: string): Set<string> {
  return FIELDS_BY_MODEL[modelName] ?? new Set();
}

function coerceDateTime(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string') {
    // YYYY-MM-DD → midnight UTC
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00.000Z`);
    // YYYY-MM-DD HH:MM[:SS] → normalize
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(v)) return new Date(v.replace(' ', 'T'));
    // Already an ISO string or parseable
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'number') return new Date(v);
  return v;
}

async function seedFile(file: string) {
  const modelName = file.replace(/\.json$/, '');
  const delegate = delegateFor(modelName);
  if (!delegate) {
    console.warn(`[seed] no Prisma model for ${modelName}, skipping`);
    return;
  }

  const rows: any[] = JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8'));
  if (!rows.length) return;

  const allowed = getModelFields(modelName);
  const dateFields = DATETIME_FIELDS[modelName] ?? new Set();
  const aliases = FIELD_ALIASES[modelName] ?? {};

  const buildData = (raw: any): Record<string, unknown> => {
    const data: Record<string, unknown> = {};
    for (const [rawKey, v] of Object.entries(raw)) {
      const k = aliases[rawKey] ?? rawKey;
      if (!allowed.has(k)) continue;
      data[k] = dateFields.has(k) ? coerceDateTime(v) : v;
    }
    return data;
  };

  let inserted = 0;
  let failed = 0;
  const firstErrors: string[] = [];

  const CONCURRENCY = 8;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const upsertOne = async (raw: any): Promise<void> => {
    const data = buildData(raw);
    let lastErr: any;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        if (raw.id) {
          await delegate.upsert({
            where: { id: raw.id },
            update: data,
            create: { id: raw.id, ...data },
          });
        } else {
          await delegate.create({ data });
        }
        return;
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? '');
        // Retry on transient pool / network errors only
        if (
          msg.includes('database server is running') ||
          msg.includes("Can't reach database") ||
          msg.includes('timed out')
        ) {
          await sleep(500 * (attempt + 1));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  };

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const chunk = rows.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(chunk.map(upsertOne));
    for (const r of results) {
      if (r.status === 'fulfilled') inserted++;
      else {
        failed++;
        if (firstErrors.length < 2) {
          firstErrors.push(String(r.reason?.message ?? r.reason).split('\n').slice(-1)[0]);
        }
      }
    }
    // Progress for large tables
    if (rows.length > 500 && (i + CONCURRENCY) % 500 === 0) {
      process.stdout.write(`  [${modelName}] ${Math.min(i + CONCURRENCY, rows.length)}/${rows.length}\n`);
    }
  }

  if (failed > 0) {
    console.log(`[seed] ${modelName}: ${inserted}/${rows.length} (failed: ${failed}) firstErr=${firstErrors[0]}`);
  } else {
    console.log(`[seed] ${modelName}: ${inserted}/${rows.length}`);
  }
}

async function main() {
  if (!existsSync(SEED_DIR)) {
    console.error(`Missing ${SEED_DIR}. Run export-from-base44 first.`);
    process.exit(1);
  }
  const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));
  for (const f of files) await seedFile(f);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
