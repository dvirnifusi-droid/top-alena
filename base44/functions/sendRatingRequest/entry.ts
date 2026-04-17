import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { entryId, phone, name } = body;

    // שלח בקשת דירוג
    const message = `${name}, איך היה הערב בעלינא? 🍽️\n\nנשמח לדירוג שלך וההערות שלך עוזרות לנו להשתפר!\n\n⭐ https://g.page/r/CReDn7f8zub7EAI/review`;

    // שלח SMS
    try {
      const twilio = require('twilio');
      const client = twilio(
        Deno.env.get('TWILIO_ACCOUNT_SID'),
        Deno.env.get('TWILIO_AUTH_TOKEN')
      );

      await client.messages.create({
        body: message,
        from: Deno.env.get('TWILIO_PHONE_NUMBER'),
        to: `+972${phone.replace(/^0/, '')}`,
      });

      console.log(`✅ Rating request sent to ${phone}`);
    } catch (e) {
      console.warn(`⚠️ SMS failed: ${e.message}`);
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error in sendRatingRequest:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});