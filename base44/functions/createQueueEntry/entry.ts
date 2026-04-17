import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { customer_name, phone, party_size } = await req.json();

    if (!customer_name || !phone || !party_size) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // קבל את המטבעות הקודמים מכניסות קודמות
    const allEntries = await base44.asServiceRole.entities.QueueEntry.list('-timestamp_register', 1000);
    const previousEntries = allEntries.filter(e => e.phone === phone);
    const previousCredits = previousEntries.length > 0 
      ? (previousEntries[0].time_credits_earned || 0) 
      : 0;

    // צור כניסה חדשה עם המטבעות הקודמים
    const newEntry = await base44.asServiceRole.entities.QueueEntry.create({
      customer_name: customer_name.trim(),
      phone: phone.trim(),
      party_size: parseInt(party_size),
      status: 'pending',
      timestamp_register: new Date().toISOString(),
      time_credits_earned: previousCredits,
    });

    return Response.json({ entry: newEntry });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});