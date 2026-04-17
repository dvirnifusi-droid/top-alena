import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { entryId } = await req.json();

    if (!entryId) {
      return Response.json({ error: 'Missing entryId' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.QueueEntry.update(entryId, {
      status: 'seated',
      proximity_response: 'yes',
      timestamp_end: now,
      timestamp_seated: now,
      seat_called_at: null,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});