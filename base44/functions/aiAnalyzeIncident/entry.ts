import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json();
    const incident_id = body.incident_id || body.event?.entity_id;
    const incident = await base44.asServiceRole.entities.Incident.get(incident_id);
    if (!incident) return Response.json({ error: 'Incident not found' }, { status: 404 });

    const prompt = `אתה יועץ תפעולי למסעדות. נתח תקרית ותן המלצות מניעה.

כותרת: ${incident.title}
תיאור: ${incident.description}
קטגוריה: ${incident.category}
חומרה: ${incident.severity}
תגובת לקוח: ${incident.customer_reaction || 'לא צוין'}
פתרון שניתן: ${incident.solution_provided || 'לא צוין'}

החזר JSON:
{
  "root_cause": "הסיבה העיקרית לתקרית",
  "immediate_action": "פעולה מיידית נדרשת",
  "prevention_plan": "כיצד למנוע חזרה",
  "team_training_needed": "האם נדרש הכשרה ובאיזה נושא",
  "priority": "high/medium/low",
  "estimated_impact": "מה ההשפעה על העסק אם לא מטפלים"
}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          root_cause: { type: 'string' },
          immediate_action: { type: 'string' },
          prevention_plan: { type: 'string' },
          team_training_needed: { type: 'string' },
          priority: { type: 'string' },
          estimated_impact: { type: 'string' }
        }
      }
    });

    // Save prevention measures back to incident
    await base44.asServiceRole.entities.Incident.update(incident_id, {
      prevention_measures: `${result.root_cause}\n\nמניעה: ${result.prevention_plan}`
    });

    return Response.json({ success: true, analysis: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});