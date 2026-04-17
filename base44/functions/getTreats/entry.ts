import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    // לא דורש auth - פשוט קרא את הפרסים הפעילים
    // createClientFromRequest עובד גם בלי authentication
    let treats = [];
    try {
      const base44 = createClientFromRequest(req);
      treats = await base44.asServiceRole.entities.TimeTreat.filter({ is_active: true });
    } catch (e) {
      // אם נכשל, זה בסדר - החזר רשימה ריקה
      console.warn('Could not fetch treats:', e.message);
    }

    console.log('Treats fetched:', treats.length);
    return Response.json({ treats });
  } catch (error) {
    console.error('Error getting treats:', error.message);
    return Response.json({ treats: [] }, { status: 200 });
  }
});