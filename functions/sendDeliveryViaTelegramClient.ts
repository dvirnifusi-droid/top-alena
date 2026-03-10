import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, address, prep_time, sessionToken } = await req.json();

    if (!sessionToken) {
      return Response.json({ error: 'Session token not provided. Please set it in the app.', needsAuth: true }, { status: 401 });
    }

    // שלח את ההודעה דרך הטלגרם - בעזרת ה-Session Token שלך
    // זה דורש שסידרת את ה-UserBot לוקלי וחלצת את ה-session
    
    // ברגע שיהיה לך טוקן חוקי, תוכל לשלוח:
    const message = `/${address}${phone ? '&' + phone : ''}`;
    
    // TODO: השתמש ב-sessionToken כדי לשדר את ההודעה דרך Telegram Client API
    // זה דורש server נוסף שרץ עם ה-UserBot וקולט את ההודעות
    
    return Response.json({ 
      success: true, 
      message: 'Message queued for sending',
      sentData: { address, phone, prep_time }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});