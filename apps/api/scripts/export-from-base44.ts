/**
 * Dumps every Base44 entity into apps/api/scripts/seed-data/<Entity>.json.
 *
 * Run this ONCE, before you turn off Base44, while the SDK still works:
 *
 *   VITE_BASE44_APP_ID=... \
 *   VITE_BASE44_APP_BASE_URL=https://<your-app>.base44.app \
 *   BASE44_TOKEN=<copy-from-browser-localStorage-base44_access_token> \
 *   tsx scripts/export-from-base44.ts
 */
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
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
  console.error(
    'Missing env vars: VITE_BASE44_APP_ID, VITE_BASE44_APP_BASE_URL, BASE44_TOKEN',
  );
  process.exit(1);
}

async function listEntity(name: string) {
  const all: unknown[] = [];
  let page = 0;
  const pageSize = 200;
  for (;;) {
    const url = `${APP_BASE}/api/apps/${APP_ID}/entities/${name}?limit=${pageSize}&skip=${page * pageSize}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (!res.ok) {
      throw new Error(`${name} list failed: ${res.status} ${await res.text()}`);
    }
    const batch = await res.json();
    const arr = Array.isArray(batch) ? batch : batch?.items ?? [];
    all.push(...arr);
    if (arr.length < pageSize) break;
    page++;
  }
  return all;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = readdirSync(ENTITIES_DIR).filter((f) => f.endsWith('.jsonc'));

  for (const f of files) {
    const name = f.replace(/\.jsonc$/, '');
    process.stdout.write(`exporting ${name} ... `);
    try {
      const rows = await listEntity(name);
      writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(rows, null, 2));
      console.log(`${rows.length} rows`);
    } catch (err: any) {
      console.error(`FAILED: ${err.message}`);
    }
  }
  console.log(`\nAll dumps written to ${OUT_DIR}`);
}

main();
