// Checklist AI coach API. reviewChecklistItem = per-task advisory vision review;
// summarizeChecklistExecution = end-of-run report; overrideChecklistItemReview =
// manager correction that also becomes a learning example; addChecklistItemExample
// = manual example. Advisory only — nothing here blocks an execution.
import { registerFn } from './index.js';
import { prisma } from '../db.js';
import { invokeLLM } from '../lib/llm.js';
import { selectExamplesForReview, overrideToLabel, attentionItems, REVIEW_SCHEMA, buildReviewPrompt } from '../lib/checklistReview.js';
const EXAMPLE_CAP = 5;
function findItem(checklist, itemOrder) {
    const items = Array.isArray(checklist?.items) ? checklist.items : [];
    return items.find((i) => Number(i.order) === Number(itemOrder)) || null;
}
registerFn('reviewChecklistItem', async ({ body }) => {
    const p = body || {};
    const checklistId = String(p.checklist_id || '');
    const itemOrder = Number(p.item_order);
    const photoUrl = String(p.photo_url || '');
    if (!checklistId || !Number.isFinite(itemOrder) || !photoUrl) {
        return { verdict: 'unknown', confidence: 0, feedback: 'חסרים פרטים לבדיקה.' };
    }
    const checklist = await prisma.checklist.findUnique({ where: { id: checklistId } }).catch(() => null);
    const item = findItem(checklist, itemOrder);
    if (!item)
        return { verdict: 'unknown', confidence: 0, feedback: 'לא נמצאה המשימה.' };
    const refs = Array.isArray(item.reference_photo_urls) ? item.reference_photo_urls.slice(0, EXAMPLE_CAP) : [];
    const rows = await prisma.checklistItemExample.findMany({
        where: { checklist_id: checklistId, item_order: itemOrder },
    }).catch(() => []);
    const { good, bad } = selectExamplesForReview(rows, EXAMPLE_CAP);
    if (!refs.length && !good.length && !bad.length && !item.expected_criteria) {
        return { verdict: 'unknown', confidence: 0, feedback: 'לא הוגדר ייחוס או קריטריונים למשימה הזו — אין מול מה להשוות.' };
    }
    const prompt = buildReviewPrompt(item, { refs: refs.length, good: good.length, bad: bad.length });
    const fileUrls = [...refs, ...good, ...bad, photoUrl];
    try {
        const res = await invokeLLM({ prompt, fileUrls, responseSchema: REVIEW_SCHEMA, model: 'gemini-2.5-flash', maxOutputTokens: 500 });
        return {
            verdict: ['ok', 'attention', 'unknown'].includes(res?.verdict) ? res.verdict : 'unknown',
            confidence: Math.max(0, Math.min(100, Number(res?.confidence) || 0)),
            feedback: String(res?.feedback || '').slice(0, 600),
        };
    }
    catch {
        return { verdict: 'unknown', confidence: 0, feedback: 'לא הצלחתי לבדוק את התמונה כרגע.' };
    }
});
registerFn('summarizeChecklistExecution', async ({ body }) => {
    const p = body || {};
    const results = Array.isArray(p.results) ? p.results : [];
    const reviewed = results.filter(r => r?.ai_review);
    if (!reviewed.length)
        return { ai_summary: '' };
    const attention = attentionItems(results);
    const okCount = reviewed.filter(r => r.ai_review.verdict === 'ok').length;
    const prompt = [
        'סכם בקצרה בעברית, בטון חיובי ומכבד, את איכות ביצוע הצ\'ק ליסט לפי חוות-דעת ה-AI לכל משימה.',
        `סה"כ ${reviewed.length} משימות נבדקו, ${okCount} מצוינות, ${attention.length} עם הערה.`,
        attention.length ? `משימות להערה: ${attention.map(a => `${a.task || a.item_order}: ${a.feedback || ''}`).join(' | ')}` : 'אין הערות.',
        'משפט-שניים בלבד, ואז רשימת ההערות (אם יש). זו סקירה למנהל לפני חתימה.',
    ].join('\n');
    try {
        const text = await invokeLLM({ prompt, maxOutputTokens: 500 });
        const summary = typeof text === 'string' ? text : (text?.text || JSON.stringify(text));
        const out = String(summary).slice(0, 1500);
        if (p.execution_id) {
            await prisma.checklistExecution.update({ where: { id: String(p.execution_id) }, data: { ai_summary: out } }).catch(() => { });
        }
        return { ai_summary: out };
    }
    catch {
        const out = `נבדקו ${reviewed.length} משימות · ${okCount} מצוינות · ${attention.length} להערה` +
            (attention.length ? `:\n${attention.map(a => `• ${a.task || a.item_order}: ${a.feedback || ''}`).join('\n')}` : '.');
        if (p.execution_id)
            await prisma.checklistExecution.update({ where: { id: String(p.execution_id) }, data: { ai_summary: out } }).catch(() => { });
        return { ai_summary: out };
    }
});
registerFn('overrideChecklistItemReview', async ({ body, user }) => {
    const p = body || {};
    const executionId = String(p.execution_id || '');
    const itemOrder = Number(p.item_order);
    const decision = p.decision === 'approved' ? 'approved' : 'rejected';
    const note = p.note ? String(p.note).slice(0, 500) : null;
    const exec = await prisma.checklistExecution.findUnique({ where: { id: executionId } }).catch(() => null);
    if (!exec)
        throw new Error('execution_not_found');
    const results = Array.isArray(exec.results) ? exec.results : [];
    const idx = results.findIndex((r) => Number(r.item_order ?? r.order) === itemOrder);
    if (idx >= 0) {
        results[idx] = { ...results[idx], manager_override: decision, manager_note: note };
        await prisma.checklistExecution.update({ where: { id: executionId }, data: { results } }).catch(() => { });
    }
    const r = idx >= 0 ? results[idx] : null;
    const photoUrl = r?.photo_urls?.[0] || r?.photo_url || null;
    if (photoUrl && exec.checklist_id) {
        await prisma.checklistItemExample.create({
            data: {
                checklist_id: exec.checklist_id, item_order: itemOrder, photo_url: photoUrl,
                label: overrideToLabel(decision), note, source: 'override', created_by: user?.id ?? null,
            },
        }).catch(() => { });
    }
    return { ok: true };
});
registerFn('addChecklistItemExample', async ({ body, user }) => {
    const p = body || {};
    if (!p.checklist_id || p.item_order == null || !p.photo_url)
        throw new Error('missing_fields');
    const label = p.label === 'bad' ? 'bad' : 'good';
    await prisma.checklistItemExample.create({
        data: {
            checklist_id: String(p.checklist_id), item_order: Number(p.item_order), photo_url: String(p.photo_url),
            label, note: p.note ? String(p.note).slice(0, 500) : null,
            source: String(p.source || 'manager_reference'), created_by: user?.id ?? null,
        },
    });
    return { ok: true };
});
//# sourceMappingURL=checklistAi.js.map