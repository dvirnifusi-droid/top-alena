// Shift-insights widget — only for shift supervisors (אחמש) and owner.
// Surfaces 3 things that need decision-making during the shift, derived from
// Beecomm + Gomiley snapshots. Refreshed every 60s. Quiet, not push-driven.
//
// Insights:
//   1. Stuck deliveries — Gomiley orders pending >10 min
//   2. Next-hour load — predicted diners vs current staffing
//   3. Waiter performance signal — top vs bottom in current shift
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, TrendingUp, Users } from 'lucide-react';

function fmtIls(n) { return '₪' + Math.round(Number(n) || 0).toLocaleString('he-IL'); }

export default function ShiftInsightsWidget() {
    const [data, setData] = useState(null);

    const load = async () => {
        try {
            const res = await base44.functions.getKitchenScreenData({});
            const r = res?.data ?? res;
            setData(r);
        } catch (e) { /* silent */ }
    };

    useEffect(() => {
        load();
        const i = setInterval(load, 60_000);
        return () => clearInterval(i);
    }, []);

    if (!data) return null;

    const gm = data.gomiley;
    const pred = data.predicted_hour;
    const workers = Array.isArray(data.beecomm?.workers) ? data.beecomm.workers : [];

    // Compute insights
    const insights = [];

    // 1. Stuck deliveries
    if (gm && gm.stuck_count > 0) {
        insights.push({
            level: gm.stuck_count >= 3 ? 'urgent' : 'warn',
            icon: AlertTriangle,
            title: `${gm.stuck_count} משלוחים ממתינים 10+ דק׳`,
            detail: `סך הכל ${gm.pending_count} פתוחים. שווה לוודא שהמטבח לא חוסם.`,
        });
    }

    // 2. Next-hour load
    if (pred && pred.avg_diners >= 12 && workers.length > 0) {
        const dinerPerWaiter = pred.avg_diners / workers.length;
        if (dinerPerWaiter > 8) {
            insights.push({
                level: 'warn',
                icon: TrendingUp,
                title: `ב-${pred.hour}:00 צפי ${pred.avg_diners} סועדים`,
                detail: `נכון לעכשיו ${workers.length} מלצרים = ${dinerPerWaiter.toFixed(1)} לכל אחד. שקול להוסיף מלצר.`,
            });
        }
    }

    // 3. Waiter perf gap
    if (workers.length >= 3) {
        const sorted = [...workers].sort((a, b) => (Number(b.sum) || 0) - (Number(a.sum) || 0));
        const top = sorted[0];
        const bot = sorted[sorted.length - 1];
        const gap = (Number(top.sum) || 0) - (Number(bot.sum) || 0);
        if (gap > 800 && Number(bot.sum) > 0) {
            insights.push({
                level: 'info',
                icon: Users,
                title: `פער ${fmtIls(gap)} בין מוביל ל-אחרון`,
                detail: `${top.name} ב-${fmtIls(top.sum)}, ${bot.name} ב-${fmtIls(bot.sum)}. שווה הצמדה.`,
            });
        }
    }

    if (insights.length === 0) {
        return (
            <Card className="mb-4 bg-emerald-50 border-emerald-200" dir="rtl">
                <CardContent className="p-3 text-center text-sm text-emerald-800">
                    ✓ הכל זורם — אין דברים שדורשים את תשומת הלב שלך עכשיו
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-3">
                <h3 className="font-bold text-sm mb-2">🎯 דורש את תשומת הלב שלך</h3>
                <div className="space-y-2">
                    {insights.map((ins, i) => {
                        const Icon = ins.icon;
                        const colors = ins.level === 'urgent'
                            ? 'bg-red-50 border-red-300 text-red-900'
                            : ins.level === 'warn'
                                ? 'bg-amber-50 border-amber-300 text-amber-900'
                                : 'bg-[#F4ECD8] border-[#D9BD83] text-blue-900';
                        return (
                            <div key={i} className={`border rounded-lg p-2.5 flex gap-2 ${colors}`}>
                                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 text-sm">
                                    <div className="font-bold">{ins.title}</div>
                                    <div className="text-xs mt-0.5 opacity-90">{ins.detail}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
