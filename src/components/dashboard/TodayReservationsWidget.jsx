import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarCheck, Clock } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import ReservationSourceBadge from '@/components/shared/ReservationSourceBadge';

export default function TodayReservationsWidget() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const today = format(new Date(), 'yyyy-MM-dd');
        const items = await base44.entities.Reservation.filter({ date: today });
        const sorted = items.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        setReservations(sorted.slice(0, 4));
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <Link to={createPageUrl("PublicReservationSettings")}>
      <Card className="hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02]">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-indigo-500" />
            הזמנות שולחנות היום
            <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full mr-auto">{reservations.length}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {loading ? <p className="text-sm text-muted-foreground">טוען...</p> :
            reservations.length === 0 ? <p className="text-sm text-muted-foreground">אין הזמנות להיום</p> :
            <div className="space-y-2">
              {reservations.map((r, i) => (
                <div key={r.id || i} className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate flex-1 flex items-center gap-1.5">
                    {r.guest_name || r.customer_name || 'אורח'}
                    <ReservationSourceBadge source={r.source} campaign={r.campaign} compact />
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 flex-shrink-0">
                    <Clock className="w-3 h-3" />{r.time || '--:--'}
                  </span>
                  <span className="text-xs text-indigo-600 flex-shrink-0">x{r.party_size || r.guests || 1}</span>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </Link>
  );
}