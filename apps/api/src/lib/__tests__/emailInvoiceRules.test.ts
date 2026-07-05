import { describe, it, expect } from 'vitest';
import { decideMessageAction, nextRuleAfterRejection, looksLikeInvoice, BLOCK_AFTER_REJECTS } from '../emailInvoiceRules.js';

describe('looksLikeInvoice', () => {
  it('matches חשבונית in subject (incl. plural/compound)', () => {
    expect(looksLikeInvoice('חשבונית מס מספר 15516 מנ.צ שיווק ופרסום בע"מ', [])).toBe(true);
    expect(looksLikeInvoice('חשבוניות לחודש יוני', [])).toBe(true);
  });
  it('matches invoice/receipt in subject or filename', () => {
    expect(looksLikeInvoice('Hetzner Online GmbH - Invoice 080001023028', [])).toBe(true);
    expect(looksLikeInvoice('מסמכים מצורפים', ['receipt-617895.pdf'])).toBe(true);
  });
  it('matches standalone קבלה but NOT התקבלה', () => {
    expect(looksLikeInvoice('קבלה על תשלום', [])).toBe(true);
    expect(looksLikeInvoice('הזמנתך התקבלה בהצלחה', [])).toBe(false);
  });
  it('matches Hebrew definite-article forms החשבונית / הקבלה', () => {
    expect(looksLikeInvoice('החשבונית החודשית שלך בבזק כאן', [])).toBe(true);
    expect(looksLikeInvoice('הקבלה שלך מוכנה', [])).toBe(true);
    // guard: definite-article stripping must not turn התקבלה into a match
    expect(looksLikeInvoice('מועמדות התקבלה למשרה', [])).toBe(false);
  });
  it('ignores unrelated mail', () => {
    expect(looksLikeInvoice('ניוזלטר שבועי — מבצעי סוף השבוע', ['banner.png'])).toBe(false);
  });
});

describe('decideMessageAction', () => {
  it('blocked sender → skip', () => {
    expect(decideMessageAction({ rule: 'block' }, true)).toBe('skip_blocked');
  });
  it('no attachment → skip regardless of rule', () => {
    expect(decideMessageAction({ rule: 'allow' }, false)).toBe('skip_no_attachment');
    expect(decideMessageAction(null, false)).toBe('skip_no_attachment');
  });
  it('allowed sender with attachment → process directly', () => {
    expect(decideMessageAction({ rule: 'allow' }, true)).toBe('process');
  });
  it('unknown/auto sender with attachment → needs AI classification', () => {
    expect(decideMessageAction(null, true)).toBe('classify');
    expect(decideMessageAction({ rule: 'auto' }, true)).toBe('classify');
  });
  it('unknown rule string behaves like auto (classify)', () => {
    expect(decideMessageAction({ rule: 'weird' }, true)).toBe('classify');
  });
});

describe('nextRuleAfterRejection', () => {
  it('first rejection keeps auto', () => {
    expect(nextRuleAfterRejection({ rule: 'auto', reject_count: 0 }))
      .toEqual({ rule: 'auto', reject_count: 1 });
  });
  it(`rejection #${BLOCK_AFTER_REJECTS} blocks the sender`, () => {
    expect(nextRuleAfterRejection({ rule: 'auto', reject_count: BLOCK_AFTER_REJECTS - 1 }))
      .toEqual({ rule: 'block', reject_count: BLOCK_AFTER_REJECTS });
  });
  it('rejecting an allowed sender demotes to auto first', () => {
    expect(nextRuleAfterRejection({ rule: 'allow', reject_count: 0 }))
      .toEqual({ rule: 'auto', reject_count: 1 });
  });
  it('rejecting an already-blocked sender keeps it blocked', () => {
    expect(nextRuleAfterRejection({ rule: 'block', reject_count: 2 }))
      .toEqual({ rule: 'block', reject_count: 3 });
    // reject_count below BLOCK_AFTER_REJECTS — must still stay blocked
    expect(nextRuleAfterRejection({ rule: 'block', reject_count: 0 }))
      .toEqual({ rule: 'block', reject_count: 1 });
  });
});
