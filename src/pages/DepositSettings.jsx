import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import PageGuard from '@/components/shared/PageGuard';

const DAYS = [
    { key: 'sunday', label: 'ראשון' },
    { key: 'monday', label: 'שני' },
    { key: 'tuesday', label: 'שלישי' },
    { key: 'wednesday', label: 'רביעי' },
    { key: 'thursday', label: 'חמישי' },
    { key: 'friday', label: 'שישי' },
    { key: 'saturday', label: 'שבת' },
];

function DepositSettingsInner() {
    const [settings, setSettings] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => { (async () => {
        const r = await base44.functions.getDepositSettings({});
        setSettings(r?.data || r);
    })(); }, []);

    if (!settings) return <div className="p-6 text-center text-gray-500">טוען הגדרות...</div>;

    const update = (patch) => setSettings(prev => ({ ...prev, ...patch }));
    const toggleDay = (key) => {
        const cur = Array.isArray(settings.required_weekend_days) ? settings.required_weekend_days : ['thursday','friday','saturday'];
        const next = cur.includes(key) ? cur.filter(d => d !== key) : [...cur, key];
        update({ required_weekend_days: next });
    };

    const save = async () => {
        setSaving(true);
        try {
            await base44.functions.updateDepositSettings({
                required_weekend_days: settings.required_weekend_days,
                required_midweek_min_party_size: Number(settings.required_midweek_min_party_size) || 6,
                amount_per_guest_ils: Number(settings.amount_per_guest_ils) || 30,
                event_pct: Number(settings.event_pct) || 20,
                free_cancel_hours_small: Number(settings.free_cancel_hours_small) || 3,
                free_cancel_hours_large: Number(settings.free_cancel_hours_large) || 6,
                free_cancel_hours_event: Number(settings.free_cancel_hours_event) || 24,
                small_party_threshold: Number(settings.small_party_threshold) || 6,
                provider: settings.provider || null,
                enabled: !!settings.enabled,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e) {
            alert('שגיאה בשמירה: ' + (e?.message || e));
        } finally { setSaving(false); }
    };

    const weekendDays = Array.isArray(settings.required_weekend_days) ? settings.required_weekend_days : ['thursday','friday','saturday'];

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4" dir="rtl">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-black text-gray-900">💳 הגדרות פיקדון</h1>
                <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!settings.enabled}
                        onChange={e => update({ enabled: e.target.checked })}
                        className="w-5 h-5 accent-emerald-600"
                    />
                    מערכת פיקדון פעילה
                </label>
            </div>

            {!settings.enabled && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
                    ⚠️ המערכת מושבתת — אף הזמנה לא תדרוש פיקדון. הפעל למעלה כדי שתתחיל לפעול.
                </div>
            )}

            {/* Days that require deposit */}
            <section className="bg-white border border-gray-200 rounded-2xl p-4">
                <h2 className="font-black text-base mb-2">📅 ימים שדורשים פיקדון תמיד</h2>
                <p className="text-xs text-gray-500 mb-3">בכל הזמנה בימים שתסמן — תידרש העברת פיקדון, ללא קשר למספר סועדים.</p>
                <div className="flex flex-wrap gap-2">
                    {DAYS.map(d => {
                        const active = weekendDays.includes(d.key);
                        return (
                            <button
                                key={d.key}
                                onClick={() => toggleDay(d.key)}
                                className={`px-3 py-2 rounded-xl text-sm font-bold border transition-colors
                                    ${active ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400'}`}
                            >{d.label}</button>
                        );
                    })}
                </div>
            </section>

            {/* Midweek threshold */}
            <section className="bg-white border border-gray-200 rounded-2xl p-4">
                <h2 className="font-black text-base mb-2">👥 סף סועדים לאמצע שבוע</h2>
                <p className="text-xs text-gray-500 mb-3">בימים שלא סומנו למעלה — מאיזה מספר סועדים יידרש פיקדון.</p>
                <div className="flex items-center gap-2">
                    <span className="text-sm">החל מ-</span>
                    <input
                        type="number" min="1" max="20"
                        value={settings.required_midweek_min_party_size ?? 6}
                        onChange={e => update({ required_midweek_min_party_size: e.target.value })}
                        className="w-20 text-center font-bold border border-gray-300 rounded px-2 py-1.5"
                    />
                    <span className="text-sm">סועדים ומעלה</span>
                </div>
            </section>

            {/* Amounts */}
            <section className="bg-white border border-gray-200 rounded-2xl p-4">
                <h2 className="font-black text-base mb-2">💰 סכומי פיקדון</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-bold block mb-1">לכל סועד (הזמנה רגילה)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number" min="0" max="500"
                                value={settings.amount_per_guest_ils ?? 30}
                                onChange={e => update({ amount_per_guest_ils: e.target.value })}
                                className="w-24 text-center font-bold border border-gray-300 rounded px-2 py-1.5"
                            />
                            <span className="text-sm">₪</span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1">10 סועדים = ₪{(Number(settings.amount_per_guest_ils)||30)*10}</div>
                    </div>
                    <div>
                        <label className="text-sm font-bold block mb-1">אחוז מהאירוע (13+ סועדים)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number" min="0" max="100"
                                value={settings.event_pct ?? 20}
                                onChange={e => update({ event_pct: e.target.value })}
                                className="w-24 text-center font-bold border border-gray-300 rounded px-2 py-1.5"
                            />
                            <span className="text-sm">%</span>
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1">דוגמה: אירוע 30 סועדים × ₪220 = ₪{30*220} → פיקדון {Number(settings.event_pct)||20}% = ₪{Math.round(30*220*((Number(settings.event_pct)||20)/100))}</div>
                    </div>
                </div>
            </section>

            {/* Cancellation policy */}
            <section className="bg-white border border-gray-200 rounded-2xl p-4">
                <h2 className="font-black text-base mb-2">⏰ חלון ביטול ללא חיוב</h2>
                <p className="text-xs text-gray-500 mb-3">תוך הזמן שתגדיר לפני שעת ההזמנה — לקוח יכול לבטל בלי שהפיקדון יחויב.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                        <label className="text-sm font-bold block mb-1">קבוצה קטנה</label>
                        <div className="flex items-center gap-2">
                            <span className="text-sm">עד</span>
                            <input type="number" min="1" max="48" value={settings.small_party_threshold ?? 6} onChange={e => update({ small_party_threshold: e.target.value })} className="w-16 text-center border rounded px-2 py-1" />
                            <span className="text-sm">סועדים, ביטול עד</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <input type="number" min="0" max="168" value={settings.free_cancel_hours_small ?? 3} onChange={e => update({ free_cancel_hours_small: e.target.value })} className="w-16 text-center border rounded px-2 py-1" />
                            <span className="text-sm">שעות לפני</span>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-bold block mb-1">קבוצה גדולה</label>
                        <div className="text-sm">מעל הסף הקטן — עד 12 סועדים</div>
                        <div className="flex items-center gap-2 mt-1">
                            <input type="number" min="0" max="168" value={settings.free_cancel_hours_large ?? 6} onChange={e => update({ free_cancel_hours_large: e.target.value })} className="w-16 text-center border rounded px-2 py-1" />
                            <span className="text-sm">שעות לפני</span>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-bold block mb-1">אירועים (13+)</label>
                        <div className="text-sm">כל אירוע</div>
                        <div className="flex items-center gap-2 mt-1">
                            <input type="number" min="0" max="168" value={settings.free_cancel_hours_event ?? 24} onChange={e => update({ free_cancel_hours_event: e.target.value })} className="w-16 text-center border rounded px-2 py-1" />
                            <span className="text-sm">שעות לפני</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Provider */}
            <section className="bg-white border border-gray-200 rounded-2xl p-4">
                <h2 className="font-black text-base mb-2">🏦 חברת סליקה</h2>
                <p className="text-xs text-gray-500 mb-3">בחר אחרי שתשוחח עם MAX לעסקים. מערכת התשלום בפועל תופעל אחרי חיבור הפרטים.</p>
                <select
                    value={settings.provider || ''}
                    onChange={e => update({ provider: e.target.value || null })}
                    className="border border-gray-300 rounded px-3 py-2 text-sm font-bold"
                >
                    <option value="">(לא נבחר)</option>
                    <option value="max_online">MAX Online</option>
                    <option value="tranzila">Tranzila</option>
                    <option value="payplus">PayPlus</option>
                    <option value="cardcom">Cardcom</option>
                </select>
                <div className="text-[11px] text-amber-700 mt-2">⚠️ ה-credentials של הספק (Terminal ID / API Key) ייוסיפו דרך פאנל ניהול נפרד אחרי שתבחר.</div>
            </section>

            {/* Save bar */}
            <div className="sticky bottom-4 bg-white border-2 border-emerald-300 rounded-2xl shadow-lg p-3 flex items-center justify-between">
                <div className="text-xs text-gray-600">השינויים נשמרים בלחיצה</div>
                <div className="flex items-center gap-2">
                    {saved && <span className="text-xs font-bold text-emerald-700">✅ נשמר</span>}
                    <button
                        onClick={save}
                        disabled={saving}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white font-black px-5 py-2 rounded-xl text-sm"
                    >{saving ? 'שומר...' : '💾 שמור הגדרות'}</button>
                </div>
            </div>
        </div>
    );
}

export default function DepositSettings() {
    return (
        <PageGuard pageName="DepositSettings" pageTitle="הגדרות פיקדון">
            <DepositSettingsInner />
        </PageGuard>
    );
}
