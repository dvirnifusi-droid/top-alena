import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';

export default function WeeklyPerformanceWidget() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const days = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          days.push(d.toISOString().split('T')[0]);
        }
        const rawReports = await base44.entities.ShiftEndReport.list('-shift_date', 20);
        // Normalize ISO shift_date to YYYY-MM-DD for the equality compare below.
        const reports = rawReports.map(r => ({ ...r, shift_date: typeof r.shift_date === 'string' ? r.shift_date.slice(0, 10) : r.shift_date }));
        const dayLabels = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
        const chartData = days.map(date => {
          const dayReports = reports.filter(r => r.shift_date === date);
          const revenue = dayReports.reduce((s, r) => s + (r.total_revenue || 0), 0);
          const d = new Date(date);
          return { day: dayLabels[d.getDay()], revenue };
        });
        setData(chartData);
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  const max = Math.max(...data.map(d => d.revenue), 1);

  return (
    <Link to={createPageUrl("Reports")}>
      <Card className="hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02]">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-green-600" />
            ביצועים שבועיים
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {loading ? <p className="text-sm text-muted-foreground">טוען...</p> : (
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.revenue === max ? '#16a34a' : '#bbf7d0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}