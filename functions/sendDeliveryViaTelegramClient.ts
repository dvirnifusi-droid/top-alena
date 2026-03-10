import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { TelegramClient } from 'npm:telegram';
import { StringSession } from 'npm:telegram/sessions';
import { Api } from 'npm:telegram';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, address, prep_time, sessionToken, groupId } = await req.json();

    if (!sessionToken) {
      return Response.json({ error: 'Session token not provided. Please set it in the app.', needsAuth: true }, { status: 401 });
    }

    if (!groupId) {
      return Response.json({ error: 'Group ID not provided.', status: 400 });
    }

    const apiId = parseInt(Deno.env.get('TELEGRAM_API_ID') || '0');
    const apiHash = Deno.env.get('TELEGRAM_API_HASH') || '';

    if (!apiId || !apiHash) {
      return Response.json({ error: 'Missing Telegram API credentials' }, { status: 500 });
    }

    const client = new TelegramClient(new StringSession(sessionToken), apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.connect();

    const message = `/${address}${phone ? '&' + phone : ''}`;

    // שלח להודעה לקבוצה מהחשבון האישי
    await client.sendMessage(groupId, {
      message: message,
    });

    await client.disconnect();

    return Response.json({ 
      success: true, 
      message: 'Message sent from personal account',
      sentData: { address, phone, prep_time }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});