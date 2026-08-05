import { describe, it, expect } from 'vitest';
import { isValidIsraeliId, FORM101_SECTIONS, validateForm101, prefillFromPrevious } from '../form101.js';

// Real check-digit-valid numbers (generated, not belonging to anyone).
const VALID_IDS = ['000000018', '123456782', '039999990'];

describe('isValidIsraeliId', () => {
  it('accepts numbers whose check digit is right', () => {
    for (const id of VALID_IDS) expect(isValidIsraeliId(id)).toBe(true);
  });
  it('rejects a wrong check digit', () => {
    expect(isValidIsraeliId('123456789')).toBe(false);
    expect(isValidIsraeliId('000000019')).toBe(false);
  });
  it('left-pads short input to 9 digits — people drop leading zeros', () => {
    expect(isValidIsraeliId('18')).toBe(true);        // 000000018
    expect(isValidIsraeliId('39999990')).toBe(true);  // 039999990
  });
  it('ignores dashes and spaces', () => {
    expect(isValidIsraeliId('12345678-2')).toBe(true);
    expect(isValidIsraeliId(' 123456782 ')).toBe(true);
  });
  it('rejects non-digits, empty and over-long input', () => {
    expect(isValidIsraeliId('')).toBe(false);
    expect(isValidIsraeliId('abcdefghi')).toBe(false);
    expect(isValidIsraeliId('1234567821')).toBe(false);
    expect(isValidIsraeliId(null as any)).toBe(false);
    expect(isValidIsraeliId(undefined as any)).toBe(false);
  });
  it('rejects all-zeros — passes the checksum but is not an ID', () => {
    expect(isValidIsraeliId('000000000')).toBe(false);
  });
});

describe('FORM101_SECTIONS', () => {
  it('covers all ten parts of the official form', () => {
    expect(FORM101_SECTIONS.map((s) => s.key)).toEqual([
      'employer', 'personal', 'children', 'income_this',
      'other_income', 'spouse', 'changes', 'credits',
      'coordination', 'declaration',
    ]);
  });
  it('marks the employer part as not employee-filled', () => {
    expect(FORM101_SECTIONS.find((s) => s.key === 'employer')!.employee_fills).toBe(false);
  });
  it('lists all 15 credit clauses of part ח', () => {
    const credits = FORM101_SECTIONS.find((s) => s.key === 'credits')!;
    expect(credits.clauses).toHaveLength(15);
    expect(credits.clauses!.map((c) => c.n)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]);
  });
  it('flags the clauses that require an attachment', () => {
    const credits = FORM101_SECTIONS.find((s) => s.key === 'credits')!;
    // נכות, עולה חדש, חייל משוחרר, ילד נטול יכולת, מזונות, יישוב מזכה, סיום לימודים
    expect(credits.clauses!.filter((c) => c.requires_document).map((c) => c.n))
      .toEqual([2, 3, 4, 11, 12, 14, 15]);
  });
});

const minimalValid = () => ({
  personal: {
    first_name: 'ישראל', last_name: 'ישראלי', id_number: '123456782',
    birth_date: '1990-05-01', gender: 'זכר', is_resident: true,
    marital_status: 'רווק/ה', city: 'ראשון לציון', street: 'רוטשילד', house_no: '104',
    phone_mobile: '0501234567',
  },
  children: [],
  income_this: { start_date: '2026-01-01', type: 'משכורת חודש' },
  other_income: { none: true },
  spouse: null,
  credits: { clauses: { 1: { checked: true } } },
  coordination: {},
  declaration: { accepted: true, signature_data_url: 'data:image/png;base64,AAAA' },
});

