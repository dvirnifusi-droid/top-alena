import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const profiles = await base44.asServiceRole.entities.RestaurantProfile.list();
    if (profiles.length === 0) {
      return Response.json({ geofencing_enabled: false });
    }
    return Response.json({ geofencing_enabled: profiles[0].geofencing_enabled === true });
  } catch (error) {
    return Response.json({ geofencing_enabled: false });
  }
});