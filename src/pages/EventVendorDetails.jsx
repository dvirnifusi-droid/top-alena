// Vendor profile + agreements + timeline + linked events + commission summary.
// Same page handles create (id=new) and edit/view.
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Save, MessageCircle, Mail, FileText, Trash2, ArrowRight, Plus } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { VENDOR_CATEGORIES } from './EventVendors';

const STAGES = [
    { key: 'on_contract', label: 'עם חתימת חוזה' },
    { key: 'on_event_date', label: 'ביום האירוע' },
    { key: 'on_payment', label: 'על קבלת תשלום' },
];

export default function EventVendorDetails() {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const id = params.get('id');
    const isNew = !id || id === 'new';

    const [vendor, setVendor] = useState({
        business_name: '', contact_name: '', phone: '', whatsapp: '', email: '', city: '',
        website: '', instagram: '', business_id: '', vat_type: 'company',
        categories: [], specialties: '',
        default_commission_pct: '', default_commission_fixed_ils: '',
        commission_stage: 'on_event_date',
        bank_name: '', bank_branch: '', bank_account: '', bank_account_owner: '',
        insurance_url: '', insurance_expiry: '',
        business_license_url: '', business_license_expiry: '',
        status: 'active', rating: '', internal_notes: '',
        marketing_consent: true,
    });
    const [agreements, setAgreements] = useState([]);
    const [eventLinks, setEventLinks] = useState([]);
    const [openEvents, setOpenEvents] = useState([]);
    const [closedEvents, setClosedEvents] = useState([]);
    const [timeline, setTimeline] = useState([]);
    const [stats, setStats] = useState({
        total_events: 0, open_count: 0, closed_count: 0,
        revenue_brought_ils: 0,
        total_commission_due: 0, total_commission_paid: 0,
    });
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    const load = async () => {
        if (isNew) return;
        setLoading(true);
        try {
            const r = await base44.functions.getVendor({ id });
            const d = r?.data ?? r;
            if (d?.vendor) {
                const v = { ...d.vendor };
                ['insurance_expiry', 'business_license_expiry'].forEach(k => {
                    if (v[k]) v[k] = String(v[k]).slice(0, 10);
                });
                v.categories = Array.isArray(v.categories) ? v.categories : [];
                setVendor(v);
                setAgreements(d.agreements || []);
                setEventLinks(d.events || []);
                setOpenEvents(d.open_events || []);
                setClosedEvents(d.closed_events || []);
                setTimeline(d.timeline || []);
                setStats(d.stats || stats);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

    const set = (k, v) => setVendor(p => ({ ...p, [k]: v }));
    const toggleCategory = (c) => set('categories', vendor.categories.includes(c)
        ? vendor.categories.filter(x => x !== c)
        : [...vendor.categories, c]);

    const save = async () => {
        if (!vendor.business_name?.trim()) { setMsg('שם העסק חובה'); return; }
        setSaving(true);
        try {
            if (isNew) {
                const r = await base44.functions.createVendor(vendor);
                const d = r?.data ?? r;
                if (d?.vendor?.id) navigate(createPageUrl(`EventVendorDetails?id=${d.vendor.id}`));
            } else {
                await base44.functions.updateVendor({ id, ...vendor });
                setMsg('✅ נשמר');
                setTimeout(() => setMsg(''), 1500);
                load();
            }
        } catch (e) { setMsg('שגיאה: ' + (e?.message || '')); }
        finally { setSaving(false); }
    };

    const remove = async () => {
        if (!confirm('למחוק את הספק? פעולה לא הפיכה.')) return;
        await base44.functions.deleteVendor({ id });
        navigate(createPageUrl('EventVendors'));
    };

    const quickWhatsApp = async () => {
        const text = prompt('הודעת WhatsApp לספק:');
        if (!text) return;
        try {
            await base44.functions.sendVendorWhatsApp({ vendor_id: id, message: text });
            setMsg('✅ נשלח'); setTimeout(() => setMsg(''), 1500); load();
        } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    };

    const quickEmail = async () => {
        const subject = prompt('נושא המייל:');
        if (!subject) return;
        const text = prompt('תוכן המייל:');
        if (!text) return;
        try {
            const html = `<div dir="rtl">${text.replace(/\n/g, '<br>')}</div>`;
            await base44.functions.sendVendorEmail({ vendor_id: id, subject, html });
            setMsg('✅ נשלח'); setTimeout(() => setMsg(''), 1500); load();
        } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    };

    if (loading) return <div className="p-6 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;

    return (
        <div className="p-4 md:p-6 min-h-screen bg-gradient-to-b from-gray-50 to-gray-100" dir="rtl">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                    <Link to={createPageUrl('EventVendors')} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
                        <ArrowRight className="w-4 h-4" /> חזרה לרשימה
                    </Link>
                    <div className="flex gap-2">
                        {!isNew && (
                            <>
                                <Button onClick={quickWhatsApp} variant="outline" size="sm" className="border-emerald-300 text-emerald-700">
                                    <MessageCircle className="w-4 h-4 ml-1" /> שלח WhatsApp
                                </Button>
                                <Button onClick={quickEmail} variant="outline" size="sm" className="border-purple-300 text-purple-700">
                                    <Mail className="w-4 h-4 ml-1" /> שלח מייל
                                </Button>
                                <Button onClick={remove} variant="outline" size="sm" className="border-red-300 text-red-700">
                                    <Trash2 className="w-4 h-4 ml-1" /> מחק
                                </Button>
                            </>
                        )}
                        <Button onClick={save} disabled={saving} className="bg-[#44512C] hover:bg-[#7A3722] text-white">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
                            {isNew ? 'צור ספק' : 'שמור שינויים'}
                        </Button>
                    </div>
                </div>

                {msg && <div className="mb-3 p-2 text-sm rounded bg-emerald-50 text-emerald-800 border border-emerald-200">{msg}</div>}

                {!isNew && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3 mb-4">
                        <Card><CardContent className="p-3 text-center">
                            <div className="text-2xl font-black text-blue-700">{stats.open_count || 0}</div>
                            <div className="text-[10px] text-gray-500">🟢 אירועים פתוחים</div>
                        </CardContent></Card>
                        <Card><CardContent className="p-3 text-center">
                            <div className="text-2xl font-black text-gray-700">{stats.closed_count || 0}</div>
                            <div className="text-[10px] text-gray-500">✅ אירועים סגורים</div>
                        </CardContent></Card>
                        <Card><CardContent className="p-3 text-center">
                            <div className="text-2xl font-black text-[#A04A2E]">₪{(stats.revenue_brought_ils || 0).toLocaleString()}</div>
                            <div className="text-[10px] text-gray-500">💰 הכנסות שהובאו</div>
                        </CardContent></Card>
                        <Card><CardContent className="p-3 text-center">
                            <div className="text-2xl font-black text-amber-700">₪{(stats.total_commission_due || 0).toLocaleString()}</div>
                            <div className="text-[10px] text-gray-500">⏳ עמלות לתשלום</div>
                        </CardContent></Card>
                        <Card><CardContent className="p-3 text-center">
                            <div className="text-2xl font-black text-emerald-700">₪{(stats.total_commission_paid || 0).toLocaleString()}</div>
                            <div className="text-[10px] text-gray-500">✅ עמלות שולמו</div>
                        </CardContent></Card>
                    </div>
                )}

                <Tabs defaultValue="profile">
                    <TabsList className="grid grid-cols-5 max-w-2xl mb-4">
                        <TabsTrigger value="profile">📋 פרופיל</TabsTrigger>
                        <TabsTrigger value="terms">💰 תנאים</TabsTrigger>
                        <TabsTrigger value="docs">📄 מסמכים</TabsTrigger>
                        <TabsTrigger value="events">🗓️ אירועים</TabsTrigger>
                        <TabsTrigger value="timeline">📨 פעילות</TabsTrigger>
                    </TabsList>

                    {/* ===== Profile ===== */}
                    <TabsContent value="profile">
                        <Card><CardContent className="p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Field label="שם העסק *"><Input value={vendor.business_name} onChange={e => set('business_name', e.target.value)} /></Field>
                                <Field label="איש קשר"><Input value={vendor.contact_name || ''} onChange={e => set('contact_name', e.target.value)} /></Field>
                                <Field label="טלפון"><Input value={vendor.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
                                <Field label="WhatsApp"><Input value={vendor.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} placeholder="אם שונה מהטלפון" /></Field>
                                <Field label="מייל"><Input type="email" value={vendor.email || ''} onChange={e => set('email', e.target.value)} /></Field>
                                <Field label="עיר"><Input value={vendor.city || ''} onChange={e => set('city', e.target.value)} /></Field>
                                <Field label="אתר"><Input value={vendor.website || ''} onChange={e => set('website', e.target.value)} /></Field>
                                <Field label="Instagram"><Input value={vendor.instagram || ''} onChange={e => set('instagram', e.target.value)} /></Field>
                                <Field label="ח.פ. / ת.ז."><Input value={vendor.business_id || ''} onChange={e => set('business_id', e.target.value)} /></Field>
                                <Field label="סוג עוסק">
                                    <select value={vendor.vat_type || ''} onChange={e => set('vat_type', e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full bg-white">
                                        <option value="company">חברה בע"מ</option>
                                        <option value="authorized">עוסק מורשה</option>
                                        <option value="exempt">עוסק פטור</option>
                                    </select>
                                </Field>
                            </div>
                            <div>
                                <p className="text-xs font-bold mb-2 text-gray-700">תחומי עיסוק (בחר את כל הרלוונטי):</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {VENDOR_CATEGORIES.map(c => (
                                        <button key={c.key} type="button" onClick={() => toggleCategory(c.key)}
                                            className={`text-xs px-3 py-1.5 rounded-full font-bold border transition-colors ${
                                                vendor.categories?.includes(c.key)
                                                    ? 'bg-[#44512C] text-white border-[#44512C]'
                                                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#D9BD83]'
                                            }`}>{c.label}</button>
                                    ))}
                                </div>
                            </div>
                            <Field label="התמחות / הערות פתוחות">
                                <Textarea value={vendor.specialties || ''} onChange={e => set('specialties', e.target.value)} rows={2} placeholder="חתונות בוטיק / טיולי גליל / סטייליסט אירועי חברה..." />
                            </Field>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Field label="סטטוס">
                                    <select value={vendor.status || ''} onChange={e => set('status', e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full bg-white">
                                        <option value="active">פעיל</option>
                                        <option value="paused">מושהה</option>
                                        <option value="terminated">סיום עבודה</option>
                                    </select>
                                </Field>
                                <Field label="דירוג (1-5)"><Input type="number" min="1" max="5" value={vendor.rating || ''} onChange={e => set('rating', e.target.value)} /></Field>
                                <Field label="הסכמת שיווק">
                                    <label className="flex items-center gap-2 text-xs">
                                        <input type="checkbox" checked={!!vendor.marketing_consent} onChange={e => set('marketing_consent', e.target.checked)} />
                                        ניתן לשלוח דיוור עסקי
                                    </label>
                                </Field>
                            </div>
                            <Field label="הערות פנימיות">
                                <Textarea value={vendor.internal_notes || ''} onChange={e => set('internal_notes', e.target.value)} rows={3} placeholder="לדוגמה: עובד טוב עם אירועים גדולים, יש לתאם מראש, צריך גיפט באירוע 50+..." />
                            </Field>
                        </CardContent></Card>
                    </TabsContent>

                    {/* ===== Commercial terms + bank ===== */}
                    <TabsContent value="terms">
                        <Card><CardContent className="p-4 space-y-3">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Field label="עמלה ברירת מחדל (%)">
                                    <Input type="number" step="0.5" value={vendor.default_commission_pct || ''} onChange={e => set('default_commission_pct', e.target.value)} placeholder="7.5" />
                                </Field>
                                <Field label="או עמלה קבועה (₪)">
                                    <Input type="number" value={vendor.default_commission_fixed_ils || ''} onChange={e => set('default_commission_fixed_ils', e.target.value)} placeholder="1500" />
                                </Field>
                                <Field label="מועד תשלום העמלה">
                                    <select value={vendor.commission_stage || 'on_event_date'} onChange={e => set('commission_stage', e.target.value)} className="border rounded-md px-3 py-2 text-sm w-full bg-white">
                                        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                    </select>
                                </Field>
                            </div>
                            <p className="text-[11px] text-gray-500">בכל אירוע ספציפי אפשר לעקוף את הערכים האלה.</p>

                            <div className="border-t pt-3 mt-3">
                                <h4 className="text-sm font-bold mb-2">🏦 פרטי תשלום עמלות</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Field label="שם הבנק"><Input value={vendor.bank_name || ''} onChange={e => set('bank_name', e.target.value)} /></Field>
                                    <Field label="סניף"><Input value={vendor.bank_branch || ''} onChange={e => set('bank_branch', e.target.value)} /></Field>
                                    <Field label="מספר חשבון"><Input value={vendor.bank_account || ''} onChange={e => set('bank_account', e.target.value)} /></Field>
                                    <Field label="שם בעל החשבון"><Input value={vendor.bank_account_owner || ''} onChange={e => set('bank_account_owner', e.target.value)} /></Field>
                                </div>
                            </div>
                        </CardContent></Card>
                    </TabsContent>

                    {/* ===== Documents (insurance + license + agreements) ===== */}
                    <TabsContent value="docs">
                        <Card><CardContent className="p-4 space-y-4">
                            <div>
                                <h4 className="text-sm font-bold mb-2">🛡️ תעודת ביטוח</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Field label="קובץ (URL)"><Input value={vendor.insurance_url || ''} onChange={e => set('insurance_url', e.target.value)} placeholder="https://..." /></Field>
                                    <Field label="תוקף עד"><Input type="date" value={vendor.insurance_expiry || ''} onChange={e => set('insurance_expiry', e.target.value)} /></Field>
                                </div>
                            </div>
                            <div className="border-t pt-3">
                                <h4 className="text-sm font-bold mb-2">📜 רישיון עסק</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <Field label="קובץ (URL)"><Input value={vendor.business_license_url || ''} onChange={e => set('business_license_url', e.target.value)} placeholder="https://..." /></Field>
                                    <Field label="תוקף עד"><Input type="date" value={vendor.business_license_expiry || ''} onChange={e => set('business_license_expiry', e.target.value)} /></Field>
                                </div>
                            </div>
                            {!isNew && (
                                <div className="border-t pt-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-sm font-bold">📄 הסכמים</h4>
                                        <Button size="sm" variant="outline" onClick={async () => {
                                            const title = prompt('שם ההסכם:'); if (!title) return;
                                            const file_url = prompt('URL לקובץ:'); if (!file_url) return;
                                            const pct = prompt('עמלה % (אם רלוונטי):');
                                            await base44.functions.addVendorAgreement({
                                                vendor_id: id, title, file_url,
                                                commission_pct: pct ? Number(pct) : undefined,
                                                commission_stage: vendor.commission_stage,
                                            });
                                            load();
                                        }}>
                                            <Plus className="w-3 h-3 ml-1" /> הסכם חדש
                                        </Button>
                                    </div>
                                    {agreements.length === 0 ? (
                                        <p className="text-xs text-gray-400">לא הועלו הסכמים עדיין</p>
                                    ) : (
                                        <div className="space-y-1">
                                            {agreements.map(a => (
                                                <div key={a.id} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded">
                                                    <div>
                                                        <span className="font-bold">{a.title || 'הסכם'}</span>
                                                        <span className="text-gray-500 mr-2">{a.commission_pct ? `${a.commission_pct}%` : ''}</span>
                                                        <span className={`mr-2 px-2 py-0.5 rounded-full ${a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>{a.status}</span>
                                                    </div>
                                                    {a.file_url && <a href={a.file_url} target="_blank" rel="noopener noreferrer" className="text-[#A04A2E] underline">פתח</a>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent></Card>
                    </TabsContent>

                    {/* ===== Linked events + commissions ===== */}
                    <TabsContent value="events">
                        <Card><CardContent className="p-4 space-y-5">
                            {eventLinks.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">אין אירועים מקושרים. אפשר לקשר ספק לאירוע ספציפי מתוך עמוד האירוע ב-EventsPrivate.</p>
                            ) : (
                                <>
                                    <EventGroup
                                        title={`🟢 אירועים פתוחים (${openEvents.length})`}
                                        emptyText="אין אירועים פתוחים כרגע"
                                        accent="border-blue-300 bg-blue-50/40"
                                        links={openEvents}
                                    />
                                    <EventGroup
                                        title={`✅ אירועים סגורים (${closedEvents.length})`}
                                        emptyText="אין אירועים סגורים עדיין"
                                        accent="border-gray-200 bg-gray-50/40"
                                        links={closedEvents}
                                    />
                                </>
                            )}
                        </CardContent></Card>
                    </TabsContent>

                    {/* ===== Timeline ===== */}
                    <TabsContent value="timeline">
                        <Card><CardContent className="p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-bold">📨 לוג פעילות</h4>
                                <Button size="sm" variant="outline" onClick={async () => {
                                    const kind = prompt('סוג (call/meeting/note):', 'call'); if (!kind) return;
                                    const subj = prompt('כותרת:');
                                    const body = prompt('תוכן:');
                                    await base44.functions.logVendorContact({ vendor_id: id, kind, subject: subj, body });
                                    load();
                                }}>
                                    <Plus className="w-3 h-3 ml-1" /> רישום חדש
                                </Button>
                            </div>
                            {timeline.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">אין רישומים עדיין</p>
                            ) : (
                                <div className="space-y-2">
                                    {timeline.map(c => (
                                        <div key={c.id} className="p-2 border-r-4 border-[#D9BD83] bg-[#FAF5E8] text-xs">
                                            <div className="flex justify-between">
                                                <span className="font-bold">{c.kind}</span>
                                                <span className="text-gray-500">{new Date(c.createdAt).toLocaleString('he-IL')}</span>
                                            </div>
                                            {c.subject && <div className="font-semibold mt-0.5">{c.subject}</div>}
                                            {c.body && <div className="text-gray-700 mt-0.5 whitespace-pre-wrap">{String(c.body).slice(0, 300)}{String(c.body).length > 300 ? '…' : ''}</div>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent></Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label className="block text-xs font-bold mb-1 text-gray-700">{label}</label>
            {children}
        </div>
    );
}

// Section that renders a labelled list of EventVendor links + a per-section
// revenue/commission summary. Used twice on the vendor card — once for open
// events, once for closed.
function EventGroup({ title, emptyText, accent, links }) {
    const totalRevenue = links
        .filter(l => l.role === 'referrer' && l.event)
        .reduce((s, l) => s + (Number(l.event?.total_ils) || 0), 0);
    const totalCommission = links.reduce((s, l) => s + (Number(l.commission_amount_ils) || 0), 0);
    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-sm">{title}</h4>
                {links.length > 0 && (
                    <span className="text-[11px] text-gray-500">
                        הכנסות: <strong className="text-[#A04A2E]">₪{totalRevenue.toLocaleString()}</strong>
                        {' · '}עמלות: <strong>₪{totalCommission.toLocaleString()}</strong>
                    </span>
                )}
            </div>
            {links.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">{emptyText}</p>
            ) : (
                <div className="space-y-2">
                    {links.map(l => (
                        <div key={l.id} className={`p-3 border rounded-lg flex items-start justify-between gap-3 text-sm ${accent}`}>
                            <div className="flex-1">
                                <div className="font-bold">{l.event?.customer_name || '—'} · {l.event?.event_date || '—'}</div>
                                <div className="text-xs text-gray-600 mt-0.5">
                                    {l.role === 'referrer' ? '🎯 הביא את הלקוח' : `🛠️ ספק שירות${l.service_type ? ' · ' + l.service_type : ''}`}
                                    {l.event?.guest_count ? ` · ${l.event.guest_count} סועדים` : ''}
                                    {l.role === 'referrer' && l.event?.total_ils ? ` · אירוע ₪${Number(l.event.total_ils).toLocaleString()}` : ''}
                                </div>
                                {l.notes && <div className="text-xs text-gray-500 italic mt-1">{l.notes}</div>}
                            </div>
                            <div className="text-left">
                                <div className="font-black text-base">₪{(l.commission_amount_ils || 0).toLocaleString()}</div>
                                <div className={`text-[10px] inline-block px-2 py-0.5 rounded-full ${l.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : l.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : l.payment_status === 'waived' ? 'bg-gray-200 text-gray-500' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                                    {l.payment_status === 'paid' ? '✅ שולם' : l.payment_status === 'partial' ? '🟡 חלקי' : l.payment_status === 'waived' ? 'בוטל' : '⏳ ממתין'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
