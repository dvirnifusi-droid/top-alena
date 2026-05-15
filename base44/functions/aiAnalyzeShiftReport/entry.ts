import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { report_id } = await req.json();
    const report = await base44.asServiceRole.entities.ShiftEndReport.get(report_id);
    if (!report) return Response.json({ error: 'Report not found' }, { status: 404 });

    const prompt = `אתה מנהל מסעדה מנוסה. נתח את דוח סיום המשמרת הבא וספק תובנות:

תאריך: ${report.shift_date} | משמרת: ${report.shift_type === 'lunch' ? 'צהריים' : 'ערב'}
מנהל: ${report.manager_name}
סועדים: ${report.total_covers || 0} | הכנסות: ₪${report.total_revenue || 0}
אשראי: ₪${report.total_credit_card || 0} | מזומן: ₪${report.total_cash || 0}
טיפים: ₪${report.total_credit_card_tips || 0} | טיפ לשעה: ₪${report.tip_per_hour_waiter || 0}
משלוחים: ${report.total_deliveries || 0} | שווי: ₪${report.total_deliveries_amount || 0}
ממוצע לסועד: ₪${report.avg_spend_dine_in || 0}
ביטולים: ${report.canceled_items_count || 0} פריטים (₪${report.canceled_items_value || 0})
הנחות: ₪${report.total_item_discounts_value || 0}
הפרש קופה: ₪${report.cash_difference || 0}
ביצועי צוות: ${JSON.stringify(report.staff_performance || [])}
אירועים מרכזיים: ${(report.key_incidents || []).join(', ')}
פידבק לקוחות: ${report.customer_feedback || 'לא צוין'}

ספק ניתוח ב-JSON:
{
  "overall_assessment": "הערכה כוללת בשורה אחת",
  "revenue_analysis": "ניתוח ביצועי ההכנסות",
  "top_issue": "הבעיה הדחופה ביותר לטיפול",
  "staff_highlights": "מי בלט לטוב ומי דורש שיחה",
  "recommendations": ["המלצה 1", "המלצה 2", "המלצה 3"],
  "forecast_next_shift": "מה לצפות במשמרת הבאה על בסיס הנתונים",
  "score": 85
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          overall_assessment: { type: 'string' },
          revenue_analysis: { type: 'string' },
          top_issue: { type: 'string' },
          staff_highlights: { type: 'string' },
          recommendations: { type: 'array', items: { type: 'string' } },
          forecast_next_shift: { type: 'string' },
          score: { type: 'number' }
        }
      }
    });

    return Response.json({ success: true, analysis: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});