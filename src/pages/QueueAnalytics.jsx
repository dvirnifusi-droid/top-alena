import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Clock, TrendingDown, UserCheck, Gift } from 'lucide-react';

export default function QueueAnalytics() {
  const [entries, setEntries] = useState([]);
  const [timeframe, setTimeframe] = useState('today');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const all = await base44.entities.QueueEntry.list('-timestamp_register', 1000);
      setEntries(all);
      setLoading(false);
    };
    fetch();
  }, []);

  const getStartDate = () => {
    const now = new Date();
    if (timeframe === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d; }
    if (timeframe === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    if (timeframe === 'month') { return new Date(now.getFullYear(), now.getMonth(), 1); }
    return new Date(0);
  };

  const filtered = entries.filter(e =>
    new Date(e.timestamp_register) >= getStartDate()
  );

  const total = filtered.length;
  const seated = filtered.filter(e => e.status === 'seated');
  const abandoned = filtered.filter(e => e.status === 'abandoned');
  const treated = filtered.filter(e => e.treated);
  const abandonRate = total > 0 ? Math.round((abandoned.length / total) * 100) : 0;

  const avgWaitSeated = seated.length > 0
    ? Math.round(
        seated
          .filter(e => e.timestamp_approved && e.timestamp_end)
          .reduce((sum, e) => sum + (new Date(e.timestamp_end) - new Date(e.timestamp_approved)) / 60000, 0)
        / Math.max(1, seated.filter(e => e.timestamp_approved && e.timestamp_end).length)
      )
    : 0;

  const avgWaitAbandoned = abandoned.length > 0
    ? Math.round(
        abandoned
          .filter(e => e.timestamp_approved && e.timestamp_end)
          .reduce((sum, e) => sum + (new Date(e.timestamp_end) - new Date(e.timestamp_approved)) / 60000, 0)
        / Math.max(1, abandoned.filter(e => e.timestamp_approved && e.timestamp_end).length)
      )
    : 0;

  // נתונים לגרף - לפי שעה
  const hourlyData = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h}:00`,
    נרשמו: 0,
    הוּשבו: 0,
    נטשו: 0,
  }));
  filtered.forEach(e => {
    const h = new Date(e.timestamp_register).getHours();
    hourlyData[h].נרשמו++;
    if (e.status === 'seated') hourlyData[h].הוּשבו++;
    if (e.status === 'abandoned') hourlyData[h].נטשו++;
  });
  const activeHours = hourlyData.filter(h => h.נרשמו > 0);

  const stats = [
    { label: 'סה"כ נרשמו', value: total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { label: 'הוּשבו', value: seated.length, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { label: 'אחוז נטישה', value: `${abandonRate}%`, icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' },
    { label: 'ממוצע המתנה (הוּשב)', value: `${avgWaitSeated} דק'`, icon: Clock, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200' },
    { label: 'ממוצע המתנה (נטש)', value: `${avgWaitAbandoned} דק'`, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { label: 'קיבלו פינוק', value: treated.length, icon: Gift, color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-200' },
  ];

  return (
    <div className="p-4 sm:p-8 min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-800">📊 ניתוח תור - מסעדת עלינא</h1>
          <p className="text-gray-500 text-sm">דוח ניהולי</p>
        </div>

        <Tabs value={timeframe} onValueChange={setTimeframe} className="mb-6">
          <TabsList>
            <TabsTrigger value="today">היום</TabsTrigger>
            <TabsTrigger value="week">שבוע</TabsTrigger>
            <TabsTrigger value="month">חודש</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {stats.map(s => (
            <Card key={s.label} className={`${s.bg} border ${s.border}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
                <p className={`text-2xl font-black ${s.color}`}>{loading ? '-' : s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* גרף שעות */}
        {activeHours.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">התפלגות לפי שעה</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={activeHours}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="נרשמו" fill="#3b82f6" />
                  <Bar dataKey="הוּשבו" fill="#22c55e" />
                  <Bar dataKey="נטשו" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* טבלת רשומות אחרונות */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">רשומות אחרונות</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-right p-3 font-semibold text-gray-600">שם</th>
                    <th className="text-right p-3 font-semibold text-gray-600">טלפון</th>
                    <th className="text-right p-3 font-semibold text-gray-600">סועדים</th>
                    <th className="text-right p-3 font-semibold text-gray-600">סטטוס</th>
                    <th className="text-right p-3 font-semibold text-gray-600">המתנה</th>
                    <th className="text-right p-3 font-semibold text-gray-600">פינוק</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 50).map(e => {
                    const waitMin = e.timestamp_approved && e.timestamp_end
                      ? Math.round((new Date(e.timestamp_end) - new Date(e.timestamp_approved)) / 60000)
                      : null;
                    const statusMap = { pending: 'ממתין', active: 'בתור', seated: 'הוּשב', abandoned: 'נטש' };
                    const statusColor = { pending: 'text-yellow-600', active: 'text-blue-600', seated: 'text-green-600', abandoned: 'text-red-600' };
                    return (
                      <tr key={e.id} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-medium">{e.customer_name}</td>
                        <td className="p-3 text-gray-500">{e.phone}</td>
                        <td className="p-3">{e.party_size}</td>
                        <td className={`p-3 font-semibold ${statusColor[e.status]}`}>{statusMap[e.status]}</td>
                        <td className="p-3 text-gray-500">{waitMin != null ? `${waitMin} דק'` : '-'}</td>
                        <td className="p-3">{e.treated ? '🎁' : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}