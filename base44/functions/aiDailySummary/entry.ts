import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// This runs once per day via automation to summarize customer feedback + queue + sales
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const [feedbacks, queueEntries, salesData] = await Promise.all([
      base44.asServiceRole.entities.CustomerFeedback.filter({ date: today }),
      base44.asServiceRole.entities.QueueEntry.list('-created_date', 50),
      base44.asServiceRole.entities.DailySales.filter({ date: yesterday })
    ]);

    const todayQueue = queueEntries.filter(e => e.created_date?.startsWith(today));
    const ratedQueue = todayQueue.filter(e => e.feedback_rating);
    const avgRating = ratedQueue.length > 0
      ? (ratedQueue.reduce((s, e) => s + e.feedback_rating, 0) / ratedQueue.length).toFixed(1)
      : null;
    const abandoned = todayQueue.filter(e => e.status === 'abandoned').length;

    const prompt = `סכם את ביצועי היום של המסעדה בצורה תמציתית וממוקדת.

תאריך: ${today}
תור: ${todayQueue.length} ממתינים | ${abandoned} נטשות | דירוג ממוצע: ${avgRating || 'לא זמין'}
מכירות אתמול: ₪${salesData[0]?.total_revenue || 'לא זמין'} | ${salesData[0]?.covers || 'לא זמין'} סועדים
פידבקים היום: ${feedbacks.length}

החזר JSON:
{
  "daily_score": 82,
  "headline": "כותרת קצרה של היום",
  "wins": ["הצלחה 1", "הצלחה 2"],
  "concerns": ["דאגה 1"],
  "action_for_tomorrow": "פעולה אחת שתשפר מחר",
  "instagram_post_idea": "רעיון לפוסט אינסטגרם בהתבסס על היום"
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          daily_score: { type: 'number' },
          headline: { type: 'string' },
          wins: { type: 'array', items: { type: 'string' } },
          concerns: { type: 'array', items: { type: 'string' } },
          action_for_tomorrow: { type: 'string' },
          instagram_post_idea: { type: 'string' }
        }
      }
    });

    // Save to AiSuggestion entity
    await base44.asServiceRole.entities.AiSuggestion.create({
      type: 'daily_summary',
      date: today,
      content: JSON.stringify(result),
      status: 'active'
    });

    return Response.json({ success: true, summary: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});