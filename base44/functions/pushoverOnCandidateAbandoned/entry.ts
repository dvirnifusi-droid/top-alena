import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const candidate = body.data;
    if (!candidate) return Response.json({ skipped: true });

    // שלח רק אם המועמד לא סיים — אין ציון, סטטוס pending
    if (candidate.score || candidate.status !== 'pending') {
      return Response.json({ skipped: 'candidate completed or rejected' });
    }

    // קבע באיזה שלב עצר
    const stageStopped = (() => {
      if (!candidate.full_name) return 'לא הזין שם';
      if (!candidate.phone) return 'לא מסר טלפון';
      if (!candidate.role_applied) return 'לא בחר תפקיד';
      if (!candidate.experience) return 'לא ענה על ניסיון';
      if (candidate.shifts_per_week == null) return 'לא ענה על משמרות';
      if (candidate.weekend_availability == null) return 'לא ענה על סופ"ש';
      return 'מילא חלקית';
    })();

    const message = [
      `⚠️ מועמד עצר באמצע תהליך הגיוס`,
      `👤 שם: ${candidate.full_name || 'לא ידוע'}`,
      candidate.phone ? `📱 טלפון: ${candidate.phone}` : null,
      candidate.role_applied ? `💼 תפקיד: ${candidate.role_applied}` : null,
      candidate.city ? `📍 עיר: ${candidate.city}` : null,
      `🛑 עצר בשלב: ${stageStopped}`,
      `💡 מומלץ ליצור קשר ידנית`,
    ].filter(Boolean).join('\n');

    const pushoverToken = Deno.env.get('PUSHOVER_API_TOKEN');
    const employees = await base44.asServiceRole.entities.Employee.filter({ status: 'active' });
    const managers = employees.filter(e => e.pushover_user_key);

    await Promise.all(managers.map(mgr =>
      fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: pushoverToken,
          user: mgr.pushover_user_key,
          title: '⚠️ מועמד עזב באמצע – עלינא',
          message,
          priority: 0,
        }),
      })
    ));

    return Response.json({ success: true, stage: stageStopped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});