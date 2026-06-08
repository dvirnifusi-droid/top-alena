import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Banknote, TrendingUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function TodayTipsWidget() {
  const [data, setData] = useState({ total: 0, perHour: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const reports = await base44.entities.TipReport.filter({ date: today });
        const total = reports.reduce((s, r) => s + (r.net_tips_for_distribution || 0), 0);
        const perHour = reports.length > 0 ? reports[reports.length - 1].tip_per_hour || 0 : 0;
        setData({ total, perHour, count: reports.length });
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
            <span className="text-xs text-muted-foreground">היום</span>
          </div>
          <p className="text-2xl font-black text-foreground">
            {loading ? '...' : `₪${data.total.toLocaleString()}`}
          </p>
          <p className="text-sm font-semibold text-muted-foreground mt-1">💰 טיפים היום</p>
          {!loading && data.perHour > 0 && (
            <p className="text-xs text-yellow-600 mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              ₪{data.perHour.toFixed(1)} לשעה
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}