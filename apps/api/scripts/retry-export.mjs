// Retries Base44 export for entities not yet dumped, with backoff on 429.
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../..');
const ENTITIES_DIR = join(ROOT, 'base44', 'entities');
const OUT_DIR = join(__dirname, 'seed-data');

const APP_ID = process.env.VITE_BASE44_APP_ID;
const APP_BASE = (process.env.VITE_BASE44_APP_BASE_URL ?? '').replace(/\/$/, '');
const TOKEN = process.env.BASE44_TOKEN;
if (!APP_ID || !APP_BASE || !TOKEN) {
  console.error('Missing env vars');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listEntity(name) {
  const all = [];
  let page = 0;
  const pageSize = 200;
  for (;;) {
    const url = `${APP_BASE}/api/apps/${APP_ID}/entities/${name}?limit=${pageSize}&skip=${page * pageSize}`;
    let attempt = 0;
    let res;
    while (attempt < 6) {
      res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (res.status !== 429) break;
      const waitSec = 5 * (attempt + 1);
      process.stdout.write(`(429, waiting ${waitSec}s) `);
      await sleep(waitSec * 1000);
      attempt++;
    }
    if (!res.ok) throw new Error(`${name} ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    const arr = Array.isArray(batch) ? batch : (batch?.items ?? []);
    all.push(...arr);
    if (arr.length < pageSize) break;
    page++;
    await sleep(500);
  }
  return all;
}

mkdirSync(OUT_DIR, { recursive: true });
const all = readdirSync(ENTITIES_DIR)
  .filter((f) => f.endsWith('.jsonc'))
  .map((f) => f.replace(/\.jsonc$/, ''));
const missing = all.filter((n) => !existsSync(join(OUT_DIR, `${n}.json`)));
console.log(`Missing ${missing.length}/${all.length}: ${missing.join(', ')}`);

for (const name of missing) {
  process.stdout.write(`exporting ${name} ... `);
  try {
    const rows = await listEntity(name);
    writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(rows, null, 2));
    console.log(`${rows.length} rows`);
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
  }
  await sleep(1500); // gentle pacing between entities
}
console.log('\nDone.');
