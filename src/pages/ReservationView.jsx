import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { Calendar, Clock, Users, MapPin, Navigation, Phone, X, CheckCircle, AlertTriangle, CalendarPlus, Share2, MessageCircle } from 'lucide-react';
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
  const [settings, setSettings] = useState(null);
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
        // Owner-editable confirmation-page content (parking / policy / images / nearby).
        base44.asServiceRole.functions.getReservationSettings({})
          .then(s => setSettings(s?.data || s)).catch(() => {});
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
  const willBeLateCancel = hoursUntil < 3 && hoursUntil >= -1;

  const address = branding?.address || (isAlena ? 'רוטשילד 104, ראשון לציון' : '');
  const phone = branding?.phone || (isAlena ? '03-6228055' : '');
  const wazeUrl = address ? `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes` : null;
  const timeRange = `${reservation.time}${reservation.reservation_end_time ? ` – ${reservation.reservation_end_time}` : ''}`;

  // Owner-editable confirmation content (falls back to Alena defaults).
  const cc = settings?.confirmation_config || {};
  const ccImages = Array.isArray(cc.images) ? cc.images : [];
  const ccParking = cc.parking || 'חניון מול מרכז בן גוריון — הליכה קצרה מהמקום.';
  const ccNearby = cc.nearby || 'רחובות סמוכים: רוטשילד, הרצל, וייצמן (כחול-לבן).';
  const ccPolicy = (Array.isArray(cc.policy) && cc.policy.length) ? cc.policy : [
    'השולחן ימתין לכם עד 10 דקות מהשעה המצוינת בהזמנה.',
    'ניתן לבטל עד 3 שעות לפני המועד — ללא חיוב.',
    'ביטול בפחות מ-3 שעות (גם אם הזמנתם בתוך הטווח) — יחויב בפיקדון של 30 ₪ לסועד.',
    'המסעדה אינה מתחייבת לשולחן או אזור ישיבה ספציפי.',
  ];

  // Add-to-calendar (.ics, floating time = same wall-clock everywhere) + share + WhatsApp.
  const icsStart = `${dateStr.replace(/-/g, '')}T${(reservation.time || '20:00').replace(':', '')}00`;
  const icsEnd = `${dateStr.replace(/-/g, '')}T${(reservation.reservation_end_time || reservation.time || '22:00').replace(':', '')}00`;
  const icsHref = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(
    ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', `DTSTART:${icsStart}`, `DTEND:${icsEnd}`, `SUMMARY:הזמנה ב${brandName}`, `LOCATION:${address}`, `DESCRIPTION:${reservation.party_size} סועדים`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
  const waHref = phone ? `https://wa.me/972${phone.replace(/\D/g, '').replace(/^0/, '')}` : null;
  const doShare = async () => {
    const url = window.location.href;
    if (navigator.share) { try { await navigator.share({ title: `הזמנה ב${brandName}`, url }); } catch { /* cancelled */ } }
    else { try { await navigator.clipboard.writeText(url); alert('הקישור הועתק ✓'); } catch { /* noop */ } }
  };

  return (
    <div dir="rtl" className="min-h-screen p-4 py-8" style={{ background: 'linear-gradient(135deg, #FAF5E8 0%, #F4ECD8 55%, #E8D9B5 100%)', fontFamily: "'Heebo', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Heebo:wght@300;400;500;700;900&display=swap');.rv-display{font-family:'Frank Ruhl Libre',serif}`}</style>
      <div className="max-w-md mx-auto space-y-4">

        {/* HERO — optional owner background image behind the logo, dark overlay for legibility */}
        <div className="rounded-3xl overflow-hidden shadow-xl relative" style={{ background: 'linear-gradient(135deg, #1F1B17 0%, #44512C 55%, #7A3722 100%)' }}>
          {/* Header background = image only (the video is now a standalone section below). */}
          {cc.header_image && (
            <>
              <div className="absolute inset-0" style={{ backgroundImage: `url(${cc.header_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(31,27,23,0.45), rgba(31,27,23,0.8))' }} />
            </>
          )}
          <div className="relative px-6 pt-7 pb-6 text-center text-white">
            <div className="rv-display text-3xl font-black tracking-tight" style={{ color: '#F4ECD8', textShadow: (cc.header_image || cc.header_video) ? '0 2px 12px rgba(0,0,0,0.5)' : 'none' }}>{isAlena ? 'עלינא' : brandName}</div>
            <div className="mt-1 text-[11px] tracking-[0.25em]" style={{ color: '#D9BD83' }}>אוכל · אלכוהול · אווירה · אנשים</div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold" style={{ background: isCancelled ? 'rgba(160,74,46,0.25)' : 'rgba(217,189,131,0.22)', color: '#FAF5E8' }}>
              {isCancelled ? (isNoShow ? '⚠️ ההזמנה בוטלה (איחור)' : '❌ ההזמנה בוטלה') : <><CheckCircle className="w-4 h-4" style={{ color: '#D9BD83' }} /> ההזמנה אושרה</>}
            </div>
          </div>
        </div>

        {/* Greeting + core details */}
        <div className="bg-white rounded-3xl shadow-lg p-6">
          <div className="text-center">
            <div className="rv-display text-2xl font-black" style={{ color: '#1F1B17' }}>שלום {reservation.customer_name}</div>
            {!isCancelled && <div className="text-sm mt-1" style={{ color: '#A04A2E' }}>שמורים לכם מקום ✨</div>}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <Stat icon={<Calendar className="w-4 h-4" />} label="תאריך" value={format(dateObj, 'dd/MM', { locale: he })} sub={format(dateObj, 'EEEE', { locale: he })} />
            <Stat icon={<Clock className="w-4 h-4" />} label="שעה" value={reservation.time} sub={reservation.reservation_end_time ? `עד ${reservation.reservation_end_time}` : ''} />
            <Stat icon={<Users className="w-4 h-4" />} label="סועדים" value={reservation.party_size} sub="" />
          </div>
          {reservation.special_occasion && (
            <div className="mt-3 text-center text-sm rounded-xl py-2" style={{ background: '#FAF5E8', color: '#7A3722' }}>🎉 חוגגים {reservation.special_occasion}</div>
          )}
        </div>

        {/* Photo gallery (owner-uploaded via settings) */}
        {ccImages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
            {ccImages.map((url, i) => (
              <img key={i} src={url} alt="" className="h-28 w-44 object-cover rounded-2xl shadow-md flex-shrink-0" />
            ))}
          </div>
        )}

        {/* Atmospheric video — placed AFTER the confirmation details so the page reads clearly as a confirmation first */}
        {cc.header_video && (
          <div className="rounded-3xl overflow-hidden shadow-lg bg-black">
            <video
              src={`${cc.header_video}${cc.header_video.includes('?') ? '&' : '?'}r=1`}
              poster={cc.header_image || undefined}
              className="w-full h-auto block"
              autoPlay muted loop playsInline preload="auto"
            />
          </div>
        )}

        {/* Location + Waze */}
        {address && (
          <div className="bg-white rounded-3xl shadow-lg p-5">
            <div className="flex items-center gap-2 font-black" style={{ color: '#44512C' }}><MapPin className="w-4 h-4" /> איפה אנחנו</div>
            <div className="text-sm mt-1" style={{ color: '#2E3819' }}>{address}</div>
            {wazeUrl && (
              <a href={wazeUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-2 text-white text-sm font-black py-2.5 rounded-xl" style={{ background: '#44512C' }}>
                <Navigation className="w-4 h-4" /> נווט בוייז
              </a>
            )}
          </div>
        )}

        {/* Parking + nearby (owner-editable; shown for Alena or any tenant that set it) */}
        {(isAlena || cc.parking) && (
          <div className="bg-white rounded-3xl shadow-lg p-5">
            <div className="font-black mb-1.5" style={{ color: '#44512C' }}>🅿️ חניה</div>
            <ul className="text-sm space-y-1.5 list-disc pr-5" style={{ color: '#2E3819' }}>
              <li>{ccParking}</li>
              {ccNearby && <li>{ccNearby}</li>}
            </ul>
          </div>
        )}

        {/* Policy (owner-editable) */}
        <div className="rounded-3xl shadow-lg p-5" style={{ background: '#FAF5E8', border: '1px solid #E8D9B5' }}>
          <div className="font-black mb-2" style={{ color: '#7A3722' }}>📋 מדיניות</div>
          <ul className="text-[13px] space-y-2 list-disc pr-5" style={{ color: '#4a3f30' }}>
            {ccPolicy.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>

        {/* Quick actions — add to calendar / share / whatsapp */}
        {!isCancelled && (
          <div className="grid grid-cols-2 gap-2">
            <a href={icsHref} download="reservation.ics" className="flex flex-col items-center gap-1 bg-white rounded-2xl shadow py-3 text-[11px] font-bold" style={{ color: '#44512C' }}>
              <CalendarPlus className="w-5 h-5" /> הוסף ליומן
            </a>
            <button onClick={doShare} className="flex flex-col items-center gap-1 bg-white rounded-2xl shadow py-3 text-[11px] font-bold" style={{ color: '#44512C' }}>
              <Share2 className="w-5 h-5" /> שיתוף
            </button>
          </div>
        )}

        {/* Primary actions */}
        {!isCancelled && (
          <div className="space-y-2">
            {phone && (
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="w-full text-white font-black py-3.5 rounded-2xl text-sm flex items-center justify-center gap-2 shadow-lg" style={{ background: 'linear-gradient(135deg, #A04A2E, #7A3722)' }}>
                <Phone className="w-4 h-4" /> התקשרו למסעדה
              </a>
            )}
            <button onClick={() => setCancelOpen(true)} className="w-full bg-white border-2 font-bold py-3 rounded-2xl text-sm flex items-center justify-center gap-2" style={{ borderColor: '#E8D9B5', color: '#9a5b3f' }}>
              <X className="w-4 h-4" /> ביטול הזמנה
            </button>
          </div>
        )}

        <div className="text-center text-[11px] pt-1" style={{ color: '#B89556' }}>
          {isAlena ? '❤️ עלינא · רוטשילד 104, ראשון לציון' : `❤️ ${brandName}`}
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
                  <div className="text-xs mt-1">פחות מ-3 שעות לפני המועד — ייתכן חיוב פיקדון של 30 ₪ לסועד בהתאם למדיניות.</div>
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

function Stat({ icon, label, value, sub }) {
  return (
    <div className="rounded-2xl py-3 px-1" style={{ background: '#FAF5E8' }}>
      <div className="flex justify-center mb-1" style={{ color: '#A04A2E' }}>{icon}</div>
      <div className="text-[10px]" style={{ color: '#9a8a6f' }}>{label}</div>
      <div className="text-lg font-black leading-none mt-0.5" style={{ color: '#1F1B17' }}>{value}</div>
      {sub ? <div className="text-[10px] mt-0.5" style={{ color: '#7A3722' }}>{sub}</div> : null}
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
