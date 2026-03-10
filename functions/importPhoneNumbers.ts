import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

  const { csv_url } = await req.json();

  // הורד את הקובץ
  const res = await fetch(csv_url);
  const text = await res.text();

  const lines = text.trim().split(/\r?\n/);
  // שורה ראשונה היא כותרת - דלג עליה
  const phoneLines = lines.slice(1);

  // שלוף כל מספרי הטלפון הקיימים
  const existing = await base44.asServiceRole.entities.DeliveryCustomer.list();
  const existingPhones = new Set(existing.map(c => c.customer_phone?.replace(/\s/g, '')));

  let imported = 0, skipped = 0, errors = 0;

  for (const line of phoneLines) {
    const phone = line.trim().replace(/"/g, '').replace(/\s/g, '');
    if (!phone) continue;

    if (existingPhones.has(phone)) {
      skipped++;
      continue;
    }

    try {
      await base44.asServiceRole.entities.DeliveryCustomer.create({
        customer_phone: phone,
        customer_name: 'לקוח לא מזוהה',
        total_orders: 0,
        total_spent: 0,
        orders: [],
      });
      existingPhones.add(phone);
      imported++;
    } catch (e) {
      errors++;
    }
  }

  return Response.json({ imported, skipped, errors, total: phoneLines.length });
});