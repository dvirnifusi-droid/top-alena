import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { entryId, response } = await req.json();

    if (!entryId || !response) {
      return Response.json({ error: 'Missing entryId or response' }, { status: 400 });
    }

    const updateData = { proximity_response: response };
    if (response === 'no') {
      updateData.status = 'abandoned';
      updateData.timestamp_end = new Date().toISOString();
    }

    await base44.asServiceRole.entities.QueueEntry.update(entryId, updateData);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});