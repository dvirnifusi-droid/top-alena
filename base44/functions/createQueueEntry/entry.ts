import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { customer_name, phone, party_size } = body;

    if (!customer_name || !phone || !party_size) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);

    const newEntry = await base44.asServiceRole.entities.QueueEntry.create({
      customer_name: customer_name.trim(),
      phone: phone.trim(),
      party_size: parseInt(party_size),
      status: 'pending',
      timestamp_register: new Date().toISOString(),
      sort_order: 9999,
    });

    console.log('Created queue entry:', newEntry.id);
    return Response.json({ entry: newEntry });
  } catch (error) {
    console.error('Error creating queue entry:', error.message);
    return Response.json({ error: error.message || 'Failed to create entry' }, { status: 500 });
  }
});