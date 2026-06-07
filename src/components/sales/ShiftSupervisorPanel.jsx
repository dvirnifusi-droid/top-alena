import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import ActivateGoalDialog from './ActivateGoalDialog';

export default function ShiftSupervisorPanel() {
    const [goals, setGoals] = useState([]);
    const [shiftStaff, setShiftStaff] = useState([]);
    const [showActivate, setShowActivate] = useState(false);
    const [busyKey, setBusyKey] = useState(null);
    const lastTapRef = useRef({}); // goalId -> { waiterId, ts } for long-press undo

    const load = async () => {
        try {
            const data = await base44.functions.getActiveSalesGoals({});
            setGoals(data.goals || []);
            // Load on-shift staff so we can render per-waiter buttons even if they
            // haven't sold yet.
            if (data.shift) {
                const shifts = await base44.entities.WorkShift.filter({ date: data.shift.date, shift_type: data.shift.type });
                const staffMap = new Map();
                for (const ws of (shifts || [])) {
                    for (const a of (ws.assigned_staff || [])) {
                        if (a.employee_id && !staffMap.has(a.employee_id)) {
                            staffMap.set(a.employee_id, { id: a.employee_id, name: a.employee_name });
                        }
                    }
                }
                setShiftStaff([...staffMap.values()]);
            }
        } catch (e) { console.warn('[ShiftSupervisorPanel] load failed', e); }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        window.addEventListener('sales:goal-activated', onChange);
        window.addEventListener('sales:goal-completed', onChange);
        const interval = setInterval(load, 15000);
        return () => {
            window.removeEventListener('sales:credited', onChange);
            window.removeEventListener('sales:goal-activated', onChange);
            window.removeEventListener('sales:goal-completed', onChange);
            clearInterval(interval);
        };
    }, []);

    const countFor = (goal, waiterId) =>
        goal.leaderboard?.find(l => l.id === waiterId)?.count || 0;

    const tap = async (goal, waiter) => {
        const key = `${goal.id}-${waiter.id}`;
        if (busyKey === key) return;
        setBusyKey(key);
        try {
            await base44.functions.creditSale({ goal_id: goal.id, waiter_id: waiter.id });
            lastTapRef.current[goal.id] = { waiterId: waiter.id, ts: Date.now() };
            window.dispatchEvent(new CustomEvent('sales:credited', { detail: { goal_id: goal.id } }));
        } catch (e) {
            console.warn('[creditSale] failed', e);
            alert(e?.message || 'שגיאה');
        } finally {
            setBusyKey(null);
        }
    };

    const undo = async (goal) => {
        const last = lastTapRef.current[goal.id];
        if (!last) return alert('אין מכירה לבטל');
        if (Date.now() - last.ts > 60_000) return alert('חלון ביטול נסגר (60 שניות)');
        try {
            await base44.functions.undoLastSale({ goal_id: goal.id, waiter_id: last.waiterId });
            window.dispatchEvent(new CustomEvent('sales:credited', { detail: { goal_id: goal.id } }));
            delete lastTapRef.current[goal.id];
        } catch (e) {
            alert(e?.message || 'שגיאה');
        }
    };

    const close = async (goal) => {
        if (!confirm(`לסגור את היעד "${goal.dish_label}"? זה ייצור Story מסכמת.`)) return;
        try {
            await base44.functions.closeSalesGoal({ goal_id: goal.id });
            await load();
        } catch (e) {
            alert(e?.message || 'שגיאה');
        }
    };

    if (goals.length === 0 && shiftStaff.length === 0) {
        return (
            <Card className="mb-4 border-2 border-dashed border-gray-300">
                <CardContent className="p-4 text-center">
                    <p className="text-gray-600 mb-3">הצוות שלך עוד לא מתחרה.</p>
                    <Button onClick={() => setShowActivate(true)}><Plus className="w-4 h-4 ml-1" /> הפעל יעד</Button>
                </CardContent>
                <ActivateGoalDialog open={showActivate} onClose={() => setShowActivate(false)} onActivated={load} />
            </Card>
        );
    }

    return (
        <Card className="mb-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold">🎯 יעדי המשמרת</h3>
                    <Button size="sm" onClick={() => setShowActivate(true)}><Plus className="w-4 h-4 ml-1" /> יעד</Button>
                </div>
                {goals.map(goal => (
                    <div key={goal.id} className="mb-4 last:mb-0 bg-white rounded-lg p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-bold">{goal.emoji} {goal.dish_label} — {goal.current_count}/{goal.target}</span>
                            <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => undo(goal)} title="ביטול אחרון (60s)"><X className="w-4 h-4" /></Button>
                                <Button size="sm" variant="outline" onClick={() => close(goal)}>סגור</Button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {shiftStaff.map(w => (
                                <Button
                                    key={w.id}
                                    size="sm"
                                    variant={countFor(goal, w.id) > 0 ? 'default' : 'outline'}
                                    onClick={() => tap(goal, w)}
                                    disabled={busyKey === `${goal.id}-${w.id}`}
                                    className="text-xs"
                                >
                                    {w.name} {countFor(goal, w.id)}
                                </Button>
                            ))}
                            {shiftStaff.length === 0 && <span className="text-xs text-gray-500">אין צוות משובץ למשמרת</span>}
                        </div>
                    </div>
                ))}
            </CardContent>
            <ActivateGoalDialog open={showActivate} onClose={() => setShowActivate(false)} onActivated={load} />
        </Card>
    );
}
