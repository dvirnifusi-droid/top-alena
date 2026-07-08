// Scan src/** for user-visible Hebrew strings and emit a de-duplicated list.
// Two sources: JSX text nodes (>...text...<) and string/template literals that
// contain Hebrew letters. We keep it conservative — only strings with Hebrew
// letters — so we never translate code identifiers.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const HEB = /[֐-׿]/;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (['.jsx', '.js', '.tsx', '.ts'].includes(extname(p))) files.push(p);
  }
})(ROOT);

const strings = new Set();
const add = (raw) => {
  if (!raw) return;
  let s = raw.replace(/\s+/g, ' ').trim();
  if (!s || !HEB.test(s)) return;
  if (s.length > 240) return;                 // skip long paragraphs / prose blobs
  if (/^[\d\s.,:;!?()%₪$-]+$/.test(s)) return; // numbers/punct only
  strings.add(s);
};

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // 1) JSX text nodes: >  ...  <   (may contain {expr} — we drop those fragments)
  for (const m of src.matchAll(/>([^<>{}]*[֐-׿][^<>{}]*)</g)) add(m[1]);
  // 2) string literals: '...'  "..."  `...`  containing Hebrew
  for (const m of src.matchAll(/'([^'\\]*[֐-׿][^'\\]*)'/g)) add(m[1]);
  for (const m of src.matchAll(/"([^"\\]*[֐-׿][^"\\]*)"/g)) add(m[1]);
  for (const m of src.matchAll(/`([^`\\$]*[֐-׿][^`\\$]*)`/g)) add(m[1]);
}

const list = [...strings].sort((a, b) => a.localeCompare(b, 'he'));
const out = new URL('../src/lib/i18n-strings.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
writeFileSync(out, JSON.stringify(list, null, 0), 'utf8');
console.log(`files scanned: ${files.length}`);
console.log(`unique Hebrew strings: ${list.length}`);
console.log('sample:', list.slice(0, 8));
