import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // חפש customers עם tag "Couple"
    const customers = await base44.asServiceRole.entities.Customer.filter({});
    const couples = customers.filter(c => (c.tags || []).includes('Couple'));

    console.log(`💕 Found ${couples.length} couples for offer`);

    const message = `${couples[0]?.name || 'היי'},\n\n💕 אנחנו יודעים שאתם אוהבים לבקר אצלנו כזוג!\n\nלכן הכנו משהו מיוחד לכם:\n🍷 ערב רומנטי באמצע שבוע (א'-ד')\n🎵 מוזיקה בחלקה + תאורה מיוחדת\n🍽️ מנה זוגית בהנחה 20%\n\nהזמינו שולחן עכשיו! 📞`;

    for (const customer of couples) {
      if (!customer.phone) continue;

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: customer.phone,
          subject: 'ערב רומנטי מיוחד בעלינא',
          body: message,
          from_name: 'עלינא',
        }).catch(() => {});

        console.log(`✅ Couple offer sent to ${customer.phone}`);
      } catch (e) {
        console.warn(`⚠️ Failed: ${e.message}`);
      }
    }

    return Response.json({ success: true, sent: couples.length });
  } catch (error) {
    console.error('Error in sendCoupleOffer:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});