// Marketing campaign to event-vendors — same idea as the customer one but
// the audience is partners (producers / tours / photographers / ...).
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, ArrowRight, Megaphone } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { VENDOR_CATEGORIES } from './EventVendors';

export default function EventVendorCampaign() {
    const [category, setCategory] = useState('all');
    const [channel, setChannel] = useState('whatsapp');
    const [subject, setSubject] = useState('');
    const [template, setTemplate] = useState('שלום {contact}! 👋\nרצינו לעדכן ש[פרטים כאן]\nנשמח לשמוע מכם 🌿\nצוות עלינא');
    const [preview, setPreview] = useState({ count: 0, sample: [] });
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);

    const loadPreview = async () => {
        setLoading(true);
        try {
            const r = await base44.functions.previewVendorSegment({ category });
            setPreview((r?.data ?? r) || { count: 0, sample: [] });
        } catch { setPreview({ count: 0, sample: [] }); }
        finally { setLoading(false); }
    };
    useEffect(() => { loadPreview(); /* eslint-disable-next-line */ }, [category]);

    const send = async () => {
        if (!template.trim()) { alert('כתוב הודעה'); return; }
        if (channel === 'email' && !subject.trim()) { alert('נושא מייל חובה'); return; }
        if (!confirm(`לשלוח ל-${preview.count} ספקים?`)) return;
        setSending(true);
        try {
            const r = await base44.functions.sendVendorCampaign({
                category, channel, subject, message_template: template,
                campaign_label: VENDOR_CATEGORIES.find(c => c.key === category)?.label || 'כל הספקים',
            });
            setResult((r?.data ?? r) || null);
        } catch (e) { setResult({ error: e?.message || 'שגיאה' }); }
        finally { setSending(false); }
    };

    const estCost = channel === 'email' ? 0 : (preview.count * 0.13).toFixed(2);

    return (
        <div className="p-4 md:p-6 min-h-screen bg-gradient-to-b from-gray-50 to-gray-100" dir="rtl">
            <div className="max-w-3xl mx-auto">
                <Link to={createPageUrl('EventVendors')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 mb-3">
                    <ArrowRight className="w-4 h-4" /> חזרה לרשימת ספקים
                </Link>
                <h1 className="text-2xl md:text-3xl font-black text-gray-800 flex items-center gap-2 mb-4">
                    <Megaphone className="w-7 h-7 text-[#A04A2E]" />
                    דיוור לספקי אירועים
                </h1>

                <Card className="mb-4"><CardContent className="p-4 space-y-3">
                    <div>
                        <label className="block text-xs font-bold mb-1">קטגוריה</label>
                        <select value={category} onChange={e => setCategory(e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full bg-white">
                            <option value="all">— כל הספקים הפעילים —</option>
                            {VENDOR_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                        </select>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                            <>
                                <div className="font-black text-2xl text-emerald-700">{preview.count} ספקים תואמים</div>
                                {preview.sample?.length > 0 && (
                                    <div className="text-xs text-gray-600 mt-1">
                                        דוגמאות: {preview.sample.map(s => s.business_name).join(', ')}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </CardContent></Card>

                <Card className="mb-4"><CardContent className="p-4 space-y-3">
                    <div className="flex gap-2">
                        <button onClick={() => setChannel('whatsapp')}
                            className={`flex-1 px-3 py-2 rounded font-bold text-sm ${channel === 'whatsapp' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700'}`}>💬 WhatsApp</button>
                        <button onClick={() => setChannel('email')}
                            className={`flex-1 px-3 py-2 rounded font-bold text-sm ${channel === 'email' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}>✉️ Email (חינם)</button>
                    </div>
                    {channel === 'email' && (
                        <div>
                            <label className="block text-xs font-bold mb-1">נושא המייל</label>
                            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="עדכון לשותפים: אירועים בקיץ 2026" />
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold mb-1">הודעה</label>
                        <div className="text-[10px] text-gray-500 mb-1">placeholders: <code className="bg-gray-100 px-1 rounded">{`{business}`}</code> <code className="bg-gray-100 px-1 rounded">{`{contact}`}</code></div>
                        <Textarea value={template} onChange={e => setTemplate(e.target.value)} rows={7} />
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                        💰 עלות משוערת: {channel === 'email' ? 'חינם' : `₪${estCost} (${preview.count} × ₪0.13)`}
                    </div>
                    <Button onClick={send} disabled={sending || !preview.count} className="w-full bg-[#44512C] hover:bg-[#7A3722] text-white py-3 font-bold">
                        {sending ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : <Send className="w-5 h-5 ml-2" />}
                        שלח ל-{preview.count} ספקים
                    </Button>
                </CardContent></Card>

                {result && (
                    <Card><CardContent className="p-4 text-sm">
                        {result.error ? (
                            <div className="text-red-700 font-bold">❌ {result.error}</div>
                        ) : (
                            <>
                                <div className="font-bold mb-1">{result.sent > 0 ? '✅ נשלח' : '⚠️ לא נשלחו'}</div>
                                <div>📤 {result.sent} נשלחו · ❌ {result.failed} נכשלו · 🎯 {result.total_matched} סך כל היעד</div>
                                <div className="text-xs text-gray-500 mt-1">{result.cost_breakdown}</div>
                            </>
                        )}
                    </CardContent></Card>
                )}
            </div>
        </div>
    );
}
