// Public profile-completion page — reached from the {update_link} in
// "complete your details" campaigns: /ClubUpdate?cid=<customer cuid>.
// Shows ONLY the fields the customer is missing, plus a self-service
// unsubscribe link at the bottom (spam-law requirement).
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { invokePublic } from '@/lib/publicFetch';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { isMainAlena } from '@/lib/tenant';

const CITIES = [
    'ראשון לציון', 'רחובות', 'נס ציונה', 'תל אביב', 'חולון', 'בת ים',
    'ראש העין', 'פתח תקווה', 'רמלה', 'לוד', 'באר יעקב', 'יבנה', 'אחר',
];

export default function ClubUpdate() {
    const [params] = useSearchParams();
    const cid = params.get('cid');
    const branding = useTenantBranding();
    const brandName = branding?.name || 'המסעדה';
    const isAlena = isMainAlena();

    const [profile, setProfile] = useState(null); // {first_name, has_*}
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ birthday: '', anniversary: '', city: '', cityOther: '', email: '' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);
    const [unsubscribed, setUnsubscribed] = useState(false);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    useEffect(() => {
        if (!cid) { setLoading(false); return; }
        invokePublic('clubGetProfile', { cid })
            .then(p => { setProfile(p); setUnsubscribed(!!p?.unsubscribed); })
            .catch(() => setProfile(null))
            .finally(() => setLoading(false));
    }, [cid]);

    const submit = async (e) => {
        e?.preventDefault?.();
        setError('');
        const city = form.city === 'אחר' ? form.cityOther.trim() : form.city;
        setSubmitting(true);
        try {
            const res = await invokePublic('clubUpdateProfile', {
                cid,
                birthday: form.birthday || null,
                anniversary: form.anniversary || null,
                city: city || null,
                email: form.email.trim() || null,
            });
            if (res?.ok) setDone(true);
            else setError('שגיאה — נסו שוב');
        } catch (err) {
            setError(err?.message || 'שגיאה — נסו שוב');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnsubscribe = async () => {
        if (!confirm(`להסיר אותך מרשימת הדיוור של ${brandName}?\nלא תקבל/י עוד הודעות שיווק.`)) return;
        try {
            await invokePublic('clubUnsubscribe', { cid });
            setUnsubscribed(true);
        } catch { /* ignore */ }
    };

    const Shell = ({ children }) => (
        <div dir="rtl" className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAF5E8' }}>
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-6 border" style={{ borderColor: '#D9BD83' }}>
                {children}
            </div>
        </div>
    );

    if (loading) return <Shell><p className="text-center text-gray-400 py-8">טוען...</p></Shell>;

    if (!cid || !profile) {
        return (
            <Shell>
                <div className="text-center py-6">
                    <div className="text-4xl mb-3">🤔</div>
                    <p className="font-bold text-gray-800">הקישור לא תקין או שפג תוקפו</p>
                    <p className="text-sm text-gray-500 mt-2">אפשר להירשם למועדון מחדש בכל עת דרך עמוד ההרשמה של {brandName}</p>
                </div>
            </Shell>
        );
    }

    if (unsubscribed) {
        return (
            <Shell>
                <div className="text-center py-6">
                    <div className="text-4xl mb-3">👋</div>
                    <h1 className="text-xl font-black mb-2" style={{ color: '#A04A2E' }}>הוסרת מרשימת הדיוור</h1>
                    <p className="text-sm text-gray-600">{`לא תקבל/י עוד הודעות שיווק מ${brandName}.`}<br />תמיד אפשר לחזור — נשמח לראותך 🌿</p>
                </div>
            </Shell>
        );
    }

    if (done) {
        return (
            <Shell>
                <div className="text-center py-6">
                    <div className="text-5xl mb-3">🎁</div>
                    <h1 className="text-xl font-black mb-2" style={{ color: '#A04A2E' }}>תודה {profile.first_name}!</h1>
                    <p className="text-sm text-gray-600">
                        הפרטים נשמרו — מהיום ההטבות בדרך אליך.
                        <br />{`נתראה ב${brandName}${isAlena ? ', רוטשילד 104' : (branding?.address ? ', ' + branding.address : '')} 🌿`}
                    </p>
                </div>
            </Shell>
        );
    }

    const missingAll = profile.has_birthday && profile.has_city && profile.has_anniversary && profile.has_email;

    return (
        <Shell>
            <div className="text-center mb-5">
                <h1 className="text-2xl font-black" style={{ color: '#A04A2E' }}>
                    היי {profile.first_name || ''} 👋
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                    {missingAll
                        ? 'כל הפרטים שלך כבר מעודכנים אצלנו 🎉'
                        : 'חסרים לנו כמה פרטים כדי שתקבל/י את כל ההטבות:'}
                </p>
            </div>

            {!missingAll && (
                <form onSubmit={submit} className="space-y-4">
                    {!profile.has_birthday && (
                        <div>
                            <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>🎂 תאריך לידה</label>
                            <input type="date" value={form.birthday} onChange={e => set('birthday', e.target.value)}
                                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ borderColor: '#D9BD83' }} />
                            <p className="text-[10px] text-gray-400 mt-0.5">קינוח מתנה ביום ההולדת 🎁</p>
                        </div>
                    )}
                    {!profile.has_city && (
                        <div>
                            <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>📍 עיר מגורים</label>
                            <select value={form.city} onChange={e => set('city', e.target.value)}
                                className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none" style={{ borderColor: '#D9BD83' }}>
                                <option value="">— בחרו עיר —</option>
                                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {form.city === 'אחר' && (
                                <input type="text" value={form.cityOther} onChange={e => set('cityOther', e.target.value)}
                                    className="w-full border rounded-xl px-3 py-2.5 text-sm mt-2 focus:outline-none"
                                    style={{ borderColor: '#D9BD83' }} placeholder="שם העיר" />
                            )}
                        </div>
                    )}
                    {!profile.has_anniversary && (
                        <div>
                            <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>💍 יום נישואין (אם יש)</label>
                            <input type="date" value={form.anniversary} onChange={e => set('anniversary', e.target.value)}
                                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none" style={{ borderColor: '#D9BD83' }} />
                        </div>
                    )}
                    {!profile.has_email && (
                        <div>
                            <label className="block text-sm font-bold mb-1" style={{ color: '#2E3819' }}>✉️ אימייל (אופציונלי)</label>
                            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                                className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none"
                                style={{ borderColor: '#D9BD83' }} placeholder="you@email.com" />
                        </div>
                    )}

                    {error && <p className="text-sm text-red-700 font-bold text-center">{error}</p>}

                    <button type="submit" disabled={submitting}
                        className="w-full text-white font-black py-3.5 rounded-xl text-base disabled:opacity-50"
                        style={{ background: '#A04A2E' }}>
                        {submitting ? 'שומר...' : '💾 שמרו את הפרטים שלי'}
                    </button>
                </form>
            )}

            <div className="mt-6 pt-4 border-t text-center" style={{ borderColor: '#F4ECD8' }}>
                <button onClick={handleUnsubscribe} className="text-[11px] text-gray-400 hover:text-red-600 underline">
                    {`להסרה מרשימת הדיוור של ${brandName} לחצו כאן`}
                </button>
            </div>
        </Shell>
    );
}
