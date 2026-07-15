// Event-vendor CRM home — list, filter, add. Each row opens /EventVendorDetails.
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Loader2, Users, Megaphone } from 'lucide-react';
import { createPageUrl } from '@/utils';
import PageHeader from '@/components/shared/PageHeader';

export const VENDOR_CATEGORIES = [
    { key: 'producer', label: '🎯 מפיק/ת אירועים' },
    { key: 'group_tours', label: '🚌 טיולי קבוצות' },
    { key: 'dj', label: '🎧 DJ' },
    { key: 'photographer', label: '📷 צלם/ת' },
    { key: 'videographer', label: '🎥 צלם וידאו' },
    { key: 'florist', label: '💐 פרחים' },
    { key: 'decorator', label: '✨ עיצוב' },
    { key: 'sound', label: '🔊 סאונד' },
    { key: 'lighting', label: '💡 תאורה' },
    { key: 'alcohol', label: '🍷 אלכוהול' },
    { key: 'catering_complement', label: '🍱 קייטרינג משלים' },
    { key: 'kids_entertainment', label: '🎈 בידור ילדים' },
    { key: 'host', label: '🎤 מנחה' },
    { key: 'security', label: '🛡️ אבטחה' },
    { key: 'transport', label: '🚐 הסעות' },
    { key: 'other', label: 'אחר' },
];
const CAT_LABEL = Object.fromEntries(VENDOR_CATEGORIES.map(c => [c.key, c.label]));

export default function EventVendors() {
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [category, setCategory] = useState('all');
    const [status, setStatus] = useState('active');

    const load = async () => {
        setLoading(true);
        try {
            const r = await base44.functions.listVendors({ q, category, status, page: 0, page_size: 100 });
            const d = r?.data ?? r;
            setRows(d?.rows || []);
            setTotal(d?.total || 0);
        } catch (e) { console.error(e); setRows([]); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        const t = setTimeout(load, q ? 350 : 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, category, status]);

    return (
        <div className="p-4 md:p-6 min-h-screen bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE]" dir="rtl">
            <div className="max-w-6xl mx-auto">
                <PageHeader
                    title="ספקי אירועים"
                    subtitle="מפיקים, צלמים, DJ, מובילי טיולים — כל מי שעובד איתנו באירועים"
                    icon={Users}
                    action={
                        <div className="flex gap-2">
                            <Link to={createPageUrl('EventVendorCampaign')}>
                                <Button variant="outline" className="border-[#44512C] text-[#44512C]">
                                    <Megaphone className="w-4 h-4 ml-1" /> דיוור לספקים
                                </Button>
                            </Link>
                            <Link to={createPageUrl('EventVendorDetails?id=new')}>
                                <Button className="bg-[#A04A2E] hover:bg-[#7A3722] text-white">
                                    <Plus className="w-4 h-4 ml-1" /> ספק חדש
                                </Button>
                            </Link>
                        </div>
                    }
                />

                <Card className="mb-4">
                    <CardContent className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="md:col-span-2 relative">
                                <Search className="w-4 h-4 absolute right-3 top-3 text-gray-400" />
                                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="חפש שם / איש קשר / מייל / טלפון" className="pr-10" />
                            </div>
                            <select value={category} onChange={e => setCategory(e.target.value)}
                                className="border rounded-md px-3 py-2 text-sm bg-white">
                                <option value="all">— כל הקטגוריות —</option>
                                {VENDOR_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                            </select>
                            <select value={status} onChange={e => setStatus(e.target.value)}
                                className="border rounded-md px-3 py-2 text-sm bg-white">
                                <option value="all">— כל הסטטוסים —</option>
                                <option value="active">פעיל</option>
                                <option value="paused">מושהה</option>
                                <option value="terminated">סיום עבודה</option>
                            </select>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">{total.toLocaleString()} ספקים</p>
                    </CardContent>
                </Card>

                {loading ? (
                    <div className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-300" /></div>
                ) : rows.length === 0 ? (
                    <Card>
                        <CardContent className="p-12 text-center text-gray-400">
                            <p className="text-lg">אין ספקים עדיין</p>
                            <p className="text-xs mt-1">לחץ "ספק חדש" כדי להוסיף את הראשון</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-2">
                        {rows.map(v => (
                            <Card key={v.id} onClick={() => navigate(createPageUrl(`EventVendorDetails?id=${v.id}`))}
                                className="cursor-pointer hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-black text-base">{v.business_name}</h3>
                                                {v.status === 'paused' && <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">מושהה</span>}
                                                {v.status === 'terminated' && <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full">סיום</span>}
                                                {v.rating ? <span className="text-xs">{'⭐'.repeat(v.rating)}</span> : null}
                                            </div>
                                            <div className="text-xs text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
                                                {v.contact_name && <span>👤 {v.contact_name}</span>}
                                                {v.phone && <span>📞 {v.phone}</span>}
                                                {v.email && <span>✉️ {v.email}</span>}
                                                {v.city && <span>📍 {v.city}</span>}
                                            </div>
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {(Array.isArray(v.categories) ? v.categories : []).map(c => (
                                                    <span key={c} className="text-[10px] bg-[#F4ECD8] text-[#7A3722] font-bold px-2 py-0.5 rounded-full">{CAT_LABEL[c] || c}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="text-left text-xs text-gray-500">
                                            {v.default_commission_pct ? <div>עמלה: {v.default_commission_pct}%</div> : null}
                                            {v.default_commission_fixed_ils ? <div>עמלה קבועה: ₪{v.default_commission_fixed_ils}</div> : null}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
