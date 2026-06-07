// One-shot recovery UI — owner clicks the button, calls reopenAutoClosedShifts,
// shows what came back. Hidden admin page; not in the sidebar.
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export default function AdminReopenShifts() {
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const run = async () => {
        setRunning(true);
        setError(null);
        setResult(null);
        try {
            const res = await base44.functions.reopenAutoClosedShifts({ maxAgeHours: 36 });
            const r = res?.data ?? res;
            setResult(r);
        } catch (e) {
            setError(e?.message || String(e));
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="p-6 max-w-2xl mx-auto" dir="rtl">
            <h1 className="text-2xl font-bold mb-2">🔧 שחזור משמרות שנסגרו אוטומטית</h1>
            <p className="text-sm text-gray-600 mb-4">
                מחפש משמרות שנסגרו אוטומטית ב-36 השעות האחרונות (geofence / 4h / 16h)
                ומחזיר אותן למצב פתוח כדי שתוכל לסגור אותן ידנית עם השעה הנכונה.
            </p>

            <Card className="mb-4">
                <CardContent className="p-6 text-center">
                    <Button onClick={run} disabled={running} size="lg" className="w-full max-w-xs">
                        {running ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : null}
                        {running ? 'מריץ...' : '🚀 הפעל שחזור'}
                    </Button>
                </CardContent>
            </Card>

            {error && (
                <Card className="mb-4 border-red-300 bg-red-50">
                    <CardContent className="p-4">
                        <p className="font-bold text-red-700">שגיאה</p>
                        <p className="text-sm text-red-600 mt-1">{error}</p>
                    </CardContent>
                </Card>
            )}

            {result && (
                <Card className="mb-4 border-emerald-300 bg-emerald-50">
                    <CardContent className="p-4">
                        <p className="font-bold text-emerald-800 text-lg">
                            ✅ {result.reverted ?? 0} משמרות הוחזרו מתוך {result.scanned ?? 0} שנסגרו אוטומטית
                        </p>
                        {result.reverted > 0 && Array.isArray(result.details) && (
                            <div className="mt-4 space-y-2">
                                <p className="text-sm font-bold text-gray-700">פרטים:</p>
                                {result.details.map((d, i) => (
                                    <div key={i} className="bg-white rounded p-2 text-sm">
                                        <div className="font-bold">{d.employee_name}</div>
                                        <div className="text-xs text-gray-500">
                                            התחילה: {new Date(d.started_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            נסגרה אוטו: {d.was_ended_at ? new Date(d.was_ended_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '—'}
                                            {d.was_total_hours ? ` (${Number(d.was_total_hours).toFixed(2)}h)` : ''}
                                        </div>
                                        <div className="text-xs text-amber-700 mt-1">סיבה: {d.reason}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {result.reverted === 0 && result.scanned === 0 && (
                            <p className="text-sm text-gray-600 mt-2">אין משמרות לפתוח מחדש — או שהן כבר נפתחו בעבר.</p>
                        )}
                        {result.reverted === 0 && result.scanned > 0 && (
                            <div className="mt-2 p-2 bg-amber-50 rounded text-sm text-amber-800">
                                ⚠️ נמצאו {result.scanned} משמרות אבל ההחזרה נכשלה לכולן.
                                {Array.isArray(result.failures) && result.failures.length > 0 && (
                                    <div className="mt-2 text-xs">
                                        שגיאה: {result.failures[0].error}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
