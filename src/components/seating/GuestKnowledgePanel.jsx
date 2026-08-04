import React, { useState } from 'react';
import { Reservation } from '@/entities/Reservation';
import { Customer } from '@/entities/Customer';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import CustomerTagsEditor from '@/components/shared/CustomerTagsEditor';

/**
 * "Who is this?" — the customer knowledge the hostess needs while the guest is
 * standing in front of her.
 *
 * Every field here already existed on the Customer record and was shown nowhere
 * in the seating flow: the reservation sheet was a form with a name, a phone and
 * a party size. Visits, last visit, spend, coins, birthday, tags and notes were
 * all one page away at /CustomerDetails, which nobody opens mid-service.
 */

const relativeVisit = (iso) => {
    if (!iso) return null;
    const then = new Date(iso);
    if (Number.isNaN(then.getTime())) return null;
    const days = Math.floor((Date.now() - then.getTime()) / 86400000);
    if (days < 0) return null;
    if (days === 0) return 'היום';
    if (days === 1) return 'אתמול';
    if (days < 7) return `לפני ${days} ימים`;
    if (days < 31) { const w = Math.floor(days / 7); return w === 1 ? 'לפני שבוע' : `לפני ${w} שבועות`; }
    if (days < 365) { const m = Math.floor(days / 30); return m === 1 ? 'לפני חודש' : `לפני ${m} חודשים`; }
    const y = Math.floor(days / 365);
    return y === 1 ? 'לפני שנה' : `לפני ${y} שנים`;
};

// Days until an MM-DD anniversary/birthday, wrapping across the year end.
const daysUntilMMDD = (mmdd) => {
    if (!mmdd || !/^\d{2}-\d{2}$/.test(mmdd)) return null;
    const [m, d] = mmdd.split('-').map(Number);
    const now = new Date();
    let next = new Date(now.getFullYear(), m - 1, d);
    next.setHours(0, 0, 0, 0);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (next < today) next = new Date(now.getFullYear() + 1, m - 1, d);
    return Math.round((next - today) / 86400000);
};

