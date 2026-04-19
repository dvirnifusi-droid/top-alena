import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const entries = await base44.asServiceRole.entities.QueueEntry.filter({ status: 'pending' }, '-timestamp_register', 100);
    return Response.json({ entries });
  } catch (error) {
    return Response.json({ entries: [] });
  }
});