
import React, { useState, useEffect } from 'react';
import { CustomerFeedback } from '@/entities/CustomerFeedback';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, MessageSquare, Loader2, ServerCrash, Phone, Users, Utensils, Award } from 'lucide-react'; // Added Award icon
import { format } from 'date-fns';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

const ratingColors = {
    1: 'bg-red-100 text-red-800',
    2: 'bg-red-100 text-red-800',
    3: 'bg-[#F4ECD8] text-yellow-800',
    4: 'bg-green-100 text-green-800',
    5: 'bg-green-100 text-green-800',
};

function FeedbackCard({ feedback }) {
    // Determine if the feedback is positive and has a phone number for potential customer club inclusion
    const isCustomerClubCandidate = feedback.rating > 3 && feedback.customer_phone;

    return (
        <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row justify-between items-start pb-2">
                <div>
                    <CardTitle className="text-lg">{feedback.customer_name || 'לקוח אנונימי'}</CardTitle>
                    <CardDescription>
                        {feedback.visit_date ? format(new Date(feedback.visit_date), 'dd/MM/yyyy') : format(new Date(feedback.created_date), 'dd/MM/yyyy')}
                    </CardDescription>
                </div>
                <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-5 h-5 ${i < feedback.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                    ))}
                </div>
            </CardHeader>
            <CardContent>
                {feedback.comments && <p className="italic text-gray-700">"{feedback.comments}"</p>}
                
                <div className="flex flex-wrap gap-2 mt-4 text-xs">
                     <Badge variant="secondary" className={ratingColors[feedback.rating]}>
                        דירוג כללי: {feedback.rating}/5
                    </Badge>
                    {feedback.food_rating > 0 && <Badge variant="outline">אוכל: {feedback.food_rating}/5</Badge>}
                    {feedback.service_rating > 0 && <Badge variant="outline">שירות: {feedback.service_rating}/5</Badge>}
                </div>
                
                <div className="border-t mt-4 pt-4 text-sm text-gray-600 space-y-2">
                    {feedback.customer_phone && (
                        <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-500" />
                            <span>{feedback.customer_phone}</span>
                        </div>
                    )}
                    {isCustomerClubCandidate && (
                        <div className="flex items-center gap-2 text-[#7A3722] font-semibold">
                            <Award className="w-4 h-4 text-[#A04A2E]" />
                            <span>מועמד/ת למועדון לקוחות</span>
                        </div>
                    )}
                    {feedback.party_size && (
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-gray-500" />
                            <span>{feedback.party_size} סועדים</span>
                        </div>
                    )}
                    {feedback.table_number && (
                        <div className="flex items-center gap-2">
                            <Utensils className="w-4 h-4 text-gray-500" />
                            <span>מקור: ברקוד {feedback.table_number !== 'general' ? `שולחן ${feedback.table_number}` : 'כללי'}</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// The Google-review funnel: QR scans → completed surveys → happy guests steered
// to Google (vs unhappy ones routed privately to the owner) + rating trend.
function ReviewTrackingDashboard() {
    const [data, setData] = useState(null);
    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let alive = true; setLoading(true);
        base44.functions.getReviewTracking({ days })
            .then((r) => { if (alive) { setData(r?.data || r); setLoading(false); } })
            .catch(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [days]);

    const d = data || {};
    const dist = d.distribution || {};
    const distMax = Math.max(1, ...Object.values(dist).map(Number));
    const last14 = (d.trend || []).slice(-14);
    const maxTrend = Math.max(1, ...last14.map((t) => Math.max(t.scans, t.completed)));

    const Kpi = ({ label, value, sub, color }) => (
        <div className="rounded-2xl border p-4 bg-white text-center" style={{ borderColor: '#E8D9B5' }}>
            <div className="text-3xl font-extrabold" style={{ color: color || '#231D17' }}>{value}</div>
            <div className="text-xs font-semibold mt-1" style={{ color: '#7A6F5D' }}>{label}</div>
            {sub ? <div className="text-[11px] mt-0.5" style={{ color: '#9a8f7d' }}>{sub}</div> : null}
        </div>
    );

    return (
        <Card className="mb-6" style={{ background: '#FFFDF8', borderColor: '#E8D9B5' }}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <div>
                    <CardTitle className="text-lg flex items-center gap-2">⭐ מעקב ביקורות גוגל</CardTitle>
                    <CardDescription>סריקת QR ← סקר שהושלם ← מרוצים שנשלחו לגוגל</CardDescription>
                </div>
                <div className="flex gap-1">
                    {[7, 30, 90].map((n) => (
                        <button key={n} onClick={() => setDays(n)} className="px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={days === n ? { background: '#44512C', color: '#fff', borderColor: '#44512C' } : { background: '#fff', color: '#7A6F5D', borderColor: '#E8D9B5' }}>
                            {n} ימים
                        </button>
                    ))}
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[#B89556]" /></div>
                ) : (
                    <div className="space-y-5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <Kpi label="סריקות QR" value={d.scans ?? 0} />
                            <Kpi label="השלימו סקר" value={d.completed ?? 0} sub={d.completion_rate != null ? `${d.completion_rate}% מהסריקות` : ''} />
                            <Kpi label="נשלחו לגוגל" value={d.good ?? 0} color="#A04A2E" sub={`${d.google_rate ?? 0}% מהמשלימים`} />
                            <Kpi label="דירוג ממוצע" value={(d.avg_rating ?? 0).toFixed(1)} color="#E0A63E" sub={`אוכל ${d.avg_food ?? 0} · שירות ${d.avg_service ?? 0}`} />
                        </div>

                        <div className="rounded-xl p-4" style={{ background: '#F4ECD8' }}>
                            <div className="text-xs font-semibold mb-2" style={{ color: '#44512C' }}>המשפך</div>
                            <div className="flex items-center gap-2 text-center text-sm">
                                <div className="flex-1"><div className="font-bold text-lg">{d.scans ?? 0}</div><div className="text-[11px] text-[#7A6F5D]">סרקו</div></div>
                                <span className="text-[#B89556]">←</span>
                                <div className="flex-1"><div className="font-bold text-lg">{d.completed ?? 0}</div><div className="text-[11px] text-[#7A6F5D]">השלימו</div></div>
                                <span className="text-[#B89556]">←</span>
                                <div className="flex-1"><div className="font-bold text-lg" style={{ color: '#A04A2E' }}>{d.good ?? 0}</div><div className="text-[11px] text-[#7A6F5D]">לגוגל</div></div>
                                <span className="text-[#B89556]">·</span>
                                <div className="flex-1"><div className="font-bold text-lg text-red-600">{d.bad ?? 0}</div><div className="text-[11px] text-[#7A6F5D]">אליך (שלילי)</div></div>
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-5">
                            <div>
                                <div className="text-xs font-semibold mb-2" style={{ color: '#7A6F5D' }}>פילוח דירוגים</div>
                                {[5, 4, 3, 2, 1].map((star) => {
                                    const c = Number(dist[String(star)] || 0);
                                    return (
                                        <div key={star} className="flex items-center gap-2 mb-1.5 text-xs">
                                            <span className="w-8 tabular-nums" style={{ color: '#7A6F5D' }}>{star}★</span>
                                            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: '#F0E6CF' }}>
                                                <div className="h-full rounded-full" style={{ width: `${(c / distMax) * 100}%`, background: star >= 4 ? '#44512C' : star === 3 ? '#B89556' : '#A04A2E' }} />
                                            </div>
                                            <span className="w-6 tabular-nums text-left" style={{ color: '#231D17' }}>{c}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div>
                                <div className="text-xs font-semibold mb-2 flex items-center gap-3" style={{ color: '#7A6F5D' }}>
                                    <span>מגמה יומית</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#B89556' }} />סריקות</span>
                                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{ background: '#44512C' }} />השלימו</span>
                                </div>
                                <div className="flex items-end gap-1 h-24">
                                    {last14.length === 0 ? <span className="text-xs" style={{ color: '#9a8f7d' }}>אין נתונים עדיין</span> : last14.map((t) => (
                                        <div key={t.day} className="flex-1 flex flex-col items-center justify-end gap-0.5" title={`${t.day}: ${t.scans} סריקות · ${t.completed} השלימו · ממוצע ${t.avg}`}>
                                            <div className="w-full flex items-end justify-center gap-0.5 h-20">
                                                <div className="w-1/2 rounded-t" style={{ height: `${(t.scans / maxTrend) * 100}%`, background: '#B89556', minHeight: t.scans ? 2 : 0 }} />
                                                <div className="w-1/2 rounded-t" style={{ height: `${(t.completed / maxTrend) * 100}%`, background: '#44512C', minHeight: t.completed ? 2 : 0 }} />
                                            </div>
                                            <span className="text-[8px]" style={{ color: '#9a8f7d' }}>{t.day.slice(8)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <p className="text-[11px]" style={{ color: '#9a8f7d' }}>
                            💡 "נשלחו לגוגל" = לקוחות שנתנו 4-5★ וקיבלו את הכפתור לביקורת. שלילי (1-3★) מגיע אליך פרטית ולא לגוגל.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

export default function CustomerSurveysPage() {
    const [feedbacks, setFeedbacks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');

    useEffect(() => {
        const loadFeedbacks = async () => {
            setLoading(true);
            try {
                const data = await CustomerFeedback.list('-created_date');
                setFeedbacks(data);
            } catch (err) {
                setError('לא ניתן היה לטעון את המשובים.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        loadFeedbacks();
    }, []);

    const filteredFeedbacks = feedbacks.filter(fb => {
        if (filter === 'all') return true;
        if (filter === 'positive') return fb.rating > 3;
        if (filter === 'negative') return fb.rating <= 3;
        return true;
    });

    if (loading) {
        return (
            <div className="flex justify-center items-center h-screen" dir="rtl">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 mx-auto animate-spin text-[#A04A2E]" />
                    <p className="mt-4 text-lg">טוען משובים...</p>
                </div>
            </div>
        );
    }
    
    if (error) {
        return (
             <div className="flex justify-center items-center h-screen" dir="rtl">
                <div className="text-center text-red-600">
                    <ServerCrash className="w-12 h-12 mx-auto" />
                    <p className="mt-4 text-lg">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <PageShell>
                <PageHeader
                    title="סקרי לקוחות"
                    subtitle="כל המשובים מהלקוחות שלך במקום אחד."
                    icon={MessageSquare}
                />

                <ReviewTrackingDashboard />

                <Tabs value={filter} onValueChange={setFilter} className="mb-6">
                    <TabsList className="grid w-full sm:w-auto sm:grid-cols-3">
                        <TabsTrigger value="all">הכל</TabsTrigger>
                        <TabsTrigger value="positive">משובים חיוביים</TabsTrigger>
                        <TabsTrigger value="negative">משובים שליליים</TabsTrigger>
                    </TabsList>
                </Tabs>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredFeedbacks.length > 0 ? (
                        filteredFeedbacks.map(fb => <FeedbackCard key={fb.id} feedback={fb} />)
                    ) : (
                        <div className="col-span-full text-center py-16">
                            <p className="text-gray-500">לא נמצאו משובים התואמים לסינון.</p>
                        </div>
                    )}
                </div>
        </PageShell>
    );
}
