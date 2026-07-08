import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { Calendar, Clock, Users, MapPin, Navigation, Phone, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { isMainAlena } from '@/lib/tenant';

// Customer-facing reservation tracking page.
// Accessed via the link sent in the SMS / email after booking:
//   /ReservationView?token=<28-char>
// Lets the customer see their reservation, parking info, and cancel.
// Late cancellation (< 2h before start) auto-marks as 'no_show'.
export default function ReservationView() {
  const [search] = useSearchParams();
  const token = search.get('token') || '';
  const [reservation, setReservation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const branding = useTenantBranding();
  const brandName = branding?.name || 'המסעדה';
  const isAlena = isMainAlena();

  useEffect(() => {
    if (!token) { setError('קישור לא תקין'); setLoading(false); return; }
    (async () => {
      try {
        const res = await base44.asServiceRole.functions.getReservationByToken({ token });
        const data = res?.data || res;
        setReservation(data);
      } catch (e) {
        setError(e?.message === 'not_found' ? 'ההזמנה לא נמצאה' : 'שגיאה בטעינת ההזמנה');
      } finally { setLoading(false); }
    })();
  }, [token]);

  const doCancel = async () => {
    setSubmitting(true);
    try {
      const res = await base44.asServiceRole.functions.cancelReservationByToken({ token, reason: cancelReason });
      const data = res?.data || res;
      if (!data?.ok) {
        alert(data?.reason === 'already_cancelled' ? 'ההזמנה כבר בוטלה.' : 'שגיאה בביטול');
        return;
      }
      // Reload
      const fresh = await base44.asServiceRole.functions.getReservationByToken({ token });
      setReservation(fresh?.data || fresh);
      setCancelOpen(false);
    } catch (e) {
      alert('שגיאה בביטול. נסה שוב.');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="p-8 text-center" dir="rtl">טוען...</div>;
  if (error) return <div className="p-8 text-center text-red-700" dir="rtl">⚠️ {error}</div>;
  if (!reservation) return null;

  const dateObj = reservation.date ? parseISO(reservation.date) : new Date();
  const dateLabel = format(dateObj, 'EEEE · dd/MM/yyyy', { locale: he });
  const isCancelled = reservation.status === 'cancelled' || reservation.status === 'no_show';
  const isNoShow = reservation.status === 'no_show';

  // Hours until reservation (for showing late-cancel warning in the dialog)
  const dateStr = format(dateObj, 'yyyy-MM-dd');
  const startMs = new Date(`${dateStr}T${reservation.time}:00`).getTime();
  const hoursUntil = (startMs - Date.now()) / (60 * 60 * 1000);
  const willBeLateCancel = hoursUntil < 2 && hoursUntil >= -1;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-amber-50 via-[#F4ECD8] to-orange-100 p-4 py-8">
      <div className="max-w-md mx-auto bg-white rounded-3xl shadow-2xl p-6 space-y-5">

        {/* Header */}
        <div className="text-center border-b pb-4">
          <div className="text-3xl font-black text-amber-900">{`🔥 ${brandName}`}</div>
          <div className="text-sm text-gray-500 mt-1">ההזמנה שלך</div>
        </div>

        {/* Status banner */}
        {isCancelled && (
          <div className={`rounded-xl p-3 text-center text-sm font-bold ${isNoShow ? 'bg-rose-100 text-rose-900' : 'bg-gray-100 text-gray-700'}`}>
            {isNoShow ? '⚠️ ההזמנה בוטלה (איחור בביטול)' : '❌ ההזמנה בוטלה'}
          </div>
        )}

        {/* Greeting */}
        <div className="text-center">
          <div className="text-2xl font-black text-gray-900">שלום {reservation.customer_name}</div>
          {!isCancelled && <div className="text-sm text-gray-600 mt-1">נשמח לראותך 🍷</div>}
        </div>

        {/* Reservation details */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          <Row icon={<Calendar className="w-4 h-4 text-amber-700" />} label="תאריך" value={dateLabel} />
          <Row icon={<Clock className="w-4 h-4 text-amber-700" />} label="שעה" value={`${reservation.time}${reservation.reservation_end_time ? ` עד ${reservation.reservation_end_time}` : ''}`} />
          <Row icon={<Users className="w-4 h-4 text-amber-700" />} label="סועדים" value={reservation.party_size} />
          {Array.isArray(reservation.assigned_table) && reservation.assigned_table.length > 0 && (
            <Row icon="🪑" label="שולחן" value={`#${reservation.assigned_table.join(', ')}`} />
          )}
          {reservation.special_occasion && (
            <Row icon="🎉" label="חוגגים" value={reservation.special_occasion} />
          )}
        </div>

        {/* Address + Waze */}
        {(isAlena || branding?.address) && (
        <div className="bg-[#F4ECD8] border border-[#E8D9B5] rounded-2xl p-4">
          <div className="font-bold text-blue-900 flex items-center gap-2 mb-2">
            <MapPin className="w-4 h-4" /> איפה אנחנו
          </div>
          <div className="text-sm text-[#2E3819]">{branding?.address || 'רוטשילד 104, ראשון לציון'}</div>
          {isAlena && (
          <a
            href="https://waze.com/ul?ll=31.96,34.79&navigate=yes"
            target="_blank" rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 bg-[#44512C] hover:bg-[#44512C] text-white text-sm font-bold py-2 px-4 rounded-lg"
          >
            <Navigation className="w-4 h-4" /> ניווט בוייז
          </a>
          )}
        </div>
        )}

        {/* Parking — Alena-specific details */}
        {isAlena && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="font-bold text-emerald-900 mb-1">🅿️ חניה</div>
          <ul className="text-sm text-emerald-800 space-y-1 list-disc pr-5">
            <li><b>חניון בן גוריון</b> — חינם אחר הצהריים, 2 דק׳ הליכה</li>
            <li>רחובות סמוכים: רוטשילד, הרצל, וייצמן — כחול-לבן</li>
          </ul>
        </div>
        )}

        {/* Policy */}
        <div className="bg-[#FAF5E8] border border-yellow-200 rounded-2xl p-4 text-sm text-yellow-900">
          <div className="font-bold mb-1">📋 מדיניות</div>
          <ul className="space-y-1 list-disc pr-5">
            <li>השולחן ימתין לכם עד 10 דקות מעבר לשעה</li>
            <li>ניתן לבטל ללא חיוב <b>עד שעתיים</b> לפני המועד</li>
            <li>ביטול בפחות משעתיים: 30₪ פיקדון לסועד</li>
          </ul>
        </div>

        {/* Cancel button */}
        {!isCancelled && (
          <button
            onClick={() => setCancelOpen(true)}
            className="w-full bg-white border-2 border-red-300 text-red-600 hover:bg-red-50 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" /> ביטול הזמנה
          </button>
        )}

        {/* Contact — only when we have a number (Alena's, for now) */}
        {isAlena && (
        <a
          href="tel:031234567"
          className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2"
        >
          <Phone className="w-4 h-4" /> התקשר למסעדה
        </a>
        )}

        <div className="text-center text-xs text-gray-400 pt-2 border-t">
          {isAlena ? '❤️ עלינא · אוכל · אלכוהול · אווירה · אנשים' : `❤️ ${brandName}`}
        </div>
      </div>

      {/* Cancel confirmation modal */}
      {cancelOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" dir="rtl" onClick={() => setCancelOpen(false)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="text-lg font-black text-gray-900">ביטול הזמנה</div>
            {willBeLateCancel ? (
              <div className="bg-[#F4ECD8] border border-rose-200 rounded-xl p-3 text-sm text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">⚠️ ביטול מאוחר</div>
                  <div className="text-xs mt-1">פחות משעתיים לפני המועד — ההזמנה תסומן כ"לא הגיע" וייתכן חיוב פיקדון של 30₪ לסועד.</div>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
                ✅ הביטול בזמן — ללא חיוב.
              </div>
            )}
            <div>
              <label className="text-xs font-bold text-gray-700">סיבה (אופציונלי)</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="למשל: שינוי תוכניות"
                className="mt-1 w-full text-sm border-2 border-gray-200 rounded-lg p-2 h-20"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCancelOpen(false)}
                disabled={submitting}
                className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-bold py-2.5 rounded-xl text-sm"
              >חזור</button>
              <button
                onClick={doCancel}
                disabled={submitting}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-bold py-2.5 rounded-xl text-sm"
              >{submitting ? 'מבטל...' : 'אשר ביטול'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ icon, label, value }) {
  if (value === null || value === undefined || value === '') return null;
  const iconEl = typeof icon === 'string' ? <span className="w-4 text-sm">{icon}</span> : icon;
  return (
    <div className="flex items-center gap-2 text-sm">
      {iconEl}
      <span className="text-gray-500">{label}:</span>
      <span className="font-bold text-gray-900">{value}</span>
    </div>
  );
}
