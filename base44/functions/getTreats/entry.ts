import { createClient } from 'npm:@base44/sdk@0.8.25';

const base44 = createClient({ appId: Deno.env.get('BASE44_APP_ID') });

Deno.serve(async (req) => {
  try {
    const treats = await base44.asServiceRole.entities.TimeTreat.filter({ is_active: true });
    console.log('✅ Treats fetched:', treats.length);
    return Response.json({ treats });
  } catch (error) {
    console.error('❌ Error getting treats:', error.message);
    return Response.json({ treats: [], error: error.message }, { status: 500 });
  }
});