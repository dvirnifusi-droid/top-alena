import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { TelegramClient } from 'npm:gramjs';
import { StringSession } from 'npm:gramjs/sessions';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { phone, address, authCode, isFirstAuth } = await req.json();

    const apiId = parseInt(Deno.env.get("TELEGRAM_API_ID") || "0");
    const apiHash = Deno.env.get("TELEGRAM_API_HASH");
    const phoneNumber = Deno.env.get("TELEGRAM_PHONE_NUMBER");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

    if (!apiId || !apiHash || !phoneNumber || !chatId) {
      return Response.json({ error: 'Missing Telegram credentials' }, { status: 500 });
    }

    // Load saved session from environment or start fresh
    const savedSession = Deno.env.get("TELEGRAM_SESSION_STRING") || "";
    const session = new StringSession(savedSession);

    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
      autoReconnect: true,
    });

    // First authentication - user needs to provide code
    if (isFirstAuth && authCode) {
      await client.connect();
      
      if (!await client.isUserAuthorized()) {
        // Send code request
        await client.sendCodeRequest(phoneNumber);
        
        try {
          // Sign in with code
          await client.signIn({
            phoneNumber: phoneNumber,
            phoneCodeHash: "", // Will be handled by client
            phoneCode: authCode,
          });
        } catch (err) {
          return Response.json({ 
            error: 'Invalid code. Please try again.',
            code: 'INVALID_AUTH_CODE'
          }, { status: 400 });
        }

        // Save session for future use
        const sessionString = client.session.save();
        console.log("Telegram session authenticated. Save this for TELEGRAM_SESSION_STRING:", sessionString);
      }

      await client.disconnect();
      return Response.json({ 
        success: true, 
        message: 'Authentication successful. Session saved.',
        sessionString: client.session.save()
      });
    }

    // Send message with existing session
    await client.connect();

    if (!await client.isUserAuthorized()) {
      return Response.json({ 
        error: 'Not authenticated. Please authenticate first with auth code.',
        needsAuth: true 
      }, { status: 401 });
    }

    const message = `/${address}${phone ? '&' + phone : ''}`;
    
    await client.sendMessage(chatId, { message });
    await client.disconnect();

    return Response.json({ success: true, message: 'Message sent from personal account' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});