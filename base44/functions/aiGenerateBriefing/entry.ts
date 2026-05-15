import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { shift_type, date } = await req.json();

    // Fetch recent data for context
    const [recentReports, recentIncidents, todayShift] = await Promise.all([
      base44.asServiceRole.entities.ShiftEndReport.list('-shift_date', 3),
      base44.asServiceRole.entities.Incident.list('-incident_date', 5),
      base44.asServiceRole.entities.WorkShift.filter({ date: date || new Date().toISOString().split('T')[0] })
    ]);

    const lastReport = recentReports[0];
    const openIncidents = recentIncidents.filter(i => i.status !== 'resolved' && i.status !== 'closed');

    const prompt = `אתה מנהל מסעדה מנוסה. צור תדריך יומי קצר וממוקד לצוות.

משמרת: ${shift_type === 'dinner' ? 'ערב' : 'צהריים'} | תאריך: ${date || 'היום'}

נתוני המשמרת האחרונה:
- הכנסות: ₪${lastReport?.total_revenue || 'לא זמין'}
- סועדים: ${lastReport?.total_covers || 'לא זמין'}
- ציון כללי: ${lastReport?.overall_rating || 'לא זמין'}/5
- בעיות שעלו: ${(lastReport?.key_incidents || []).join(', ') || 'ללא'}

תקריות פתוחות: ${openIncidents.map(i => i.title).join(', ') || 'ללא'}

עובדים במשמרת: ${(todayShift[0]?.assigned_staff || []).map(s => s.employee_name).join(', ') || 'לא זמין'}

החזר JSON:
{
  "title": "כותרת התדריך",
  "greeting": "ברכה פותחת קצרה ומעוררת מוטיבציה",
  "focus_points": ["נקודת דגש 1", "נקודת דגש 2", "נקודת דגש 3"],
  "open_issues": "תקרית/בעיה פתוחה לטיפול",
  "target_for_shift": "יעד מספרי ברור למשמרת",
  "closing_message": "מסר סיום מעורר"
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          greeting: { type: 'string' },
          focus_points: { type: 'array', items: { type: 'string' } },
          open_issues: { type: 'string' },
          target_for_shift: { type: 'string' },
          closing_message: { type: 'string' }
        }
      }
    });

    return Response.json({ success: true, briefing: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});