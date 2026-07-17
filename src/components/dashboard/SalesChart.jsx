import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { base44 } from '@/api/base44Client';
import { format, subDays, startOfMonth, startOfWeek, endOfMonth } from 'date-fns';

const FILTERS = [
  { label: 'שבוע אחרון', value: 'last7' },
  { label: '30 יום אחרונים', value: 'last30' },
  { label: 'חודש נוכחי', value: 'current_month' },
  { label: 'חודש קודם', value: 'prev_month' },
];

function getDateRange(filter) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  if (filter === 'last7') {
    const from = subDays(new Date(), 6);
    from.setHours(0, 0, 0, 0);
    return { from, to: today };
  }
  if (filter === 'last30') {
    const from = subDays(new Date(), 29);
    from.setHours(0, 0, 0, 0);
    return { from, to: today };
  }
  if (filter === 'current_month') {
    const from = startOfMonth(new Date());
    return { from, to: today };
  }
  if (filter === 'prev_month') {
    const firstOfCurrent = startOfMonth(new Date());
    const lastOfPrev = new Date(firstOfCurrent);
    lastOfPrev.setDate(0);
    const firstOfPrev = startOfMonth(lastOfPrev);
    return { from: firstOfPrev, to: lastOfPrev };
  }
  return { from: subDays(new Date(), 29), to: today };
}

export default function SalesChart() {
  const [activeFilter, setActiveFilter] = useState('last30');
  const [chartData, setChartData] = useState([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [activeFilter]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { from, to } = getDateRange(activeFilter);
      const fromStr = format(from, 'yyyy-MM-dd');
      const toStr = format(to, 'yyyy-MM-dd');

      // REAL revenue from the POS history (BeecommHistoricalDay via getDemandHistory).
      // DailySales is empty in prod, which is why this chart showed ₪0.
      let records = [];
      try {
        const res = await base44.functions.getDemandHistory({ days: 180 });
        records = ((res?.data ?? res)?.history || []).map(r => ({ date: String(r.date).slice(0, 10), total_revenue: r.revenue }));
      } catch { /* fall back to legacy table */ }
      if (!records.length) {
        records = await base44.entities.DailySales.list('-date', 500).catch(() => []);
      }

      const filtered = records.filter(r => r.date >= fromStr && r.date <= toStr);

      // קיבוץ לפי תאריך - סכום הכנסות
      const byDate = {};
      for (const r of filtered) {
        const d = r.date;
        if (!byDate[d]) byDate[d] = 0;
        byDate[d] += (r.total_revenue || r.total_sales || r.revenue || r.sales || 0);
      }

      // מיון לפי תאריך
      const sorted = Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, revenue]) => ({
          date,
          label: date.slice(5), // MM-DD
          revenue: Math.round(revenue),
        }));

      setChartData(sorted);
      setTotalRevenue(sorted.reduce((s, r) => s + r.revenue, 0));
    } catch (e) {
      console.error('SalesChart error:', e);
      setChartData([]);
      setTotalRevenue(0);
    }
    setIsLoading(false);
  };

  return (
    <Card className="shadow-xl border-0 bg-gradient-to-br from-white to-green-50/30">
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <CardTitle className="text-xl text-slate-800">מגמות הכנסות</CardTitle>
          </div>

          {/* פילטרים */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeFilter === f.value
                    ? 'bg-green-600 text-white shadow'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-green-50'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* סה"כ */}
        <div className="text-left mt-1">
          <div className="text-2xl font-bold text-green-600">
            ₪{totalRevenue.toLocaleString()}
          </div>
          <div className="text-sm text-slate-500">סה"כ תקופה</div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="h-72 bg-slate-100 rounded-lg animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
            אין נתונים לתקופה הנבחרת
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={288}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                tickFormatter={v => `₪${(v / 1000).toFixed(0)}k`}
                width={50}
              />
              <Tooltip
                formatter={(v) => [`₪${v.toLocaleString()}`, 'הכנסות']}
                labelFormatter={(l) => `תאריך: ${l}`}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  direction: 'rtl',
                }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#10b981' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}