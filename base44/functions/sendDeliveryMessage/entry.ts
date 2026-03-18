import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { channel, recipients, message } = await req.json();

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

  const results = [];

  for (const r of recipients) {
    if (!r.phone) { results.push({ phone: r.phone, status: 'skipped', reason: 'no phone' }); continue; }

    // נרמול מספר טלפון ישראלי
    let phone = r.phone.replace(/[\s\-]/g, '');
    if (phone.startsWith('0')) phone = '+972' + phone.slice(1);
    else if (!phone.startsWith('+')) phone = '+972' + phone;

    let toNumber = phone;
    let fromNumber = fromPhone;

    if (channel === 'whatsapp') {
      toNumber = 'whatsapp:' + toNumber;
      fromNumber = 'whatsapp:' + fromNumber;
    }

    const body = new URLSearchParams({ To: toNumber, From: fromNumber, Body: message });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      }
    );

    const data = await response.json();
    results.push({ phone: r.phone, status: data.sid ? 'sent' : 'failed', error: data.message });
  }

  return Response.json({ results });
});