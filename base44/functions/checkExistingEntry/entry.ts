import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phone } = await req.json();

    if (!phone) return Response.json({ activeEntry: null });

    const entries = await base44.asServiceRole.entities.QueueEntry.filter({ phone: phone.trim() });
    const activeEntry = entries.find(e => e.status !== 'seated' && e.status !== 'abandoned') || null;

    return Response.json({ activeEntry });
  } catch (error) {
    return Response.json({ activeEntry: null });
  }
});