describe('validateForm101', () => {
  it('passes a complete minimal form', () => {
    expect(validateForm101(minimalValid()).errors).toEqual([]);
  });

  it('blocks a missing required personal field', () => {
    const f = minimalValid();
    delete (f.personal as any).last_name;
    const { errors } = validateForm101(f);
    expect(errors.some((e) => e.field === 'personal.last_name')).toBe(true);
  });

  it('blocks a bad employee ID check digit', () => {
    const f = minimalValid();
    f.personal.id_number = '123456789';
    expect(validateForm101(f).errors.some((e) => e.field === 'personal.id_number')).toBe(true);
  });

  it('requires name, ID and birth date for EVERY child — a count is not enough', () => {
    const f = minimalValid();
    (f.children as any) = [{ name: 'דנה' }];
    const { errors } = validateForm101(f);
    expect(errors.some((e) => e.field === 'children.0.id_number')).toBe(true);
    expect(errors.some((e) => e.field === 'children.0.birth_date')).toBe(true);
  });

  it('validates each child ID check digit', () => {
    const f = minimalValid();
    (f.children as any) = [{ name: 'דנה', id_number: '111111111', birth_date: '2015-03-02' }];
    expect(validateForm101(f).errors.some((e) => e.field === 'children.0.id_number')).toBe(true);
  });

  it('requires the spouse ID when married', () => {
    const f = minimalValid();
    f.personal.marital_status = 'נשוי/אה';
    const { errors } = validateForm101(f);
    expect(errors.some((e) => e.field === 'spouse.id_number')).toBe(true);
  });

  it('requires a תיאום מס approval document when separated (פרוד/ה)', () => {
    const f = minimalValid();
    f.personal.marital_status = 'פרוד/ה';
    expect(validateForm101(f).errors.some((e) => e.field === 'personal.separated_approval')).toBe(true);
  });

  it('blocks part ה left blank — neither "no other income" nor a list', () => {
    const f = minimalValid();
    (f.other_income as any) = {};
    expect(validateForm101(f).errors.some((e) => e.field === 'other_income')).toBe(true);
  });

  it('requires details when other income is declared', () => {
    const f = minimalValid();
    (f.other_income as any) = { none: false, types: [] };
    expect(validateForm101(f).errors.some((e) => e.field === 'other_income.types')).toBe(true);
  });

  it('blocks a credit clause that needs a document without one', () => {
    const f = minimalValid();
    (f.credits as any) = { clauses: { 4: { checked: true, service_start: '2020-01-01', service_end: '2023-01-01' } } };
    expect(validateForm101(f).errors.some((e) => e.field === 'credits.4.document')).toBe(true);
  });

  it('accepts that same clause once the document is attached', () => {
    const f = minimalValid();
    (f.credits as any) = {
      clauses: { 4: { checked: true, service_start: '2020-01-01', service_end: '2023-01-01', document_url: 'https://x/y.pdf' } },
    };
    expect(validateForm101(f).errors.some((e) => e.field.startsWith('credits.4'))).toBe(false);
  });

  it('blocks submission without the declaration and the signature', () => {
    const f = minimalValid();
    (f.declaration as any) = { accepted: false };
    const { errors } = validateForm101(f);
    expect(errors.some((e) => e.field === 'declaration.accepted')).toBe(true);
    expect(errors.some((e) => e.field === 'declaration.signature_data_url')).toBe(true);
  });

  it('rejects a signature that is not an image data URL', () => {
    const f = minimalValid();
    f.declaration.signature_data_url = 'https://evil.example/sig.png';
    expect(validateForm101(f).errors.some((e) => e.field === 'declaration.signature_data_url')).toBe(true);
  });

  it('warns — does not block — when a child birth date contradicts the age bracket', () => {
    const f = minimalValid();
    (f.children as any) = [{ name: 'דנה', id_number: '123456782', birth_date: '2010-01-01', in_custody: true }];
    (f.credits as any) = { clauses: { 7: { checked: true, born_this_year: 1 } } };
    const { errors, warnings } = validateForm101(f, { tax_year: 2026 });
    expect(errors.some((e) => e.field.startsWith('credits.7'))).toBe(false);
    expect(warnings.some((w) => w.field === 'credits.7.born_this_year')).toBe(true);
  });

  it('validates a draft leniently — a half-filled draft is not an error', () => {
    const { errors } = validateForm101({ personal: { first_name: 'ישראל' } }, { draft: true });
    expect(errors).toEqual([]);
  });

  it('still rejects a malformed ID in a draft', () => {
    const { errors } = validateForm101(
      { personal: { first_name: 'ישראל', id_number: '123456789' } }, { draft: true },
    );
    expect(errors.some((e) => e.field === 'personal.id_number')).toBe(true);
  });
});

describe('prefillFromPrevious', () => {
  const prev = {
    personal: { first_name: 'ישראל', last_name: 'ישראלי', id_number: '123456782', city: 'ראשון לציון' },
    children: [{ name: 'דנה', id_number: '123456782', birth_date: '2015-03-02' }],
    spouse: { first_name: 'רות', id_number: '039999992' },
    income_this: { start_date: '2025-01-01', type: 'משכורת חודש' },
    credits: { clauses: { 1: { checked: true } } },
    declaration: { accepted: true, signature_data_url: 'data:image/png;base64,AAAA' },
  };

  it('carries over only parts ב, ג and ו — the rules name exactly those', () => {
    const next = prefillFromPrevious(prev);
    expect(next.personal).toEqual(prev.personal);
    expect(next.children).toEqual(prev.children);
    expect(next.spouse).toEqual(prev.spouse);
  });

  it('never carries the signature, the declaration or last year\'s income', () => {
    const next = prefillFromPrevious(prev);
    expect(next.declaration).toBeUndefined();
    expect(next.income_this).toBeUndefined();
    expect(next.credits).toBeUndefined();
  });

  it('marks the carried data as needing the employee\'s active confirmation', () => {
    expect(prefillFromPrevious(prev).prefilled_needs_confirmation).toBe(true);
  });

  it('returns an empty form when there is no previous year', () => {
    expect(prefillFromPrevious(null)).toEqual({});
  });

  it('does not alias the previous year — editing the copy leaves history intact', () => {
    const next = prefillFromPrevious(prev);
    (next.children as any)[0].name = 'שונה';
    expect(prev.children[0].name).toBe('דנה');
  });
});
