import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    // Support both direct call and entity automation trigger
    const candidate_id = body.candidate_id || body.event?.entity_id;
    const candidate_data = body.candidate_data || body.data;

    const candidate = candidate_data || (candidate_id ? await base44.asServiceRole.entities.JobCandidate.get(candidate_id) : null);
    if (!candidate) return Response.json({ error: 'No candidate data' }, { status: 400 });

    const prompt = `אתה מנהל משאבי אנוש במסעדה. דרג מועמד לעבודה (0-100) ותן המלצה.

שם: ${candidate.full_name}
גיל: ${candidate.age || 'לא צוין'}
עיר: ${candidate.city || 'לא צוין'}
תפקיד: ${candidate.role_applied || 'לא צוין'}
ניסיון: ${candidate.experience || 'ללא'}
משמרות בשבוע: ${candidate.shifts_per_week || 0}
זמין לסופי שבוע: ${candidate.weekend_availability ? 'כן' : 'לא'}
תאריך התחלה: ${candidate.start_date || 'לא צוין'}

החזר JSON:
{
  "score": 75,
  "recommendation": "approved/pending/rejected",
  "reason": "הסבר קצר לציון",
  "strengths": ["חוזקה 1", "חוזקה 2"],
  "concerns": ["חשש 1"]
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          score: { type: 'number' },
          recommendation: { type: 'string' },
          reason: { type: 'string' },
          strengths: { type: 'array', items: { type: 'string' } },
          concerns: { type: 'array', items: { type: 'string' } }
        }
      }
    });

    // Update candidate with score if we have an ID
    if (candidate_id) {
      await base44.asServiceRole.entities.JobCandidate.update(candidate_id, {
        score: result.score,
        notes: `AI: ${result.reason}`
      });
    }

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});