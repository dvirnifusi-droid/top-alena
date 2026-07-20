import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Send, TrendingUp, Users, AlertTriangle, Eye } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { format, parseISO } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';

// This page used to read CampaignLog, which only InstagramStudio writes. Every
// real send — birthday, welcome, anniversary, NPS, manual blasts, A/B tests —
// goes to CampaignSend and was never shown here. The dashboard was not empty
// because nothing had been sent; it was reading the wrong table.
export default function MarketingDashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('30');

    useEffect(() => {
        let alive = true;
        setLoading(true);
        base44.functions.getMarketingStats({ days: Number(period) })
            .then(r => { if (alive) setStats((r?.data ?? r) || null); })
            .catch(() => { if (alive) setStats(null); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [period]);

    const totals = stats?.totals || { campaigns: 0, recipients: 0, accepted: 0, failed: 0 };
    const delivery = stats?.delivery || null;
    const campaigns = stats?.campaigns || [];
    const chartData = (stats?.by_day || []).map(d => ({ ...d, label: format(parseISO(d.date), 'dd/MM') }));
    const hasVolume = chartData.some(d => d.whatsapp || d.sms || d.email);

    const Kpi = ({ icon: Icon, tint, label, value, sub }) => (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${tint} rounded-lg flex items-center justify-center shrink-0`}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm text-gray-500 truncate">{label}</p>
                        <p className="text-2xl font-bold">{value}</p>
                        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="p-4 md:p-8 space-y-6" dir="rtl">
            <PageHeader
                title="דאשבורד שיווקי"
                subtitle="קמפיינים שנשלחו בפועל — אוטומטיים וידניים"
                icon={TrendingUp}
                action={
                    <Tabs value={period} onValueChange={setPeriod}>
                        <TabsList>
                            <TabsTrigger value="7">7 ימים</TabsTrigger>
                            <TabsTrigger value="30">30 ימים</TabsTrigger>
                            <TabsTrigger value="90">90 ימים</TabsTrigger>
                        </TabsList>
                    </Tabs>
                }
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Kpi icon={Send} tint="bg-[#F4ECD8] text-[#44512C]" label="קמפיינים" value={totals.campaigns} />
                <Kpi icon={Users} tint="bg-[#F4ECD8] text-[#A04A2E]" label="נמענים" value={totals.recipients.toLocaleString()} />
                <Kpi icon={MessageSquare} tint="bg-green-100 text-green-600" label="יצאו בהצלחה"
                    value={totals.accepted.toLocaleString()}
                    sub={totals.failed > 0 ? `${totals.failed} נכשלו בשליחה` : null} />
                {/* Only shown where delivery was actually measured. A blended rate
                    across untracked drips would read as a catastrophe that is
                    really just an absence of measurement. */}
                {delivery ? (
                    <Kpi icon={Eye} tint="bg-blue-100 text-blue-600" label="הגיעו ליעד"
                        value={`${delivery.delivered_pct}%`}
                        sub={`${delivery.delivered.toLocaleString()} מתוך ${delivery.tracked_recipients.toLocaleString()} שנמדדו`} />
                ) : (
                    <Kpi icon={Eye} tint="bg-gray-100 text-gray-400" label="הגיעו ליעד" value="—"
                        sub="לא נמדד בקמפיינים האלה" />
                )}
            </div>

            {/* The number that would have surfaced the WhatsApp window problem
                months ago, had anything been looking at it. */}
            {delivery && delivery.delivered_pct < 70 && delivery.tracked_recipients >= 20 && (
                <Card className="border-amber-300 bg-amber-50">
                    <CardContent className="p-4 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-sm">
                            <p className="font-bold text-amber-900">
                                רק {delivery.delivered_pct}% מההודעות הגיעו בפועל
                            </p>
                            <p className="text-amber-800 mt-0.5">
                                השאר יצאו מהמערכת ולא נמסרו. הסיבה הנפוצה: וואטסאפ מעביר הודעה חופשית
                                רק תוך 24 שעות מרגע שהלקוח כתב לעסק. הפתרון הוא תבניות וואטסאפ מאושרות.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card>
                <CardHeader><CardTitle className="text-base">שליחות לפי יום</CardTitle></CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-64 flex items-center justify-center text-gray-400">טוען...</div>
                    ) : !hasVolume ? (
                        <div className="h-64 flex items-center justify-center text-gray-400 text-sm text-center px-4">
                            לא נשלחו קמפיינים בתקופה הזו.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="whatsapp" name="וואטסאפ" stackId="a" fill="#22c55e" radius={[0,0,0,0]} />
                                <Bar dataKey="sms" name="SMS" stackId="a" fill="#6366f1" radius={[0,0,0,0]} />
                                <Bar dataKey="email" name="מייל" stackId="a" fill="#A04A2E" radius={[4,4,0,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle className="text-base">קמפיינים אחרונים</CardTitle></CardHeader>
                <CardContent>
                    {campaigns.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">לא נמצאו קמפיינים בתקופה זו.</p>
                    ) : (
                        <div className="space-y-2">
                            {campaigns.slice(0, 15).map(c => (
                                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50 gap-3">
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm truncate">{c.label}</p>
                                        <p className="text-xs text-gray-400">
                                            {c.channel === 'sms' ? 'SMS' : c.channel === 'email' ? 'מייל' : 'וואטסאפ'}
                                            {c.sent_at && ` · ${format(parseISO(c.sent_at), 'dd/MM HH:mm')}`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0 text-xs">
                                        <Badge variant="outline">
                                            {c.accepted}/{c.recipients} יצאו
                                            {c.failed > 0 && <span className="text-red-500 mr-1">· {c.failed} נכשלו</span>}
                                        </Badge>
                                        {c.tracked ? (
                                            <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                                                {c.delivered} הגיעו{c.read > 0 && ` · ${c.read} נקראו`}
                                            </Badge>
                                        ) : (
                                            <span className="text-gray-400">מסירה לא נמדדה</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
