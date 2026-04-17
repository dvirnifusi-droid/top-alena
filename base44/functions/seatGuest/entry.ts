import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { entryId } = await req.json();

    if (!entryId) {
      return Response.json({ error: 'Missing entryId' }, { status: 400 });
    }

    // קבל את הכניסה לפני העדכון
    const entry = await base44.asServiceRole.entities.QueueEntry.get(entryId);

    const now = new Date().toISOString();
    const seatedEntry = await base44.asServiceRole.entities.QueueEntry.update(entryId, {
      status: 'seated',
      proximity_response: 'yes',
      timestamp_end: now,
      timestamp_seated: now,
      seat_called_at: null,
    });

    // אם יש טלפון ומטבעות, שמור לCustomer
    if (entry.phone && entry.time_credits_earned > 0) {
      try {
        const customers = await base44.asServiceRole.entities.Customer.filter({ phone: entry.phone });
        
        if (customers.length > 0) {
          // עדכן את המטבעות של הCustomer הקיים
          await base44.asServiceRole.entities.Customer.update(customers[0].id, {
            coin_balance: (customers[0].coin_balance || 0) + entry.time_credits_earned,
            last_visit: now,
            visit_count: (customers[0].visit_count || 0) + 1,
          });
        } else {
          // צור Customer חדש
          await base44.asServiceRole.entities.Customer.create({
            phone: entry.phone,
            name: entry.customer_name,
            coin_balance: entry.time_credits_earned,
            visit_count: 1,
            last_visit: now,
          });
        }
      } catch (e) {
        console.warn('Could not save credits to Customer:', e);
      }
    }

    return Response.json({ success: true, entry: seatedEntry });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});