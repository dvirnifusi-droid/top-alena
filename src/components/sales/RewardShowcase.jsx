import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function RewardShowcase() {
    const [data, setData] = useState({ affordable: [], locked: [], balance: 0 });
    const [redeeming, setRedeeming] = useState(null);

    const loadFallback = async () => {
        // Resilient path: pull rewards + my balance directly from entity APIs
        // (same pattern as the existing GamificationCenter page).
        try {
            const me = await base44.entities.User.me();
            const [emps, allRewards] = await Promise.all([
                base44.entities.Employee.filter({ status: 'active' }).catch(() => []),
                base44.entities.Reward.filter({ is_active: true }).catch(() => []),
            ]);
            const emp = (emps || []).find(e => (e.email || '').toLowerCase() === (me?.email || '').toLowerCase());
            let bal = 0;
            if (emp) {
                const txs = await base44.entities.CoinTransaction.filter({ employee_id: emp.id, status: 'approved' }).catch(() => []);
                bal = (txs || []).reduce((s, t) => s + Number(t.amount || 0), 0);
            }
            const sorted = (allRewards || []).slice().sort((a, b) => Number(a.cost || 0) - Number(b.cost || 0));
            setData({
                affordable: sorted.filter(r => Number(r.cost || 0) <= bal),
                locked: sorted.filter(r => Number(r.cost || 0) > bal).slice(0, 6),
                balance: bal,
            });
        } catch { /* nothing else to do */ }
    };

    const load = async () => {
        try {
            const d = await base44.functions.getActiveRewardsForMe({});
            const affordable = Array.isArray(d?.affordable) ? d.affordable : [];
            const locked = Array.isArray(d?.locked) ? d.locked : [];
            // If the server returns empty in both buckets, fall back to direct
            // entity load — works around stale deploys / route quirks.
            if (affordable.length === 0 && locked.length === 0) {
                await loadFallback();
                return;
            }
            setData({
                affordable,
                locked,
                balance: Number(d?.balance) || 0,
            });
        } catch {
            await loadFallback();
        }
    };

    useEffect(() => {
        load();
        const onChange = () => load();
        window.addEventListener('sales:credited', onChange);
        return () => window.removeEventListener('sales:credited', onChange);
    }, []);

    const redeem = async (reward) => {
        setRedeeming(reward.id);
        try {
            // Same redemption flow as GamificationCenter — pending_approval CoinTransaction
            const me = await base44.entities.User.me();
            const emps = await base44.entities.Employee.filter({ status: 'active' });
            const emp = (emps || []).find(e => e.email?.toLowerCase() === me.email?.toLowerCase());
            if (!emp) throw new Error('עובד לא נמצא');
            await base44.entities.CoinTransaction.create({
                employee_id: emp.id,
                employee_name: emp.full_name,
                amount: -Number(reward.cost || 0),
                reason: `בקשת פדיון: ${reward.title}`,
                type: 'redeemed',
                trigger: 'redemption',
                status: 'pending_approval',
                redemption_reward: reward.id || reward.title,
            });
            alert('🎉 הבקשה נשלחה למנהל');
            await load();
        } catch (e) {
            alert(e?.message || 'שגיאה');
        } finally {
            setRedeeming(null);
        }
    };

    return (
        <Card className="mb-4">
            <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-bold">💎 הפרסים שלך</h3>
                    <span className="text-sm font-bold text-amber-600">{data.balance} 🪙</span>
                </div>

                {data.affordable.length > 0 && (
                    <>
                        <p className="text-xs text-gray-500 mb-2">✅ זמינים עכשיו</p>
                        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
                            {data.affordable.slice(0, 6).map(r => (
                                <div key={r.id} className="flex-shrink-0 w-28 bg-green-50 border border-green-200 rounded-lg p-2 text-center">
                                    <div className="text-2xl">{r.emoji || '🎁'}</div>
                                    <div className="text-xs font-bold mt-1 line-clamp-2">{r.title}</div>
                                    <div className="text-xs text-gray-600">{r.cost} 🪙</div>
                                    <Button size="sm" className="mt-2 w-full text-xs h-7" onClick={() => redeem(r)} disabled={redeeming === r.id}>
                                        קנה
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {data.locked.length > 0 && (
                    <>
                        <p className="text-xs text-gray-500 mb-2">🔒 קצת עוד</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {data.locked.map(r => {
                                const pct = Math.min(100, Math.round((data.balance / Math.max(1, r.cost)) * 100));
                                const need = Math.max(0, Number(r.cost || 0) - data.balance);
                                return (
                                    <div key={r.id} className="flex-shrink-0 w-28 bg-gray-50 border rounded-lg p-2 text-center">
                                        <div className="text-2xl opacity-60">{r.emoji || '🎁'}</div>
                                        <div className="text-xs font-bold mt-1 line-clamp-2">{r.title}</div>
                                        <div className="text-xs text-gray-600">{r.cost} 🪙</div>
                                        <div className="h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                                            <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-1">עוד {need}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {data.affordable.length === 0 && data.locked.length === 0 && (
                    <div className="text-center py-5">
                        <div className="text-3xl mb-1">🎁</div>
                        <p className="text-sm font-medium text-slate-600">פרסים בדרך!</p>
                        <p className="text-xs text-slate-400 mt-0.5">אספו מטבעות — המנהל יוסיף כאן פרסים לזכייה.</p>
                    </div>
                )}

                <Link to="/GamificationCenter" className="block text-center text-xs mt-3 underline" style={{ color: 'var(--brand-primary, #A04A2E)' }}>
                    כל הפרסים →
                </Link>
            </CardContent>
        </Card>
    );
}
