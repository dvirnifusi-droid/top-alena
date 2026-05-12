import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { full_name, age, role_applied, city, experience, shifts_per_week, weekend_availability, start_date, score } = body;

    const message = [
      `🎯 מועמד חדש מתאים נמצא!`,
      `👤 שם: ${full_name}`,
      `🎂 גיל: ${age}`,
      `📍 עיר: ${city}`,
      `💼 תפקיד: ${role_applied}`,
      `📝 ניסיון: ${experience}`,
      `📅 משמרות: ${shifts_per_week}/שבוע`,
      `🗓️ סופ"ש: ${weekend_availability ? 'כן ✅' : 'לא ❌'}`,
      `🚀 יכול להתחיל: ${start_date}`,
      `⭐ ציון: ${score}/100`,
    ].join('\n');

    const pushoverToken = Deno.env.get('PUSHOVER_API_TOKEN');
    // נסה לשלוח לכל המשתמשים עם pushover_user_key
    const employees = await base44.asServiceRole.entities.Employee.filter({ status: 'active' });
    const managers = employees.filter(e => e.pushover_user_key);

    const pushPromises = managers.map(mgr =>
      fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: pushoverToken,
          user: mgr.pushover_user_key,
          title: '🌿 מועמד חדש - עלינא',
          message,
          priority: 1,
        }),
      })
    );

    await Promise.all(pushPromises);

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});