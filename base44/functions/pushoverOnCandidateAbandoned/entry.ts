import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // מצב 1: קריאה ידנית עם מועמד ספציפי (מהדאשבורד)
    const candidate = body.data || body.candidate;

    if (candidate) {
      return await sendAbandonedAlert(base44, candidate);
    }

    // מצב 2: ריצה מתוזמנת — מצא את כל ה-pending ללא ציון שנוצרו לפני יותר מ-2 שעות
    const all = await base44.asServiceRole.entities.JobCandidate.filter({ status: 'pending' });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const abandoned = all.filter(c => {
      if (c.score) return false; // יש ציון — סיים
      const created = new Date(c.created_date);
      if (created > twoHoursAgo) return false; // עדיין טרי
      if (c._notified_abandoned) return false; // כבר שלחנו
      return true;
    });

    if (abandoned.length === 0) {
      return Response.json({ skipped: 'no abandoned candidates', checked: all.length });
    }

    let sent = 0;
    for (const c of abandoned) {
      await sendAbandonedAlert(base44, c);
      // סמן שנשלחה התראה כדי לא לשלוח שוב
      await base44.asServiceRole.entities.JobCandidate.update(c.id, { _notified_abandoned: true });
      sent++;
    }

    return Response.json({ success: true, sent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function sendAbandonedAlert(base44, candidate) {
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
}