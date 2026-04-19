import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
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