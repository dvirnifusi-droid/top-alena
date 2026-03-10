import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { MTProto } from 'npm:@mtproto/core';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, address } = await req.json();

    const apiId = parseInt(Deno.env.get("TELEGRAM_API_ID") || "0");
    const apiHash = Deno.env.get("TELEGRAM_API_HASH");
    const phoneNumber = Deno.env.get("TELEGRAM_PHONE_NUMBER");
    const chatId = parseInt(Deno.env.get("TELEGRAM_CHAT_ID") || "0");

    if (!apiId || !apiHash || !phoneNumber || !chatId) {
      return Response.json({ error: 'Missing Telegram credentials' }, { status: 500 });
    }

    const mtproto = new MTProto({
      api: {
        id: apiId,
        hash: apiHash,
      },
      app: {
        version: '1.0.0',
        defaultUsername: 'UserBot',
      },
      storageOptions: {
        path: '/tmp/mtproto-storage',
      },
    });

    await mtproto.call('auth.sendCode', {
      phone_number: phoneNumber,
      settings: {
        _: 'codeSettings',
      },
    });

    return Response.json({ 
      message: 'Code sent to your Telegram. Please authenticate.',
      needsAuth: true
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});