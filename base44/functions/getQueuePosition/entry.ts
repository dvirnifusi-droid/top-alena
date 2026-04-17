import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { entryId } = body;

    if (!entryId) {
      return Response.json({ error: 'Missing entryId' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    // קרא את כל הכניסות עם service role (ללא דרישת התחברות)
    console.log('🔍 Fetching queue entries with service role...');
    const all = await base44.asServiceRole.entities.QueueEntry.list('-timestamp_register', 300);
    console.log('✅ Queue entries fetched:', all.length);

    // חפש מיקום בתור active
    const activeQueue = all
      .filter(e => e.status === 'active')
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    const activePos = activeQueue.findIndex(e => e.id === entryId);

    if (activePos >= 0) {
      return Response.json({ position: activePos + 1, status: 'active', total: activeQueue.length });
    }

    // אם לא בפעיל, בדוק pending
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
    return Response.json({ error: error.message || 'Failed to get position' }, { status: 500 });
  }
});