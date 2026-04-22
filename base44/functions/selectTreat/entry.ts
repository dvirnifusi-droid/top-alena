import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { entryId, treatId, treatCost } = await req.json();

    if (!entryId || !treatId || treatCost === undefined) {
      return Response.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // קרא את הentry הנוכחי דרך service role (ציבורי — אנונימי)
    const entry = await base44.asServiceRole.entities.QueueEntry.get(entryId);

    if (!entry) {
      return Response.json({ error: 'Entry not found' }, { status: 404 });
    }

    const currentCredits = entry.time_credits_earned || 0;
    if (currentCredits < treatCost) {
      return Response.json({ error: 'Not enough credits' }, { status: 400 });
    }

    const remainingCredits = currentCredits - treatCost;

    // עדכן entry עם הפינוק והמטבעות הנותרים
    await base44.asServiceRole.entities.QueueEntry.update(entryId, {
      selected_treat_id: treatId,
      time_credits_spent: (entry.time_credits_spent || 0) + treatCost,
      time_credits_earned: remainingCredits,
    });

    return Response.json({ 
      success: true, 
      remainingCredits 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});