import { describe, it, expect } from 'vitest';
import { decideMessageAction, nextRuleAfterRejection, BLOCK_AFTER_REJECTS } from '../emailInvoiceRules.js';

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
});
