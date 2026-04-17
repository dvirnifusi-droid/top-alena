import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { entryId } = body;

    const base44 = createClientFromRequest(req);

    // קרא את הרשומה מ-QueueEntry
    const entry = await base44.asServiceRole.entities.QueueEntry.list('-timestamp_register', 1).then(all => all.find(e => e.id === entryId));
    if (!entry) {
      return Response.json({ error: 'Entry not found' }, { status: 404 });
    }

    // חפש customer קיים לפי טלפון
    const existing = await base44.asServiceRole.entities.Customer.filter({ phone: entry.phone });
    const now = new Date().toISOString();
    let customer;

    if (existing.length > 0) {
      // עדכן קיים
      customer = existing[0];
      const newVisitCount = (customer.visit_count || 0) + 1;
      const newCoinBalance = (customer.coin_balance || 0) + (entry.time_credits_earned || 0);
      const newTags = [...(customer.tags || [])];
      
      // סנן תגיות כפולות ודוגמא לתגיות חדשות
      if (entry.party_size === 2 && !newTags.includes('Couple')) newTags.push('Couple');
      if (entry.party_size >= 6 && !newTags.includes('Group6Plus')) newTags.push('Group6Plus');
      
      // קבע tier
      let tier = 'regular';
      if (newVisitCount >= 3) tier = 'vip';
      else if (newVisitCount >= 2) tier = 'frequent';

      await base44.asServiceRole.entities.Customer.update(customer.id, {
        visit_count: newVisitCount,
        coin_balance: newCoinBalance,
        loyalty_tier: tier,
        last_visit: now,
        group_size_preference: entry.party_size,
        tags: newTags,
      });

      console.log(`✅ Customer updated: ${customer.id}, visits: ${newVisitCount}, coins: ${newCoinBalance}`);
    } else {
      // צור customer חדש
      const tags = [];
      if (entry.party_size === 2) tags.push('Couple');
      if (entry.party_size >= 6) tags.push('Group6Plus');

      const newCustomer = await base44.asServiceRole.entities.Customer.create({
        phone: entry.phone,
        name: entry.customer_name,
        visit_count: 1,
        coin_balance: entry.time_credits_earned || 0,
        loyalty_tier: 'regular',
        last_visit: now,
        group_size_preference: entry.party_size,
        tags,
      });

      console.log(`✅ New customer created: ${newCustomer.id}`);
    }

    // עדכן את ה-QueueEntry עם customer_id
    await base44.asServiceRole.entities.QueueEntry.update(entryId, {
      customer_id: customer?.id || newCustomer?.id,
    }).catch(() => {});

    return Response.json({ success: true, customerId: customer?.id });
  } catch (error) {
    console.error('Error syncing queue to customer:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});