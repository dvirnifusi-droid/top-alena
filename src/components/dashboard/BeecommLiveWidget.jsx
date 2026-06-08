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
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) return '';
    const ms = Date.now() - t;
    const m = Math.round(ms / 60000);
    if (m < 0) return 'עכשיו';
    if (m < 1) return 'עכשיו';
    if (m < 60) return `לפני ${m} דק׳`;
    const h = Math.round(m / 60);
    if (h < 24) return `לפני ${h} שעות`;
    const d = Math.round(h / 24);
    return `לפני ${d} ימים`;
}

export default function BeecommLiveWidget() {
    const [snap, setSnap] = useState(null);
    const [yesterday, setYesterday] = useState(null);
    const [lastWithData, setLastWithData] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const load = async () => {
        try {
            const res = await base44.functions.getLatestBeecommSnapshot({});
            // base44Client wraps fn responses as { data, status } — unwrap.
            const r = res?.data ?? res;
            setSnap(r?.snapshot || null);
            setYesterday(r?.yesterday || null);
            setLastWithData(r?.last_with_data || null);
            setError(null);
        } catch (e) { setError(e?.message); }
    };

    const refresh = async () => {
        setRefreshing(true);
        setError(null);
        try {
            const res = await base44.functions.captureBeecommSnapshot({});
            const r = res?.data ?? res;
            if (r?.ok === false) {
                setError('שרת לא הצליח: ' + (r?.reason || 'לא ידוע') + (r?.error ? ' (' + r.error + ')' : ''));
            } else if (r?.error) {
                setError('שגיאה: ' + r.error);
            }
            await load();
        } catch (e) {
            setError('שגיאת רשת: ' + (e?.message || String(e)));
            console.error('[BeecommLiveWidget] refresh failed', e);
        } finally { setRefreshing(false); }
    };

    useEffect(() => {
        load();
        // Refresh display every 20s so a new snapshot (server captures every 3 min)
        // shows up within seconds of being written.
        const i = setInterval(load, 20_000);
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

    // When today is fresh (no sales yet, e.g. Z just opened), fall back to the
    // most recent snapshot that has real data — so the owner still sees the
    // waiters/dishes/payments breakdown from the last real session.
    const todayEmpty = (Number(snap.total_today) || 0) === 0
        && (!Array.isArray(snap.workers) || snap.workers.length === 0);
    const breakdownSrc = (todayEmpty && lastWithData) ? lastWithData : snap;
    const showingFallback = todayEmpty && !!lastWithData;

    const workers = Array.isArray(breakdownSrc.workers) ? breakdownSrc.workers : [];
    const topDishes = Array.isArray(breakdownSrc.top_dishes) ? breakdownSrc.top_dishes : [];
    const stations = Array.isArray(breakdownSrc.stations) ? breakdownSrc.stations : [];
    const ordersByHour = breakdownSrc.orders_by_hour || {};
    const hourKeys = Object.keys(ordersByHour).sort((a, b) => Number(a) - Number(b));
    const maxHourTotal = hourKeys.reduce((m, k) => Math.max(m, Number(ordersByHour[k]?.totalSum) || 0), 1);

    const delta = yesterday ? snap.total_today - yesterday.total_today : null;

    const fallbackDate = showingFallback
        ? new Date(breakdownSrc.captured_at).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Jerusalem' })
        : null;

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
                        <div className="text-xs text-gray-500 mt-1">סה״כ חודשי</div>
                    </div>
                </div>

                {showingFallback && (
                    <div className="bg-amber-100 border border-amber-300 rounded-lg p-2 mb-3 text-xs text-amber-900">
                        ℹ️ אין עדיין מכירות היום (Z חדש נפתח). מציג פירוט מ-{fallbackDate}
                    </div>
                )}

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
                    <div className="bg-white rounded-lg p-3 shadow-sm mb-3">
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

                <PaymentsSection payments={breakdownSrc.payments} raw={breakdownSrc.raw} />
                <ChannelsSection dineIn={breakdownSrc.dine_in} takeaway={breakdownSrc.takeaway} delivery={breakdownSrc.delivery} />
                <HarigotSection harigot={breakdownSrc.harigot} />
            </CardContent>
        </Card>
    );
}

function PaymentsSection({ payments, raw }) {
    const list = payments && typeof payments === 'object' ? Object.values(payments) : [];
    const cards = raw?.x?.creditCardTypes && typeof raw.x.creditCardTypes === 'object' ? Object.values(raw.x.creditCardTypes) : [];
    if (list.length === 0 && cards.length === 0) return null;
    const totalAll = list.reduce((s, p) => s + Number(p.sum || 0), 0);
    return (
        <div className="bg-white rounded-lg p-3 shadow-sm mb-3">
            <p className="text-xs font-bold text-gray-700 mb-2">💳 פר סוג תשלום</p>
            <div className="space-y-1">
                {list.map((p, i) => {
                    const pct = totalAll > 0 ? Math.round((Number(p.sum || 0) / totalAll) * 100) : 0;
                    return (
                        <div key={i} className="flex justify-between text-sm">
                            <span className="font-bold">{p.paymentTypeName}</span>
                            <span className="text-gray-600">{fmtIls(p.sum)} ({pct}%){p.tips > 0 ? ` · 💰${fmtIls(p.tips)}` : ''}</span>
                        </div>
                    );
                })}
            </div>
            {cards.length > 0 && (
                <div className="mt-2 pt-2 border-t">
                    <p className="text-[10px] text-gray-500 mb-1">סוגי כרטיסי אשראי</p>
                    <div className="space-y-1 text-xs">
                        {cards.map((c, i) => (
                            <div key={i} className="flex justify-between">
                                <span>{c.cardTypeName}</span>
                                <span className="text-gray-600">חיוב {fmtIls(c.sumHiuv)}{c.sumZikuy ? ` · זיכוי ${fmtIls(c.sumZikuy)}` : ''}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ChannelsSection({ dineIn, takeaway, delivery }) {
    const channels = [
        { name: '🪑 במקום', data: dineIn, color: 'bg-emerald-50 text-emerald-800' },
        { name: '🥡 איסוף', data: takeaway, color: 'bg-amber-50 text-amber-800' },
        { name: '🛵 משלוח', data: delivery, color: 'bg-blue-50 text-blue-800' },
    ];
    const any = channels.some(c => c.data && (Number(c.data.sum) || Number(c.data.count) || Number(c.data.diners)));
    if (!any) return null;
    return (
        <div className="bg-white rounded-lg p-3 shadow-sm mb-3">
            <p className="text-xs font-bold text-gray-700 mb-2">📦 פר ערוץ</p>
            <div className="grid grid-cols-3 gap-2">
                {channels.map((c, i) => {
                    const d = c.data || {};
                    return (
                        <div key={i} className={`rounded-lg p-2 text-center ${c.color}`}>
                            <div className="text-xs font-bold">{c.name}</div>
                            <div className="text-base font-bold mt-1">{fmtIls(d.sum)}</div>
                            <div className="text-[10px] mt-1">{Number(d.diners) || 0} סועדים · {Number(d.count) || 0} הזמנות</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function HarigotSection({ harigot }) {
    if (!harigot || typeof harigot !== 'object') return null;
    const rows = [
        { label: 'ביטולי פריטים', d: harigot.cancelItems },
        { label: 'ביטולי הזמנות', d: harigot.cancelOrders },
        { label: 'הנחות פריטים', d: harigot.discountItems },
        { label: 'הנחות הזמנות', d: harigot.discountOrders },
    ].filter(r => r.d && (Number(r.d.count) || Number(r.d.sum)));
    if (rows.length === 0) return null;
    return (
        <div className="bg-white rounded-lg p-3 shadow-sm">
            <p className="text-xs font-bold text-gray-700 mb-2">⚠️ ביטולים והנחות</p>
            <div className="grid grid-cols-2 gap-1 text-xs">
                {rows.map((r, i) => (
                    <div key={i} className="flex justify-between bg-amber-50 px-2 py-1 rounded">
                        <span>{r.label}</span>
                        <span className="text-amber-900 font-bold">{Number(r.d.count) || 0}{Number(r.d.sum) ? ` · ${fmtIls(r.d.sum)}` : ''}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
