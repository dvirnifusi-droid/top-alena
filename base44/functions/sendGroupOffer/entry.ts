import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // חפש customers עם tag "Group6Plus"
    const customers = await base44.asServiceRole.entities.Customer.filter({});
    const groups = customers.filter(c => (c.tags || []).includes('Group6Plus'));

    console.log(`👥 Found ${groups.length} groups for offer`);

    const message = `${groups[0]?.name || 'היי'},\n\n👥 אנחנו יודעים שאתם אוהבים לבקר בקבוצה!\n\nלכן הכנו משהו מדהים:\n🎉 חוקי אירועים וימי הולדת\n🎯 סגירה של שולחן כולל\n🎁 ערכות מנות מיוחדות לקבוצות\n💰 הנחה 25% לקבוצות של 8+ אנשים\n🎵 אפשרות למוזיקה וקישוט\n\nשמרו תאריך וקרא לנו! 📞`;

    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhone = Deno.env.get('TWILIO_PHONE_NUMBER');

    for (const customer of groups) {
      if (!customer.phone) continue;

      const msg = `${customer.name},\n\n👥 אנחנו יודעים שאתם אוהבים לבקר בקבוצה!\n\n🎉 חוקיים ויום הולדת\n🎯 סגירה של שולחן כולל\n🎁 ערכות מנות מיוחדות\n💰 הנחה 25% לקבוצות של 8+\n🎵 אפשרות מוזיקה וקישוט\n\nשמרו תאריך וקרא לנו! 📞`;

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
        console.log(`✅ Group offer sent to ${customer.phone}`);
      } catch (e) {
        console.warn(`⚠️ Failed: ${e.message}`);
      }
    }

    return Response.json({ success: true, sent: groups.length });
  } catch (error) {
    console.error('Error in sendGroupOffer:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});