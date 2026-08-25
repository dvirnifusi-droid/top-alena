import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Phone, Edit } from 'lucide-react';
import TimePicker from '@/components/shared/TimePicker';

/**
 * The waitlist the hostess never saw.
 *
 * A guest who hits a full slot and presses "הירשם לרשימת המתנה" gets a Reservation
 * row with is_standby=true, no table, and status 'pending' — visually identical to
 * an ordinary unconfirmed booking on every existing screen. Nothing read the flag,
 * and `promoteStandbyReservation` (which assigns a table AND WhatsApps the guest)
 * had no caller anywhere in the app. So the promise the booking page makes —
 * "אם יתפנה שולחן נשלח לך וואטסאפ" — had nobody on the other end of it.
 */

const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-9);

const waitingSince = (r) => {
    const t = r.createdAt || r.created_date;
    if (!t) return null;
    const mins = Math.floor((Date.now() - new Date(t).getTime()) / 60000);
    if (Number.isNaN(mins) || mins < 0) return null;
    if (mins < 60) return `ממתין ${mins} דק׳`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `ממתין ${h} שע׳`;
    return `ממתין ${Math.floor(h / 24)} ימים`;
};

export default function StandbyPanel({ reservations, onRefresh, onEditReservation }) {
    const [busyId, setBusyId] = useState(null);
    const [result, setResult] = useState({});   // id -> { ok, msg }
    const [retimeId, setRetimeId] = useState(null);
    const [newTime, setNewTime] = useState('');

    // A reservation is still "waiting" only if it's flagged standby AND has no
    // table yet. is_standby is never cleared when a table is assigned from the
    // map, so without the table check a seated guest (e.g. on tables 30,31) shows
    // in BOTH the waitlist and the floor — and "remove from waitlist" would cancel
    // the whole (now-seated) booking. Having a table means it's no longer waiting.
    const list = (reservations || [])
        .filter(r => r.is_standby
            && !(Array.isArray(r.assigned_table) && r.assigned_table.length > 0)
            && !['cancelled', 'deleted', 'no_show', 'completed'].includes(r.status))
        .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

    const promote = async (r, timeOverride) => {
        setBusyId(r.id);
        setResult(prev => ({ ...prev, [r.id]: null }));
        try {
            const res = await base44.functions.promoteStandbyReservation({
                reservation_id: r.id,
                ...(timeOverride ? { new_time: timeOverride } : {}),
            });
            const d = res?.data || res || {};
            if (d.success) {
                setResult(prev => ({ ...prev, [r.id]: { ok: true, msg: `שובץ ✓ ונשלחה הודעה ללקוח` } }));
                setRetimeId(null);
                onRefresh?.();
            } else if (d.reason === 'still_full') {
                setResult(prev => ({ ...prev, [r.id]: { ok: false, msg: 'עדיין אין שולחן פנוי בשעה הזו' } }));
            } else if (d.reason === 'not_a_standby') {
                setResult(prev => ({ ...prev, [r.id]: { ok: false, msg: 'ההזמנה כבר לא ברשימת המתנה' } }));
                onRefresh?.();
            } else {
                setResult(prev => ({ ...prev, [r.id]: { ok: false, msg: 'לא הצלחנו לקדם — נסה שוב' } }));
            }
        } catch (e) {
            console.error('promote standby failed', e);
            setResult(prev => ({ ...prev, [r.id]: { ok: false, msg: e?.message || 'שגיאה' } }));
        } finally {
            setBusyId(null);
        }
    };

    const drop = async (r) => {
        if (!window.confirm(`להסיר את ${r.customer_name} מרשימת ההמתנה?\n\nההזמנה תסומן כמבוטלת. הלקוח לא יקבל הודעה אוטומטית.`)) return;
        setBusyId(r.id);
        try {
            await base44.entities.Reservation.update(r.id, { status: 'cancelled' });
            onRefresh?.();
        } catch (e) {
            console.error('drop standby failed', e);
            alert('שגיאה בהסרה');
        } finally {
            setBusyId(null);
        }
    };

    if (list.length === 0) {
        return (
            <div className="bg-white border rounded-xl p-6 text-center">
                <div className="text-4xl mb-2">🟡</div>
                <div className="font-bold text-slate-700 text-sm">אין אף אחד ברשימת המתנה</div>
                <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    לקוח שמנסה להזמין שעה מלאה בעמוד הציבורי יכול להירשם כאן,
                    ואז נבטיח לו וואטסאפ אם יתפנה שולחן.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="bg-[#1F1B17] text-[#D9BD83] rounded-xl px-3 py-2 text-[11px] leading-snug">
                <b>{list.length} ממתינים.</b> הבטחנו לכל אחד מהם וואטסאפ אם יתפנה שולחן.
                "קדם" משבץ שולחן <b>ושולח את ההודעה</b> — אל תשבץ אותם ידנית מהמפה, כי אז הם לא יידעו.
            </div>

            {list.map(r => {
                const res = result[r.id];
                const busy = busyId === r.id;
                const wait = waitingSince(r);
                return (
                    <div key={r.id} className="bg-white border border-[#E8D9B5] rounded-xl overflow-hidden">
                        <div className="px-3 py-2">
                            <div className="flex items-start justify-between gap-2">
                                <span className="text-[11px] font-bold text-[#A04A2E] tabular-nums shrink-0" dir="ltr">
                                    {String(r.time || '').slice(0, 5)}
                                </span>
                                <div className="flex-1 min-w-0 text-right">
                                    <div className="font-semibold text-[14px] text-slate-900 truncate">{r.customer_name}</div>
                                    <div className="text-[11px] text-slate-500 tabular-nums">
                                        {r.party_size} סועדים
                                        {r.standby_requested_time && r.standby_requested_time !== r.time
                                            ? ` · ביקש ${r.standby_requested_time}` : ''}
                                        {wait ? ` · ${wait}` : ''}
                                    </div>
                                    {r.special_requests && (
                                        <div className="text-[11px] text-slate-600 mt-0.5 truncate">💬 {r.special_requests}</div>
                                    )}
                                </div>
                            </div>

                            {res && (
                                <div className={`mt-1.5 text-[11px] font-semibold ${res.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {res.ok ? '✓ ' : '⚠️ '}{res.msg}
                                </div>
                            )}
                        </div>

                        {/* Retime — promoteStandbyReservation takes a new_time, which is the
                            realistic outcome of the callback: "20:00 is gone, 21:15 works?" */}
                        {retimeId === r.id && (
                            <div className="px-3 pb-2 flex gap-1.5 items-center">
                                {/* Not <input type="time"> — the native control follows the
                                    device locale and shows 11:30 PM to anyone whose phone is
                                    set to 12-hour. TimePicker is two numeric fields, always
                                    24h, and doesn't snap to 5-minute steps on iOS. */}
                                <TimePicker value={newTime} onChange={setNewTime} size="sm" />
                                <button
                                    onClick={() => newTime && promote(r, newTime)}
                                    disabled={!newTime || busy}
                                    className="h-8 px-3 rounded-lg bg-[#44512C] text-white text-[12px] font-bold disabled:opacity-40"
                                >קדם לשעה הזו</button>
                                <button
                                    onClick={() => setRetimeId(null)}
                                    className="h-8 px-2 text-[12px] text-slate-500"
                                >בטל</button>
                            </div>
                        )}

                        <div className="flex border-t border-gray-100 divide-x divide-x-reverse divide-gray-100">
                            <button
                                onClick={() => promote(r)}
                                disabled={busy}
                                className="flex-1 py-2 text-[12px] font-bold text-white bg-[#44512C] disabled:opacity-50 flex items-center justify-center gap-1"
                            >
                                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '✓'} קדם
                            </button>
                            <button
                                onClick={() => { setRetimeId(retimeId === r.id ? null : r.id); setNewTime(String(r.time || '').slice(0, 5)); }}
                                disabled={busy}
                                className="w-16 py-2 text-[12px] font-semibold text-slate-600 hover:bg-gray-50"
                                title="קדם לשעה אחרת"
                            >🕒</button>
                            {r.customer_phone && (
                                <>
                                    <a
                                        href={`tel:${String(r.customer_phone).replace(/\s/g, '')}`}
                                        className="w-12 py-2 flex items-center justify-center text-slate-600 hover:bg-gray-50"
                                        title="חייג"
                                    ><Phone className="w-3.5 h-3.5" /></a>
                                    <a
                                        href={`https://wa.me/972${phoneKey(r.customer_phone)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="w-12 py-2 flex items-center justify-center text-green-700 hover:bg-green-50"
                                        title="וואטסאפ"
                                    >💬</a>
                                </>
                            )}
                            <button
                                onClick={() => onEditReservation?.(r)}
                                className="w-12 py-2 flex items-center justify-center text-slate-600 hover:bg-gray-50"
                                title="ערוך הזמנה"
                            ><Edit className="w-3.5 h-3.5" /></button>
                            <button
                                onClick={() => drop(r)}
                                disabled={busy}
                                className="w-12 py-2 text-[13px] text-rose-600 hover:bg-rose-50"
                                title="הסר מרשימת ההמתנה"
                            >✕</button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
