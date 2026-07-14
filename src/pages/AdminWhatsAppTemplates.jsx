// Internal view of every Twilio Content template + its Meta approval status.
// Lets the owner submit a draft template for WhatsApp approval in one click
// instead of clicking through the Twilio Console.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, ExternalLink, Send, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';

// Per-template Hebrew explanation + whether it's a Twilio out-of-the-box
// sample (English defaults that come pre-loaded with every Twilio account
// and aren't useful for the restaurant — best to leave them or delete them).
const TEMPLATE_INFO = {
    booking_confirmation_he: {
        purpose: '✅ אישור הזמנת שולחן ללקוח אחרי שהוא הזמין דרך האתר',
        when: 'נשלח אוטומטית מיד אחרי שהזמנה נוצרת ב-/PublicReservation',
        category_suggest: 'UTILITY',
        sample: false,
    },
    notification_order_tracking: {
        purpose: '📦 מעקב סטטוס משלוח (כפתורים: "איפה ההזמנה" / "צור קשר")',
        when: 'דוגמה של Twilio — לא בשימוש אצלנו (אנחנו מסעדה, לא חנות שולחת משלוחים)',
        category_suggest: 'UTILITY',
        sample: true,
    },
    customer_care_greeting_template: {
        purpose: '👋 ברכת פתיחה לשיחת תמיכה (באנגלית, גנרי)',
        when: 'דוגמה של Twilio — לא בשימוש',
        category_suggest: 'UTILITY',
        sample: true,
    },
    customer_care_help_center_template: {
        purpose: '❓ הפניית לקוח למרכז עזרה עם כפתור',
        when: 'דוגמה של Twilio — לא בשימוש',
        category_suggest: 'UTILITY',
        sample: true,
    },
    message_opt_in: {
        purpose: '✋ בקשת הסכמה מלקוח לקבל הודעות שיווק',
        when: 'דוגמה של Twilio — לא בשימוש (אצלנו ההסכמה במועדון הלקוחות)',
        category_suggest: 'UTILITY',
        sample: true,
    },
    customer_support_routing_template: {
        purpose: '🔀 ניתוב לקוח לנציג / מוצר (קטלוג)',
        when: 'דוגמה של Twilio — לא בשימוש',
        category_suggest: 'UTILITY',
        sample: true,
    },
};

const STATUS_STYLE = {
    approved:     { color: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle2, label: '✅ אושר ע"י Meta' },
    pending:      { color: 'bg-amber-100 text-amber-900 border-amber-300',      icon: Clock,        label: '⏳ ממתין לאישור Meta' },
    received:     { color: 'bg-amber-100 text-amber-900 border-amber-300',      icon: Clock,        label: '⏳ התקבל ב-Twilio' },
    rejected:     { color: 'bg-red-100 text-red-800 border-red-300',            icon: XCircle,      label: '❌ נדחה' },
    paused:       { color: 'bg-orange-100 text-orange-800 border-orange-300',   icon: AlertTriangle,label: '⚠️ הושעה' },
    unsubmitted:  { color: 'bg-gray-200 text-gray-700 border-gray-300',         icon: AlertTriangle,label: '🟡 לא נשלח לאישור' },
};

