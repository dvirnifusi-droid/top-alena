// Admin diagnostic + broadcast page for WhatsApp via Twilio.
// Three sections:
//   1. Status check — verifies env vars + Twilio sender are ready
//   2. Test send — type a phone number, send a test message, see exact error
//   3. Broadcast — pick audience (delivery customers / club members / inactive),
//      compose message, dry-run count + send.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, MessageCircle, CheckCircle2, AlertTriangle, Send, Users } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

function StatusSection() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    const check = async () => {
        setLoading(true);
        try {
            const res = await base44.functions.getWhatsAppStatus({});
            setStatus(res?.data ?? res);
        } catch (e) {
            setStatus({ error: e?.message || String(e) });
        } finally { setLoading(false); }
    };

    useEffect(() => { check(); }, []);

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-emerald-600" />
                        סטטוס חיבור Twilio WhatsApp
                    </h3>
                    <Button size="sm" variant="outline" onClick={check} disabled={loading}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'בדוק שוב'}
                    </Button>
                </div>

                {loading && <div className="text-center py-4"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>}

                {status && !loading && (
                    <div className="space-y-2">
                        <StatusRow label="TWILIO_ACCOUNT_SID" ok={status.has_sid} />
                        <StatusRow label="TWILIO_AUTH_TOKEN" ok={status.has_token} />
                        <StatusRow label="TWILIO_WHATSAPP_FROM" ok={status.has_from} value={status.from_masked || '—'} />
                        <StatusRow label="WhatsApp Template SID" ok={status.has_template} value={status.template_masked} />
                        <StatusRow label="Sender registered with Twilio" ok={status.sender_ok === true} warn={status.sender_ok === false} sub={status.sender_error || (status.sender_ok ? 'מספר אושר ופעיל' : null)} />
                    </div>
                )}

                {status?.error && <p className="text-red-700 text-sm mt-2">❌ {status.error}</p>}
            </CardContent>
        </Card>
    );
}

function StatusRow({ label, ok, warn, value, sub }) {
    return (
        <div className="flex items-start gap-2 text-sm">
            {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                : warn ? <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />}
            <div className="flex-1">
                <div className="font-bold text-gray-800">{label}</div>
                {value && <div className="text-xs text-gray-500 font-mono">{value}</div>}
                {sub && <div className={`text-xs mt-0.5 ${warn ? 'text-amber-700' : ok ? 'text-emerald-700' : 'text-red-700'}`}>{sub}</div>}
            </div>
        </div>
    );
}

function TestSendSection() {
    const brandName = useTenantBranding()?.name || 'המסעדה';
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState(`שלום! זו בדיקה מ-${brandName} 🌿`);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    const send = async () => {
        const cleanPhone = phone.trim();
        if (!/^(\+?972|0)\d{8,9}$/.test(cleanPhone.replace(/[\s-]/g, ''))) {
            alert('פורמט טלפון לא תקין. דוגמה: 0501234567 או +972501234567');
            return;
        }
        setSending(true); setResult(null);
        try {
            const res = await base44.functions.sendWhatsApp({ to: cleanPhone, message });
            setResult(res?.data ?? res);
        } catch (e) {
            setResult({ error: e?.message || String(e) });
        } finally { setSending(false); }
    };

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4">
                <h3 className="font-bold text-lg flex items-center gap-2 mb-3">
                    <Send className="w-5 h-5 text-[#44512C]" />
                    שליחת בדיקה
                </h3>
                <div className="space-y-2">
                    <Label className="text-xs">מספר טלפון (E.164 או ישראלי)</Label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0501234567 או +972501234567" dir="ltr" />
                    <Label className="text-xs">הודעה</Label>
                    <Textarea rows={3} value={message} onChange={e => setMessage(e.target.value)} />
                    <Button onClick={send} disabled={sending || !phone} className="bg-[#44512C] hover:bg-[#44512C]">
                        {sending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Send className="w-4 h-4 ml-2" />}
                        שלח בדיקה
                    </Button>
                </div>
                {result && (
                    <div className={`mt-3 p-3 rounded-lg text-sm ${result.success ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-red-50 border border-red-200 text-red-900'}`}>
                        {result.success
                            ? <>✅ נשלח · SID: <code className="text-xs">{result.sid}</code></>
                            : <>❌ {result.error || result.message || 'נכשל'}</>}
                    </div>
                )}
                <div className="mt-3 text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded p-2">
                    💡 <b>שים לב:</b> בלי template מאושר, הודעות חופשיות עובדות רק אם הלקוח פנה אליך ב-24 השעות האחרונות. עבור שליחה יזומה — דרוש template.
                </div>
            </CardContent>
        </Card>
    );
}

