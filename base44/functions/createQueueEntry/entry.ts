Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { customer_name, phone, party_size } = body;

    if (!customer_name || !phone || !party_size) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // שלח בקשה ישירה ל-API (ללא auth requirement)
    const appId = Deno.env.get('BASE44_APP_ID');
    const url = `https://api.base44.app/apps/${appId}/entities/QueueEntry`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_name: customer_name.trim(),
        phone: phone.trim(),
        party_size: parseInt(party_size),
        status: 'pending',
        timestamp_register: new Date().toISOString(),
        sort_order: 9999,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('API error:', error);
      throw new Error(`Failed to create entry: ${response.status}`);
    }

    const newEntry = await response.json();
    console.log('Created queue entry:', newEntry.id);
    return Response.json({ entry: newEntry });
  } catch (error) {
    console.error('Error creating queue entry:', error);
    return Response.json({ error: error.message || 'Failed to create entry' }, { status: 500 });
  }
});