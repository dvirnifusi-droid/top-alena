// base44/functions/pushoverOnHotEventLead/entry.ts
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const lead = body.data || body.lead;
    if (!lead) {
      return Response.json({ error: 'missing lead' }, { status: 400 });
    }
    return await sendHotLeadAlert(base44, lead);
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});

async function sendHotLeadAlert(base44: any, lead: any) {
  const q = lead.qualifier_answers || {};
  const message = [
    `🔥 ליד אירוע חם — עלינא`,
    `👤 ${lead.contact_name || 'ללא שם'} • ${lead.contact_phone || ''}`,
    q.event_date ? `📅 תאריך: ${q.event_date}` : null,
    q.event_type ? `🎉 סוג: ${q.event_type}` : null,
    q.guest_count ? `👥 אורחים: ${q.guest_count}` : null,
    q.budget_per_person ? `💰 תקציב/סועד: ₪${q.budget_per_person}` : null,
    q.hours_window ? `🕒 שעות: ${q.hours_window}` : null,
    `📊 ציון: ${lead.score ?? '?'}/100`,
    `💡 פתח/י את Agent Inbox לפעולה.`,
  ].filter(Boolean).join('\n');

  const pushoverToken = Deno.env.get('PUSHOVER_API_TOKEN');
  const employees = await base44.asServiceRole.entities.Employee.filter({ status: 'active' });
  const managers = employees.filter((e: any) => e.pushover_user_key);

  await Promise.all(managers.map((mgr: any) =>
    fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: pushoverToken,
        user: mgr.pushover_user_key,
        title: '🔥 ליד אירוע חם — עלינא',
        message,
        priority: 1,
      }),
    })
  ));

  await base44.asServiceRole.entities.Lead.update(lead.id, { owner_alerted: true });

  // Also emit an AgentMessage so the existing Agent Inbox UI renders it
  await base44.asServiceRole.entities.AgentMessage.create({
    from_agent: 'EVENTS_QUALIFIER',
    to_agent: 'OWNER',
    msg_type: 'SIGNAL',
    priority_tier: 5,
    topic: 'hot_event_lead',
    payload: {
      summary: `ליד אירוע חם: ${lead.contact_name || 'ללא שם'}`,
      hebrew_message: message,
      data: { lead_id: lead.lead_id || lead.id, qualifier_answers: q, score: lead.score },
      confidence: 0.9,
    },
    requires_response: true,
    owner_visible: true,
    owner_template: 'C',
  });

  return Response.json({ success: true, alerted: managers.length });
}
