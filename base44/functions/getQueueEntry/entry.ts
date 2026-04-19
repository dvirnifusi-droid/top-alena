import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { entryId } = body;

    if (!entryId) {
      return Response.json({ error: 'Missing entryId' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    console.log('🔍 Fetching entry:', entryId);
    const entries = await base44.asServiceRole.entities.QueueEntry.filter({ id: entryId });
    const entry = entries[0] || null;

    if (!entry) {
      return Response.json({ error: 'Entry not found' }, { status: 404 });
    }

    return Response.json({ entry });
  } catch (error) {
    console.error('Error fetching queue entry:', error);
    return Response.json({ error: error.message || 'Failed to fetch entry' }, { status: 500 });
  }
});