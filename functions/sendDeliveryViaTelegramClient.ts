import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { TelegramClient } from 'npm:telegram';
import { StringSession } from 'npm:telegram/sessions';

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

    const session = new StringSession(Deno.env.get("TELEGRAM_SESSION") || "");
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });

    await client.start({
      phoneNumber: async () => phoneNumber,
      password: async () => Deno.env.get("TELEGRAM_2FA_PASSWORD") || "",
      phoneCode: async () => {
        throw new Error("Please authenticate via Telegram app and store session token");
      },
      onError: (err) => console.error(err),
    });

    const message = `/${address}${phone ? '&' + phone : ''}`;
    await client.sendMessage(chatId, { message });
    
    await client.disconnect();

    return Response.json({ success: true, message: 'Message sent from personal account' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});