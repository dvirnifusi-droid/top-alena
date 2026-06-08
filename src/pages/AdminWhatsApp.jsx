// Admin diagnostic + broadcast page for WhatsApp via Twilio.
// Three sections:
//   1. Status check — verifies env vars + Twilio sender are ready
//   2. Test send — type a phone number, send a test message, see exact error
//   3. Broadcast — pick audience (delivery customers / club members / inactive),
//      compose message, dry-run count + send.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, MessageCircle, CheckCircle2, AlertTriangle, Send, Users } from 'lucide-react';

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
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('שלום! זו בדיקה מ-עלינא 🌿');
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
                    <Textarea rows={5} value={message} onChange={e => setMessage(e.target.value)} placeholder="היי! ב-עלינא יש מבצע מיוחד השבוע: ..." />
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

export default function AdminWhatsApp() {
    return (
        <div className="p-6 max-w-3xl mx-auto" dir="rtl">
            <h1 className="text-2xl font-bold mb-2">💬 WhatsApp · Twilio</h1>
            <p className="text-sm text-gray-600 mb-6">
                סטטוס החיבור, שליחת בדיקה, ושליחות שיווקיות (broadcast) ללקוחות. הקוד מחבר אוטומטית כל קונפירמציית הזמנה — הדף הזה מאפשר לך לוודא שזה עובד ולשלוח באופן יזום.
            </p>

            <StatusSection />
            <TestSendSection />
            <BroadcastSection />

            <Card className="mt-6 bg-gray-50">
                <CardContent className="p-4 text-xs text-gray-600 space-y-2">
                    <p className="font-bold text-gray-800">📋 צעדי הקמה (חד-פעמי)</p>
                    <ol className="list-decimal pr-5 space-y-1">
                        <li>Twilio Console → Messaging → Senders → WhatsApp Senders → + New Sender</li>
                        <li>בחר "Use a Twilio phone number" — בחר את המספר הקיים שלך</li>
                        <li>Display Name: "עלינא" · Category: Food & Beverage · Website: topalena.com</li>
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
