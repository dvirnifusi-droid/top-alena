// Compares row counts: seed-data JSON (source of truth from Base44) vs Supabase.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, 'seed-data');
const prisma = new PrismaClient();

const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'));
const rows = [];
let totalSrc = 0,
  totalDb = 0;

for (const f of files) {
  const model = f.replace(/\.json$/, '');
  const key = model[0].toLowerCase() + model.slice(1);
  const delegate = prisma[key];
  if (!delegate) {
    rows.push({ model, src: '-', db: '-', status: 'NO MODEL' });
    continue;
  }
  const src = JSON.parse(readFileSync(join(SEED_DIR, f), 'utf8')).length;
  let db = 0;
  try {
    db = await delegate.count();
  } catch (e) {
    rows.push({ model, src, db: 'ERR', status: e.message.slice(0, 50) });
    continue;
  }
  totalSrc += src;
  totalDb += db;
  const status = src === 0 ? 'empty' : db === src ? 'OK' : db === 0 ? 'MISSING' : `partial ${Math.round((db / src) * 100)}%`;
  rows.push({ model, src, db, status });
}

console.log('\nModel'.padEnd(35) + 'Src'.padStart(8) + 'DB'.padStart(8) + '  Status');
console.log('-'.repeat(70));
for (const r of rows) {
  const status = r.status === 'OK' ? '✓ OK' : r.status === 'empty' ? '. empty' : r.status === 'MISSING' ? '✗ MISSING' : `~ ${r.status}`;
  console.log(
    r.model.padEnd(35) + String(r.src).padStart(8) + String(r.db).padStart(8) + '  ' + status,
  );
}
console.log('-'.repeat(70));
console.log('TOTAL'.padEnd(35) + String(totalSrc).padStart(8) + String(totalDb).padStart(8));

await prisma.$disconnect();
