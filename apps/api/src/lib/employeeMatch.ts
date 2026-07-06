// Cross-script-tolerant employee name matching for the WhatsApp agent.
//
// Root problem: staff names are stored in Hebrew (e.g. "שידן קיבראב ברחה") but
// a manager often pastes the Latin transliteration ("Shiden Kitreab Berhe").
// A naive `full_name.includes(query)` never matches across scripts, so the
// agent dead-ends on "employee not found" and the user re-pastes repeatedly.
//
// Design: a direct (same-script) substring/token match is authoritative and
// safe for WRITE tools. When that fails, we RANK the roster with a rough
// Hebrew→Latin transliteration similarity and return SUGGESTIONS — never an
// auto-pick (auto-writing a shift to the wrong person is worse than asking).

export function normalizeName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Rough Hebrew→Latin consonant transliteration (for fuzzy RANKING only, never
// for identity). Hebrew has no written vowels, so this is intentionally loose.
const HE_LATIN: Record<string, string> = {
  'א': '', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z',
  'ח': 'h', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm',
  'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': '', 'פ': 'p', 'ף': 'p',
  'צ': 'ts', 'ץ': 'ts', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't',
};

export function hebrewToLatin(s: string): string {
  let out = '';
  for (const ch of String(s || '')) out += (ch in HE_LATIN) ? HE_LATIN[ch] : ch;
  return normalizeName(out);
}

// Consonant skeleton — Hebrew has no written vowels, so to compare a Hebrew
// name (or its transliteration) against a vowel-full Latin paste we drop Latin
// vowels + y from BOTH sides and match on consonants only. Hebrew letters are
// untouched (not in [aeiouy]).
function skeleton(s: string): string {
  return normalizeName(s).replace(/[aeiouy]/g, '').replace(/\s+/g, ' ').trim();
}

function bigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, '');
  const g = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
  return g;
}

// Character-bigram Jaccard similarity, 0..1.
function bigramSim(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

export type EmployeeLite = { id: string; full_name: string; [k: string]: any };
export type MatchResult<T> = {
  exact: T[];            // strong same-script matches (authoritative)
  suggestions: T[];      // ranked cross-script guesses when there's no strong match
};

// Score a query against one name using the best of: raw normalized similarity
// and Hebrew→Latin transliterated similarity.
export function nameScore(query: string, name: string): number {
  const q = normalizeName(query);
  const n = normalizeName(name);
  if (!q || !n) return 0;
  if (n === q || n.includes(q) || q.includes(n)) return 1;
  const qs = skeleton(query);
  const direct = bigramSim(qs, skeleton(name));
  const translit = bigramSim(qs, skeleton(hebrewToLatin(name)));
  return Math.max(direct, translit);
}

// Same-script substring/token match is "exact"; otherwise rank suggestions.
export function matchEmployees<T extends EmployeeLite>(query: string, employees: T[]): MatchResult<T> {
  const q = normalizeName(query);
  if (!q) return { exact: [], suggestions: [] };
  const exact: T[] = [];
  const scored: { e: T; score: number }[] = [];
  for (const e of employees) {
    const n = normalizeName(e.full_name);
    if (!n) continue;
    if (n === q || n.includes(q) || q.includes(n)) { exact.push(e); continue; }
    scored.push({ e, score: nameScore(query, e.full_name) });
  }
  if (exact.length) return { exact, suggestions: [] };
  const suggestions = scored
    .filter(s => s.score >= 0.30)     // ignore clearly-unrelated names
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.e);
  return { exact: [], suggestions };
}
