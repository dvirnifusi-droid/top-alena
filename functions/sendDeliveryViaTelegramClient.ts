import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, address, prep_time, sessionToken, ngrokUrl } = await req.json();

    if (!sessionToken) {
      return Response.json({ error: 'Session token not provided. Please set it in the app.', needsAuth: true }, { status: 401 });
    }

    if (!ngrokUrl) {
      return Response.json({ error: 'Ngrok URL not provided. Set it in the app settings.', needsUrl: true }, { status: 400 });
    }

    const message = `/${address}${phone ? '&' + phone : ''}`;

    // שלח ל-UserBot Server דרך Ngrok
    const res = await fetch(ngrokUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        phone, 
        address, 
        message,
        prep_time,
        sessionToken 
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return Response.json({ error: data.error || 'Failed to send message' }, { status: 500 });
    }

    return Response.json({ 
      success: true, 
      message: 'Message sent via UserBot',
      sentData: { address, phone, prep_time }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});