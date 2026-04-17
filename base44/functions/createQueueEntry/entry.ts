import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { customer_name, phone, party_size } = await req.json();

    if (!customer_name || !phone || !party_size) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // יצור כניסה בתור דרך service role - אין צורך בauth משתמש
    const newEntry = await base44.asServiceRole.entities.QueueEntry.create({
      customer_name: customer_name.trim(),
      phone: phone.trim(),
      party_size: parseInt(party_size),
      status: 'pending',
      timestamp_register: new Date().toISOString(),
      sort_order: 9999,
    });

    return Response.json({ entry: newEntry });
  } catch (error) {
    console.error('Error creating queue entry:', error);
    return Response.json({ error: error.message || 'Failed to create entry' }, { status: 500 });
  }
});