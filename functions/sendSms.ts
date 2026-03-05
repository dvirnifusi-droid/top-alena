import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const { to, message } = await req.json();

        const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

        const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
            {
                method: "POST",
                headers: {
                    Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({ To: to, From: fromNumber, Body: message }),
            }
        );

        const result = await response.json();
        if (result.error_code) {
            return Response.json({ error: result.message }, { status: 400 });
        }
        return Response.json({ success: true, sid: result.sid });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});