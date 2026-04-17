import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const { to, message } = await req.json();

  if (!to || !message) {
    return Response.json({ error: 'Missing to or message' }, { status: 400 });
  }

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  const credentials = btoa(`${accountSid}:${authToken}`);

  // נרמול מספר טלפון ישראלי
  let normalizedPhone = to.replace(/\D/g, '');
  if (normalizedPhone.startsWith('0')) {
    normalizedPhone = '+972' + normalizedPhone.slice(1);
  } else if (!normalizedPhone.startsWith('972')) {
    normalizedPhone = '+972' + normalizedPhone;
  } else {
    normalizedPhone = '+' + normalizedPhone;
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: normalizedPhone,
        Body: message,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    return Response.json({ error: data.message || 'Twilio error', details: data }, { status: 500 });
  }

  return Response.json({ success: true, sid: data.sid });
});