// Marketing Campaigns 2.0 — segment-driven bulk WhatsApp/SMS sender.
//
// Replaces the old 4 hardcoded send-buttons with a flexible workflow:
//   1. Pick segment (or custom filter)
//   2. Preview: see count + 5 sample customers
//   3. Edit message template (with {name}, {coins}, {days_since_visit} placeholders)
//   4. Send → bulk send via WhatsApp (default) or SMS, throttled 24h per customer
//   5. History tab shows every past send
//
// All sends respect marketing_consent (חוק הספאם).
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Send, Eye, Sparkles, History as HistoryIcon, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

// === Predefined segments with default templates =============================
const SEGMENTS = [
    {
        key: 'birthday_this_month',
        emoji: '🎂',
        label: 'יום הולדת החודש',
        desc: 'לקוחות שהיום שלהם נופל החודש',
        defaultTemplate: 'היי {name}! 🎂\nלקראת היום הגדול שלך החודש — מתנה ממסעדת עלינא:\n🍰 קינוח אישי על חשבון הבית כשתבוא לחגוג!\n\nתקף לחודש שלם. נשמח לראותך 🌿',
        color: 'pink',
    },
    {
        key: 'birthday_today',
        emoji: '🎉',
        label: 'חוגגים היום',
        desc: 'מי שיום הולדתו ממש היום',
        defaultTemplate: 'יום הולדת שמח, {name}! 🎉🎂\nאיזה יום מיוחד — אם תבוא היום, הקינוח עלינא 🍰\nרוטשילד 104, ראשון לציון. נשמח לחגוג איתך 🌿',
        color: 'rose',
    },
    {
        key: 'anniversary_this_month',
        emoji: '💝',
        label: 'יום נישואים החודש',
        desc: 'ציון מיוחד (חתונה / יום השנה לעלינא) החודש',
        defaultTemplate: 'היי {name} 💝\nהחודש יש לך ציון חשוב לחגוג. למה לא לחגוג איתנו?\nהזמן שולחן ותקבל מתנה אישית מבית עלינא 🌿',
        color: 'rose',
    },
    {
        key: 'anniversary_today',
        emoji: '🥂',
        label: 'יום נישואים היום',
        desc: 'מי שיש לו ציון מיוחד היום',
        defaultTemplate: 'מזל טוב, {name}! 🥂\nהיום יום מיוחד — בוא לחגוג אצלנו ויש לנו מתנה.\nרוטשילד 104, ראשון לציון 🌿',
        color: 'pink',
    },
    {
        key: 'winback_30',
        emoji: '👋',
        label: 'מתגעגעים — 30 יום',
        desc: 'לא ביקרו אצלנו 30-60 ימים',
        defaultTemplate: 'היי {name}, מתגעגעים! ❤️\nכבר {days_since_visit} ימים מאז שביקרת אצלנו. הקפה הראשון עלינא — בוא נראה אותך השבוע 🌿\nעלינא, רוטשילד 104',
        color: 'amber',
    },
    {
        key: 'winback_60',
        emoji: '💝',
        label: 'התגעגענו — 60 יום',
        desc: 'לא ביקרו 60-90 ימים — הצעה גדולה יותר',
        defaultTemplate: 'היי {name}! 💝\nכבר {days_since_visit} ימים בלעדיך. בא ניזכר — 15% הנחה לכל ההזמנה החודש, רק תגיד שאמרת לי בוואטסאפ 🌿',
        color: 'orange',
    },
    {
        key: 'winback_90',
        emoji: '✨',
        label: 'חזרה דרמטית — 90 יום',
        desc: 'לא ביקרו 90+ ימים — הצעה חזקה',
        defaultTemplate: 'שלום {name} 🌿\nעבר זמן... כדי להחזיר אותך — קופון של 50₪ ללא תנאי, רק תבוא ותהנה.\nתקף עד סוף החודש. נשמח לראותך! ✨',
        color: 'red',
    },
    {
        key: 'vip',
        emoji: '🏆',
        label: 'VIP בלבד',
        desc: 'לקוחות עם loyalty_tier=vip',
        defaultTemplate: 'היי {name} 🏆\nכלקוח/ה VIP שלנו — הזמנה לטעימת המנה החדשה לפני כולם, ביום שלישי הקרוב ב-19:00.\nמספר מקומות מוגבל. רוצה? תגיב פה 🌿',
        color: 'emerald',
    },
    {
        key: 'almost_vip',
        emoji: '⭐',
        label: 'כמעט VIP',
        desc: 'רגיל עם 5+ ביקורים',
        defaultTemplate: 'היי {name} ⭐\nאתה כבר {visit_count} ביקורים אצלנו — עוד ביקור אחד ותקבל סטטוס VIP עם הטבות קבועות.\nנשמח לראותך בקרוב 🌿',
        color: 'gold',
    },
    {
        key: 'high_spenders',
        emoji: '💎',
        label: 'לקוחות מובילים (10+ ביקורים)',
        desc: 'הלקוחות הכי נאמנים',
        defaultTemplate: 'היי {name} 💎\nאתה אחד הלקוחות הכי יקרים שלנו ({visit_count} ביקורים) — תודה ענקית.\nמתנה אישית מחכה לך בביקור הבא, רק תגיד שראיתי הודעה זו 🌿',
        color: 'purple',
    },
    {
        key: 'with_coins',
        emoji: '🪙',
        label: 'עם מטבעות לא ממומשים',
        desc: 'coin_balance > 0',
        defaultTemplate: 'היי {name} 🪙\nיש לך {coins} מטבעות שמחכים לך! בוא לממש אותם — כל מטבע = ₪1 הנחה.\nנשמח לראותך 🌿',
        color: 'yellow',
    },
    {
        key: 'all_consented',
        emoji: '📢',
        label: 'כל הרשימה (consent בלבד)',
        desc: 'הודעה לכל לקוח שאישר שיווק',
        defaultTemplate: 'היי {name}! 🌿\n[הודעה כללית - מלא כאן]',
        color: 'blue',
    },
    {
        key: 'missing_details',
        emoji: '📋',
        label: 'חסרים פרטים במועדון',
        desc: 'לקוחות בלי יום הולדת או עיר — שלח קישור השלמה אישי',
        defaultTemplate: 'היי {name} 👋\nראינו שחסרים לנו כמה פרטים שלך במועדון הלקוחות של עלינא — מגיע לך להתחיל לצבור הטבות! 🎁\nההשלמה לוקחת חצי דקה:\n{update_link}\n\nלהסרה מרשימת התפוצה — השיבו "הסר" 🌿',
        color: 'amber',
    },
    {
        key: 'manual',
        emoji: '🎯',
        label: 'בחירה ידנית',
        desc: 'חפש ובחר שמות / טלפונים ספציפיים',
        defaultTemplate: 'היי {name}! 🌿\n[כתוב כאן את ההודעה]',
        color: 'emerald',
    },
];

