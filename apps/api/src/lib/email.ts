type SendEmailArgs = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from?: string;
};

export async function sendEmail({ to, subject, text, html, from }: SendEmailArgs) {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = from ?? process.env.EMAIL_FROM ?? 'noreply@example.com';
  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping send', { to, subject });
    return { skipped: true };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend error ${res.status}: ${errBody}`);
  }
  return res.json();
}
