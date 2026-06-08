import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function MyTipsWidget() {
  const [data, setData] = useState({ weekTotal: 0, todayTotal: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const user = await base44.auth.me();
        const emps = await base44.entities.Employee.filter({ email: user.email });
        if (emps.length === 0) return;
        const emp = emps[0];

        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        const rawReports = await base44.entities.TipReport.list('-date', 20);
        // API returns ISO datetime strings post-migration; slice to YYYY-MM-DD.
        const reports = rawReports.map(r => ({ ...r, date: typeof r.date === 'string' ? r.date.slice(0, 10) : r.date }));
        const recent = reports.filter(r => r.date >= weekAgoStr);

        let weekTotal = 0, todayTotal = 0;
        recent.forEach(report => {
          const myEntry = (report.staff_details || []).find(s => s.employee_id === emp.id || s.employee_name === emp.full_name);
          if (myEntry) {
            weekTotal += myEntry.final_tip || 0;
            if (report.date === today) todayTotal += myEntry.final_tip || 0;
          }
        });
        setData({ weekTotal, todayTotal });
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <Link to={createPageUrl("Tips")}>
      <Card className="hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-[#F4ECD8] rounded-xl"><Banknote className="w-5 h-5 text-yellow-600" /></div>
            <span className="text-xs text-muted-foreground">השבוע</span>
          </div>
          <p className="text-2xl font-black text-foreground">
            {loading ? '...' : `₪${data.weekTotal.toFixed(0)}`}
          </p>
          <p className="text-sm font-semibold text-muted-foreground mt-1">💰 הטיפים שלי</p>
          {!loading && data.todayTotal > 0 && (
            <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              ₪{data.todayTotal.toFixed(0)} היום
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}