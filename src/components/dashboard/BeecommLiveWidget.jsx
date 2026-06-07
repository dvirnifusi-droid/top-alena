// Live Beecomm widget — pulls the latest snapshot the server captured every
// 15 min from BeePort's /api/auth/<uid> endpoint. Visible to admin/owner
// roles on the Dashboard page.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

function fmtIls(n) {
    return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL');
}

function fmtAgo(ts) {
    if (!ts) return '';
    const ms = Date.now() - new Date(ts).getTime();
    const m = Math.round(ms / 60000);
    if (m < 1) return 'עכשיו';
    if (m < 60) return `לפני ${m} דק׳`;
    const h = Math.round(m / 60);
    return `לפני ${h} שעות`;
}

export default function BeecommLiveWidget() {
    const [snap, setSnap] = useState(null);
    const [yesterday, setYesterday] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const load = async () => {
        try {
            const r = await base44.functions.getLatestBeecommSnapshot({});
            setSnap(r?.snapshot || null);
            setYesterday(r?.yesterday || null);
            setError(null);
        } catch (e) { setError(e?.message); }
    };

    const refresh = async () => {
        setRefreshing(true);
        try {
            await base44.functions.captureBeecommSnapshot({});
            await load();
        } catch (e) {
            setError(e?.message);
        } finally { setRefreshing(false); }
    };

    useEffect(() => {
        load();
        const i = setInterval(load, 60_000); // refresh display every minute
        return () => clearInterval(i);
    }, []);

    if (!snap) {
        return (
            <Card className="mb-4 bg-slate-50 border-slate-200">
                <CardContent className="p-4 text-center">
                    <p className="text-sm text-gray-600">🔴 Beecomm Live · אין נתונים עדיין</p>
                    <Button size="sm" onClick={refresh} disabled={refreshing} className="mt-2">
                        {refreshing ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'משוך עכשיו'}
                    </Button>
                    {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                </CardContent>
            </Card>
        );
    }

    const workers = Array.isArray(snap.workers) ? snap.workers : [];
    const topDishes = Array.isArray(snap.top_dishes) ? snap.top_dishes : [];
    const stations = Array.isArray(snap.stations) ? snap.stations : [];
    const ordersByHour = snap.orders_by_hour || {};
    const hourKeys = Object.keys(ordersByHour).sort((a, b) => Number(a) - Number(b));
    const maxHourTotal = hourKeys.reduce((m, k) => Math.max(m, Number(ordersByHour[k]?.totalSum) || 0), 1);

    const delta = yesterday ? snap.total_today - yesterday.total_today : null;

    return (
        <Card className="mb-4 bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-amber-300" dir="rtl">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-bold flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            Beecomm Live
                        </h3>
                        <p className="text-xs text-gray-500">{fmtAgo(snap.captured_at)} · Z #{(snap.z_numbers_open || [])[0] || '-'}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing}>
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-amber-700">{fmtIls(snap.total_today)}</div>
                        <div className="text-xs text-gray-500 mt-1">סה״כ היום</div>
                        {delta !== null && (
                            <div className={`text-[10px] mt-1 ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {delta >= 0 ? '▲' : '▼'} {fmtIls(Math.abs(delta))} מאתמול
                            </div>
                        )}
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-blue-700">{fmtIls(snap.total_tips)}</div>
                        <div className="text-xs text-gray-500 mt-1">טיפים</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-orange-700">{fmtIls(snap.open_money)}</div>
                        <div className="text-xs text-gray-500 mt-1">כסף פתוח</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-purple-700">{fmtIls(snap.predicted_month)}</div>
                        <div className="text-xs text-gray-500 mt-1">צפי חודשי</div>
                    </div>
                </div>

                {workers.length > 0 && (
                    <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
                        <p className="text-xs font-bold text-gray-700 mb-2">👥 מלצרים במשמרת</p>
                        <div className="space-y-1">
                            {workers.slice(0, 6).map(w => (
                                <div key={w.workerId} className="flex justify-between text-sm">
                                    <span className="font-bold">{w.name}</span>
                                    <span className="text-gray-600">
                                        {w.diners} סועדים · {fmtIls(w.sum)} · 💰 {fmtIls(w.tips)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {topDishes.length > 0 && (
                    <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
                        <p className="text-xs font-bold text-gray-700 mb-2">🍽️ Top מנות היום</p>
                        <div className="space-y-1">
                            {topDishes.slice(0, 5).map(d => (
                                <div key={d.dishId} className="flex justify-between text-sm">
                                    <span>{d.name}</span>
                                    <span className="text-gray-600">×{d.quantity} · {fmtIls(d.sum)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {hourKeys.length > 0 && (
                    <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
                        <p className="text-xs font-bold text-gray-700 mb-2">📊 פר שעה</p>
                        <div className="flex items-end gap-1 h-20">
                            {hourKeys.map(h => {
                                const total = Number(ordersByHour[h]?.totalSum) || 0;
                                const diners = Number(ordersByHour[h]?.diners) || 0;
                                const height = Math.max(4, Math.round((total / maxHourTotal) * 70));
                                return (
                                    <div key={h} className="flex-1 flex flex-col items-center" title={`${h}:00 · ${fmtIls(total)} · ${diners} סועדים`}>
                                        <div className="w-full bg-amber-400 rounded-t" style={{ height: `${height}px` }} />
                                        <span className="text-[10px] text-gray-500 mt-1">{h}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {stations.length > 0 && (
                    <div className="bg-white rounded-lg p-3 shadow-sm">
                        <p className="text-xs font-bold text-gray-700 mb-2">📱 פר תחנת iPad</p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                            {stations.map((s, i) => (
                                <div key={i} className="flex justify-between bg-gray-50 px-2 py-1 rounded">
                                    <span className="font-bold">{s.stationName}</span>
                                    <span className="text-gray-600">{fmtIls(s.sum)}{s.tips > 0 ? ` · 💰${fmtIls(s.tips)}` : ''}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
