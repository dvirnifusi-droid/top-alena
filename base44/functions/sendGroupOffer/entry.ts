import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // חפש customers עם tag "Group6Plus"
    const customers = await base44.asServiceRole.entities.Customer.filter({});
    const groups = customers.filter(c => (c.tags || []).includes('Group6Plus'));

    console.log(`👥 Found ${groups.length} groups for offer`);

    const message = `${groups[0]?.name || 'היי'},\n\n👥 אנחנו יודעים שאתם אוהבים לבקר בקבוצה!\n\nלכן הכנו משהו מדהים:\n🎉 חוקי אירועים וימי הולדת\n🎯 סגירה של שולחן כולל\n🎁 ערכות מנות מיוחדות לקבוצות\n💰 הנחה 25% לקבוצות של 8+ אנשים\n🎵 אפשרות למוזיקה וקישוט\n\nשמרו תאריך וקרא לנו! 📞`;

    for (const customer of groups) {
      if (!customer.phone) continue;

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: customer.phone,
          subject: 'אירוע מיוחד לקבוצה בעלינא',
          body: message,
          from_name: 'עלינא',
        }).catch(() => {});

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