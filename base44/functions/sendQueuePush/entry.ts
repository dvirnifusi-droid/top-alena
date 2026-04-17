import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import webpush from 'npm:web-push@3.6.7';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const { entryId, title, body } = await req.json();

  if (!entryId || !title || !body) {
    return Response.json({ error: 'Missing params' }, { status: 400 });
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');

  if (!vapidPublicKey || !vapidPrivateKey) {
    return Response.json({ error: 'VAPID keys not configured' }, { status: 500 });
  }

  webpush.setVapidDetails(
    'mailto:info@alena-restaurant.com',
    vapidPublicKey,
    vapidPrivateKey
  );

  // שלוף את ה-subscription מה-entry
  const entry = await base44.asServiceRole.entities.QueueEntry.get(entryId);

  if (!entry?.push_subscription) {
    return Response.json({ skipped: true, reason: 'No push subscription' });
  }

  const payload = JSON.stringify({ title, body });

  await webpush.sendNotification(entry.push_subscription, payload);

  return Response.json({ success: true });
});