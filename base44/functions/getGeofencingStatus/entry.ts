import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const profiles = await base44.asServiceRole.entities.RestaurantProfile.list();
    const enabled = profiles.length > 0 ? profiles[0].geofencing_enabled !== false : false;
    return Response.json({ enabled });
  } catch (error) {
    return Response.json({ enabled: false });
  }
});