function BroadcastSection() {
    const brandName = useTenantBranding()?.name || 'המסעדה';
    const [audience, setAudience] = useState('delivery_customers');
    const [message, setMessage] = useState('');
    const [count, setCount] = useState(null);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    const audiences = [
        { id: 'delivery_customers', label: 'מועדון לקוחות משלוחים (כל הלקוחות)', icon: '🛵' },
        { id: 'delivery_inactive_30d', label: 'לקוחות משלוחים — לא הזמינו 30+ יום', icon: '😴' },
        { id: 'reservations_past_30d', label: 'לקוחות שהזמינו ב-30 יום אחרונים', icon: '🪑' },
    ];

    const previewCount = async () => {
        setCount('...');
        try {
            const res = await base44.functions.previewWhatsAppBroadcast({ audience });
            const r = res?.data ?? res;
            setCount(r?.count ?? 'err');
        } catch (e) { setCount('err: ' + (e?.message || '')); }
    };

    useEffect(() => { previewCount(); }, [audience]);

    const send = async () => {
        if (!message.trim()) { alert('כתוב הודעה לפני שליחה'); return; }
        if (!confirm(`לשלוח את ההודעה ל-${count} נמענים? פעולה זו לא ניתנת לביטול.`)) return;
        setSending(true); setResult(null);
        try {
            const res = await base44.functions.sendWhatsAppBroadcast({ audience, message });
            setResult(res?.data ?? res);
        } catch (e) {
            setResult({ error: e?.message || String(e) });
        } finally { setSending(false); }
    };

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4">
                <h3 className="font-bold text-lg flex items-center gap-2 mb-3">
                    <Users className="w-5 h-5 text-[#A04A2E]" />
                    שליחת broadcast שיווקי
                </h3>

                <div className="space-y-3">
                    <Label className="text-xs">קהל יעד</Label>
                    <div className="space-y-1">
                        {audiences.map(a => (
                            <label key={a.id} className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${audience === a.id ? 'bg-[#F4ECD8] border-[#D9BD83]' : 'bg-white border-gray-200'}`}>
                                <input type="radio" checked={audience === a.id} onChange={() => setAudience(a.id)} />
                                <span className="text-sm">{a.icon} {a.label}</span>
                            </label>
                        ))}
                    </div>

                    <div className="bg-gray-50 rounded p-2 text-sm flex items-center justify-between">
                        <span>נמענים בקהל זה:</span>
                        <span className="font-bold">{count === '...' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : count}</span>
                    </div>

                    <Label className="text-xs">הודעה</Label>
                    <Textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} placeholder={`היי! ב-${brandName} יש מבצע מיוחד השבוע: ...`} />
                    <p className="text-xs text-gray-500">{message.length} תווים</p>

                    <Button
                        onClick={send}
                        disabled={sending || !message.trim() || typeof count !== 'number' || count === 0}
                        className="bg-[#A04A2E] hover:bg-[#7A3722]"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Send className="w-4 h-4 ml-2" />}
                        שלח broadcast
                    </Button>

                    {result && (
                        <div className={`p-3 rounded-lg text-sm ${result.sent !== undefined ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-red-50 border border-red-200 text-red-900'}`}>
                            {result.sent !== undefined
                                ? <>✅ נשלחו {result.sent} · נכשלו {result.failed || 0} · דולגו (חסר טלפון) {result.skipped || 0}</>
                                : <>❌ {result.error || 'נכשל'}</>}
                        </div>
                    )}
                </div>

                <div className="mt-3 text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded p-2">
                    💡 לשליחה יזומה דרוש template מאושר ע"י Meta. הודעה חופשית תעבוד רק ללקוחות שפנו ב-24 השעות האחרונות.
                </div>
            </CardContent>
        </Card>
    );
}

// Owner-editable Twilio Auth Token override — for when the server .env is
// unreachable and the token was rotated (Twilio 401). Takes effect within ~30s.
function TwilioCredsSection() {
    const [token, setToken] = useState('');
    const [sid, setSid] = useState('');
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);
    const [override, setOverride] = useState(null);

    const loadStatus = async () => {
        try { const r = await base44.functions.getTwilioCredStatus({}); setOverride(r?.data ?? r); } catch { /* noop */ }
    };
    useEffect(() => { loadStatus(); }, []);

    const save = async () => {
        if (!token.trim()) { setResult({ err: 'הדבק את ה-Auth Token' }); return; }
        setSaving(true); setResult(null);
        try {
            const res = await base44.functions.updateTwilioCredentials({ auth_token: token.trim(), account_sid: sid.trim() || undefined });
            const r = res?.data ?? res;
            setResult(r?.sender_ok ? { ok: 'הטוקן נשמר ו-Twilio אישר אותו ✅ הסוכן אמור לחזור לעבוד.' }
                : { err: `נשמר, אבל Twilio עדיין דוחה: ${r?.sender_error || 'בדוק שהעתקת את הטוקן הנכון / שהחשבון פעיל'}` });
            setToken('');
            loadStatus();
        } catch (e) { setResult({ err: e?.message || String(e) }); }
        setSaving(false);
    };

    const clearOverride = async () => {
        setSaving(true); setResult(null);
        try { await base44.functions.updateTwilioCredentials({ clear: true }); setResult({ ok: 'ה-override נמחק — חוזרים ל-.env של השרת.' }); loadStatus(); }
        catch (e) { setResult({ err: e?.message || String(e) }); }
        setSaving(false);
    };

    return (
        <Card className="mb-4 border-amber-300 bg-amber-50/50" dir="rtl">
            <CardContent className="p-4">
                <h3 className="font-bold text-lg flex items-center gap-2 mb-1">
                    עדכון Auth Token של Twilio
                </h3>
                <p className="text-xs text-gray-600 mb-3">
                    אם הסוכן לא מגיב ורואים שגיאת <b>401</b> — סימן שה-Auth Token התחלף ב-Twilio. העתק אותו מ-
                    <b> Twilio Console → Account → API keys &amp; tokens → Auth Token</b> והדבק כאן. נכנס לתוקף תוך ~30 שניות, בלי גישת שרת.
                    {override?.has_override_token && <span className="block mt-1 text-emerald-700">כרגע פעיל override מהאפליקציה (טוקן {override.token_masked}).</span>}
                </p>
                <div className="space-y-2">
                    <div>
                        <Label className="text-xs">Auth Token (חובה)</Label>
                        <Input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="הדבק את ה-Auth Token העדכני" dir="ltr" autoComplete="off" />
                    </div>
                    <div>
                        <Label className="text-xs">Account SID (רק אם גם הוא השתנה — לרוב לא)</Label>
                        <Input value={sid} onChange={e => setSid(e.target.value)} placeholder="ACxxxxxxxx (אופציונלי)" dir="ltr" autoComplete="off" />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור ובדוק מול Twilio'}
                        </Button>
                        {override?.has_override_token && (
                            <Button onClick={clearOverride} disabled={saving} variant="outline" className="border-gray-300">מחק override</Button>
                        )}
                    </div>
                    {result?.ok && <p className="text-emerald-700 text-sm">✅ {result.ok}</p>}
                    {result?.err && <p className="text-red-700 text-sm">❌ {result.err}</p>}
                </div>
            </CardContent>
        </Card>
    );
}

