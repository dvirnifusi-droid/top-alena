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

export default function BeecommLive() {
    const [history, setHistory] = useState([]);

    const load = async () => {
        try {
            const r = await base44.functions.getBeecommDailyHistory({ days: 7 });
            setHistory(r?.history || []);
        } catch { /* swallow */ }
    };

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
