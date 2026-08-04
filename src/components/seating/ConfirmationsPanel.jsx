import React, { useState } from 'react';
import { Reservation } from '@/entities/Reservation';
import { Loader2, Phone, Edit } from 'lucide-react';
import { confirmationState } from '@/lib/reservationStatus';

/**
 * "Who hasn't confirmed?" — the roll-up the per-reservation state couldn't give.
 *
 * The whole point is the split between two things that look identical on a
 * card: a guest who was asked and stayed silent, and a guest our message never
 * reached. The second is our failure, not theirs (~47% of business-initiated
 * WhatsApp is silently undelivered), so they are listed FIRST and framed as
 * "call them", never as a candidate for releasing the table.
 *
 * Nothing here releases anything automatically. It's a call list.
 */

const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-9);

const GROUPS = [
    {
        key: 'undelivered',
        title: '⚠️ ההודעה לא הגיעה',
        note: 'הוואטסאפ לא נמסר. אי אפשר להסיק שהם לא מגיעים — צריך לחייג.',
        cls: 'bg-amber-50 border-amber-300',
        head: 'text-amber-900',
    },
    {
        key: 'no_reply',
        title: '⏳ נמסר ולא ענו',
        note: 'קיבלו את ההודעה ולא השיבו. שווה תזכורת או טלפון לפני שמשחררים.',
        cls: 'bg-slate-50 border-slate-300',
        head: 'text-slate-800',
    },
    {
        key: 'sent',
        title: '📤 נשלח, טרם אומת',
        note: 'ההודעה יצאה ועדיין אין אישור מסירה מ-Twilio. חכו כמה דקות.',
        cls: 'bg-slate-50 border-slate-200',
        head: 'text-slate-600',
    },
];

export default function ConfirmationsPanel({ reservations, selectedDate, isToday, onRefresh, onEditReservation }) {
    const [busyId, setBusyId] = useState(null);

    const relevant = (reservations || []).filter(r =>
        r.status === 'confirmed' && !r.guest_declined_at);
    const byKey = {};
    for (const r of relevant) {
        const cs = confirmationState(r);
        if (!cs) continue;
        (byKey[cs.key] = byKey[cs.key] || []).push(r);
    }
    const confirmedCount = (byKey.confirmed || []).length;
    const notAsked = (byKey.not_asked || []).length;
    const needAttention = GROUPS.reduce((n, g) => n + (byKey[g.key] || []).length, 0);

    const markConfirmed = async (r) => {
        setBusyId(r.id);
        try {
            // The hostess phoned and they said yes — same outcome as a reply.
            await Reservation.update(r.id, { guest_confirmed_at: new Date().toISOString() });
            onRefresh?.();
        } catch (e) {
            console.error('mark confirmed failed', e);
            alert('שגיאה בסימון');
        } finally {
            setBusyId(null);
        }
    };

    const markDeclined = async (r) => {
        if (!window.confirm(`לסמן ש-${r.customer_name} לא מגיע ולבטל את ההזמנה?\n\nהשולחן ישוחרר.`)) return;
        setBusyId(r.id);
        try {
            await Reservation.update(r.id, {
                guest_declined_at: new Date().toISOString(),
                status: 'cancelled',
                cancellation_reason: 'לא אישר הגעה — בוטל ידנית',
            });
            onRefresh?.();
        } catch (e) {
            console.error('mark declined failed', e);
            alert('שגיאה בביטול');
        } finally {
            setBusyId(null);
        }
    };

    if (!isToday) {
        return (
            <div className="bg-white border rounded-xl p-6 text-center">
                <div className="text-4xl mb-2">📅</div>
                <div className="font-bold text-slate-700 text-sm">אישורי הגעה נשלחים ביום ההזמנה</div>
                <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                    בחרת תאריך אחר. ההודעה יוצאת בין שעה וחצי לשש שעות לפני ההזמנה,
                    ורק אז יש מה לעקוב אחריו.
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="bg-[#1F1B17] text-[#D9BD83] rounded-xl px-3 py-2 text-[11px] leading-snug">
                <b>{confirmedCount} אישרו הגעה ✓✓ · {needAttention} פתוחים.</b><br />
                זו רשימת טלפונים, לא רשימת ביטולים — שום שולחן לא משוחרר לבד.
                {notAsked > 0 && <> ל-{notAsked} עוד לא נשלחה בקשה (ההודעה יוצאת קרוב יותר לשעה).</>}
            </div>

            {needAttention === 0 && (
                <div className="bg-white border rounded-xl p-6 text-center">
                    <div className="text-4xl mb-2">✓✓</div>
                    <div className="font-bold text-slate-700 text-sm">אין מה לרדוף אחריו</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                        כל מי שנשלחה אליו בקשה — ענה.
                    </div>
                </div>
            )}

            {GROUPS.map(g => {
                const list = (byKey[g.key] || []).sort((a, b) =>
                    String(a.time || '').localeCompare(String(b.time || '')));
                if (!list.length) return null;
                return (
                    <div key={g.key} className={`rounded-xl border ${g.cls} overflow-hidden`}>
                        <div className="px-3 py-2">
                            <div className={`text-[13px] font-bold ${g.head}`}>{g.title} · {list.length}</div>
                            <div className="text-[11px] text-slate-600 mt-0.5 leading-snug">{g.note}</div>
                        </div>
                        <div className="bg-white/70 divide-y divide-gray-100">
                            {list.map(r => {
                                const busy = busyId === r.id;
                                const tables = Array.isArray(r.assigned_table) ? r.assigned_table.join('+') : '';
                                return (
                                    <div key={r.id} className="px-3 py-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <span className="text-[11px] font-bold text-[#A04A2E] tabular-nums shrink-0" dir="ltr">
                                                {String(r.time || '').slice(0, 5)}
                                            </span>
                                            <div className="flex-1 min-w-0 text-right">
                                                <div className="font-semibold text-[14px] text-slate-900 truncate">{r.customer_name}</div>
                                                <div className="text-[11px] text-slate-500 tabular-nums">
                                                    {r.party_size} סועדים{tables ? ` · שולחן ${tables}` : ' · ללא שולחן'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 mt-1.5">
                                            <button
                                                onClick={() => markConfirmed(r)}
                                                disabled={busy}
                                                className="flex-1 h-8 rounded-lg bg-sky-600 text-white text-[12px] font-bold disabled:opacity-50 inline-flex items-center justify-center gap-1"
                                                title="דיברתי איתו והוא מגיע"
                                            >
                                                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '✓✓'} אישר
                                            </button>
                                            {r.customer_phone && (
                                                <>
                                                    <a
                                                        href={`tel:${String(r.customer_phone).replace(/\s/g, '')}`}
                                                        className="w-11 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-slate-600"
                                                        title="חייג"
                                                    ><Phone className="w-3.5 h-3.5" /></a>
                                                    <a
                                                        href={`https://wa.me/972${phoneKey(r.customer_phone)}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="w-11 h-8 rounded-lg border border-green-200 bg-green-50 flex items-center justify-center text-green-700"
                                                        title="וואטסאפ"
                                                    >💬</a>
                                                </>
                                            )}
                                            <button
                                                onClick={() => onEditReservation?.(r)}
                                                className="w-11 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-slate-600"
                                                title="ערוך הזמנה"
                                            ><Edit className="w-3.5 h-3.5" /></button>
                                            <button
                                                onClick={() => markDeclined(r)}
                                                disabled={busy}
                                                className="w-11 h-8 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[12px]"
                                                title="לא מגיע — בטל ושחרר את השולחן"
                                            >✕</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