export default function AdminWhatsAppTemplates() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(null);

    const load = async () => {
        setLoading(true);
        try {
            const r = await base44.functions.listWhatsAppTemplates({});
            const d = r?.data ?? r;
            setRows(d?.templates || []);
        } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []);

    const submit = async (sid, name) => {
        const category = prompt('קטגוריה (UTILITY / MARKETING / AUTHENTICATION):', 'UTILITY');
        if (!category) return;
        const submitName = prompt('שם להגשה (אותיות קטנות, snake_case):', name || 'template_' + sid.slice(-6));
        if (!submitName) return;
        setBusy(sid);
        try {
            await base44.functions.submitWhatsAppTemplate({ sid, name: submitName, category: category.toUpperCase() });
            alert('✅ נשלח לאישור. עדכון יגיע בדרך כלל תוך כמה שעות.');
            load();
        } catch (e) {
            alert('שגיאה: ' + (e?.message || ''));
        } finally { setBusy(null); }
    };

    return (
        <div className="p-4 md:p-6 min-h-screen bg-gradient-to-b from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE]" dir="rtl">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black text-gray-800">📨 WhatsApp Templates</h1>
                        <p className="text-sm text-gray-500 mt-1">
                            סטטוס אישור Meta לכל ה-templates שלך. רק template ש-<strong>אושר</strong> יכול להישלח ללקוחות מחוץ לחלון השירות 24h.
                        </p>
                    </div>
                    <Button onClick={load} disabled={loading} variant="outline">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <RefreshCw className="w-4 h-4 ml-1" />} רענן
                    </Button>
                </div>

                <Card className="mb-4 bg-blue-50 border-blue-200"><CardContent className="p-3 text-xs text-blue-900">
                    💡 <b>הסבר קצר:</b> Meta מחלקת הודעות WhatsApp עסקיות ל-3 קטגוריות:
                    <ul className="mr-4 mt-1 space-y-0.5 list-disc">
                        <li><b>UTILITY</b> — אישורי הזמנה, עדכוני סטטוס, תזכורות (~₪0.025/הודעה)</li>
                        <li><b>MARKETING</b> — הצעות, מבצעים, ימי הולדת (~₪0.13/הודעה)</li>
                        <li><b>AUTHENTICATION</b> — קודי OTP</li>
                    </ul>
                </CardContent></Card>

                {loading && rows.length === 0 ? (
                    <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-300" /></div>
                ) : (
                    <div className="space-y-3">
                        {rows.map(t => {
                            const st = STATUS_STYLE[t.whatsapp_status] || STATUS_STYLE.unsubmitted;
                            const Icon = st.icon;
                            const canSubmit = t.whatsapp_status === 'unsubmitted' || t.whatsapp_status === 'rejected';
                            const info = TEMPLATE_INFO[t.friendly_name] || null;
                            return (
                                <Card key={t.sid} className={`border-r-4 ${st.color.split(' ').find(c => c.startsWith('border-')) || 'border-gray-300'} ${info?.sample ? 'opacity-70' : ''}`}>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-3 flex-wrap">
                                            <div className="flex-1 min-w-[200px]">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <h3 className="font-black text-base">{t.friendly_name}</h3>
                                                    <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full">{t.language}</span>
                                                    {(t.types || []).map(ty => (
                                                        <span key={ty} className="text-[10px] bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">{ty.replace('twilio/','')}</span>
                                                    ))}
                                                    {info?.sample && (
                                                        <span className="text-[10px] bg-gray-300 text-gray-700 px-2 py-0.5 rounded-full font-bold">🧪 דוגמה של Twilio</span>
                                                    )}
                                                </div>
                                                {info && (
                                                    <div className="mt-1.5 mb-1 text-xs">
                                                        <div className="font-bold text-[#44512C]">{info.purpose}</div>
                                                        <div className="text-gray-500 mt-0.5">{info.when}</div>
                                                    </div>
                                                )}
                                                <code className="text-[10px] text-gray-400 select-all">{t.sid}</code>
                                            </div>
                                            <div className={`text-xs font-bold px-3 py-1.5 rounded-full border ${st.color} flex items-center gap-1`}>
                                                <Icon className="w-3.5 h-3.5" />
                                                {st.label}
                                            </div>
                                        </div>

                                        {t.body && (
                                            <pre className="mt-3 p-2 bg-gray-50 border rounded text-[11px] whitespace-pre-wrap font-sans text-gray-700 max-h-32 overflow-y-auto">
                                                {t.body}
                                            </pre>
                                        )}

                                        {t.whatsapp_category && (
                                            <p className="text-[10px] text-gray-500 mt-2">קטגוריה: <b>{t.whatsapp_category}</b></p>
                                        )}
                                        {t.rejection_reason && (
                                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-[11px] text-red-800">
                                                <b>סיבת דחייה:</b> {t.rejection_reason}
                                            </div>
                                        )}

                                        {canSubmit && (
                                            <div className="mt-3 pt-3 border-t flex items-center gap-2">
                                                <Button size="sm" onClick={() => submit(t.sid, t.friendly_name)} disabled={busy === t.sid}
                                                    className="bg-[#44512C] hover:bg-[#7A3722] text-white">
                                                    {busy === t.sid ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Send className="w-3 h-3 ml-1" />}
                                                    שלח לאישור Meta
                                                </Button>
                                                <a href={`https://console.twilio.com/us1/develop/content/template-builder?sid=${t.sid}`} target="_blank" rel="noopener noreferrer"
                                                    className="text-xs text-[#A04A2E] hover:underline flex items-center gap-1">
                                                    פתח ב-Twilio Console <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