const COLOR_BG = {
    pink: 'bg-pink-50 border-pink-200 hover:border-pink-400',
    rose: 'bg-rose-50 border-rose-200 hover:border-rose-400',
    amber: 'bg-amber-50 border-amber-200 hover:border-amber-400',
    orange: 'bg-orange-50 border-orange-200 hover:border-orange-400',
    red: 'bg-red-50 border-red-200 hover:border-red-400',
    emerald: 'bg-emerald-50 border-emerald-200 hover:border-emerald-400',
    gold: 'bg-yellow-50 border-yellow-200 hover:border-yellow-400',
    purple: 'bg-purple-50 border-purple-200 hover:border-purple-400',
    yellow: 'bg-yellow-50 border-yellow-200 hover:border-yellow-400',
    blue: 'bg-blue-50 border-blue-200 hover:border-blue-400',
};

const COLOR_ACTIVE = {
    pink: 'bg-pink-500 text-white border-pink-700',
    rose: 'bg-rose-500 text-white border-rose-700',
    amber: 'bg-amber-500 text-white border-amber-700',
    orange: 'bg-orange-500 text-white border-orange-700',
    red: 'bg-red-500 text-white border-red-700',
    emerald: 'bg-emerald-600 text-white border-emerald-800',
    gold: 'bg-yellow-500 text-white border-yellow-700',
    purple: 'bg-purple-500 text-white border-purple-700',
    yellow: 'bg-yellow-500 text-white border-yellow-700',
    blue: 'bg-blue-500 text-white border-blue-700',
};

