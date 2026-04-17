import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // קרא את כל הפרסים הפעילים עם service role
    const treats = await base44.asServiceRole.entities.TimeTreat.filter({ is_active: true });

    console.log('Treats fetched:', treats.length);
    return Response.json({ treats });
  } catch (error) {
    console.error('Error getting treats:', error.message);
    return Response.json({ error: error.message || 'Failed to get treats' }, { status: 500 });
  }
});