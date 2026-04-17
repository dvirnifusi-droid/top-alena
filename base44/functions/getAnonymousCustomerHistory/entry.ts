import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phone } = await req.json();

    if (!phone) {
      return Response.json({ error: 'Missing phone' }, { status: 400 });
    }

    // חזור כל הכניסות בתור של הטלפון הזה
    const allEntries = await base44.asServiceRole.entities.QueueEntry.list('-timestamp_register', 1000);
    const customerEntries = allEntries.filter(e => e.phone === phone);

    if (customerEntries.length === 0) {
      return Response.json({ 
        isNewCustomer: true,
        visitCount: 0,
        totalCredits: 0,
        previousEntriesCount: 0
      });
    }

    // חישוב נתונים
    const visitCount = customerEntries.length;
    const seatedCount = customerEntries.filter(e => e.status === 'seated').length;
    const abandonedCount = customerEntries.filter(e => e.status === 'abandoned').length;
    
    // המטבעות האחרונים שנתרו
    const lastEntry = customerEntries[0];
    const totalCredits = lastEntry.time_credits_earned || 0;

    // בחר פרס קודם
    const previousTreat = customerEntries.find(e => e.selected_treat_id);

    return Response.json({ 
      isNewCustomer: false,
      visitCount,
      seatedCount,
      abandonedCount,
      totalCredits,
      previousTreat: previousTreat ? {
        treatId: previousTreat.selected_treat_id,
        timestamp: previousTreat.timestamp_register
      } : null,
      lastVisit: lastEntry.timestamp_register
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});