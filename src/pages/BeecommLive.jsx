// Full-screen Beecomm live page. Linked from the sidebar (כספים ודוחות → קופה Live).
// Re-uses BeecommLiveWidget for the top section, then adds 7-day history.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import BeecommLiveWidget from '../components/dashboard/BeecommLiveWidget';

function fmtIls(n) {
    return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL');
}

const RANGE_OPTIONS = [
    { id: 1, label: 'היום' },
    { id: 7, label: '7 ימים' },
    { id: 14, label: 'שבועיים' },
    { id: 30, label: '30 ימים' },
    { id: 90, label: '3 חודשים' },
];

export default function BeecommLive() {
    const [history, setHistory] = useState([]);
    const [range, setRange] = useState(7);
    const [breakdown, setBreakdown] = useState(null);

    const load = async () => {
        try {
            const res = await base44.functions.getBeecommDailyHistory({ days: 7 });
            const r = res?.data ?? res;
            setHistory(r?.history || []);
        } catch { /* swallow */ }
    };

    const loadBreakdown = async (days) => {
        try {
            const res = await base44.functions.getBeecommRangeBreakdown({ days });
            setBreakdown(res?.data ?? res);
        } catch { /* swallow */ }
    };

    useEffect(() => { loadBreakdown(range); }, [range]);

    useEffect(() => {
        load();
        const i = setInterval(load, 5 * 60 * 1000); // refresh history every 5 min
        return () => clearInterval(i);
    }, []);

    const maxTotal = history.reduce((m, d) => Math.max(m, d.total), 1);
    const sum7 = history.reduce((s, d) => s + d.total, 0);
    const tips7 = history.reduce((s, d) => s + d.tips, 0);
    const avgDaily = history.length ? sum7 / history.length : 0;

    return (
        <div className="p-6 max-w-6xl mx-auto" dir="rtl">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">📊 קופה Live</h1>
                    <p className="text-sm text-gray-500">חי מ-Beecomm BeePort · מתעדכן כל 15 דק׳</p>
                </div>
                <a
                    href="https://beeport.web.app/x"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                >
                    פתח ב-BeePort <ExternalLink className="w-3 h-3" />
                </a>
            </div>

            <BeecommLiveWidget />

            {history.length > 0 && (
                <Card className="mb-4">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="font-bold">📆 שבעת הימים האחרונים</h3>
                            <div className="text-xs text-gray-500">
                                סה״כ: {fmtIls(sum7)} · ממוצע יומי: {fmtIls(avgDaily)} · טיפים: {fmtIls(tips7)}
                            </div>
                        </div>
                        <div className="flex items-end gap-2 h-32">
                            {history.map(d => {
                                const h = Math.max(8, Math.round((d.total / maxTotal) * 120));
                                const date = new Date(d.date);
                                const dayName = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][date.getDay()];
                                return (
                                    <div key={d.date} className="flex-1 flex flex-col items-center group" title={`${d.date} · ${fmtIls(d.total)} · ${fmtIls(d.tips)} טיפים`}>
                                        <span className="text-[10px] text-gray-500 mb-1">{fmtIls(d.total)}</span>
                                        <div
                                            className="w-full bg-gradient-to-t from-amber-500 to-yellow-400 rounded-t group-hover:from-amber-600 transition-colors"
                                            style={{ height: `${h}px` }}
                                        />
                                        <span className="text-xs font-bold mt-1">{dayName}</span>
                                        <span className="text-[10px] text-gray-400">{date.getDate()}.{date.getMonth() + 1}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="mb-4">
                <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <h3 className="font-bold">🔍 פילוח לפי טווח</h3>
                        <div className="flex gap-1">
                            {RANGE_OPTIONS.map(opt => (
                                <Button
                                    key={opt.id}
                                    size="sm"
                                    variant={range === opt.id ? 'default' : 'outline'}
                                    onClick={() => setRange(opt.id)}
                                    className="text-xs"
                                >
                                    {opt.label}
                                </Button>
                            ))}
                        </div>
                    </div>
                    {!breakdown && <p className="text-sm text-gray-500">טוען...</p>}
                    {breakdown && (
                        <>
                            <div className="text-xs text-gray-500 mb-3">
                                {breakdown.days_covered} ימים · סה״כ {fmtIls(breakdown.totals?.sum)} · {breakdown.totals?.diners || 0} סועדים · 💰 {fmtIls(breakdown.totals?.tips)}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="bg-blue-50 rounded-lg p-3">
                                    <p className="text-xs font-bold mb-2">🏆 מלצרים מובילים</p>
                                    <div className="space-y-1 text-xs">
                                        {(breakdown.waiters || []).slice(0, 8).map((w, i) => (
                                            <div key={i} className="flex justify-between">
                                                <span className="font-bold">{i + 1}. {w.name}</span>
                                                <span className="text-gray-600">{fmtIls(w.sum)} · {w.diners} סוע׳ · 💰{fmtIls(w.tips)}</span>
                                            </div>
                                        ))}
                                        {(breakdown.waiters || []).length === 0 && <p className="text-gray-400">אין נתונים</p>}
                                    </div>
                                </div>
                                <div className="bg-amber-50 rounded-lg p-3">
                                    <p className="text-xs font-bold mb-2">🍽️ מנות מובילות</p>
                                    <div className="space-y-1 text-xs">
                                        {(breakdown.dishes || []).slice(0, 8).map((d, i) => (
                                            <div key={i} className="flex justify-between gap-2">
                                                <span className="font-bold truncate">{i + 1}. {d.name}</span>
                                                <span className="text-gray-600 flex-shrink-0">×{d.quantity} · {fmtIls(d.sum)}</span>
                                            </div>
                                        ))}
                                        {(breakdown.dishes || []).length === 0 && <p className="text-gray-400">אין נתונים</p>}
                                    </div>
                                </div>
                                <div className="bg-emerald-50 rounded-lg p-3">
                                    <p className="text-xs font-bold mb-2">📱 פר תחנת iPad</p>
                                    <div className="space-y-1 text-xs">
                                        {(breakdown.stations || []).slice(0, 8).map((s, i) => (
                                            <div key={i} className="flex justify-between">
                                                <span className="font-bold">{s.name}</span>
                                                <span className="text-gray-600">{fmtIls(s.sum)} · 💰{fmtIls(s.tips)}</span>
                                            </div>
                                        ))}
                                        {(breakdown.stations || []).length === 0 && <p className="text-gray-400">אין נתונים</p>}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-4">
                    <h3 className="font-bold mb-2">ℹ️ איך זה עובד</h3>
                    <ul className="text-sm text-gray-700 space-y-1 list-disc pr-5">
                        <li>השרת מושך נתונים מ-Beecomm כל 15 דקות אוטומטית</li>
                        <li>הנתונים מאוחסנים אצלנו ב-DB — היסטוריה מלאה לחיזוי AI ולדוחות</li>
                        <li>אם משהו לא מעודכן — לחץ על כפתור הרענון ב-widget למעלה</li>
                        <li>הנתונים: מכירות, טיפים, כסף פתוח, צפי חודשי, פר-מלצר, Top מנות, פר תחנת iPad</li>
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
