import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { entryId } = await req.json();

    if (!entryId) {
      return Response.json({ error: 'Missing entryId' }, { status: 400 });
    }

    console.log('🔍 Fetching queue entries with service role...');
    const all = await base44.asServiceRole.entities.QueueEntry.list('-timestamp_register', 300);
    console.log('✅ Queue entries fetched:', all.length);

    const activeQueue = all
      .filter(e => e.status === 'active')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    const activePos = activeQueue.findIndex(e => e.id === entryId);

    if (activePos >= 0) {
      return Response.json({ position: activePos + 1, status: 'active', total: activeQueue.length });
    }

    const pendingQueue = all
      .filter(e => e.status === 'pending')
      .sort((a, b) => new Date(a.timestamp_register) - new Date(b.timestamp_register));
    const pendingPos = pendingQueue.findIndex(e => e.id === entryId);

    if (pendingPos >= 0) {
      return Response.json({ position: pendingPos + 1, status: 'pending', total: pendingQueue.length });
    }

    return Response.json({ position: null, status: 'not_found' });
  } catch (error) {
    console.error('Error getting queue position:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});