import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Users, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function QueueStatusWidget() {
  const [data, setData] = useState({ waiting: 0, active: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const entries = await base44.entities.QueueEntry.filter({ status: { $in: ['pending', 'active'] } });
        setData({
          waiting: entries.filter(e => e.status === 'pending').length,
          active: entries.filter(e => e.status === 'active').length,
        });
      } catch {} finally { setLoading(false); }
    };
    load();
    const unsub = base44.entities.QueueEntry.subscribe(() => load());
    return () => unsub();
  }, []);

  const total = data.waiting + data.active;

  return (
    <Link to={createPageUrl("QueueDashboard")}>
      <Card className={`hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02] ${total > 0 ? 'border-blue-200' : ''}`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-xl ${total > 0 ? 'bg-blue-100' : 'bg-slate-100'}`}>
              <Users className={`w-5 h-5 ${total > 0 ? 'text-blue-600' : 'text-slate-500'}`} />
            </div>
            <span className="text-xs text-muted-foreground font-medium">חי</span>
          </div>
          <p className="text-2xl font-black text-foreground">{loading ? '...' : total}</p>
          <p className="text-sm font-semibold text-muted-foreground mt-1">🎫 תור נוכחי</p>
          {!loading && total > 0 && (
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-orange-600 flex items-center gap-1"><Clock className="w-3 h-3" />{data.waiting} ממתינים</span>
              <span className="text-xs text-blue-600 flex items-center gap-1"><Users className="w-3 h-3" />{data.active} פעילים</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}