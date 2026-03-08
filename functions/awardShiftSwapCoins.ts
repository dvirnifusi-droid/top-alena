import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { employee_id, employee_name } = body;
    const coinsToAward = 50; // Bonus for shift swap

    // Create coin transaction
    await base44.asServiceRole.entities.CoinTransaction.create({
      employee_id,
      employee_name,
      amount: coinsToAward,
      reason: 'החלפת משמרת עם עובד אחר',
      type: 'earned',
      trigger: 'shift_swap',
      status: 'approved'
    });

    return Response.json({ 
      success: true, 
      coinsAwarded: coinsToAward 
    });
  } catch (error) {
    console.error('Error awarding shift swap coins:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});