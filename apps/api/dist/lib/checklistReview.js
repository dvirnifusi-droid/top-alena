// Pure helpers for the checklist AI coach — example selection, label mapping,
// attention extraction, and the review response schema/prompt. DB-free & tested.
// Most-recent up to `cap` per label. Returns photo URL lists for the prompt.
export function selectExamplesForReview(rows, cap) {
    const byNewest = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const good = byNewest.filter(r => r.label === 'good').slice(0, cap).map(r => r.photo_url);
    const bad = byNewest.filter(r => r.label === 'bad').slice(0, cap).map(r => r.photo_url);
    return { good, bad };
}
export function overrideToLabel(decision) {
    return decision === 'approved' ? 'good' : 'bad';
}
// From an execution's results array, the items the AI flagged for attention.
export function attentionItems(results) {
    return (Array.isArray(results) ? results : [])
        .filter(r => r?.ai_review?.verdict === 'attention')
        .map(r => ({ item_order: r.item_order ?? r.order, task: r.task, feedback: r?.ai_review?.feedback }));
}
// Response schema for the per-task vision review.
export const REVIEW_SCHEMA = {
    type: 'object',
    properties: {
        verdict: { type: 'string', enum: ['ok', 'attention', 'unknown'], description: 'ok=תקין, attention=יש מה לתקן, unknown=אין מספיק מידע' },
        confidence: { type: 'number', description: '0-100' },
        feedback: { type: 'string', description: 'משוב קצר וידידותי בעברית — מה טוב ומה לשפר' },
    },
    required: ['verdict', 'confidence', 'feedback'],
};
// Build the Hebrew instruction text for a single-task review. Photos are passed
// separately as fileUrls (references first, good/bad examples, then the actual).
export function buildReviewPrompt(item, counts) {
    const lines = [
        'אתה מאמן שירות למסעדה. עובד ביצע משימה מצ\'ק ליסט וצילם. תפקידך לתת משוב מייעץ — לא לפסול.',
        `משימה: ${item.task || ''}${item.area ? ` (אזור: ${item.area})` : ''}`,
    ];
    if (item.description)
        lines.push(`תיאור: ${item.description}`);
    if (item.help_text)
        lines.push(`טקסט עזר: ${item.help_text}`);
    if (item.expected_criteria)
        lines.push(`קריטריונים לביצוע תקין: ${item.expected_criteria}`);
    lines.push(`התמונות המצורפות: ${counts.refs} תמונות ייחוס, ${counts.good} דוגמאות "תקין", ${counts.bad} דוגמאות "לא תקין", ואז התמונה של העובד (האחרונה).`, 'קבל וריאציות סבירות בזווית/תאורה/סידור. אם אין מול מה להשוות או שאתה לא בטוח — verdict=unknown והסבר.', 'ענה בעברית, קצר וחיובי: מה טוב, ומה (אם בכלל) כדאי לתקן.');
    return lines.join('\n');
}
//# sourceMappingURL=checklistReview.js.map