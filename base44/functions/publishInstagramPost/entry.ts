import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { image_url, caption, scheduled_date } = await req.json();
    if (!image_url || !caption) return Response.json({ error: 'Missing image_url or caption' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('instagram');

    // Get Instagram user ID
    const meRes = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
    const me = await meRes.json();
    if (!me.id) return Response.json({ error: 'Failed to get Instagram user', details: me }, { status: 500 });

    // Step 1: Create media container
    const containerPayload = { image_url, caption, access_token: accessToken };
    if (scheduled_date) {
      const scheduledUnix = Math.floor(new Date(scheduled_date).getTime() / 1000);
      containerPayload.scheduled_publish_time = scheduledUnix;
    }

    const containerRes = await fetch(`https://graph.instagram.com/${me.id}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerPayload)
    });
    const container = await containerRes.json();
    if (!container.id) return Response.json({ error: 'Failed to create media container', details: container }, { status: 500 });

    // Step 2: Publish (or schedule is done automatically if scheduled_publish_time was set)
    if (!scheduled_date) {
      const publishRes = await fetch(`https://graph.instagram.com/${me.id}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: container.id, access_token: accessToken })
      });
      const published = await publishRes.json();
      if (!published.id) return Response.json({ error: 'Failed to publish', details: published }, { status: 500 });
      return Response.json({ success: true, post_id: published.id, username: me.username, scheduled: false });
    }

    return Response.json({ success: true, post_id: container.id, username: me.username, scheduled: true, scheduled_date });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});