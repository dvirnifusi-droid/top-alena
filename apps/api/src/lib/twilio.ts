export function normalizeIsraeliPhone(input: string): string {
  let n = input.replace(/\D/g, '');
  if (n.startsWith('0')) return '+972' + n.slice(1);
  if (n.startsWith('972')) return '+' + n;
  return '+972' + n;
}

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    console.warn('[twilio] missing credentials, skipping', { to, body: body.slice(0, 60) });
    return { skipped: true };
  }
  const creds = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: normalizeIsraeliPhone(to), Body: body }),
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(data?.message || `twilio_${res.status}`);
  return { success: true, sid: data.sid };
}

// Send a WhatsApp message using a pre-approved Content Template. Pass the variables
// as a {key: value} map matching the {{1}}, {{2}}, ... placeholders.
// Falls back to free-form sendWhatsApp if templateSid is missing.
export async function sendWhatsAppTemplate(
  to: string,
  templateSid: string,
  variables: Record<string, string>,
) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from =
    process.env.TWILIO_WHATSAPP_FROM ??
    (process.env.TWILIO_PHONE_NUMBER ? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}` : undefined);
  if (!sid || !token || !from || !templateSid) {
    console.warn('[twilio-wa] missing template-send config', { sid_set: !!sid, from_set: !!from, sid_template: templateSid });
    return { skipped: true };
  }
  const creds = Buffer.from(`${sid}:${token}`).toString('base64');
  const toN = normalizeIsraeliPhone(to);
  const params: Record<string, string> = {
    From: from,
    To: `whatsapp:${toN}`,
    ContentSid: templateSid,
    ContentVariables: JSON.stringify(variables),
  };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data: any = await res.json();
  if (!res.ok) {
    console.error('[twilio-wa-template] failed', { status: res.status, code: data?.code, message: data?.message, to: toN });
    throw new Error(`twilio_wa_template_${data?.code || res.status}: ${data?.message || 'unknown'}`);
  }
  return { success: true, sid: data.sid };
}

export async function sendWhatsApp(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from =
    process.env.TWILIO_WHATSAPP_FROM ??
    (process.env.TWILIO_PHONE_NUMBER ? `whatsapp:${process.env.TWILIO_PHONE_NUMBER}` : undefined);
  if (!sid || !token || !from) {
    console.warn('[twilio] missing WhatsApp credentials, skipping', { to, from_set: !!from, sid_set: !!sid });
    return { skipped: true, reason: 'missing_credentials' };
  }
  const creds = Buffer.from(`${sid}:${token}`).toString('base64');
  const toN = normalizeIsraeliPhone(to);
  const params: Record<string, string> = { From: from, To: `whatsapp:${toN}`, Body: body };
  // If a pre-approved template SID is configured, use it. Twilio's WhatsApp Business
  // requires templates for business-initiated messages outside a 24h session.
  // Default = the owner's approved booking_confirmation_he template; overridable via env.
  const templateSid = process.env.TWILIO_WA_TEMPLATE_SID || 'HX42bd4ae96abaa7312aeeae1af997c3da';
  if (templateSid) {
    params.ContentSid = templateSid;
    // Caller passes ContentVariables as the message body (just the JSON string of {1: ..., 2: ..., ...})
    // — sendWhatsAppTemplate below is the typed wrapper.
    if (process.env.TWILIO_WA_TEMPLATE_VARS) params.ContentVariables = process.env.TWILIO_WA_TEMPLATE_VARS;
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data: any = await res.json();
  if (!res.ok) {
    // Surface the full Twilio error code + message so we can diagnose (e.g., 63016 = needs template).
    console.error('[twilio-wa] failed', { status: res.status, code: data?.code, message: data?.message, to: toN });
    throw new Error(`twilio_wa_${data?.code || res.status}: ${data?.message || 'unknown'}`);
  }
  return { success: true, sid: data.sid };
}
