import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { delivery_id, status, customer_name, address } = await req.json();

    if (!delivery_id || !status) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const apiToken = Deno.env.get('PUSHOVER_API_TOKEN');
    const userKey = Deno.env.get('PUSHOVER_USER_KEY');

    if (!apiToken || !userKey) {
      return Response.json({ error: 'Pushover config missing' }, { status: 500 });
    }

    // הודעות שונות לפי סטטוס
    let title, message, priority;

    if (status === 'picked_up') {
      title = `🚴 משלוח הורם`;
      message = `${user.full_name} הרים את המשלוח ל${customer_name || address}`;
      priority = 0;
    } else if (status === 'delivered') {
      title = `✅ משלוח הוריד`;
      message = `${user.full_name} הוריד את המשלוח בכתובת ${address}`;
      priority = 1; // עדיפות גבוהה יותר כשמסיימים
    } else {
      return Response.json({ error: 'Unknown status' }, { status: 400 });
    }

    // שלח Pushover notification
    const response = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token: apiToken,
        user: userKey,
        title: title,
        message: message,
        priority: priority,
        sound: status === 'delivered' ? 'cashregister' : 'siren',
      }).toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      return Response.json({ error: 'Pushover API error', details: result }, { status: 500 });
    }

    return Response.json({ success: true, receipt: result.receipt });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});