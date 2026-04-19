import { createClient } from 'npm:@base44/sdk@0.8.25';

const base44 = createClient({ appId: Deno.env.get('BASE44_APP_ID') });

Deno.serve(async (req) => {
  try {
    const profiles = await base44.asServiceRole.entities.RestaurantProfile.list();
    const enabled = profiles.length > 0 ? profiles[0].geofencing_enabled !== false : false;
    return Response.json({ enabled });
  } catch (error) {
    return Response.json({ enabled: false });
  }
});