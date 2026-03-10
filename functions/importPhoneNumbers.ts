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

  // בנה את רשימת הלקוחות החדשים
  const toCreate = [];
  for (const line of phoneLines) {
    const phone = line.trim().replace(/"/g, '').replace(/\s/g, '');
    if (!phone) continue;
    if (existingPhones.has(phone)) continue;
    existingPhones.add(phone);
    toCreate.push({
      customer_phone: phone,
      customer_name: 'לקוח לא מזוהה',
      total_orders: 0,
      total_spent: 0,
      orders: [],
    });
  }

  const skipped = phoneLines.length - toCreate.length;
  let imported = 0, errors = 0;

  // צור ב-batches של 100
  const BATCH = 100;
  for (let i = 0; i < toCreate.length; i += BATCH) {
    const batch = toCreate.slice(i, i + BATCH);
    try {
      await base44.asServiceRole.entities.DeliveryCustomer.bulkCreate(batch);
      imported += batch.length;
    } catch (e) {
      errors += batch.length;
      console.error('Batch error:', e.message);
    }
  }

  return Response.json({ imported, skipped, errors, total: phoneLines.length });
});