import React, { useState, useEffect } from 'react';
import { invokePublic } from '@/lib/publicFetch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';

function sandboxNote() { return 'תשלום מאובטח. במצב Stub — לא מחויב כסף בפועל.'; }

export default function EventsPayment() {
  const [bookingId] = useState(() => { try { return new URLSearchParams(window.location.search).get('booking'); } catch { return null; } });
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!bookingId) { setError('booking missing from URL'); setLoading(false); return; }
    (async () => {
      try {
        const r = await invokePublic('getEventBooking', { booking_id: bookingId });
        setBooking(r?.booking || null);
      } catch (e) { setError(e?.message || 'load failed'); }
      finally { setLoading(false); }
    })();
  }, [bookingId]);

  const pay = async () => {
    setPaying(true); setError(null);
    try {
      await invokePublic('confirmEventPayment', { booking_id: bookingId, mock: true });
      setDone(true);
    } catch (e) { setError(e?.message || 'pay failed'); }
    finally { setPaying(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>;

  if (error || !booking) return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
      <Card className="max-w-md w-full"><CardContent className="p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
        <p>{error || 'הזמנה לא נמצאה'}</p>
      </CardContent></Card>
    </div>
  );

  if (done) return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-emerald-50 to-teal-50" dir="rtl">
      <Card className="max-w-md w-full"><CardContent className="p-8 text-center space-y-3">
        <CheckCircle2 className="w-14 h-14 text-emerald-600 mx-auto" />
        <h2 className="text-2xl font-bold">תודה רבה! 🌿</h2>
        <p className="text-slate-700">הפיקדון התקבל, האירוע נשמר במערכת.</p>
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">⏳ ההזמנה מותנת באישור סופי של מנהל המסעדה. נחזור אליכם תוך כמה שעות.</p>
      </CardContent></Card>
    </div>
  );

  const menuName = (booking.selected_menu && booking.selected_menu.name) || '-';
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 p-4 flex items-start justify-center" dir="rtl">
      <Card className="max-w-md w-full mt-6">
        <CardHeader>
          <CardTitle>אישור והזמנת אירוע</CardTitle>
          <CardDescription>סקירה אחרונה לפני תשלום הפיקדון</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded p-2"><div className="text-xs text-slate-500">תאריך</div><div className="font-bold">{booking.event_date} {booking.event_time || ''}</div></div>
            <div className="bg-slate-50 rounded p-2"><div className="text-xs text-slate-500">אורחים</div><div className="font-bold">{booking.guest_count}</div></div>
            <div className="bg-slate-50 rounded p-2 col-span-2"><div className="text-xs text-slate-500">חבילה</div><div className="font-bold">{menuName}</div></div>
          </div>
          {Array.isArray(booking.selected_upsells) && booking.selected_upsells.length > 0 && (
            <div><div className="text-xs text-slate-500 mb-1">תוספות</div>
              <ul className="text-xs space-y-0.5">
                {booking.selected_upsells.map((u, i) => <li key={i}>• {u.name} — ₪{u.price}</li>)}
              </ul>
            </div>
          )}
          <div className="border-t pt-2">
            <div className="flex justify-between text-xs"><span>סכום כולל:</span><span>₪{booking.total_ils || 0}</span></div>
            <div className="flex justify-between text-base font-bold text-emerald-700 mt-1"><span>פיקדון לתשלום:</span><span>₪{booking.deposit_amount_ils || 0}</span></div>
          </div>
          {booking.short_notice && <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-900">⏰ אירוע בטווח קצר — מותנה באישור סופי של מנהל.</div>}
          <Button onClick={pay} disabled={paying} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 text-base font-bold">
            {paying ? <><Loader2 className="w-4 h-4 animate-spin ml-1" /> מעבד תשלום…</> : <><CreditCard className="w-4 h-4 ml-1" /> שלם פיקדון ₪{booking.deposit_amount_ils || 0}</>}
          </Button>
          <p className="text-xs text-slate-500 text-center">🔒 {sandboxNote()}</p>
        </CardContent>
      </Card>
    </div>
  );
}
