import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    
    const { employee_id, employee_name, availableShifts, coinsToAward } = body;

    if (!employee_id || !employee_name) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const coins = coinsToAward || (availableShifts * 5);

    if (coins > 0) {
      await base44.asServiceRole.entities.CoinTransaction.create({
        employee_id,
        employee_name,
        amount: coins,
        reason: `הגשת סידור זמינות - ${availableShifts} משמרות פנויות`,
        type: 'earned',
        trigger: 'availability_submitted',
        status: 'approved'
      });
    }

    return Response.json({ 
      success: true, 
      coinsAwarded: coins 
    });
  } catch (error) {
    console.error('Error awarding availability coins:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});