// Scraped daily snapshot of Gomiley's /system/pages/index/ dashboard.
// Shows the 4 KPI tiles, platforms breakdown, top dishes/customers/companies.
// Cron runs at 04:30 IL; manual refresh button forces a fresh scrape.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';

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
    const d = Math.round(h / 24);
    return `לפני ${d} ימים`;
}

export default function GomileyDashboardWidget() {
    const [snap, setSnap] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const load = async () => {
        try {
            const res = await base44.functions.getLatestGomileyDashboard({});
            const r = res?.data ?? res;
            setSnap(r?.snapshot || null);
            setError(null);
        } catch (e) { setError(e?.message); }
    };

    const refresh = async () => {
        setRefreshing(true); setError(null);
        try {
            const res = await base44.functions.captureGomileyDashboard({});
            const r = res?.data ?? res;
            if (r?.ok === false) setError(r?.reason || 'נכשל');
            await load();
        } catch (e) { setError(e?.message || String(e)); }
        finally { setRefreshing(false); }
    };

    useEffect(() => { load(); }, []);

    if (!snap) {
        return (
            <Card className="mb-4 bg-slate-50 border-slate-200" dir="rtl">
                <CardContent className="p-4 text-center">
                    <p className="text-sm text-gray-600">📊 Gomiley לוח בקרה · אין נתונים עדיין</p>
                    <Button size="sm" onClick={refresh} disabled={refreshing} className="mt-2">
                        {refreshing ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : null}
                        משוך עכשיו
                    </Button>
                    {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                </CardContent>
            </Card>
        );
    }

    const platforms = Array.isArray(snap.platforms) ? snap.platforms : [];
    const topDishes = Array.isArray(snap.top_dishes) ? snap.top_dishes : [];
    const topCustomers = Array.isArray(snap.top_customers) ? snap.top_customers : [];
    const topCompanies = Array.isArray(snap.top_companies) ? snap.top_companies : [];
    const platformsTotal = platforms.reduce((s, p) => s + (Number(p.total) || 0), 0);

    return (
        <Card className="mb-4 bg-gradient-to-br from-cyan-50 to-blue-50 border-2 border-cyan-300" dir="rtl">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h3 className="font-bold flex items-center gap-2">
                            📊 Gomiley לוח בקרה
                            <span className="text-xs font-normal text-gray-500">({snap.date_range_label || 'החודש הנוכחי'})</span>
                        </h3>
                        <p className="text-xs text-gray-500">{fmtAgo(snap.captured_at)}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={refresh} disabled={refreshing}>
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </Button>
                </div>

                {/* 4 KPI tiles */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-emerald-700">{fmtIls(snap.total_income)}</div>
                        <div className="text-xs text-gray-500 mt-1">הכנסות</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-blue-700">{snap.total_orders ?? '—'}</div>
                        <div className="text-xs text-gray-500 mt-1">הזמנות</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-purple-700">{snap.new_customers ?? '—'}</div>
                        <div className="text-xs text-gray-500 mt-1">לקוחות חדשים</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 text-center shadow-sm">
                        <div className="text-2xl font-bold text-amber-700">{snap.new_companies ?? '—'}</div>
                        <div className="text-xs text-gray-500 mt-1">חברות חדשות</div>
                    </div>
                </div>

                {/* Returning vs one-time */}
                {(snap.onetime_percent !== null && snap.onetime_percent !== undefined) && (
                    <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
                        <p className="text-xs font-bold text-gray-700 mb-2">🔁 חוזרים מול חד-פעמיים</p>
                        <div className="flex gap-2 items-center">
                            <div className="flex-1">
                                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden flex">
                                    <div
                                        className="bg-cyan-500 h-3"
                                        style={{ width: `${100 - Number(snap.onetime_percent)}%` }}
                                        title={`חוזרים: ${snap.returning_count ?? '?'}`}
                                    />
                                    <div
                                        className="bg-gray-400 h-3"
                                        style={{ width: `${Number(snap.onetime_percent)}%` }}
                                        title={`חד-פעמיים: ${snap.onetime_count ?? '?'}`}
                                    />
                                </div>
                            </div>
                            <span className="text-xs text-gray-600 whitespace-nowrap">
                                {snap.returning_count ?? '?'} חוזרים · {snap.onetime_count ?? '?'} חד-פעמיים ({Number(snap.onetime_percent).toFixed(1)}%)
                            </span>
                        </div>
                    </div>
                )}

                {/* Platforms */}
                {platforms.length > 0 && (
                    <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
                        <p className="text-xs font-bold text-gray-700 mb-2">🛵 פלטפורמות שיווק</p>
                        <table className="w-full text-xs">
                            <thead className="text-gray-500">
                                <tr>
                                    <th className="text-right py-1">שם</th>
                                    <th className="text-center">הזמנות</th>
                                    <th className="text-center">סכום</th>
                                    <th className="text-center">ממוצע</th>
                                    <th className="text-left">%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {platforms.map((p, i) => {
                                    const pct = platformsTotal > 0 ? Math.round((Number(p.total) / platformsTotal) * 1000) / 10 : 0;
                                    return (
                                        <tr key={i} className="border-t border-gray-100">
                                            <td className="font-bold py-1">{p.name}</td>
                                            <td className="text-center">{p.orders}</td>
                                            <td className="text-center">{fmtIls(p.total)}</td>
                                            <td className="text-center text-gray-600">{fmtIls(p.avg)}</td>
                                            <td className="text-left text-gray-600">{pct}%</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Top dishes / customers / companies — 3 columns */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {topDishes.length > 0 && (
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs font-bold text-gray-700 mb-2">🍽️ Top מנות</p>
                            <div className="space-y-1 text-xs">
                                {topDishes.slice(0, 5).map((d, i) => (
                                    <div key={i} className="flex justify-between">
                                        <span className="truncate ml-2">{d.rank}. {d.name}</span>
                                        <span className="text-gray-600 whitespace-nowrap">×{d.orders} · {fmtIls(d.total)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {topCustomers.length > 0 && (
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs font-bold text-gray-700 mb-2">⭐ Top לקוחות חוזרים</p>
                            <div className="space-y-1 text-xs">
                                {topCustomers.slice(0, 5).map((c, i) => (
                                    <div key={i} className="flex justify-between">
                                        <span className="truncate ml-2">{c.rank}. {c.name}</span>
                                        <span className="text-gray-600 whitespace-nowrap">×{c.orders} · {fmtIls(c.total)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {topCompanies.length > 0 && (
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs font-bold text-gray-700 mb-2">🏢 Top חברות</p>
                            <div className="space-y-1 text-xs">
                                {topCompanies.slice(0, 5).map((c, i) => (
                                    <div key={i} className="flex justify-between">
                                        <span className="truncate ml-2">{c.rank}. {c.name}</span>
                                        <span className="text-gray-600 whitespace-nowrap">×{c.orders} · {fmtIls(c.total)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
            </CardContent>
        </Card>
    );
}
