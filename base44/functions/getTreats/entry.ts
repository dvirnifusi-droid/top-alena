import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const treats = await base44.asServiceRole.entities.TimeTreat.filter({ is_active: true });
    return Response.json({ treats });
  } catch (error) {
    console.error('❌ Error getting treats:', error.message);
    return Response.json({ treats: [], error: error.message }, { status: 500 });
  }
});