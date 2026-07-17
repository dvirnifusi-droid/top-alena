// Pure decision logic for the email invoice scanner. Kept DB-free for testing.
/** Number of owner rejections before a sender is permanently blocked (reversible in settings). */
export const BLOCK_AFTER_REJECTS = 2;
export function decideMessageAction(rule, hasAllowedAttachment) {
    if (rule?.rule === 'block')
        return 'skip_blocked';
    // Allow-listed senders are trusted: process even without an attachment so a
    // link-only invoice still reaches the body-link fallback path downstream.
    if (rule?.rule === 'allow')
        return 'process';
    if (!hasAllowedAttachment)
        return 'skip_no_attachment';
    return 'classify';
}
// Fast-path detection: if the subject or an attachment filename explicitly
// says invoice/receipt, import without asking the LLM at all (owner's rule:
// "collect everything labeled invoice"). Token-based so that 'קבלה' matches
// but 'התקבלה' does not; Hebrew prefix match covers 'חשבוניות', 'חשבונית-מס'.
// 'חשבוני' (not 'חשבונית') so the plural 'חשבוניות' matches too — the plural
// inserts a vav before the tav, so it does not share the singular's prefix.
const INVOICE_TOKEN_PREFIXES = ['חשבוני', 'invoice', 'receipt'];
function tokenIsInvoice(t) {
    // Also test the token with a leading Hebrew definite article stripped, so
    // 'החשבונית' / 'הקבלה' match. Note 'התקבלה' → 'תקבלה' still does NOT match,
    // so recruitment/order-confirmation subjects stay excluded.
    const variants = t.startsWith('ה') ? [t, t.slice(1)] : [t];
    return variants.some(v => v === 'קבלה' || INVOICE_TOKEN_PREFIXES.some(p => v.startsWith(p)));
}
export function looksLikeInvoice(subject, attachmentFilenames) {
    const hay = [subject || '', ...(attachmentFilenames || [])].join(' ').toLowerCase();
    const tokens = hay.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    return tokens.some(tokenIsInvoice);
}
// Owner rejected an invoice from this sender. Two strikes → block.
// An 'allow' sender drops back to 'auto' on first strike (was probably
// auto-promoted by an approval that the owner now regrets).
export function nextRuleAfterRejection(rule) {
    if (rule.rule === 'block')
        return { rule: 'block', reject_count: (rule.reject_count || 0) + 1 };
    const count = (rule.reject_count || 0) + 1;
    if (count >= BLOCK_AFTER_REJECTS)
        return { rule: 'block', reject_count: count };
    return { rule: 'auto', reject_count: count };
}
//# sourceMappingURL=emailInvoiceRules.js.map