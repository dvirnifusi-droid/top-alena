import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // קרא את כל הלקוחות שיש להם coins
    const customers = await base44.asServiceRole.entities.Customer.filter({});
    const withCoins = customers.filter(c => (c.coin_balance || 0) > 0);

    console.log(`📧 Found ${withCoins.length} customers with coins for newsletter`);

    const message = `היי! 👋\n\nצברת ${withCoins[0]?.coin_balance || 0} מטבעות עלינא!\n\n🍴 זה שבוע מעניין במסעדה:\n• מנה חדשה: פסטה טריוויאלי\n• אירוע מיוחד: מוזיקה live ביום שלישי\n• הופעה של [אמן]\n\nבואו לקנות משהו טוב עם המטבעות שלכם! 💰\n\nמעניין אתכם? תגידו לנו!`;

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    for (const customer of withCoins) {
      if (!customer.phone) continue;

      const msg = `היי ${customer.name}! 👋\n\nצברת ${customer.coin_balance || 0} מטבעות עלינא!\n\n🍴 זה שבוע מעניין במסעדה:\n• מנה חדשה: פסטה טריוויאלי\n• אירוע מיוחד: מוזיקה live ביום שלישי\n• הופעה של [אמן]\n\nבואו לקנות משהו טוב עם המטבעות שלכם! 💰`;

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
            To: `+972${customer.phone.replace(/^0/, '')}`,
            Body: msg
          })
        });
        console.log(`✅ Newsletter sent to ${customer.phone}`);
      } catch (e) {
        console.warn(`⚠️ Failed: ${e.message}`);
      }
    }

    return Response.json({ success: true, sent: withCoins.length });
  } catch (error) {
    console.error('Error in sendWeeklyNewsletter:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});