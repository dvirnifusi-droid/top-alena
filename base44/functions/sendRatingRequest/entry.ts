import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // בדוק entries שhosped לפני בדיוק 3 שעות
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2.5 * 60 * 60 * 1000).toISOString();

    const entries = await base44.asServiceRole.entities.QueueEntry.filter({ status: 'seated' });
    const targets = entries.filter(e => {
      if (!e.timestamp_seated) return false;
      return e.timestamp_seated >= twoHoursAgo && e.timestamp_seated <= threeHoursAgo;
    });

    console.log(`📊 Found ${targets.length} entries to send rating request`);

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    for (const entry of targets) {
      if (!entry.phone) continue;

      const { phone, customer_name } = entry;
      const message = `${customer_name}, איך היה הערב בעלינא? 🍽️\n\nנשמח לדירוג שלך וההערות שלך עוזרות לנו להשתפר!\n\n⭐ https://g.page/r/CReDn7f8zub7EAI/review`;

      try {
        const auth = btoa(`${twilioSid}:${twilioToken}`);
        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            From: twilioPhone,
            To: `+972${phone.replace(/^0/, '')}`,
            Body: message
          })
        });

        console.log(`✅ Rating request sent to ${phone}`);
      } catch (e) {
        console.warn(`⚠️ Failed to send: ${e.message}`);
      }
    }

    return Response.json({ success: true, sent: targets.length });
  } catch (error) {
    console.error('Error in sendRatingRequest:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});