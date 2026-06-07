import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

export default function WeeklyPersonalGoal() {
    const [goal, setGoal] = useState(null);

    const load = async () => {
        try {
            const data = await base44.functions.getMyWeeklyGoal();
            setGoal(data.goal);
        } catch { /* swallow */ }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        return () => window.removeEventListener('sales:credited', onChange);
    }, []);

    if (!goal) return null;
    const pct = Math.min(100, Math.round((goal.current_count / Math.max(1, goal.target)) * 100));
    const remaining = Math.max(0, goal.target - goal.current_count);

    return (
        <Card className="mb-4 bg-blue-50 border-blue-200">
            <CardContent className="p-3">
                <div className="flex justify-between text-sm font-bold mb-1">
                    <span>🎯 היעד שלך לשבוע: {goal.target} מכירות</span>
                    <span>{goal.current_count}/{goal.target}</span>
                </div>
                <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-blue-700 mt-1">
                    {goal.is_awarded
                        ? '🏆 השגת את היעד! בונוס שולם.'
                        : `עוד ${remaining} ותקבל בונוס ${goal.reward_coins} 🪙`}
                </p>
            </CardContent>
        </Card>
    );
}
