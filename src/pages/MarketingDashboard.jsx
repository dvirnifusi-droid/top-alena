import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Mail, MessageSquare, Send, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from 'recharts';
import { format, subDays, parseISO, startOfDay } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';

export default function MarketingDashboard() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('30');

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const data = await base44.entities.CampaignLog.list('-sent_at', 500);
            setLogs(data || []);
        } catch (e) {
            console.error('Error loading campaign logs:', e);
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    const days = parseInt(period);
    const cutoff = subDays(new Date(), days);
    const filteredLogs = logs.filter(l => l.sent_at && new Date(l.sent_at) >= cutoff);

    const emailLogs = filteredLogs.filter(l => l.type === 'email');
    const smsLogs = filteredLogs.filter(l => l.type === 'sms');

    const totalEmailsSent = emailLogs.reduce((s, l) => s + (l.sent_count || 0), 0);
    const totalSmsSent = smsLogs.reduce((s, l) => s + (l.sent_count || 0), 0);
    const totalCampaigns = filteredLogs.length;
    const avgRecipients = totalCampaigns > 0
        ? Math.round(filteredLogs.reduce((s, l) => s + (l.recipients_count || 0), 0) / totalCampaigns)
        : 0;

    // Build daily chart data
    const dailyMap = {};
    for (let i = days - 1; i >= 0; i--) {
        const d = format(subDays(new Date(), i), 'dd/MM');
        dailyMap[d] = { date: d, email: 0, sms: 0 };
    }
    filteredLogs.forEach(l => {
        if (!l.sent_at) return;
        const d = format(parseISO(l.sent_at), 'dd/MM');
        if (dailyMap[d]) {
            if (l.type === 'email') dailyMap[d].email += l.sent_count || 0;
            if (l.type === 'sms') dailyMap[d].sms += l.sent_count || 0;
        }
    });
    const chartData = Object.values(dailyMap);

    // Recent campaigns table
    const recentCampaigns = [...filteredLogs]
        .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))
        .slice(0, 10);

    return (
        <div className="p-4 md:p-8 space-y-6" dir="rtl">
            <PageHeader
                title="דאשבורד שיווקי"
                subtitle="מעקב אחרי קמפיינים, שליחות מייל ו-SMS"
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

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#F4ECD8] rounded-lg flex items-center justify-center">
                                <Send className="w-5 h-5 text-[#44512C]" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">סה"כ קמפיינים</p>
                                <p className="text-2xl font-bold">{totalCampaigns}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#F4ECD8] rounded-lg flex items-center justify-center">
                                <Mail className="w-5 h-5 text-[#A04A2E]" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">מיילים נשלחו</p>
                                <p className="text-2xl font-bold">{totalEmailsSent.toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <MessageSquare className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">SMS נשלחו</p>
                                <p className="text-2xl font-bold">{totalSmsSent.toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-[#F4ECD8] rounded-lg flex items-center justify-center">
                                <Users className="w-5 h-5 text-[#A04A2E]" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">ממוצע נמענים</p>
                                <p className="text-2xl font-bold">{avgRecipients}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">שליחות לפי יום</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="h-64 flex items-center justify-center text-gray-400">טוען...</div>
                    ) : chartData.every(d => d.email === 0 && d.sms === 0) ? (
                        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
                            אין נתונים לתקופה זו. שלח קמפיין כדי לראות נתונים כאן.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="email" name="מיילים" fill="#6366f1" radius={[4,4,0,0]} />
                                <Bar dataKey="sms" name="SMS" fill="#22c55e" radius={[4,4,0,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* Recent Campaigns */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">קמפיינים אחרונים</CardTitle>
                </CardHeader>
                <CardContent>
                    {recentCampaigns.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">לא נמצאו קמפיינים בתקופה זו.</p>
                    ) : (
                        <div className="space-y-3">
                            {recentCampaigns.map(log => (
                                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border bg-gray-50 gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${log.type === 'email' ? 'bg-[#F4ECD8]' : 'bg-green-100'}`}>
                                            {log.type === 'email'
                                                ? <Mail className="w-4 h-4 text-[#A04A2E]" />
                                                : <MessageSquare className="w-4 h-4 text-green-600" />}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-medium text-sm truncate">
                                                {log.subject || log.body_preview || '—'}
                                            </p>
                                            {log.template_name && (
                                                <p className="text-xs text-gray-400">תבנית: {log.template_name}</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 flex-shrink-0 text-sm">
                                        <Badge variant="outline">
                                            {log.sent_count} נשלחו
                                            {log.failed_count > 0 && <span className="text-red-500 mr-1">/ {log.failed_count} נכשלו</span>}
                                        </Badge>
                                        <span className="text-gray-400 text-xs">
                                            {log.sent_at ? format(parseISO(log.sent_at), 'dd/MM HH:mm') : ''}
                                        </span>
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