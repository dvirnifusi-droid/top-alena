import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import twilio from 'npm:twilio@5.3.4';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { to, message } = await req.json();

        const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
        const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
        const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

        if (!accountSid || !authToken || !fromNumber) {
            return Response.json({ error: 'Missing Twilio credentials' }, { status: 500 });
        }

        const client = twilio(accountSid, authToken);

        const result = await client.messages.create({
            from: `whatsapp:${fromNumber}`,
            to: `whatsapp:${to}`,
            body: message,
        });

        return Response.json({ success: true, sid: result.sid });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});