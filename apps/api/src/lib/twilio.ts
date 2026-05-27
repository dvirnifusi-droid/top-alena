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
