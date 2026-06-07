// Admin-only page to set/refresh Gomiley session cookies. Owner pastes the
// 3 cookies he copied from his browser DevTools, hits save, and the server
// stores them in IntegrationSecret. Next snapshot cron tick (within 5 min)
// will use them. When the session expires (Gomiley logs the user out after
// some inactivity), owner just visits this page and pastes fresh values.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function AdminGomileyCookies() {
    const [phpSessId, setPhpSessId] = useState('');
    const [arena, setArena] = useState('');
    const [deviceToken, setDeviceToken] = useState('');
    const [restaurantId, setRestaurantId] = useState('1968');
    const [status, setStatus] = useState(null);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const loadStatus = async () => {
        try {
            const res = await base44.functions.getGomileyCookiesStatus({});
            setStatus(res?.data ?? res);
        } catch (e) { setError(e?.message); }
    };

    useEffect(() => { loadStatus(); }, []);

    const save = async () => {
        setSaving(true); setError(null); setResult(null);
        try {
            const res = await base44.functions.saveGomileyCookies({
                phpSessId, arena, deviceToken, restaurantId,
            });
            const r = res?.data ?? res;
            setResult(r);
            await loadStatus();
            // Clear inputs after successful save
            if (r?.capture_test?.ok) {
                setPhpSessId(''); setArena(''); setDeviceToken('');
            }
        } catch (e) {
            setError(e?.message || String(e));
        } finally { setSaving(false); }
    };

    return (
        <div className="p-6 max-w-3xl mx-auto" dir="rtl">
            <h1 className="text-2xl font-bold mb-2">🛵 הגדרת חיבור Gomiley</h1>
            <p className="text-sm text-gray-600 mb-4">
                מדביק את 3 הCookies מ-DevTools של Gomiley ולוחץ "שמור". זה מאפשר לשרת לשלוף משלוחים אוטומטית כל 5 דק׳.
                כשהcookies יפוגו (אחרי כמה ימים/שבועות) — חוזרים לכאן עם ערכים חדשים.
            </p>

            {status && (
                <Card className={`mb-4 ${status.has_phpsessid ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'}`}>
                    <CardContent className="p-3 text-sm">
                        <div className="flex items-center gap-2 font-bold mb-2">
                            {status.has_phpsessid ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                            סטטוס נוכחי
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>PHPSESSID: {status.has_phpsessid ? '✓ מוגדר' : '✗ חסר'}</div>
                            <div>arena: {status.has_arena ? '✓ מוגדר' : '✗ חסר'}</div>
                            <div>device_token: {status.has_device_token ? '✓ מוגדר' : '✗ חסר'}</div>
                            <div>restaurant_id: {status.restaurant_id || '—'}</div>
                            <div className="col-span-2 mt-1">
                                snapshot אחרון: {status.last_capture_at ? new Date(status.last_capture_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : 'אין עדיין'}
                                {status.last_orders_count !== null && ` · ${status.last_orders_count} משלוחים`}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="mb-4">
                <CardContent className="p-4 space-y-3">
                    <h2 className="font-bold">קלט cookies חדשים</h2>

                    <div>
                        <Label className="text-sm">PHPSESSID</Label>
                        <Input
                            value={phpSessId}
                            onChange={e => setPhpSessId(e.target.value)}
                            placeholder="4b0d6tk109j7jacb95ba3ph713"
                            className="font-mono text-xs"
                        />
                    </div>

                    <div>
                        <Label className="text-sm">arena</Label>
                        <Input
                            value={arena}
                            onChange={e => setArena(e.target.value)}
                            placeholder="d39e51eafe7ee8904f2341d9bc2185be"
                            className="font-mono text-xs"
                        />
                    </div>

                    <div>
                        <Label className="text-sm">device_token</Label>
                        <Input
                            value={deviceToken}
                            onChange={e => setDeviceToken(e.target.value)}
                            placeholder="B58E5D91-2B97-4B64-8286-771A714CB713"
                            className="font-mono text-xs"
                        />
                    </div>

                    <div>
                        <Label className="text-sm">restaurant_id (ברירת מחדל 1968 לעלינא)</Label>
                        <Input
                            value={restaurantId}
                            onChange={e => setRestaurantId(e.target.value)}
                            className="font-mono text-xs w-32"
                        />
                    </div>

                    <Button onClick={save} disabled={saving || !phpSessId || !arena} size="lg" className="w-full">
                        {saving ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : null}
                        {saving ? 'שומר ובודק חיבור...' : '💾 שמור והתחבר'}
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <Card className="mb-4 border-red-300 bg-red-50">
                    <CardContent className="p-3 text-sm text-red-700">
                        <p className="font-bold">שגיאה</p>
                        <p>{error}</p>
                    </CardContent>
                </Card>
            )}

            {result && (
                <Card className={`mb-4 ${result.capture_test?.ok ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
                    <CardContent className="p-3 text-sm">
                        <p className="font-bold mb-1">
                            {result.capture_test?.ok ? '✅ נשמר ונבדק בהצלחה!' : '⚠️ נשמר אבל הבדיקה נכשלה'}
                        </p>
                        {result.capture_test?.ok ? (
                            <div className="text-xs text-emerald-800 space-y-1">
                                <div>הזמנות שנמצאו: {result.capture_test.total_orders}</div>
                                <div>סה״כ הכנסות היום: ₪{Math.round(result.capture_test.total_income)}</div>
                                <div>משלוחי מזומן: {result.capture_test.cash_orders_count} (₪{Math.round(result.capture_test.cash_orders_amount)})</div>
                                <div className="text-emerald-600 mt-2">חזור ל-Dashboard ותראה את הwidget מתעדכן.</div>
                            </div>
                        ) : (
                            <div className="text-xs text-amber-800">
                                סיבה: {result.capture_test?.reason || 'לא ידוע'}
                                {result.capture_test?.preview && (
                                    <pre className="mt-2 text-[10px] bg-white p-2 rounded">{result.capture_test.preview}</pre>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardContent className="p-3 text-xs text-gray-600 space-y-2">
                    <p className="font-bold text-gray-800">איך להשיג את הCookies:</p>
                    <ol className="list-decimal pr-5 space-y-1">
                        <li>תפתח <a href="https://app.gomiley.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">app.gomiley.com</a> ותתחבר</li>
                        <li>F12 → טאב <b>Application</b> → <b>Cookies</b> → app.gomiley.com</li>
                        <li>תעתיק את הערכים של PHPSESSID, arena, device_token</li>
                        <li>תדביק כאן ותלחץ שמור</li>
                    </ol>
                </CardContent>
            </Card>
        </div>
    );
}
