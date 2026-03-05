import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { to, subject, body } = await req.json();

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

        // Build HTML body - if body contains an img tag, wrap in HTML
        const htmlBody = body.includes('<img') 
            ? `<div style="font-family:sans-serif;direction:rtl;text-align:right;">${body.replace(/\n/g, '<br/>')}</div>`
            : `<div style="font-family:sans-serif;direction:rtl;text-align:right;">${body.replace(/\n/g, '<br/>')}</div>`;

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'TOP ALENA <onboarding@resend.dev>',
                to: [to],
                subject: subject,
                html: htmlBody,
            }),
        });

        const data = await res.json();

        if (!res.ok) {
            return Response.json({ error: data.message || 'Failed to send email' }, { status: 500 });
        }

        return Response.json({ success: true, id: data.id });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});