import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { employee_id, employee_name, submittedByTuesday, scheduledInWeekly } = body;
    let coinsToAward = 0;

    // Base 50 coins for submitting availability by Tuesday
    if (submittedByTuesday) {
      coinsToAward += 50;
    }

    // Additional 100 coins if submitted by Friday AND scheduled in weekly shifts
    if (submittedByTuesday && scheduledInWeekly) {
      coinsToAward += 100;
    }

    if (coinsToAward > 0) {
      const reason = submittedByTuesday && scheduledInWeekly 
        ? 'הגשת זמינות בזמן וסידור במשמרות'
        : 'הגשת זמינות בזמן';

      await base44.asServiceRole.entities.CoinTransaction.create({
        employee_id,
        employee_name,
        amount: coinsToAward,
        reason,
        type: 'earned',
        trigger: 'availability_submitted',
        status: 'approved'
      });
    }

    return Response.json({ 
      success: true, 
      coinsAwarded: coinsToAward 
    });
  } catch (error) {
    console.error('Error awarding availability coins:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});