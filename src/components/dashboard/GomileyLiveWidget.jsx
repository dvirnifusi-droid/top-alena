// Live Gomiley delivery widget — pulls the latest snapshot the server
// captured every 5 min from /system/pages/orders/ajax.php. Shows totals,
// per-source breakdown, cash orders, and the order list. Mounted on the
// Dashboard right under BeecommLiveWidget.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle } from 'lucide-react';

function fmtIls(n) {
    return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL');
}

function fmtAgo(ts) {
    if (!ts) return '';
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) return '';
    const ms = Date.now() - t;
    const m = Math.round(ms / 60000);
    if (m < 1) return 'עכשיו';
    if (m < 60) return `לפני ${m} דק׳`;
    const h = Math.round(m / 60);
    if (h < 24) return `לפני ${h} שעות`;
    return `לפני ${Math.round(h / 24)} ימים`;
}

export default function GomileyLiveWidget() {
    const [snap, setSnap] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [combined, setCombined] = useState(null);

    const load = async () => {
        try {
            const [snapRes, comRes] = await Promise.all([
                base44.functions.getLatestGomileySnapshot({}),
                base44.functions.getCombinedRevenueToday({}),
            ]);
            const s = snapRes?.data ?? snapRes;
            const c = comRes?.data ?? comRes;
            setSnap(s?.snapshot || null);
            setCombined(c || null);
            setError(null);
        } catch (e) { setError(e?.message); }
    };

    const refresh = async () => {
        setRefreshing(true); setError(null);
        try {
            const res = await base44.functions.captureGomileySnapshot({});
            const r = res?.data ?? res;
            if (r?.ok === false) setError(r?.reason || 'נכשל');
            await load();
        } catch (e) {
            setError('שגיאה: ' + (e?.message || e));
        } finally { setRefreshing(false); }
    };

    useEffect(() => {
        load();
        const i = setInterval(load, 30_000);
        return () => clearInterval(i);
    }, []);

    if (!snap) {
        return (
            <Card className="mb-4 bg-orange-50 border-orange-200">
                <CardContent className="p-4 text-center">
                    <p className="text-sm text-gray-700">🛵 Gomiley · אין נתונים עדיין</p>
                    <Button size="sm" onClick={refresh} disabled={refreshing} className="mt-2">
                        {refreshing ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'משוך עכשיו'}
                    </Button>
                    {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                </CardContent>
            </Card>
        );
    }

    const orders = Array.isArray(snap.orders) ? snap.orders : [];
    // Source rollup
    const bySource = orders.reduce((m, o) => {
        const src = o.source || 'אחר';
        if (!m[src]) m[src] = { count: 0, amount: 0, cash_count: 0, cash_amount: 0 };
        m[src].count++;
        m[src].amount += Number(o.amount) || 0;
        if (o.is_cash_guess) {
            m[src].cash_count++;
            m[src].cash_amount += Number(o.amount) || 0;
        }
        return m;
    }, {});
    const sourceRows = Object.entries(bySource).sort((a, b) => b[1].amount - a[1].amount);

    return (
        <>
            {combined && (
                <Card className="mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300">
                    <CardContent className="p-3">
                        <p className="text-xs font-bold text-emerald-800 mb-1">💰 סה״כ היום משולב (Beecomm + Gomiley)</p>
                        <div className="flex items-baseline justify-between flex-wrap">
                            <div className="text-2xl font-bold text-emerald-700">{fmtIls(combined.combined_total)}</div>
                            <div className="text-xs text-gray-600">
                                Beecomm: {fmtIls(combined.beecomm?.total)} · Gomiley: {fmtIls(combined.gomiley?.total)}
                            </div>
                        </div>
                        <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                            💵 הערכת מזומן היום: {fmtIls(combined.cash_today_approx)}
                            <span className="text-gray-500"> · קופה Beecomm פתוח {fmtIls(combined.beecomm?.open_money)} + {combined.gomiley?.cash_count || 0} משלוחי Gomiley מזומן ({fmtIls(combined.gomiley?.cash_amount)})</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="mb-4 bg-gradient-to-br from-orange-50 to-amber-50 border-2 border-orange-300" dir="rtl">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <h3 className="font-bold flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                🛵 Gomiley Live
                            </h3>
                            <p className="text-xs text-gray-500">{fmtAgo(snap.captured_at)}</p>
                        </div>
                        <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing}>
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                            <div className="text-2xl font-bold text-orange-700">{fmtIls(snap.total_income)}</div>
                            <div className="text-xs text-gray-500 mt-1">סה״כ היום</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                            <div className="text-2xl font-bold text-blue-700">{snap.total_orders || 0}</div>
                            <div className="text-xs text-gray-500 mt-1">משלוחים</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                            <div className="text-2xl font-bold text-emerald-700">{fmtIls(snap.cash_orders_amount)}</div>
                            <div className="text-xs text-gray-500 mt-1">💵 מזומן ({snap.cash_orders_count || 0})</div>
                        </div>
                        <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                            <div className="text-2xl font-bold text-red-600">{snap.cancelled_orders || 0}</div>
                            <div className="text-xs text-gray-500 mt-1">מבוטלות</div>
                        </div>
                    </div>

                    {sourceRows.length > 0 && (
                        <div className="bg-white rounded-lg p-3 shadow-sm mb-3">
                            <p className="text-xs font-bold text-gray-700 mb-2">🛵 פר מקור</p>
                            <div className="space-y-1">
                                {sourceRows.map(([src, v]) => (
                                    <div key={src} className="flex justify-between text-sm">
                                        <span className="font-bold">{src}</span>
                                        <span className="text-gray-600">
                                            {v.count} משלוחים · {fmtIls(v.amount)}
                                            {v.cash_count > 0 ? ` · 💵 ${v.cash_count}` : ''}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {orders.length > 0 && (
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs font-bold text-gray-700 mb-2">📋 הזמנות אחרונות ({orders.length})</p>
                            <div className="space-y-1 max-h-60 overflow-y-auto">
                                {orders.slice(0, 10).map(o => (
                                    <div key={o.id} className="flex justify-between text-xs border-b pb-1">
                                        <span>
                                            <span className="font-bold">{o.customer}</span>
                                            {' · '}
                                            <span className="text-gray-500">{o.source}</span>
                                            {o.is_cash_guess && <span className="text-amber-700 mr-1">💵</span>}
                                        </span>
                                        <span className="text-gray-600">{fmtIls(o.amount)} · {o.delivery_at}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-700 flex items-start gap-1">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <span>{error}{error?.includes('session') && ' — הPHPSESSID של Gomiley פג. דבר עם דביר ניפוסי לרענן.'}</span>
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
    );
}
