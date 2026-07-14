import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function RewardShowcase() {
    const [data, setData] = useState({ affordable: [], locked: [], balance: 0 });
    const [redeeming, setRedeeming] = useState(null);
    const [tab, setTab] = useState('available'); // available | locked

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
                    <h3 className="font-bold text-[#3A2E1E]">💎 חנות הפרסים</h3>
                    <span className="inline-flex items-center gap-1 bg-gradient-to-r from-yellow-400 to-amber-500 text-white text-sm font-black rounded-full px-3 py-1 shadow-sm">
                        🪙 {Number(data.balance || 0).toLocaleString()}
                    </span>
                </div>

                {(() => {
                    const next = [...(data.locked || [])]
                        .filter(r => Number(r.cost || 0) > data.balance)
                        .sort((a, b) => a.cost - b.cost)[0];
                    if (next) {
                        const pct = Math.min(100, Math.round((data.balance / Math.max(1, next.cost)) * 100));
                        const need = Math.max(0, Number(next.cost || 0) - data.balance);
                        return (
                            <div className="mb-3 rounded-xl bg-[#FBF6EA] border border-[#EADFC8] p-2.5">
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                    <span className="font-bold text-[#3A2E1E]">🎯 עוד {need.toLocaleString()} 🪙 ל{next.emoji || '🎁'} {next.title}</span>
                                    <span className="text-slate-500">{pct}%</span>
                                </div>
                                <div className="h-2 bg-white rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--brand-primary, #A04A2E)' }} />
                                </div>
                            </div>
                        );
                    }
                    if ((data.affordable || []).length > 0) {
                        return <p className="text-xs font-medium mb-3" style={{ color: 'var(--brand-primary, #A04A2E)' }}>🎉 יש לך מספיק ל-{data.affordable.length} פרסים — לך תממש!</p>;
                    }
                    return null;
                })()}

                {(data.affordable.length > 0 || data.locked.length > 0) && (
                    <>
                        {/* טאבים: זמינים / נעולים */}
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => setTab('available')}
                                className="px-3 py-1.5 rounded-full text-xs font-bold transition-colors bg-slate-100 text-slate-600 hover:bg-slate-200"
                                style={tab === 'available' ? { background: 'var(--brand-primary, #A04A2E)', color: '#fff' } : undefined}
                            >
                                ✅ זמינים {data.affordable.length > 0 ? `(${data.affordable.length})` : ''}
                            </button>
                            <button
                                onClick={() => setTab('locked')}
                                className="px-3 py-1.5 rounded-full text-xs font-bold transition-colors bg-slate-100 text-slate-600 hover:bg-slate-200"
                                style={tab === 'locked' ? { background: 'var(--brand-primary, #A04A2E)', color: '#fff' } : undefined}
                            >
                                🔒 קצת עוד {data.locked.length > 0 ? `(${data.locked.length})` : ''}
                            </button>
                        </div>

                        {tab === 'available' && (
                            data.affordable.length > 0 ? (
                                <div className="flex gap-2.5 overflow-x-auto pb-2 snap-x">
                                    {data.affordable.slice(0, 10).map(r => (
                                        <div key={r.id} className="flex-shrink-0 w-24 rounded-2xl p-2.5 text-center border-2 shadow-sm snap-start hover:-translate-y-0.5 transition-transform" style={{ borderColor: 'var(--brand-primary, #A04A2E)', background: 'linear-gradient(165deg, #ffffff 0%, #F3F8EC 100%)' }}>
                                            <div className="text-3xl mb-1 leading-none">{r.emoji || '🎁'}</div>
                                            <div className="text-xs font-bold line-clamp-2 leading-tight h-8 text-[#3A2E1E]">{r.title}</div>
                                            <div className="inline-flex items-center gap-0.5 text-xs font-black text-amber-600 my-1.5">🪙 {Number(r.cost).toLocaleString()}</div>
                                            <button onClick={() => redeem(r)} disabled={redeeming === r.id} className="w-full text-xs font-bold text-white rounded-lg py-1.5 shadow-sm active:scale-95 transition-transform disabled:opacity-50" style={{ background: 'var(--brand-primary, #A04A2E)' }}>
                                                {redeeming === r.id ? '...' : 'קנה'}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 text-center py-4">עוד אין פרסים בהישג יד — אספו עוד מטבעות 🪙</p>
                            )
                        )}

                        {tab === 'locked' && (
                            data.locked.length > 0 ? (
                                <div className="flex gap-2.5 overflow-x-auto pb-2 snap-x">
                                    {data.locked.map(r => {
                                        const pct = Math.min(100, Math.round((data.balance / Math.max(1, r.cost)) * 100));
                                        const need = Math.max(0, Number(r.cost || 0) - data.balance);
                                        return (
                                            <div key={r.id} className="flex-shrink-0 w-24 rounded-2xl p-2.5 text-center border border-slate-200 bg-white shadow-sm snap-start">
                                                <div className="text-3xl mb-1 leading-none grayscale opacity-70">{r.emoji || '🎁'}</div>
                                                <div className="text-xs font-bold line-clamp-2 leading-tight h-8 text-[#3A2E1E]">{r.title}</div>
                                                <div className="text-[11px] text-slate-500 my-1">🪙 {Number(r.cost).toLocaleString()}</div>
                                                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--brand-accent, #C9A15A)' }} />
                                                </div>
                                                <div className="text-[10px] font-medium mt-1" style={{ color: 'var(--brand-primary, #A04A2E)' }}>עוד {need.toLocaleString()} 🪙</div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-400 text-center py-4">כל הפרסים כבר בהישג ידך! 🎉</p>
                            )
                        )}
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
