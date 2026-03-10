import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { TelegramClient } from 'npm:telethon';
import { StringSession } from 'npm:telethon/sessions';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, address } = await req.json();

    const apiId = parseInt(Deno.env.get("TELEGRAM_API_ID") || "0");
    const apiHash = Deno.env.get("TELEGRAM_API_HASH");
    const phoneNumber = Deno.env.get("TELEGRAM_PHONE_NUMBER");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

    if (!apiId || !apiHash || !phoneNumber || !chatId) {
      return Response.json({ error: 'Missing Telegram credentials' }, { status: 500 });
    }

    // Use empty session or stored session from environment
    const sessionString = Deno.env.get("TELEGRAM_SESSION") || "";
    const session = new StringSession(sessionString);

    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      autoReconnect: true,
      requestTimeout: 30,
    });

    await client.connect();

    // Check if already authorized, if not will need user to input code
    if (!await client.isUserAuthorized()) {
      await client.sendCodeRequest(phoneNumber);
      return Response.json({ 
        error: 'Need verification code. Check your Telegram for code.',
        needsAuth: true 
      }, { status: 400 });
    }

    const message = `/${address}${phone ? '&' + phone : ''}`;
    
    await client.sendMessage(chatId, { message });

    // Save session for future use
    const sessionString2 = client.session.save();
    
    await client.disconnect();

    return Response.json({ success: true, message: 'Message sent via personal account' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});