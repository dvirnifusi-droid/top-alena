import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // קרא את כל הלקוחות שיש להם coins
    const customers = await base44.asServiceRole.entities.Customer.filter({});
    const withCoins = customers.filter(c => (c.coin_balance || 0) > 0);

    console.log(`📧 Found ${withCoins.length} customers with coins for newsletter`);

    const message = `היי! 👋\n\nצברת ${withCoins[0]?.coin_balance || 0} מטבעות עלינא!\n\n🍴 זה שבוע מעניין במסעדה:\n• מנה חדשה: פסטה טריוויאלי\n• אירוע מיוחד: מוזיקה live ביום שלישי\n• הופעה של [אמן]\n\nבואו לקנות משהו טוב עם המטבעות שלכם! 💰\n\nמעניין אתכם? תגידו לנו!`;

    for (const customer of withCoins) {
      if (!customer.phone) continue;

      try {
        // שלח SMS
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: customer.phone,
          subject: 'עדכון שבועי - עלינא',
          body: message,
          from_name: 'עלינא',
        }).catch(() => {});

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