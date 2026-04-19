import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { entryId } = await req.json();

    if (!entryId) {
      return Response.json({ error: 'Missing entryId' }, { status: 400 });
    }

    console.log('🔍 Fetching entry:', entryId);
    const entries = await base44.asServiceRole.entities.QueueEntry.filter({ id: entryId });
    const entry = entries[0] || null;

    if (!entry) {
      return Response.json({ error: 'Entry not found' }, { status: 404 });
    }

    return Response.json({ entry });
  } catch (error) {
    console.error('Error fetching queue entry:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});