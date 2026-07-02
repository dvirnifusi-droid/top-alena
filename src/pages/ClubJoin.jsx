// Public customer-club signup page — no login required.
// Collects: full name*, phone*, city* (required), birthday, anniversary,
// email, and the marketing-consent checkbox (spam-law requirement).
// Branded with the warm Alena palette, mobile-first.
import React, { useState } from 'react';
import { invokePublic } from '@/lib/publicFetch';
import { useTenantBranding } from '@/hooks/useTenantBranding';

const CITIES = [
    'ראשון לציון', 'רחובות', 'נס ציונה', 'תל אביב', 'חולון', 'בת ים',
    'ראש העין', 'פתח תקווה', 'רמלה', 'לוד', 'באר יעקב', 'יבנה', 'אחר',
];

export default function ClubJoin() {
    const branding = useTenantBranding();
    const brandName = branding?.name || 'המסעדה';
    const [form, setForm] = useState({
        name: '', phone: '', city: '', cityOther: '',
        birthday: '', anniversary: '', email: '', consent: true,
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const submit = async (e) => {
        e?.preventDefault?.();
        setError('');
        const phone = form.phone.replace(/[^\d]/g, '');
        if (!form.name.trim()) return setError('יש למלא שם מלא');
        if (phone.length < 9) return setError('יש למלא מספר טלפון תקין');
        const city = form.city === 'אחר' ? form.cityOther.trim() : form.city;
        if (!city) return setError('יש לבחור עיר מגורים');
        setSubmitting(true);
        try {
            const res = await invokePublic('clubJoin', {
                name: form.name.trim(),
                phone,
                city,
                birthday: form.birthday || null,
                anniversary: form.anniversary || null,
                email: form.email.trim() || null,
                marketing_consent: !!form.consent,
            });
            if (res?.ok) setDone(true);
            else setError(res?.message || 'שגיאה — נסו שוב');
        } catch (err) {
            setError(err?.message || 'שגיאה — נסו שוב');
        } finally {
            setSubmitting(false);
        }
    };

    if (done) {
        return (
            <div dir="rtl" className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAF5E8' }}>
                <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center border" style={{ borderColor: '#D9BD83' }}>
                    <div className="text-6xl mb-4">🎉</div>
                    <h1 className="text-2xl font-black mb-2" style={{ color: '#A04A2E' }}>ברוכים הבאים למועדון!</h1>
                    <p className="text-gray-700 mb-4">
                        {`${form.name.split(' ')[0]}, נרשמת בהצלחה למועדון הלקוחות של ${brandName} 🌿`}
                    </p>
                    <p className="text-sm text-gray-500">
                        מהיום — הטבות, הפתעות ביום ההולדת, ועדכונים על מנות חדשות.
                        <br />נתראה ברוטשילד 104, ראשון לציון!
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div dir="rtl" className="min-h-screen p-4 md:p-8" style={{ background: '#FAF5E8' }}>
            <div className="max-w-md mx-auto">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-black" style={{ color: '#A04A2E' }}>{`🌿 מועדון הלקוחות של ${brandName}`}</h1>
                    <p className="text-gray-600 mt-2 text-sm">
                        הצטרפו חינם — הטבות, מתנה ביום ההולדת, ועדכונים לפני כולם
                    </p>
                </div>

                <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-6 space-y-4 border" style={{ borderColor: '#D9BD83' }}>
                    <div>
                        <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>שם מלא *</label>
                        <input type="text" value={form.name} onChange={e => set('name', e.target.value)}
                            className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                            style={{ borderColor: '#D9BD83' }} placeholder="ישראל ישראלי" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>טלפון נייד *</label>
                        <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                            className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                            style={{ borderColor: '#D9BD83' }} placeholder="050-0000000" />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>עיר מגורים *</label>
                        <select value={form.city} onChange={e => set('city', e.target.value)}
                            className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none"
                            style={{ borderColor: '#D9BD83' }}>
                            <option value="">— בחרו עיר —</option>
                            {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {form.city === 'אחר' && (
                            <input type="text" value={form.cityOther} onChange={e => set('cityOther', e.target.value)}
                                className="w-full border rounded-xl px-3 py-2.5 text-sm mt-2 focus:outline-none"
                                style={{ borderColor: '#D9BD83' }} placeholder="שם העיר" />
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>🎂 תאריך לידה</label>
                            <input type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)}
                                className="w-full border rounded-xl px-2 py-2.5 text-sm focus:outline-none"
                                style={{ borderColor: '#D9BD83' }} />
                            <p className="text-[10px] text-gray-400 mt-0.5">מתנה ביום ההולדת 🎁</p>
                        </div>
                        <div>
                            <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>💍 יום נישואין</label>
                            <input type="date" value={form.anniversary} onChange={e => set('anniversary', e.target.value)}
                                className="w-full border rounded-xl px-2 py-2.5 text-sm focus:outline-none"
                                style={{ borderColor: '#D9BD83' }} />
                            <p className="text-[10px] text-gray-400 mt-0.5">אם יש — חוגגים יחד 🥂</p>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>אימייל (אופציונלי)</label>
                        <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                            className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                            style={{ borderColor: '#D9BD83' }} placeholder="you@email.com" />
                    </div>

                    <label className="flex items-start gap-2 p-3 rounded-xl cursor-pointer" style={{ background: '#F4ECD8' }}>
                        <input type="checkbox" checked={form.consent} onChange={e => set('consent', e.target.checked)} className="mt-0.5" />
                        <span className="text-xs leading-relaxed" style={{ color: '#2E3819' }}>
                            {`אני מאשר/ת קבלת הודעות והטבות מ${brandName} ב-WhatsApp/SMS/מייל.`}
                            ניתן להסיר בכל רגע — משיבים "הסר" לכל הודעה.
                        </span>
                    </label>

                    {error && <p className="text-sm text-red-700 font-bold text-center">{error}</p>}

                    <button type="submit" disabled={submitting}
                        className="w-full text-white font-black py-3.5 rounded-xl text-base transition-opacity disabled:opacity-50"
                        style={{ background: '#A04A2E' }}>
                        {submitting ? 'נרשם...' : '🌿 הצטרפו למועדון'}
                    </button>
                    <p className="text-[10px] text-gray-400 text-center">
                        {brandName}
                    </p>
                </form>
            </div>
        </div>
    );
}