// Team nudges — the "always-awake ops manager": per-tenant on/off + per-nudge
// toggles and times. Backed by RestaurantProfile.team_nudges via
// get/setTeamNudgesConfig; runTeamNudgesNow fires an immediate check.
function TeamNudgesSection() {
    const [cfg, setCfg] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await base44.functions.getTeamNudgesConfig({});
                setCfg((res?.data ?? res)?.config || null);
            } catch (e) { setResult({ err: e?.message || String(e) }); }
            setLoading(false);
        })();
    }, []);

    const save = async (next) => {
        setSaving(true); setResult(null);
        try {
            const res = await base44.functions.setTeamNudgesConfig({ config: next });
            if ((res?.data ?? res)?.ok) setResult({ ok: 'נשמר ✓' });
            else setResult({ err: 'שמירה נכשלה' });
        } catch (e) { setResult({ err: e?.message || String(e) }); }
        setSaving(false);
    };

    const set = (patch) => setCfg(prev => ({ ...prev, ...patch }));
    const setSub = (key, patch) => setCfg(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

    const runNow = async () => {
        setRunning(true); setResult(null);
        try {
            await base44.functions.runTeamNudgesNow({});
            setResult({ ok: 'הבדיקה רצה — אם היה מה לשלוח, ההודעות בדרך (וסיכום אליך)' });
        } catch (e) { setResult({ err: e?.message || String(e) }); }
        setRunning(false);
    };

    const numInput = (val, onCh, w = 'w-16') => (
        <input type="number" value={val} onChange={e => onCh(Number(e.target.value))}
            className={`${w} border rounded-lg px-2 py-1 text-sm text-center`} />
    );

    if (loading) return <Card className="mb-4" dir="rtl"><CardContent className="p-4 text-sm text-gray-500">טוען מנהל אוטומטי...</CardContent></Card>;
    if (!cfg) return null;

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        🤖 מנהל אוטומטי — תזכורות אישיות לצוות
                    </h3>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={!!cfg.enabled} onChange={e => set({ enabled: e.target.checked })} className="w-5 h-5 accent-emerald-600" />
                        <span className={`font-bold text-sm ${cfg.enabled ? 'text-emerald-700' : 'text-gray-400'}`}>{cfg.enabled ? 'פעיל' : 'כבוי'}</span>
                    </label>
                </div>
                <p className="text-xs text-gray-500">כל תזכורת נשלחת אישית בוואטסאפ (+התראת אפליקציה) בדיוק למי שצריך, פעם אחת — והבעלים מקבל סיכום.</p>

                <div className={`space-y-2 ${cfg.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
                    <div className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-lg p-2 text-sm">
                        <input type="checkbox" checked={cfg.availability?.enabled !== false} onChange={e => setSub('availability', { enabled: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
                        <span className="font-semibold">⏰ לא הגיש זמינות</span>
                        <span className="text-gray-500">— רביעי+חמישי בשעה</span>
                        {numInput(cfg.availability?.hour ?? 10, v => setSub('availability', { hour: v }))}
                        <span className="text-gray-500">:00</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-lg p-2 text-sm">
                        <input type="checkbox" checked={cfg.clockin?.enabled !== false} onChange={e => setSub('clockin', { enabled: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
                        <span className="font-semibold">🕐 שובץ ולא החתים כניסה</span>
                        <span className="text-gray-500">— אחרי</span>
                        {numInput(cfg.clockin?.delay_min ?? 35, v => setSub('clockin', { delay_min: v }))}
                        <span className="text-gray-500">דקות מתחילת המשמרת</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap bg-gray-50 rounded-lg p-2 text-sm">
                        <input type="checkbox" checked={cfg.checklist?.enabled !== false} onChange={e => setSub('checklist', { enabled: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
                        <span className="font-semibold">📋 צ'קליסט לא הושלם</span>
                        <span className="text-gray-500">— בדיקה בבוקר בשעה</span>
                        {numInput(cfg.checklist?.morning_hour ?? 11, v => setSub('checklist', { morning_hour: v }))}
                        <span className="text-gray-500">ובערב בשעה</span>
                        {numInput(cfg.checklist?.evening_hour ?? 19, v => setSub('checklist', { evening_hour: v }))}
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Button onClick={() => save(cfg)} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null} שמור
                    </Button>
                    <Button variant="outline" onClick={runNow} disabled={running || !cfg.enabled}>
                        {running ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null} הרץ בדיקה עכשיו
                    </Button>
                    {result?.ok && <span className="text-emerald-700 text-sm font-semibold">{result.ok}</span>}
                    {result?.err && <span className="text-red-600 text-sm">{result.err}</span>}
                </div>
            </CardContent>
        </Card>
    );
}

// Owner + report-recipient registry. Everyone listed here receives every
// report/alert (hours, morning, end-of-day, incidents, tips...). co_owner may
// also command the bot; receive_only just reads. registry_owner + env_admins
// always receive and are shown read-only.
function ReportRecipientsSection() {
    const [recipients, setRecipients] = useState([]);
    const [registryOwner, setRegistryOwner] = useState(null);
    const [envAdmins, setEnvAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [result, setResult] = useState(null);

    const load = async () => {
        setLoading(true); setError(null);
        try {
            const res = await base44.functions.getReportRecipients({});
            const data = res?.data ?? res;
            setRecipients(Array.isArray(data?.recipients) ? data.recipients : []);
            setRegistryOwner(data?.registry_owner ?? null);
            setEnvAdmins(Array.isArray(data?.env_admins) ? data.env_admins : []);
        } catch (e) {
            setError(e?.message || String(e));
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    const updateRow = (idx, field, value) =>
        setRecipients(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    const removeRow = (idx) => setRecipients(prev => prev.filter((_, i) => i !== idx));
    const addRow = () => setRecipients(prev => [...prev, { phone: '', name: '', permission: 'receive_only' }]);

    const save = async () => {
        const clean = recipients
            .map(r => ({
                phone: (r.phone || '').trim(),
                name: (r.name || '').trim(),
                permission: r.permission === 'co_owner' ? 'co_owner' : 'receive_only',
            }))
            .filter(r => r.phone.replace(/\D/g, '').length >= 9);
        setSaving(true); setResult(null);
        try {
            const res = await base44.functions.saveReportRecipients({ recipients: clean });
            const data = res?.data ?? res;
            if (data?.ok) {
                setResult({ ok: `נשמר — ${data.count ?? clean.length} מקבלים` });
                setRecipients(Array.isArray(data?.recipients) ? data.recipients : clean);
            } else {
                setResult({ err: data?.error || 'שמירה נכשלה' });
            }
        } catch (e) {
            setResult({ err: e?.message || String(e) });
        } finally { setSaving(false); }
    };

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4">
                <h3 className="font-bold text-lg flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 text-[#44512C]" />
                    👥 בעלים ומקבלי דוחות
                </h3>
                <p className="text-xs text-gray-600 mb-3">
                    כל המספרים כאן מקבלים את כל הדוחות וההתראות (דוח שעות, בוקר, סוף-יום, תקלות, טיפים...). <b>קו-בעלים</b> גם יכול לתת פקודות לבוט; <b>קבלה בלבד</b> רק מקבל.
                </p>

                {loading && <div className="text-center py-4"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>}
                {error && !loading && <p className="text-red-700 text-sm mb-2">❌ {error}</p>}

                {!loading && (
                    <>
                        {(registryOwner || envAdmins.length > 0) && (
                            <div className="bg-gray-50 border border-gray-200 rounded p-3 mb-3 text-sm">
                                <div className="font-bold text-gray-700 mb-1">מקבלים תמיד</div>
                                {registryOwner && (
                                    <div className="text-gray-600">
                                        {registryOwner.name || 'בעלים'} · <span dir="ltr" className="font-mono">{registryOwner.phone}</span>
                                        <span className="text-xs text-gray-400"> (בעלים ראשי — קבוע)</span>
                                    </div>
                                )}
                                {envAdmins.map((p, i) => (
                                    <div key={i} className="text-gray-600">
                                        <span dir="ltr" className="font-mono">{p}</span>
                                        <span className="text-xs text-gray-400"> (בעלים ראשי — קבוע)</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-2">
                            {recipients.map((r, idx) => (
                                <div key={idx} className="flex items-center gap-2">
                                    <Input value={r.name || ''} onChange={e => updateRow(idx, 'name', e.target.value)} placeholder="שם" className="flex-1" />
                                    <Input value={r.phone || ''} onChange={e => updateRow(idx, 'phone', e.target.value)} placeholder="05X-XXXXXXX" dir="ltr" className="flex-1" />
                                    <select
                                        value={r.permission === 'co_owner' ? 'co_owner' : 'receive_only'}
                                        onChange={e => updateRow(idx, 'permission', e.target.value)}
                                        className="border border-gray-200 rounded-md h-10 px-2 text-sm bg-white"
                                    >
                                        <option value="co_owner">קו-בעלים</option>
                                        <option value="receive_only">קבלה בלבד</option>
                                    </select>
                                    <Button size="sm" variant="outline" onClick={() => removeRow(idx)} className="text-red-600 border-red-200 hover:bg-red-50">✕</Button>
                                </div>
                            ))}
                            {recipients.length === 0 && <p className="text-xs text-gray-400">אין מקבלים נוספים עדיין.</p>}
                        </div>

                        <div className="flex gap-2 flex-wrap mt-3">
                            <Button size="sm" variant="outline" onClick={addRow}>➕ הוסף מקבל</Button>
                            <Button onClick={save} disabled={saving} className="bg-[#44512C] hover:bg-[#44512C] text-white">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                                שמור
                            </Button>
                        </div>

                        {result?.ok && <p className="text-emerald-700 text-sm mt-2">✅ {result.ok}</p>}
                        {result?.err && <p className="text-red-700 text-sm mt-2">❌ {result.err}</p>}
                    </>
                )}
            </CardContent>
        </Card>
    );
}

export default function AdminWhatsApp() {
    const brandName = useTenantBranding()?.name || 'המסעדה';
    return (
        <div className="p-6 max-w-3xl mx-auto" dir="rtl">
            <PageHeader
                title="WhatsApp · Twilio"
                subtitle="סטטוס החיבור, שליחת בדיקה, ושליחות שיווקיות (broadcast) ללקוחות. הקוד מחבר אוטומטית כל קונפירמציית הזמנה — הדף הזה מאפשר לך לוודא שזה עובד ולשלוח באופן יזום."
                icon={MessageCircle}
            />

            <StatusSection />
            <TwilioCredsSection />
            <TestSendSection />
            <BroadcastSection />
            <ReportRecipientsSection />
            <TeamNudgesSection />

            <Card className="mt-6 bg-gray-50">
                <CardContent className="p-4 text-xs text-gray-600 space-y-2">
                    <p className="font-bold text-gray-800">צעדי הקמה (חד-פעמי)</p>
                    <ol className="list-decimal pr-5 space-y-1">
                        <li>Twilio Console → Messaging → Senders → WhatsApp Senders → + New Sender</li>
                        <li>בחר "Use a Twilio phone number" — בחר את המספר הקיים שלך</li>
                        <li>Display Name: "{brandName}" · Category: Food & Beverage · Website: topalena.com</li>
                        <li>בשלב Verification — בחר <b>SMS</b> (לא Voice Call)</li>
                        <li>קבל את הקוד דרך Twilio Console → Monitor → Messaging Logs (Incoming)</li>
                        <li>אחרי אישור Meta — עדכן את <code className="bg-white px-1 rounded">TWILIO_WHATSAPP_FROM</code> ב-Hetzner</li>
                        <li>Restart docker compose, ולחץ "בדוק שוב" למעלה</li>
                    </ol>
                </CardContent>
            </Card>
        </div>
    );
}
