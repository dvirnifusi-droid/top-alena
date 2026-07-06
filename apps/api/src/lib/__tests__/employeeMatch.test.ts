import { describe, it, expect } from 'vitest';
import { normalizeName, hebrewToLatin, nameScore, matchEmployees } from '../employeeMatch.js';

describe('normalizeName', () => {
  it('lowercases, strips punctuation, collapses spaces', () => {
    expect(normalizeName('  Shiden-Kitreab  Berhe! ')).toBe('shiden kitreab berhe');
  });
});

describe('hebrewToLatin', () => {
  it('roughly transliterates a Hebrew name to Latin consonants', () => {
    // שידן קיבראב ברחה → shydn kybrb brhh (loose; vowels absent)
    const t = hebrewToLatin('שידן קיבראב ברחה');
    expect(t).toContain('sh');
    expect(t).toContain('br');
    expect(t.replace(/\s/g, '')).toMatch(/shydn/);
  });
});

describe('matchEmployees — same-script', () => {
  const roster = [
    { id: '1', full_name: 'שידן קיבראב ברחה' },
    { id: '2', full_name: 'משה כהן' },
    { id: '3', full_name: 'דנה לוי' },
  ];
  it('substring match is exact and authoritative', () => {
    const r = matchEmployees('שידן', roster);
    expect(r.exact.map(e => e.id)).toEqual(['1']);
    expect(r.suggestions).toEqual([]);
  });
});

describe('matchEmployees — cross-script (the incident)', () => {
  const roster = [
    { id: '1', full_name: 'שידן קיבראב ברחה' }, // the real employee, Hebrew
    { id: '2', full_name: 'משה כהן' },
    { id: '3', full_name: 'דנה לוי' },
  ];
  it('a Latin paste of a Hebrew name yields NO exact match but suggests the right person first', () => {
    const r = matchEmployees('Shiden Kitreab Berhe', roster);
    expect(r.exact).toEqual([]);                 // never auto-picks across scripts
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.suggestions[0].id).toBe('1');        // ranks שידן קיבראב ברחה top
  });
  it('does not suggest clearly-unrelated names', () => {
    const r = matchEmployees('Shiden Kitreab Berhe', roster);
    expect(r.suggestions.map(e => e.id)).not.toContain('3'); // דנה לוי is unrelated
  });
});

describe('nameScore', () => {
  it('exact/substring scores 1', () => {
    expect(nameScore('שידן', 'שידן קיבראב ברחה')).toBe(1);
  });
  it('cross-script close name scores higher than an unrelated one', () => {
    const close = nameScore('Shiden Kitreab Berhe', 'שידן קיבראב ברחה');
    const far = nameScore('Shiden Kitreab Berhe', 'דנה לוי');
    expect(close).toBeGreaterThan(far);
  });
});
