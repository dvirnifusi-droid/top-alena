import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { employee_id, employee_name } = body;
    const coinsToAward = Math.floor(Math.random() * 10) + 1; // 1-10 coins

    // Create coin transaction
    await base44.asServiceRole.entities.CoinTransaction.create({
      employee_id,
      employee_name,
      amount: coinsToAward,
      reason: 'קריאת תדריך',
      type: 'earned',
      trigger: 'briefing_read',
      status: 'approved'
    });

    return Response.json({ 
      success: true, 
      coinsAwarded: coinsToAward 
    });
  } catch (error) {
    console.error('Error awarding briefing coins:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});