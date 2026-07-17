// Strip HTML tags + collapse whitespace for plain-text fallback. Many spam
// filters penalize HTML-only emails.
function htmlToText(html) {
    return String(html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>(?!\n)/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
export async function sendEmail({ to, subject, text, html, from, replyTo }) {
    const apiKey = process.env.RESEND_API_KEY;
    // Friendly From name helps deliverability AND looks more professional.
    // Caller can override with `from`; otherwise use EMAIL_FROM env, otherwise the
    // verified-at-Resend brand domain (alenabepita.co.il is the long-standing
    // production sender — verified + Cloudflare DNS + DKIM/SPF/DMARC in place).
    const defaultFrom = process.env.EMAIL_FROM ?? 'TOP APOLLO <noreply@alenabepita.co.il>';
    const sender = from ?? defaultFrom;
    if (!apiKey) {
        console.warn('[email] RESEND_API_KEY not set — skipping send', { to, subject });
        return { skipped: true };
    }
    // Ensure a plain-text version exists — Gmail/Outlook treat HTML-only as suspicious.
    const finalText = text || (html ? htmlToText(html) : '');
    const payload = {
        from: sender,
        to: Array.isArray(to) ? to : [to],
        subject,
        text: finalText,
        html,
        // Reply-To so customers can reply to the business directly instead of noreply@
        reply_to: replyTo || process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || 'reservations@alenabepita.co.il',
    };
    // Standard List-Unsubscribe header — major signal for inbox placement. Only
    // emitted when EMAIL_LIST_UNSUB is set (per-tenant), so we never leak Alena's
    // unsubscribe address onto another tenant's mail.
    if (process.env.EMAIL_LIST_UNSUB) {
        payload.headers = {
            'List-Unsubscribe': process.env.EMAIL_LIST_UNSUB,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        };
    }
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const errBody = await res.text();
        console.error('[email] resend failed', { status: res.status, body: errBody.slice(0, 300) });
        throw new Error(`Resend error ${res.status}: ${errBody}`);
    }
    return res.json();
}
//# sourceMappingURL=email.js.map