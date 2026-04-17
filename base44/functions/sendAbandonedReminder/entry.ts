import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // קרא את כל הנטושים מ-24-48 שעות אחורה
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    const abandoned = await base44.asServiceRole.entities.QueueEntry.filter({ status: 'abandoned' });
    const targets = abandoned.filter(e => {
      const ts = e.timestamp_end;
      return ts >= twoDaysAgo && ts <= oneDayAgo;
    });

    console.log(`📨 Found ${targets.length} abandoned entries to remind`);

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    for (const entry of targets) {
      if (!entry.phone) continue;

      const dayOfWeek = new Date(entry.timestamp_register).toLocaleDateString('he-IL', { weekday: 'long' });
      const message = `היי ${entry.customer_name},\n\nראינו שביקרת אצלנו ביום ${dayOfWeek} והיה עומס חריג... 😅\n\nאנחנו לא אוהבים שיוצאים מאיתנו רעבים! 😋\n\nבואו לבקר אותנו באמצע שבוע (א'-ד') - הקינוח עלינו! 🎁\n\n🍰 בתוקף עד שבועיים`;

      try {
        const auth = btoa(`${twilioSid}:${twilioToken}`);
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            From: twilioPhone,
            To: `+972${entry.phone.replace(/^0/, '')}`,
            Body: message
          })
        });

        if (response.ok) {
          console.log(`✅ WhatsApp sent to ${entry.phone}`);
        } else {
          console.warn(`⚠️ Failed to send to ${entry.phone}`);
        }
      } catch (e) {
        console.warn(`⚠️ Error: ${e.message}`);
      }
    }

    return Response.json({ sent: targets.length });
  } catch (error) {
    console.error('Error in sendAbandonedReminder:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});