export default function MarketingCampaigns() {
    const [activeSegment, setActiveSegment] = useState(null); // SEGMENTS entry
    const [template, setTemplate] = useState('');
    const [channel, setChannel] = useState('whatsapp');
    const [mediaUrl, setMediaUrl] = useState(''); // optional image attachment
    const [preview, setPreview] = useState(null); // { count, sample }
    const [previewLoading, setPreviewLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState(null);
    const [history, setHistory] = useState([]);
    const [tab, setTab] = useState('compose');
    const [detailsOpen, setDetailsOpen] = useState(null); // CampaignSend selected for drill-down
    const [details, setDetails] = useState(null);
    const [holidays, setHolidays] = useState([]);
    // Manual recipient picker — owner searches + hand-picks specific customers
    const [manualList, setManualList] = useState([]);
    const [custSearch, setCustSearch] = useState('');
    const [custResults, setCustResults] = useState([]);
    const [custSearching, setCustSearching] = useState(false);

    const isManual = activeSegment?.key === 'manual';

    // Cost preview — Email is free (Resend, up to 3,000/mo); WhatsApp/SMS via Twilio
    const estCost = channel === 'email'
        ? '0.00'
        : preview?.count
            ? (channel === 'whatsapp' ? (preview.count * 0.13).toFixed(2) : (preview.count * 0.10).toFixed(2))
            : '0.00';

    // When segment is chosen, set default template + auto-preview
    const pickSegment = async (seg) => {
        setActiveSegment(seg);
        setTemplate(seg.defaultTemplate);
        setSendResult(null);
        if (seg.key === 'manual') {
            // Manual mode previews locally from the picked list — no server query.
            setPreview({ count: manualList.length, sample: manualList.slice(0, 5) });
            return;
        }
        await runPreview(seg.key);
    };

    // Debounced customer search for the manual picker
    useEffect(() => {
        if (!isManual || custSearch.trim().length < 2) { setCustResults([]); return; }
        const t = setTimeout(async () => {
            setCustSearching(true);
            try {
                const r = await base44.functions.searchCustomers({ q: custSearch.trim() });
                setCustResults((r?.data || r)?.results || []);
            } catch { setCustResults([]); }
            finally { setCustSearching(false); }
        }, 400);
        return () => clearTimeout(t);
    }, [custSearch, isManual]);

    // Keep the preview synced with the picked list in manual mode
    useEffect(() => {
        if (isManual) setPreview({ count: manualList.length, sample: manualList.slice(0, 5) });
    }, [manualList, isManual]);

    const addManualCustomer = (c) => {
        setManualList(prev => prev.some(x => x.id === c.id) ? prev : [...prev, c]);
        setCustSearch('');
        setCustResults([]);
    };
    const removeManualCustomer = (id) => setManualList(prev => prev.filter(x => x.id !== id));

    const runPreview = async (segmentKey) => {
        if (segmentKey === 'manual') {
            setPreview({ count: manualList.length, sample: manualList.slice(0, 5) });
            return;
        }
        setPreviewLoading(true);
        setPreview(null);
        try {
            const r = await base44.functions.previewCustomerSegment({ segment: segmentKey });
            setPreview(r?.data || r);
        } catch (e) {
            setPreview({ count: 0, sample: [], error: e?.message });
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleSend = async () => {
        if (!activeSegment) return;
        if (!template.trim()) { alert('כתוב הודעה לפני שליחה'); return; }
        const count = preview?.count || 0;
        if (count === 0) { alert('אין לקוחות תואמים לסגמנט הזה'); return; }
        if (!confirm(`לשלוח ל-${count} לקוחות?\n\nסגמנט: ${activeSegment.label}\nערוץ: ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}\n\nההודעות נשלחות מיידית.`)) return;
        setSending(true);
        setSendResult(null);
        try {
            const r = await base44.functions.sendCustomerCampaign({
                segment: activeSegment.key,
                message_template: template,
                channel,
                campaign_key: activeSegment.key,
                campaign_label: activeSegment.label,
                media_url: mediaUrl || undefined,
                // Manual mode: send exactly to the hand-picked customers
                custom_filter: isManual ? { customer_ids: manualList.map(c => c.id) } : undefined,
            });
            const data = r?.data || r;
            setSendResult({ success: true, ...data });
            loadHistory();
        } catch (e) {
            setSendResult({ success: false, error: e?.message || 'שגיאה' });
        } finally {
            setSending(false);
        }
    };

    const loadHistory = async () => {
        try {
            const r = await base44.functions.getCampaignHistory({ limit: 50 });
            setHistory((r?.data || r)?.rows || []);
        } catch (e) {
            console.warn('history load failed', e);
        }
    };

    useEffect(() => {
        loadHistory();
        // Load holiday template library
        base44.functions.listHolidayTemplates({}).then(r => {
            setHolidays((r?.data || r)?.templates || []);
        }).catch(() => {});
    }, []);

    // Render placeholder preview
    const renderedSample = (() => {
        if (!preview?.sample?.[0]) return '';
        const c = preview.sample[0];
        const replacements = {
            name: c.name || 'אורח/ת יקר/ה',
            coins: String(c.coin_balance || 0),
            days_since_visit: c.last_visit ? String(Math.floor((Date.now() - new Date(c.last_visit).getTime()) / 86400000)) : '0',
            visit_count: String(c.visit_count || 0),
            tier: c.loyalty_tier === 'vip' ? 'VIP' : 'רגיל',
            city: c.city || '',
            update_link: `https://topalena.com/ClubUpdate?cid=${c.id}`,
        };
        return template.replace(/\{(\w+)\}/g, (m, k) => replacements[k] ?? m);
    })();

    return (
        <div className="p-4 md:p-6 min-h-screen bg-gradient-to-b from-gray-50 to-gray-100" dir="rtl">
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-3xl md:text-4xl font-black text-gray-800 mb-2 flex items-center gap-2">
                        <Sparkles className="w-8 h-8 text-[#A04A2E]" />
                        קמפיינים שיווקיים
                    </h1>
                    <p className="text-gray-600 text-sm">בחר סגמנט → ערוך טמפלייט → ראה תצוגה מקדימה → שלח</p>
                </div>

                <Tabs value={tab} onValueChange={setTab} className="space-y-4">
                    <TabsList className="grid grid-cols-3 max-w-2xl">
                        <TabsTrigger value="compose">📝 צור קמפיין</TabsTrigger>
                        <TabsTrigger value="holidays">🎉 חגים</TabsTrigger>
                        <TabsTrigger value="history">📊 היסטוריה ({history.length})</TabsTrigger>
                    </TabsList>

                    {/* === Compose tab === */}
                    <TabsContent value="compose" className="space-y-4">
                        {/* Segment chips */}
                        <Card>
                            <CardContent className="p-4">
                                <h3 className="font-bold mb-3 text-sm text-gray-700">1️⃣ בחר קהל יעד:</h3>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                                    {SEGMENTS.map(seg => {
                                        const isActive = activeSegment?.key === seg.key;
                                        return (
                                            <button
                                                key={seg.key}
                                                onClick={() => pickSegment(seg)}
                                                className={`border-2 rounded-xl p-3 text-right transition-all ${
                                                    isActive ? COLOR_ACTIVE[seg.color] : COLOR_BG[seg.color]
                                                }`}
                                            >
                                                <div className="text-2xl mb-1">{seg.emoji}</div>
                                                <div className={`font-bold text-sm ${isActive ? 'text-white' : 'text-gray-900'}`}>{seg.label}</div>
                                                <div className={`text-[10px] mt-0.5 ${isActive ? 'text-white/90' : 'text-gray-500'}`}>{seg.desc}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Manual recipient picker — search + hand-pick customers */}
                        {isManual && (
                            <Card>
                                <CardContent className="p-4">
                                    <h3 className="font-bold mb-2 text-sm text-gray-700">🎯 חפש והוסף לקוחות:</h3>
                                    <input
                                        type="text"
                                        value={custSearch}
                                        onChange={(e) => setCustSearch(e.target.value)}
                                        placeholder="הקלד שם או מספר טלפון (לפחות 2 תווים)..."
                                        className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                                    />
                                    {custSearching && <p className="text-xs text-gray-400 mt-2">מחפש...</p>}
                                    {custResults.length > 0 && (
                                        <div className="mt-2 border rounded-lg divide-y max-h-56 overflow-y-auto">
                                            {custResults.map(c => {
                                                const blocked = !c.marketing_consent || c.marketing_unsubscribed_at;
                                                return (
                                                    <button
                                                        key={c.id}
                                                        onClick={() => !blocked && addManualCustomer(c)}
                                                        disabled={blocked}
                                                        className={`w-full text-right p-2 text-xs flex items-center gap-2 ${blocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-emerald-50'}`}
                                                    >
                                                        <span className="font-bold">{c.name || '(ללא שם)'}</span>
                                                        <span className="text-gray-500">{c.phone}</span>
                                                        {c.visit_count > 0 && <span className="text-emerald-600">{c.visit_count} ביקורים</span>}
                                                        {blocked
                                                            ? <span className="mr-auto text-red-600 font-bold">🚫 ללא הסכמת שיווק</span>
                                                            : <span className="mr-auto text-emerald-700 font-bold">+ הוסף</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {manualList.length > 0 && (
                                        <div className="mt-3">
                                            <p className="text-xs font-bold text-gray-600 mb-1">נבחרו ({manualList.length}):</p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {manualList.map(c => (
                                                    <span key={c.id} className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full">
                                                        {c.name || c.phone}
                                                        <button onClick={() => removeManualCustomer(c.id)} className="text-emerald-600 hover:text-red-600">✕</button>
                                                    </span>
                                                ))}
                                                <button onClick={() => setManualList([])} className="text-xs text-gray-400 hover:text-red-600 underline">נקה הכל</button>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {activeSegment && (
                            <>
                                {/* Preview */}
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="font-bold text-sm text-gray-700">2️⃣ תצוגה מקדימה של הקהל:</h3>
                                            <Button size="sm" variant="outline" onClick={() => runPreview(activeSegment.key)} disabled={previewLoading}>
                                                {previewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3 ml-1" />}
                                                רענן
                                            </Button>
                                        </div>
                                        {previewLoading ? (
                                            <div className="text-center py-6 text-gray-400">
                                                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                            </div>
                                        ) : preview ? (
                                            <div>
                                                <div className="text-3xl font-black text-emerald-700 mb-1">
                                                    {preview.count} לקוחות תואמים
                                                </div>
                                                {preview.count === 0 && (
                                                    <p className="text-sm text-orange-600 mt-2">⚠️ אין לקוחות תואמים. תוודא שיש לקוחות עם marketing_consent + נתונים מתאימים לסגמנט.</p>
                                                )}
                                                {preview.sample?.length > 0 && (
                                                    <div className="mt-3 space-y-1">
                                                        <p className="text-xs text-gray-500 font-bold">דוגמאות:</p>
                                                        {preview.sample.map(c => (
                                                            <div key={c.id} className="text-xs bg-gray-50 rounded px-2 py-1 flex items-center gap-2">
                                                                <span className="font-semibold">{c.name || '(ללא שם)'}</span>
                                                                <span className="text-gray-400">·</span>
                                                                <span className="text-gray-500">{c.phone}</span>
                                                                {c.visit_count > 0 && (
                                                                    <span className="text-emerald-600 mr-auto">{c.visit_count} ביקורים</span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : null}
                                    </CardContent>
                                </Card>

                                {/* Template editor */}
                                <Card>
                                    <CardContent className="p-4">
                                        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                                            <h3 className="font-bold text-sm text-gray-700">3️⃣ ערוך הודעה (תוצג ללקוח):</h3>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        const sampleId = preview?.sample?.[0]?.id;
                                                        if (!sampleId) { alert('בחר סגמנט עם לקוחות לפני שיוצרים אישית'); return; }
                                                        try {
                                                            const r = await base44.functions.personalizeWithAI({ template, customer_id: sampleId });
                                                            const data = r?.data || r;
                                                            if (data?.ok) setTemplate(data.personalized);
                                                            else alert('AI נכשל: ' + (data?.error || 'unknown'));
                                                        } catch (e) { alert('שגיאה: ' + e?.message); }
                                                    }}
                                                    className="text-purple-700 border-purple-300 hover:bg-purple-50"
                                                >
                                                    ✨ AI אישי (Gemini)
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        const second = prompt('נוסח B (חלופי) — חצי מהלקוחות יקבלו:', '');
                                                        if (!second?.trim()) return;
                                                        if (!confirm(`לשלוח A/B Test ל-${preview?.count || 0} לקוחות?\n50% נוסח A, 50% נוסח B`)) return;
                                                        (async () => {
                                                            try {
                                                                const r = await base44.functions.sendABTestCampaign({
                                                                    segment: activeSegment.key,
                                                                    variants: [template, second],
                                                                    channel,
                                                                    campaign_key: activeSegment.key,
                                                                    campaign_label: activeSegment.label,
                                                                    media_url: mediaUrl || undefined,
                                                                });
                                                                const data = r?.data || r;
                                                                setSendResult({ success: data?.ok, ...data });
                                                                loadHistory();
                                                            } catch (e) { alert('שגיאה: ' + e?.message); }
                                                        })();
                                                    }}
                                                    className="text-blue-700 border-blue-300 hover:bg-blue-50"
                                                >
                                                    🆎 A/B Test
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="text-xs text-gray-500 mb-2">
                                            placeholders זמינים: <code className="bg-gray-100 px-1 rounded">{`{name}`}</code> <code className="bg-gray-100 px-1 rounded">{`{coins}`}</code> <code className="bg-gray-100 px-1 rounded">{`{days_since_visit}`}</code> <code className="bg-gray-100 px-1 rounded">{`{visit_count}`}</code> <code className="bg-gray-100 px-1 rounded">{`{tier}`}</code> <code className="bg-gray-100 px-1 rounded">{`{city}`}</code> <code className="bg-gray-100 px-1 rounded">{`{update_link}`}</code>
                                        </div>
                                        <textarea
                                            value={template}
                                            onChange={(e) => setTemplate(e.target.value)}
                                            rows={6}
                                            className="w-full border rounded-lg p-3 text-sm font-medium focus:ring-2 focus:ring-[#44512C] focus:outline-none"
                                            placeholder="כתוב את ההודעה..."
                                        />
                                        {renderedSample && (
                                            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                                <p className="text-[10px] font-bold text-emerald-800 mb-1">📱 תצוגה מקדימה (בהתאמה ללקוח הראשון):</p>
                                                <pre className="text-sm whitespace-pre-wrap font-sans text-gray-800">{renderedSample}</pre>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Image attachment (WhatsApp only) */}
                                {channel === 'whatsapp' && (
                                    <Card>
                                        <CardContent className="p-4">
                                            <h3 className="font-bold mb-2 text-sm text-gray-700">📷 תמונה מצורפת (אופציונלי):</h3>
                                            <p className="text-xs text-gray-500 mb-2">URL ציבורי לתמונה (JPG/PNG). תוצג בהודעה לפני הטקסט.</p>
                                            <input
                                                type="url"
                                                value={mediaUrl}
                                                onChange={(e) => setMediaUrl(e.target.value)}
                                                placeholder="https://topalena.com/images/birthday-cake.jpg"
                                                className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                                            />
                                            {mediaUrl && (
                                                <div className="mt-2">
                                                    <img src={mediaUrl} alt="preview" className="max-h-32 rounded-lg border" onError={(e) => { e.target.style.display = 'none'; }} />
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Channel + Send */}
                                <Card>
                                    <CardContent className="p-4">
                                        <h3 className="font-bold mb-3 text-sm text-gray-700">4️⃣ בחר ערוץ ושלח:</h3>
                                        <div className="flex items-center gap-3 mb-4">
                                            <button
                                                onClick={() => setChannel('whatsapp')}
                                                className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                                                    channel === 'whatsapp' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                            >
                                                💬 WhatsApp
                                            </button>
                                            <button
                                                onClick={() => setChannel('sms')}
                                                className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                                                    channel === 'sms' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                            >
                                                📨 SMS
                                            </button>
                                            <button
                                                onClick={() => setChannel('email')}
                                                className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                                                    channel === 'email' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                                }`}
                                            >
                                                ✉️ Email (חינם)
                                            </button>
                                        </div>

                                        {/* Cost preview */}
                                        {preview?.count > 0 && (
                                            channel === 'email' ? (
                                                <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                                                    <p className="text-sm font-bold text-emerald-900 mb-1">💰 עלות משוערת:</p>
                                                    <p className="text-2xl font-black text-emerald-700">חינם ₪0</p>
                                                    <p className="text-[10px] text-emerald-700 mt-1">
                                                        Email דרך Resend — חינם עד 3,000 מיילים בחודש
                                                    </p>
                                                    <p className="text-[10px] text-gray-600 mt-1">
                                                        ⚠️ נשלח רק ללקוחות שיש להם כתובת מייל — השאר ידולגו אוטומטית
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                                    <p className="text-sm font-bold text-amber-900 mb-1">💰 עלות משוערת:</p>
                                                    <p className="text-2xl font-black text-amber-700">₪{estCost}</p>
                                                    <p className="text-[10px] text-amber-700 mt-1">
                                                        {preview.count} × ₪{channel === 'whatsapp' ? '0.13' : '0.10'} {channel === 'whatsapp' ? '(WhatsApp Marketing לישראל)' : '(SMS לישראל)'}
                                                    </p>
                                                    <p className="text-[10px] text-gray-600 mt-1">
                                                        💡 שיחות שירות (24h חלון אחרי הודעה נכנסת) חינמיות עד 1000/חודש
                                                    </p>
                                                </div>
                                            )
                                        )}

                                        <Button
                                            onClick={handleSend}
                                            disabled={sending || !preview?.count}
                                            className="w-full bg-[#44512C] hover:bg-[#7A3722] text-white font-bold text-base py-6"
                                        >
                                            {sending ? (
                                                <><Loader2 className="w-5 h-5 animate-spin ml-2" /> שולח...</>
                                            ) : (
                                                <><Send className="w-5 h-5 ml-2" /> שלח ל-{preview?.count || 0} לקוחות</>
                                            )}
                                        </Button>

                                        <p className="text-[10px] text-gray-500 mt-2 text-center">
                                            ⚠️ הודעות נשלחות רק ללקוחות שאישרו שיווק. לקוחות שקיבלו הודעה ב-24 שעות אחרונות יושמטו אוטומטית.
                                        </p>
                                    </CardContent>
                                </Card>

                                {/* Send result */}
                                {sendResult && (
                                    <Card>
                                        <CardContent className="p-4">
                                            {sendResult.success ? (
                                                <div className="flex items-start gap-3 text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                                                    <CheckCircle2 className="w-6 h-6 mt-0.5" />
                                                    <div className="flex-1">
                                                        <p className="font-bold">✅ נשלח בהצלחה!</p>
                                                        <p className="text-sm mt-1">
                                                            📤 {sendResult.sent} הודעות נשלחו · ❌ {sendResult.failed} נכשלו · 🎯 {sendResult.total_matched} סך כל היעד
                                                        </p>
                                                        {sendResult.failure_sample?.length > 0 && (
                                                            <details className="mt-2 text-xs">
                                                                <summary className="cursor-pointer text-red-700">מה נכשל? ({sendResult.failure_sample.length} דוגמאות)</summary>
                                                                {sendResult.failure_sample.map((f, i) => (
                                                                    <div key={i} className="mt-1">{f.phone}: {f.reason}</div>
                                                                ))}
                                                            </details>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-start gap-3 text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
                                                    <AlertCircle className="w-6 h-6 mt-0.5" />
                                                    <div>
                                                        <p className="font-bold">❌ שגיאה</p>
                                                        <p className="text-sm">{sendResult.error}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )}
                            </>
                        )}
                    </TabsContent>

                    {/* === Holidays tab === */}
                    <TabsContent value="holidays" className="space-y-3">
                        <Card>
                            <CardContent className="p-4">
                                <h3 className="font-bold mb-2">🎉 ספריית תבניות לחגים</h3>
                                <p className="text-xs text-gray-600 mb-3">לחץ על חג → הטמפלייט יטען בעורך הקמפיין → ערוך → שלח לכל הלקוחות.</p>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {holidays.map(h => (
                                        <button
                                            key={h.key}
                                            onClick={() => {
                                                const allConsented = SEGMENTS.find(s => s.key === 'all_consented');
                                                if (allConsented) {
                                                    setActiveSegment(allConsented);
                                                    setTemplate(h.template);
                                                    setTab('compose');
                                                    runPreview('all_consented');
                                                }
                                            }}
                                            className="border-2 border-amber-200 bg-amber-50 hover:border-amber-400 hover:bg-amber-100 rounded-xl p-3 text-right transition-all"
                                        >
                                            <div className="text-2xl mb-1">{h.emoji}</div>
                                            <div className="font-bold text-sm">{h.label}</div>
                                            <div className="text-[10px] text-gray-500 mt-1 line-clamp-2">{h.template.slice(0, 60)}...</div>
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* === History tab === */}
                    <TabsContent value="history" className="space-y-3">
                        {history.length === 0 ? (
                            <Card>
                                <CardContent className="p-12 text-center text-gray-400">
                                    <HistoryIcon className="w-12 h-12 mx-auto mb-3" />
                                    <p>אין עדיין היסטוריית קמפיינים</p>
                                </CardContent>
                            </Card>
                        ) : (
                            history.map(h => {
                                const convRate = h.success_count > 0 ? Math.round((h.converted_count || 0) / h.success_count * 100) : 0;
                                const readRate = h.success_count > 0 ? Math.round((h.read_count || 0) / h.success_count * 100) : 0;
                                return (
                                <Card key={h.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={async () => {
                                    setDetailsOpen(h.id);
                                    try {
                                        const r = await base44.functions.getCampaignDetails({ campaign_send_id: h.id });
                                        setDetails(r?.data || r);
                                    } catch {}
                                }}>
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="font-bold text-sm">{h.campaign_label || h.campaign_key}</span>
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                                        h.channel === 'whatsapp' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                                    }`}>
                                                        {h.channel === 'whatsapp' ? '💬 WhatsApp' : '📨 SMS'}
                                                    </span>
                                                    {h.media_url && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">🖼️ עם תמונה</span>}
                                                </div>
                                                <p className="text-xs text-gray-600 line-clamp-2">{h.message_template}</p>
                                            </div>
                                            <span className="text-[10px] text-gray-400 whitespace-nowrap">{new Date(h.sent_at).toLocaleString('he-IL')}</span>
                                        </div>
                                        {/* Stats grid */}
                                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 pt-3 border-t">
                                            <div className="text-center">
                                                <div className="text-lg font-bold text-gray-700">{h.recipient_count}</div>
                                                <div className="text-[10px] text-gray-500">נשלחו</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-lg font-bold text-emerald-700">{h.delivered_count || 0}</div>
                                                <div className="text-[10px] text-gray-500">נמסרו</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-lg font-bold text-blue-700">{h.read_count || 0}</div>
                                                <div className="text-[10px] text-gray-500">נפתחו ({readRate}%)</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-lg font-bold text-purple-700">{h.converted_count || 0}</div>
                                                <div className="text-[10px] text-gray-500">הזמינו ({convRate}%)</div>
                                            </div>
                                            <div className="text-center">
                                                <div className="text-lg font-bold text-amber-700">₪{(h.estimated_cost_ils || 0).toFixed(2)}</div>
                                                <div className="text-[10px] text-gray-500">עלות</div>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-center text-gray-400 mt-2">לחץ לפרטים מלאים</p>
                                    </CardContent>
                                </Card>
                                );
                            })
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* === Per-campaign drill-down === */}
            {detailsOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setDetailsOpen(null); setDetails(null); }}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
                            <h3 className="font-black text-lg">📊 פרטי קמפיין</h3>
                            <button onClick={() => { setDetailsOpen(null); setDetails(null); }} className="text-2xl text-gray-400 hover:text-gray-700">✕</button>
                        </div>
                        <div className="p-4">
                            {!details ? (
                                <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>
                            ) : (
                                <>
                                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                                        <p className="font-bold text-sm">{details.send?.campaign_label}</p>
                                        <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{details.send?.message_template}</p>
                                        {details.send?.media_url && (
                                            <img src={details.send.media_url} alt="" className="max-h-32 mt-2 rounded" />
                                        )}
                                    </div>
                                    <div className="grid grid-cols-5 gap-2 mb-4 text-center">
                                        <div><div className="text-2xl font-black">{details.send?.recipient_count}</div><div className="text-[10px] text-gray-500">נשלחו</div></div>
                                        <div><div className="text-2xl font-black text-emerald-700">{details.send?.delivered_count || 0}</div><div className="text-[10px] text-gray-500">נמסרו</div></div>
                                        <div><div className="text-2xl font-black text-blue-700">{details.send?.read_count || 0}</div><div className="text-[10px] text-gray-500">נפתחו</div></div>
                                        <div><div className="text-2xl font-black text-purple-700">{details.send?.converted_count || 0}</div><div className="text-[10px] text-gray-500">הזמינו</div></div>
                                        <div><div className="text-2xl font-black text-amber-700">₪{(details.send?.estimated_cost_ils || 0).toFixed(2)}</div><div className="text-[10px] text-gray-500">עלות</div></div>
                                    </div>
                                    <h4 className="font-bold text-sm mb-2">🧑‍🤝‍🧑 רשימת לקוחות ({details.recipients?.length}):</h4>
                                    <div className="space-y-1 max-h-96 overflow-y-auto">
                                        {details.recipients?.map(r => {
                                            const statusColor = {
                                                queued: 'bg-gray-100 text-gray-700',
                                                sent: 'bg-gray-100 text-gray-700',
                                                delivered: 'bg-emerald-100 text-emerald-700',
                                                read: 'bg-blue-100 text-blue-700',
                                                failed: 'bg-red-100 text-red-700',
                                            }[r.status] || 'bg-gray-100 text-gray-700';
                                            return (
                                                <div key={r.id} className="flex items-center gap-2 p-2 border rounded-lg text-xs hover:bg-gray-50">
                                                    <span className="font-bold flex-1">{r.customer_name || r.phone}</span>
                                                    <span className="text-gray-500">{r.phone}</span>
                                                    <span className={`px-2 py-0.5 rounded-full font-bold ${statusColor}`}>
                                                        {r.status === 'read' ? '👁️ פתח' : r.status === 'delivered' ? '✅ נמסר' : r.status === 'sent' ? '📤 נשלח' : r.status === 'failed' ? '❌ נכשל' : '⏳ ממתין'}
                                                    </span>
                                                    {r.converted_reservation_id && (
                                                        <span className="px-2 py-0.5 rounded-full bg-purple-200 text-purple-800 font-bold">
                                                            🎉 הזמין!
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
