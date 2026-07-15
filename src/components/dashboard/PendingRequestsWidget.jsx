import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Bell, Calendar, ArrowLeftRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function PendingRequestsWidget() {
  const [data, setData] = useState({ leaves: 0, swaps: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [leavesRes, swapsRes] = await Promise.allSettled([
          base44.entities.LeaveRequest.filter({ status: 'pending' }),
          base44.entities.ShiftSwapRequest.filter({ status: 'pending' }),
        ]);
        setData({
          leaves: leavesRes.status === 'fulfilled' ? leavesRes.value.length : 0,
          swaps: swapsRes.status === 'fulfilled' ? swapsRes.value.length : 0,
        });
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  const total = data.leaves + data.swaps;

  return (
    <Link to={createPageUrl("LeaveRequests")}>
      <Card className={`hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02] ${total > 0 ? 'border-red-200' : ''}`}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-xl ${total > 0 ? 'bg-red-100' : 'bg-slate-100'}`}>
              <Bell className={`w-5 h-5 ${total > 0 ? 'text-red-600' : 'text-slate-500'}`} />
            </div>
            <span className="text-xs text-muted-foreground">ממתין</span>
          </div>
          <p className={`text-2xl font-black ${total > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {loading ? '...' : total || '✓'}
          </p>
          <p className="text-sm font-semibold text-muted-foreground mt-1">📋 בקשות ממתינות</p>
          {!loading && total > 0 && (
            <div className="flex gap-3 mt-2">
              {data.leaves > 0 && <span className="text-xs text-orange-600 flex items-center gap-1"><Calendar className="w-3 h-3" />{data.leaves} חופשות</span>}
              {data.swaps > 0 && <span className="text-xs text-[#44512C] flex items-center gap-1"><ArrowLeftRight className="w-3 h-3" />{data.swaps} החלפות</span>}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}