// Visits alone tell the hostess more than the stored tier, which most tenants
// never curate. Tier wins when it's been set to something other than default.
const tierOf = (customer) => {
    const t = (customer?.loyalty_tier || '').toLowerCase();
    if (t && t !== 'regular') {
        const KNOWN = { vip: { label: 'VIP', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
                        gold: { label: 'זהב', cls: 'bg-amber-100 text-amber-800 border-amber-300' },
                        silver: { label: 'כסף', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
                        bronze: { label: 'ארד', cls: 'bg-orange-100 text-orange-800 border-orange-300' } };
        return KNOWN[t] || { label: customer.loyalty_tier, cls: 'bg-slate-100 text-slate-700 border-slate-300' };
    }
    const v = Number(customer?.total_visits || customer?.visit_count || 0);
    if (v >= 15) return { label: '⭐ VIP', cls: 'bg-amber-100 text-amber-800 border-amber-300' };
    if (v >= 5) return { label: 'לקוח קבוע', cls: 'bg-emerald-100 text-emerald-700 border-emerald-300' };
    if (v >= 2) return { label: 'חוזר', cls: 'bg-sky-100 text-sky-700 border-sky-300' };
    return { label: 'לקוח חדש', cls: 'bg-gray-100 text-gray-600 border-gray-300' };
};

const Stat = ({ value, label }) => (
    <div className="flex-1 min-w-0 text-center px-1">
        <div className="text-[15px] font-semibold text-slate-800 tabular-nums leading-tight truncate">{value}</div>
        <div className="text-[10px] text-slate-500 leading-tight">{label}</div>
    </div>
);

export default function GuestKnowledgePanel({ reservation, customer }) {
    const [notes, setNotes] = useState(customer?.notes || '');
    const [savingNotes, setSavingNotes] = useState(false);
    const [notesDirty, setNotesDirty] = useState(false);
    const [history, setHistory] = useState(null);   // null = not loaded, [] = loaded empty
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);

    if (!customer) {
        return (
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 text-center">
                <div className="text-[13px] font-semibold text-gray-600">לקוח חדש — אין היסטוריה</div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                    לא נמצא כרטיס לקוח לטלפון הזה. הוא ייווצר בהצטרפות למועדון.
                </div>
            </div>
        );
    }

    const tier = tierOf(customer);
    const visits = Number(customer.total_visits || customer.visit_count || 0);
    const spent = Number(customer.total_spent || 0);
    const avg = visits > 0 ? Math.round(spent / visits) : 0;
    const lastVisit = relativeVisit(customer.last_visit);
    const bdayIn = daysUntilMMDD(customer.birthday_mmdd);
    const annivIn = daysUntilMMDD(customer.anniversary_mmdd);

    const saveNotes = async () => {
        setSavingNotes(true);
        try {
            await Customer.update(customer.id, { notes });
            setNotesDirty(false);
        } catch (e) {
            console.error('save customer notes failed', e);
            alert('שגיאה בשמירת ההערה');
        } finally {
            setSavingNotes(false);
        }
    };

    const toggleHistory = async () => {
        const next = !historyOpen;
        setHistoryOpen(next);
        if (!next || history !== null || loadingHistory) return;
        setLoadingHistory(true);
        try {
            const rows = await Reservation.filter({ customer_phone: customer.phone }, '-date', 12);
            setHistory((rows || []).filter(r => r.id !== reservation?.id));
        } catch (e) {
            console.error('load visit history failed', e);
            setHistory([]);
        } finally {
            setLoadingHistory(false);
        }
    };

    return (
        <div className="rounded-xl border border-[#E8D9B5] bg-[#FBF7EE] overflow-hidden">
            {/* Identity + headline stats */}
            <div className="px-3 pt-2.5 pb-2">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <a
                        href={`/CustomerDetails?id=${encodeURIComponent(customer.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[#A04A2E] font-semibold hover:underline shrink-0"
                    >לכרטיס המלא ↗</a>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${tier.cls}`}>{tier.label}</span>
                </div>
                <div className="flex items-stretch divide-x divide-x-reverse divide-[#E8D9B5]">
                    <Stat value={visits || '—'} label="ביקורים" />
                    <Stat value={lastVisit || '—'} label="ביקור אחרון" />
                    <Stat value={avg ? `₪${avg}` : '—'} label="ממוצע לביקור" />
                    <Stat value={Number(customer.coin_balance || 0)} label="מטבעות" />
                </div>
            </div>

            {/* Context that changes how you greet them — read-only, derived */}
            {(bdayIn !== null && bdayIn <= 14) || (annivIn !== null && annivIn <= 14) || customer.satisfaction_status || customer.city ? (
                <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                    {bdayIn !== null && bdayIn <= 14 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-200">
                            🎂 {bdayIn === 0 ? 'יום הולדת היום!' : `יום הולדת בעוד ${bdayIn} ימים`}
                        </span>
                    )}
                    {annivIn !== null && annivIn <= 14 && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                            💜 {customer.anniversary_label || 'יום נישואים'} {annivIn === 0 ? 'היום!' : `בעוד ${annivIn} ימים`}
                        </span>
                    )}
                    {customer.satisfaction_status && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white text-slate-600 border border-slate-200">
                            שביעות רצון: {customer.satisfaction_status}
                        </span>
                    )}
                    {customer.city && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white text-slate-500 border border-slate-200">
                            📍 {customer.city}
                        </span>
                    )}
                </div>
            ) : null}

            {/* Allergies + preferences — shared with /CustomerDetails so the two
                can't drift apart. */}
            <div className="px-3 pb-2">
                <CustomerTagsEditor customer={customer} />
            </div>

            {/* Standing notes about the guest — separate from this booking's requests */}
            <div className="px-3 pb-2">
                <label className="text-[10px] text-slate-500">הערות קבועות על הלקוח</label>
                <textarea
                    value={notes}
                    onChange={e => { setNotes(e.target.value); setNotesDirty(true); }}
                    rows={2}
                    placeholder="אלרגיה, מקום מועדף, רגישויות, מה חשוב לזכור…"
                    className="w-full mt-0.5 border border-gray-200 rounded-lg px-2 py-1.5 text-[13px] bg-white resize-y focus:outline-none focus:border-[#A04A2E]"
                />
                {notesDirty && (
                    <button
                        onClick={saveNotes}
                        disabled={savingNotes}
                        className="mt-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#44512C] text-white disabled:opacity-50 inline-flex items-center gap-1"
                    >
                        {savingNotes && <Loader2 className="w-3 h-3 animate-spin" />}
                        שמור הערה
                    </button>
                )}
            </div>

            {/* Visit history — one extra query, so only on demand */}
            <button
                onClick={toggleHistory}
                className="w-full flex items-center justify-between px-3 py-2 bg-white/70 border-t border-[#E8D9B5] text-[12px] font-semibold text-slate-700"
            >
                <span className="text-slate-400 text-[11px]">{historyOpen ? '▲' : '▼'}</span>
                <span>היסטוריית ביקורים</span>
            </button>
            {historyOpen && (
                <div className="bg-white/70 px-3 pb-2 border-t border-[#F0E6D2]">
                    {loadingHistory && (
                        <div className="py-3 text-center text-[12px] text-gray-400 flex items-center justify-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> טוען…
                        </div>
                    )}
                    {!loadingHistory && history?.length === 0 && (
                        <div className="py-3 text-center text-[12px] text-gray-400">אין הזמנות קודמות</div>
                    )}
                    {!loadingHistory && history?.length > 0 && (
                        <div className="divide-y divide-gray-100">
                            {history.map(h => {
                                const d = typeof h.date === 'string' ? h.date.slice(0, 10) : format(new Date(h.date), 'yyyy-MM-dd');
                                const tbl = Array.isArray(h.assigned_table) ? h.assigned_table.join('+') : (h.assigned_table || '');
                                const STATUS = { seated: 'ישב', completed: 'הגיע', no_show: 'הבריז', cancelled: 'ביטל', confirmed: 'מאושר', pending: 'ממתין' };
                                const bad = h.status === 'no_show' || h.status === 'cancelled';
                                return (
                                    <div key={h.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                                        <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${bad ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {STATUS[h.status] || h.status || '—'}
                                        </span>
                                        <span className="flex-1 min-w-0 text-right text-slate-600 tabular-nums truncate" dir="rtl">
                                            {d} · {String(h.time || '').slice(0, 5)} · {h.party_size} סועדים{tbl ? ` · שולחן ${tbl}` : ''}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
