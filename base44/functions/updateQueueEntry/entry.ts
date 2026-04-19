import { createClient } from 'npm:@base44/sdk@0.8.25';

const base44 = createClient({ appId: Deno.env.get('BASE44_APP_ID') });

Deno.serve(async (req) => {
  try {
    const { entryId, data } = await req.json();

    if (!entryId || !data) {
      return Response.json({ error: 'Missing entryId or data' }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.QueueEntry.update(entryId, data);
    return Response.json({ entry: updated });
  } catch (error) {
    console.error('updateQueueEntry error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});