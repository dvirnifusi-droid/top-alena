import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

export default function LocationSettings() {
    const [config, setConfig] = useState(null);
    const [profile, setProfile] = useState(null);
    const [employees, setEmployees] = useState([]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [loading, setLoading] = useState(true);

    const load = async () => {
        // Load each source INDEPENDENTLY — one failing call must not block the
        // whole page (a tenant with drifted RestaurantProfile columns would
        // otherwise leave the page stuck on "טוען" and unable to set location).
        try {
            const cfgRes = await base44.functions.getGeofenceConfig({});
            setConfig(cfgRes?.data || {});
        } catch (e) { console.error('getGeofenceConfig failed:', e); setConfig({}); }
        try {
            const profs = await base44.entities.RestaurantProfile.list();
            setProfile(profs?.[0] || null);
        } catch (e) { console.error('RestaurantProfile.list failed:', e); }
        try {
            const emps = await base44.entities.Employee.list();
            setEmployees(emps || []);
        } catch (e) { console.error('Employee.list failed:', e); }
        setLoading(false);
    };
    useEffect(() => {
        load();
        // Safety net: never let the page hang on "טוען" even if a request stalls.
        const t = setTimeout(() => setLoading(false), 8000);
        return () => clearTimeout(t);
    }, []);

    const captureLocation = async () => {
        if (!navigator.geolocation) { alert('GPS לא זמין במכשיר הזה'); return; }
        setSaving(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    await base44.functions.setRestaurantLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                    });
                    setMsg(`✅ נשמר: ${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
                    await load();
                } catch (e) {
                    alert('שגיאה בשמירה: ' + (e?.message || 'unknown'));
                }
                setSaving(false);
            },
            (err) => { alert('שגיאת מיקום: ' + err.message); setSaving(false); },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    };

    const toggleGlobal = async (enabled) => {
        try {
            await base44.functions.setGlobalLocationTracking({ enabled });
            await load();
        } catch (e) {
            alert('שגיאה: ' + (e?.message || 'unknown'));
        }
    };

    const toggleEmployee = async (employee_id, disabled) => {
        try {
            await base44.functions.setEmployeeLocationToggle({ employee_id, disabled });
            await load();
        } catch (e) {
            alert('שגיאה: ' + (e?.message || 'unknown'));
        }
    };

    if (loading) return <div className="p-6">טוען... <span className="text-[10px] text-slate-400">v2</span></div>;

    // Prefer coordinates from getGeofenceConfig (safe select) so a drifted
    // RestaurantProfile.list doesn't hide an already-set location.
    const lat = config?.restaurant_lat ?? profile?.restaurant_lat ?? null;
    const lng = config?.restaurant_lng ?? profile?.restaurant_lng ?? null;
    const hasLocation = lat != null && lng != null;
    const mapsHref = hasLocation
        ? `https://maps.google.com/?q=${lat},${lng}`
        : null;

    return (
        <div className="p-4 max-w-2xl mx-auto space-y-4">
            <h1 className="text-2xl font-bold">📍 הגדרות מיקום העסק <span className="text-[10px] font-normal text-slate-400">v2</span></h1>

            <Card>
                <CardContent className="p-4 space-y-3">
                    <h2 className="font-semibold">מיקום העסק</h2>
                    {hasLocation ? (
                        <p className="text-sm text-slate-600">
                            {lat.toFixed(5)}, {lng.toFixed(5)}{' '}
                            <a href={mapsHref} target="_blank" rel="noopener" className="text-[#44512C] underline">פתח במפה</a>
                        </p>
                    ) : (
                        <p className="text-sm text-orange-600">⚠️ עוד לא הוגדר מיקום — geofence כבוי.</p>
                    )}
                    <Button onClick={captureLocation} disabled={saving}>
                        📍 קבע מיקום עכשיו (השתמש ב-GPS של המכשיר)
                    </Button>
                    {msg && <p className="text-sm text-green-700">{msg}</p>}
                    <p className="text-xs text-slate-500">לחץ/י כשאת/ה עומד/ת במסעדה.</p>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="font-semibold">דרישת מיקום לכניסה למשמרת</h2>
                            <p className="text-xs text-slate-500">כשמופעל: עובדים חייבים להיות במרחק 30m מהעסק כדי להחתים כניסה. סגירה אוטומטית אחרי 500m+ ללא יציאה.</p>
                        </div>
                        <Switch
                            checked={!!(config?.tracking_required || profile?.shift_geofence_required)}
                            onCheckedChange={toggleGlobal}
                            disabled={!hasLocation}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4 space-y-2">
                    <h2 className="font-semibold">עובדים — בלי דרישת מיקום</h2>
                    <p className="text-xs text-slate-500">סמן/י עובדים שיכולים להחתים כניסה גם מחוץ למסעדה (פטור פרטני).</p>
                    <div className="divide-y">
                        {employees.map(emp => (
                            <div key={emp.id} className="flex items-center justify-between py-2">
                                <span>{emp.full_name}</span>
                                <Switch
                                    checked={!!emp.location_tracking_disabled}
                                    onCheckedChange={(v) => toggleEmployee(emp.id, v)}
                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
