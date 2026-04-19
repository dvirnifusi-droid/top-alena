import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { customer_name, phone, party_size, seating_preference } = body;

    if (!customer_name || !phone || !party_size) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // קבל את המטבעות מCustomer entity (השמור מפעמים קודמות)
    let previousCredits = 0;
    try {
      const customers = await base44.asServiceRole.entities.Customer.filter({ phone: phone.trim() });
      if (customers.length > 0) {
        previousCredits = customers[0].coin_balance || 0;
      }
    } catch (e) {
      // אם לא ניתן לקרוא, נמשיך עם 0 מטבעות
      console.warn('Could not fetch customer credits, continuing with 0:', e?.message);
    }

    // צור כניסה חדשה עם המטבעות הקודמים
    const newEntry = await base44.asServiceRole.entities.QueueEntry.create({
      customer_name: customer_name.trim(),
      phone: phone.trim(),
      party_size: parseInt(party_size),
      seating_preference: seating_preference || 'no_preference',
      status: 'pending',
      timestamp_register: new Date().toISOString(),
      time_credits_earned: previousCredits,
    });

    return Response.json({ entry: newEntry });
  } catch (error) {
    console.error('createQueueEntry error:', error?.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});