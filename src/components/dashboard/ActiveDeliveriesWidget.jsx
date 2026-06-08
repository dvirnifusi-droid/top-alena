import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Truck, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function ActiveDeliveriesWidget() {
  const [data, setData] = useState({ pending: 0, inProgress: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const deliveries = await base44.entities.Delivery.filter({ date: today });
        setData({
          pending: deliveries.filter(d => d.delivery_status === 'pending').length,
          inProgress: deliveries.filter(d => d.delivery_status === 'picked_up').length,
        });
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <Link to={createPageUrl("Deliveries")}>
      <Card className="hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-[#F4ECD8] rounded-xl"><Truck className="w-5 h-5 text-[#44512C]" /></div>
            <span className="text-xs text-muted-foreground">היום</span>
          </div>
          <p className="text-2xl font-black text-foreground">
            {loading ? '...' : data.pending + data.inProgress}
          </p>
          <p className="text-sm font-semibold text-muted-foreground mt-1">🚚 משלוחים פעילים</p>
          {!loading && (
            <div className="flex gap-3 mt-2">
              <span className="text-xs text-orange-600 flex items-center gap-1"><Clock className="w-3 h-3" />{data.pending} ממתינים</span>
              <span className="text-xs text-[#44512C] flex items-center gap-1"><Truck className="w-3 h-3" />{data.inProgress} בדרך</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}