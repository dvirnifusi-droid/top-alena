// Geofence helpers — pure, no DB or network. Distance in meters between two
// WGS-84 coordinates using the haversine formula.
export const GEOFENCE_IN_RADIUS_M = 30; // must be within this to clock in
export const GEOFENCE_OUT_RADIUS_M = 500; // beyond this triggers auto-close
export const GEOFENCE_WARMUP_SECONDS = 120; // ignore heartbeat checks this long after clock-in
export const HEARTBEAT_INTERVAL_SECONDS = 120;
const EARTH_RADIUS_M = 6_371_000;
function toRad(deg) {
    return (deg * Math.PI) / 180;
}
export function distanceMeters(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
//# sourceMappingURL=geofence.js.map