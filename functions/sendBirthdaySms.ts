import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);

        const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER");

        // Get all customers with a birthday
        const customers = await base44.asServiceRole.entities.Customer.list();

        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDay = today.getDate();

        let sent = 0;
        for (const customer of customers) {
            if (!customer.birthday || !customer.phone) continue;

            const bday = new Date(customer.birthday);
            if (bday.getMonth() + 1 === todayMonth && bday.getDate() === todayDay) {
                const message = `יום הולדת שמח ${customer.name}! 🎂 מחכים לך ב-Top Alena עם מתנה מיוחדת!`;

                await fetch(
                    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
                    {
                        method: "POST",
                        headers: {
                            Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
                            "Content-Type": "application/x-www-form-urlencoded",
                        },
                        body: new URLSearchParams({ To: customer.phone, From: fromNumber, Body: message }),
                    }
                );
                sent++;
            }
        }

        return Response.json({ success: true, sent });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});