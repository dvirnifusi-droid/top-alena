import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, ScatterChart, Scatter
} from 'recharts';
import { Users, Clock, TrendingDown, UserCheck, Gift, AlertTriangle, Zap, Star } from 'lucide-react';
import FeatureGate from '@/components/platform/FeatureGate';

// Queue works on every plan; the analytics view is a premium sub-feature.
export default function QueueAnalytics() {
  return (
    <FeatureGate feature="queue_analytics" title="אנליטיקת תורים" className="max-w-md mx-auto mt-10">
      <QueueAnalyticsInner />
    </FeatureGate>
  );
}

function QueueAnalyticsInner() {
  const [entries, setEntries] = useState([]);
  const [timeframe, setTimeframe] = useState('today');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.QueueEntry.list('-timestamp_register', 1000).then(all => {
      setEntries(all);
      setLoading(false);
    });
  }, []);

  const getStartDate = () => {
    const now = new Date();
    if (timeframe === 'today') { const d = new Date(now); d.setHours(0,0,0,0); return d; }
    if (timeframe === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    if (timeframe === 'month') { return new Date(now.getFullYear(), now.getMonth(), 1); }
    return new Date(0);
  };

  const filtered = entries.filter(e => new Date(e.timestamp_register) >= getStartDate());

  const total = filtered.length;
  const seated = filtered.filter(e => e.status === 'seated');
  const abandoned = filtered.filter(e => e.status === 'abandoned');
  const treated = filtered.filter(e => e.treated);
  const abandonRate = total > 0 ? Math.round((abandoned.length / total) * 100) : 0;

  const calcAvgWait = (list) => {
    const valid = list.filter(e => e.timestamp_approved && e.timestamp_end);
    if (!valid.length) return 0;
    return Math.round(valid.reduce((sum, e) =>
      sum + (new Date(e.timestamp_end) - new Date(e.timestamp_approved)) / 60000, 0) / valid.length);
  };

  const avgWaitSeated = calcAvgWait(seated);
  const avgWaitAbandoned = calcAvgWait(abandoned);

  // נתוני שעות - כמות נרשמו + נטישה + זמן המתנה ממוצע
  const hourlyMap = {};
  filtered.forEach(e => {
    const h = new Date(e.timestamp_register).getHours();
    if (!hourlyMap[h]) hourlyMap[h] = { registered: 0, seated: 0, abandoned: 0, waitTotal: 0, waitCount: 0 };
    hourlyMap[h].registered++;
    if (e.status === 'seated') hourlyMap[h].seated++;
    if (e.status === 'abandoned') hourlyMap[h].abandoned++;
    if (e.timestamp_approved && e.timestamp_end) {
      hourlyMap[h].waitTotal += (new Date(e.timestamp_end) - new Date(e.timestamp_approved)) / 60000;
      hourlyMap[h].waitCount++;
    }
  });

  const hourlyData = Object.entries(hourlyMap)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([h, d]) => ({
      hour: `${h}:00`,
      נרשמו: d.registered,
      הוּשבו: d.seated,
      נטשו: d.abandoned,
      'נטישה %': d.registered > 0 ? Math.round((d.abandoned / d.registered) * 100) : 0,
      'המתנה ממוצע': d.waitCount > 0 ? Math.round(d.waitTotal / d.waitCount) : 0,
    }));

  // שעות שיא - top 3 לפי כמות נרשמו
  const peakHours = [...hourlyData].sort((a, b) => b.נרשמו - a.נרשמו).slice(0, 3);

  // שעות נטישה גבוהה (>30%)
  const highAbandonHours = hourlyData.filter(h => h['נטישה %'] > 30 && h.נרשמו >= 3);

  const kpis = [
    { label: 'סה"כ נרשמו', value: total, icon: Users, color: 'text-[#44512C]', bg: 'bg-[#F4ECD8]', border: 'border-[#E8D9B5]' },
    { label: 'הוּשבו', value: seated.length, icon: UserCheck, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { label: 'אחוז נטישה', value: `${abandonRate}%`, icon: TrendingDown, color: abandonRate > 25 ? 'text-red-600' : 'text-orange-600', bg: abandonRate > 25 ? 'bg-red-50' : 'bg-orange-50', border: abandonRate > 25 ? 'border-red-200' : 'border-orange-200' },
    { label: 'המתנה ממוצע (הוּשב)', value: `${avgWaitSeated} דק'`, icon: Clock, color: 'text-[#A04A2E]', bg: 'bg-[#F4ECD8]', border: 'border-purple-200' },
    { label: 'המתנה ממוצע (נטש)', value: `${avgWaitAbandoned} דק'`, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
    { label: 'קיבלו פינוק', value: treated.length, icon: Gift, color: 'text-[#A04A2E]', bg: 'bg-[#F4ECD8]', border: 'border-pink-200' },
  ];

  return (
    <div className="p-4 sm:p-8 min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-5xl mx-auto">

        {/* כותרת */}
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-800">📊 ניתוח תור - דוח ניהולי</h1>
          <p className="text-gray-500 text-sm">ניתוח עומסים, נטישות ושעות שיא לניהול צוות</p>
        </div>

        <Tabs value={timeframe} onValueChange={setTimeframe} className="mb-6">
          <TabsList>
            <TabsTrigger value="today">היום</TabsTrigger>
            <TabsTrigger value="week">שבוע</TabsTrigger>
            <TabsTrigger value="month">חודש</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="text-center py-20 text-gray-400">טוען נתונים...</div>
        ) : total === 0 ? (
          <div className="text-center py-20 text-gray-400">אין נתונים לטווח הנבחר</div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {kpis.map(s => (
                <Card key={s.label} className={`${s.bg} border ${s.border}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                      <p className="text-xs text-gray-500">{s.label}</p>
                    </div>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* שעות שיא */}
            {peakHours.length > 0 && (
              <Card className="mb-6 border-amber-200 bg-amber-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                    <Zap className="w-4 h-4" /> שעות שיא — המלצות לניהול צוות
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {peakHours.map((h, i) => (
                      <div key={h.hour} className="bg-white rounded-xl p-3 border border-amber-200">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-black text-amber-700 text-lg">{h.hour}</span>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${i === 0 ? 'bg-red-100 text-red-700' : i === 1 ? 'bg-orange-100 text-orange-700' : 'bg-[#F4ECD8] text-yellow-700'}`}>
                            #{i + 1} שיא
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{h.נרשמו} נרשמו · {h['המתנה ממוצע']} דק' המתנה</p>
                        <p className="text-xs text-gray-400 mt-1">
                          💡 {h.נרשמו >= 6 ? 'מומלץ להוסיף מארחת/ית נוספת' : h.נרשמו >= 3 ? 'עומס בינוני — צוות מלא' : 'עומס קל'}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* שעות נטישה גבוהה */}
            {highAbandonHours.length > 0 && (
              <Card className="mb-6 border-red-200 bg-red-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-red-700">
                    <AlertTriangle className="w-4 h-4" /> שעות עם נטישה גבוהה
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {highAbandonHours.map(h => (
                      <div key={h.hour} className="bg-white border border-red-200 rounded-xl px-4 py-2 text-sm">
                        <span className="font-black text-red-700">{h.hour}</span>
                        <span className="text-gray-500 mr-2">· נטישה {h['נטישה %']}%</span>
                        <span className="text-gray-400">({h.נטשו} מתוך {h.נרשמו})</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-red-600 mt-3">💡 שקול לקצר את זמן ההמתנה או להוסיף פינוק בשעות אלו</p>
                </CardContent>
              </Card>
            )}

            {/* גרף עומס לפי שעה */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">עומס לפי שעה</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="נרשמו" fill="#3b82f6" />
                    <Bar dataKey="הוּשבו" fill="#22c55e" />
                    <Bar dataKey="נטשו" fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* גרף זמן המתנה + נטישה לאורך היום */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">זמן המתנה ממוצע ואחוז נטישה לאורך היום</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="left" tick={{ fontSize: 11 }} hide />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="המתנה ממוצע" stroke="#8b5cf6" strokeWidth={2} dot={false} name="המתנה ממוצע (דק')" />
                    <Line yAxisId="left" type="monotone" dataKey="נטישה %" stroke="#ef4444" strokeWidth={2} dot={false} name="נטישה %" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Churn Heatmap - מפת חום של נטישה */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">🔥 מפת חום נטישה - מתי אנשים עוזבים?</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-right p-2 font-bold">שעה</th>
                        <th className="text-right p-2 font-bold">נרשמו</th>
                        <th className="text-right p-2 font-bold">הוּשבו</th>
                        <th className="text-right p-2 font-bold">נטשו</th>
                        <th className="text-right p-2 font-bold">נטישה %</th>
                        <th className="text-right p-2 font-bold">המתנה (דק')</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hourlyData.map(h => {
                        const abandonPct = h['נטישה %'];
                        let bgColor = 'bg-green-50';
                        if (abandonPct > 50) bgColor = 'bg-red-100';
                        else if (abandonPct > 30) bgColor = 'bg-orange-100';
                        else if (abandonPct > 10) bgColor = 'bg-[#F4ECD8]';
                        
                        return (
                          <tr key={h.hour} className={`border-b ${bgColor} hover:opacity-70`}>
                            <td className="p-2 font-bold text-gray-700">{h.hour}</td>
                            <td className="p-2 text-center text-[#44512C] font-semibold">{h.נרשמו}</td>
                            <td className="p-2 text-center text-green-600 font-semibold">{h.הוּשבו}</td>
                            <td className="p-2 text-center text-red-600 font-semibold">{h.נטשו}</td>
                            <td className={`p-2 text-center font-black ${abandonPct > 40 ? 'text-red-700' : abandonPct > 20 ? 'text-orange-700' : 'text-green-700'}`}>
                              {abandonPct}%
                            </td>
                            <td className="p-2 text-center text-[#A04A2E] font-semibold">{h['המתנה ממוצע']}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
                    <span>0-10% נטישה</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-[#F4ECD8] border border-[#D9BD83] rounded"></div>
                    <span>10-30% נטישה</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded"></div>
                    <span>30-50% נטישה</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-100 border border-red-300 rounded"></div>
                    <span>50%+ נטישה</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* נוטשים סדרתיים */}
            {(() => {
              const phoneMap = {};
              entries.forEach(e => {
                if (!phoneMap[e.phone]) phoneMap[e.phone] = { name: e.customer_name, phone: e.phone, total: 0, abandoned: 0 };
                phoneMap[e.phone].total++;
                if (e.status === 'abandoned') phoneMap[e.phone].abandoned++;
              });
              const serial = Object.values(phoneMap)
                .filter(p => p.total >= 2 && p.abandoned / p.total >= 0.6)
                .sort((a, b) => b.abandoned - a.abandoned);
              if (!serial.length) return null;
              return (
                <Card className="mb-6 border-orange-200 bg-orange-50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-orange-800">
                      <AlertTriangle className="w-4 h-4" /> נוטשים סדרתיים 🚨
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-orange-600 mb-3">אלו לקוחות שנרשמים אבל לא נכנסים — מומלץ לסמן אותם בעת ההרשמה הבאה</p>
                    <div className="space-y-2">
                      {serial.map(p => (
                        <div key={p.phone} className="flex items-center justify-between bg-white border border-orange-200 rounded-xl px-4 py-2.5">
                          <div>
                            <p className="font-bold text-gray-800 text-sm">{p.name}</p>
                            <p className="text-xs text-gray-400">{p.phone}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-orange-700 font-black text-sm">{p.abandoned}/{p.total} ביקורים עזב</p>
                            <p className="text-xs text-orange-500">{Math.round(p.abandoned/p.total*100)}% נטישה</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* פידבקים */}
            {(() => {
              const withRating = filtered.filter(e => e.feedback_rating);
              if (!withRating.length) return null;
              const avg = (withRating.reduce((s, e) => s + e.feedback_rating, 0) / withRating.length).toFixed(1);
              const dist = [1,2,3,4,5].map(s => ({ s, count: withRating.filter(e => e.feedback_rating === s).length }));
              return (
                <Card className="mb-6">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-500" /> פידבקים מלקוחות ({withRating.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <p className="text-4xl font-black text-yellow-500">{avg}</p>
                        <p className="text-xs text-gray-400">ממוצע</p>
                      </div>
                      <div className="flex-1 space-y-1">
                        {dist.reverse().map(({ s, count }) => (
                          <div key={s} className="flex items-center gap-2 text-xs">
                            <span className="w-4 text-yellow-500">{'⭐'.repeat(s).slice(0,1)}{s}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-yellow-400 rounded-full" style={{ width: withRating.length ? `${count/withRating.length*100}%` : '0%' }} />
                            </div>
                            <span className="text-gray-400 w-5 text-right">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {/* טבלת רשומות */}
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
                        <th className="text-right p-3 font-semibold text-gray-600">סועדים</th>
                        <th className="text-right p-3 font-semibold text-gray-600">שעת הרשמה</th>
                        <th className="text-right p-3 font-semibold text-gray-600">סטטוס</th>
                        <th className="text-right p-3 font-semibold text-gray-600">המתנה</th>
                        <th className="text-right p-3 font-semibold text-gray-600">פינוק</th>
                        <th className="text-right p-3 font-semibold text-gray-600">סיבת נטישה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.slice(0, 50).map(e => {
                        const waitMin = e.timestamp_approved && e.timestamp_end
                          ? Math.round((new Date(e.timestamp_end) - new Date(e.timestamp_approved)) / 60000)
                          : null;
                        const statusMap = { pending: 'ממתין', active: 'בתור', seated: 'הוּשב', abandoned: 'נטש' };
                        const statusColor = { pending: 'text-yellow-600', active: 'text-[#44512C]', seated: 'text-green-600', abandoned: 'text-red-600' };
                        return (
                          <tr key={e.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 font-medium">{e.customer_name}</td>
                            <td className="p-3">{e.party_size}</td>
                            <td className="p-3 text-gray-500">{new Date(e.timestamp_register).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className={`p-3 font-semibold ${statusColor[e.status]}`}>{statusMap[e.status]}</td>
                            <td className="p-3 text-gray-500">{waitMin != null ? `${waitMin} דק'` : '-'}</td>
                            <td className="p-3">{e.treated ? '🎁' : '-'}</td>
                            <td className="p-3 text-gray-500 text-xs max-w-[140px]">
                              {e.status === 'abandoned' && e.notes ? e.notes : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}