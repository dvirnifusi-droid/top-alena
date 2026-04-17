import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const { entryId, phone, customerName } = await req.json();

  if (!phone || !entryId) return Response.json({ error: 'missing params' }, { status: 400 });

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from = Deno.env.get('TWILIO_PHONE_NUMBER');

  // normalize Israeli phone
  let to = phone.replace(/\D/g, '');
  if (to.startsWith('0')) to = '+972' + to.slice(1);
  else if (!to.startsWith('+')) to = '+972' + to;

  const feedbackUrl = `${req.headers.get('origin') || 'https://app.base44.com'}/QueueFeedback?id=${entryId}`;
  const message = `שלום ${customerName || 'יקר/ה'}! 😊\nתודה שביקרתם בעלינא.\nנשמח לשמוע מה חשבתם:\n${feedbackUrl}`;

  const body = new URLSearchParams({ From: from, To: to, Body: message });
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await resp.json();
  if (!resp.ok) return Response.json({ error: data.message }, { status: 500 });
  return Response.json({ success: true, sid: data.sid });
});