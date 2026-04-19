import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { phone } = await req.json();

    if (!phone) return Response.json({ error: 'Missing phone' }, { status: 400 });

    const allEntries = await base44.asServiceRole.entities.QueueEntry.filter({ phone: phone.trim() });

    if (allEntries.length === 0) {
      return Response.json({ isNewCustomer: true, visitCount: 0, totalCredits: 0 });
    }

    const visitCount = allEntries.length;
    const seatedCount = allEntries.filter(e => e.status === 'seated').length;
    const abandonedCount = allEntries.filter(e => e.status === 'abandoned').length;
    const lastEntry = allEntries.sort((a, b) => new Date(b.timestamp_register) - new Date(a.timestamp_register))[0];
    const totalCredits = lastEntry.time_credits_earned || 0;

    return Response.json({ isNewCustomer: false, visitCount, seatedCount, abandonedCount, totalCredits, lastVisit: lastEntry.timestamp_register });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});