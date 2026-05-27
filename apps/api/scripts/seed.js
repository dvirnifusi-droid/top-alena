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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, Prisma } from '@prisma/client';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, 'seed-data');
const prisma = new PrismaClient();
function delegateFor(modelName) {
    const key = modelName[0].toLowerCase() + modelName.slice(1);
    return prisma[key] ?? null;
}
const FIELDS_BY_MODEL = {};
for (const model of Prisma.dmmf.datamodel.models) {
    FIELDS_BY_MODEL[model.name] = new Set(model.fields.map((f) => f.name));
}
function getModelFields(modelName) {
    return FIELDS_BY_MODEL[modelName] ?? new Set();
}
async function seedFile(file) {
    const modelName = file.replace(/\.json$/, '');
    const delegate = delegateFor(modelName);
    if (!delegate) {
        console.warn(`[seed] no Prisma model for ${modelName}, skipping`);
        return;
    }
    const rows = JSON.parse(readFileSync(join(SEED_DIR, file), 'utf8'));
    if (!rows.length)
        return;
    const allowed = getModelFields(modelName);
    let inserted = 0;
    for (const raw of rows) {
        const data = {};
        for (const [k, v] of Object.entries(raw)) {
            if (allowed.size === 0 || allowed.has(k))
                data[k] = v;
        }
        try {
            if (raw.id) {
                await delegate.upsert({
                    where: { id: raw.id },
                    update: data,
                    create: { id: raw.id, ...data },
                });
            }
            else {
                await delegate.create({ data });
            }
            inserted++;
        }
        catch (err) {
            console.error(`[seed] ${modelName} row failed:`, err.message);
        }
    }
    console.log(`[seed] ${modelName}: ${inserted}/${rows.length}`);
}
async function main() {
    if (!existsSync(SEED_DIR)) {
        console.error(`Missing ${SEED_DIR}. Run export-from-base44 first.`);
        process.exit(1);
    }
    const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));
    for (const f of files)
        await seedFile(f);
    await prisma.$disconnect();
}
main().catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
});
//# sourceMappingURL=seed.js.map