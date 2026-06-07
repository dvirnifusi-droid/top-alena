import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

function gradientForPct(pct) {
    if (pct >= 100) return 'from-purple-500 to-fuchsia-600 animate-pulse';
    if (pct >= 75) return 'from-green-500 to-emerald-600';
    if (pct >= 40) return 'from-yellow-500 to-amber-600';
    return 'from-red-400 to-orange-500';
}

export default function SalesGoalsBanner() {
    const [goals, setGoals] = useState([]);
    const [shift, setShift] = useState(null);

    const load = async () => {
        try {
            const data = await base44.functions.getActiveSalesGoals({});
            setGoals(Array.isArray(data?.goals) ? data.goals : []);
            setShift(data.shift);
        } catch { /* swallow */ }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        window.addEventListener('sales:goal-activated', onChange);
        window.addEventListener('sales:goal-completed', onChange);
        const interval = setInterval(load, 20000);
        return () => {
            window.removeEventListener('sales:credited', onChange);
            window.removeEventListener('sales:goal-activated', onChange);
            window.removeEventListener('sales:goal-completed', onChange);
            clearInterval(interval);
        };
    }, []);

    if (!shift || goals.length === 0) return null;

    return (
        <Card className="mb-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0">
            <CardContent className="p-4">
                <h3 className="font-bold mb-3 text-center">🔥 הצוות מתחרה — {shift.type === 'lunch' ? 'צהריים' : 'ערב'}!</h3>
                {goals.map(g => {
                    const pct = Math.min(100, Math.round((g.current_count / Math.max(1, g.target)) * 100));
                    const lb = Array.isArray(g.leaderboard) ? g.leaderboard : [];
                    const myMsg = g.my_position === 1
                        ? `👑 אתה מוביל עם ${g.my_count}`
                        : g.my_position > 0
                            ? `אתה במקום #${g.my_position} עם ${g.my_count}${lb[0] ? ` · עוד ${lb[0].count - g.my_count + 1} ותעקוף את ${lb[0].name}` : ''}`
                            : null;
                    return (
                        <div key={g.id} className="mb-3 last:mb-0">
                            <div className="flex justify-between text-sm font-bold mb-1">
                                <span>{g.emoji} {g.dish_label}</span>
                                <span>{g.current_count}/{g.target}</span>
                            </div>
                            <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full bg-gradient-to-r ${gradientForPct(pct)} transition-all`} style={{ width: `${pct}%` }} />
                            </div>
                            {myMsg && <p className="text-xs mt-1 text-amber-200">{myMsg}</p>}
                            {!myMsg && lb[0] && (
                                <p className="text-xs mt-1 text-amber-200">👑 המוביל: {lb[0].name} ({lb[0].count})</p>
                            )}
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
