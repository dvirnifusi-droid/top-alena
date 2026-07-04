// Pure decision logic for the email invoice scanner. Kept DB-free for testing.

/** Number of owner rejections before a sender is permanently blocked (reversible in settings). */
export const BLOCK_AFTER_REJECTS = 2;

export type SenderRuleLike = { rule: string; reject_count?: number } | null | undefined;

export type MessageAction = 'skip_blocked' | 'skip_no_attachment' | 'process' | 'classify';

export function decideMessageAction(rule: SenderRuleLike, hasAllowedAttachment: boolean): MessageAction {
  if (rule?.rule === 'block') return 'skip_blocked';
  if (!hasAllowedAttachment) return 'skip_no_attachment';
  if (rule?.rule === 'allow') return 'process';
  return 'classify';
}

// Owner rejected an invoice from this sender. Two strikes → block.
// An 'allow' sender drops back to 'auto' on first strike (was probably
// auto-promoted by an approval that the owner now regrets).
export function nextRuleAfterRejection(rule: { rule: string; reject_count?: number | null }): { rule: string; reject_count: number } {
  if (rule.rule === 'block') return { rule: 'block', reject_count: (rule.reject_count || 0) + 1 };
  const count = (rule.reject_count || 0) + 1;
  if (count >= BLOCK_AFTER_REJECTS) return { rule: 'block', reject_count: count };
  return { rule: 'auto', reject_count: count };
}
