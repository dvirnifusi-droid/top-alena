import React, { useState, useEffect, useMemo, useRef } from 'react';
import LanguagePicker from '@/components/shared/LanguagePicker';
import { useI18n } from '@/lib/i18n';
import { invokePublic } from '@/lib/publicFetch';
import { format, addDays, addMinutes, parse, isSameDay } from 'date-fns';
import { he } from 'date-fns/locale';
import {
  Calendar, Clock, Users, Send, Loader2, CheckCircle, Phone, MapPin,
  Instagram, Music2, Facebook, MessageCircle, Sparkles, Flame, Navigation as NavIcon,
  Star, ChevronRight,
} from 'lucide-react';

// --- Constants ---------------------------------------------------------------

const HERO_FALLBACK_BG = 'linear-gradient(135deg, #18181b 0%, #3f1d1d 60%, #7c2d12 100%)';

// Default opening hours (overridden by settings if provided)
const getOpeningHours = (selectedDate) => {
  const dayOfWeek = new Date(selectedDate).getDay();
  if (dayOfWeek === 6) return { start: '21:00', end: '23:45' }; // Saturday
  if (dayOfWeek === 5) return { start: '12:00', end: '23:45' }; // Friday
  return { start: '12:00', end: '23:30' };
};
const getSeatingDuration = (size) => (size >= 9 ? 165 : size >= 6 ? 150 : 120);

// Build HOUR slots (top-level picker). User then drills down into quarter-hours.
function generateHourSlots(startTime, endTime) {
  if (startTime === '00:00' && endTime === '00:00') return [];
  const slots = [];
  const [sh] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let h = sh;
  const lastH = em > 0 ? eh : eh - 1;
  while (h <= lastH) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    h += 1;
  }
  return slots;
}

// Build a -30 to +30 quarter-hour drill-down strip around an hour, clamped
// to the open window. Used after the user picks an hour.
function buildQuarterStrip(hourSlot, startTime, endTime) {
  if (!hourSlot) return [];
  const [h, m] = hourSlot.split(':').map(Number);
  const base = h * 60 + m;
  const startM = Number(startTime.split(':')[0]) * 60 + Number(startTime.split(':')[1] || 0);
  const endM = Number(endTime.split(':')[0]) * 60 + Number(endTime.split(':')[1] || 0);
  const out = [];
  for (const offset of [-30, -15, 0, 15, 30]) {
    const m2 = base + offset;
    if (m2 < startM || m2 > endM) continue;
    const hh = Math.floor(m2 / 60), mm = m2 % 60;
    out.push(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  return out;
}

// Estimate end time given a start "HH:mm" and party size — mirrors backend policy.
function estimateEndTime(startHHmm, partySize) {
  if (!startHHmm) return '';
  const size = Number(partySize) || 2;
  const dur = size >= 11 ? 150 : size >= 6 ? 135 : 120;
  const [h, m] = startHHmm.split(':').map(Number);
  const total = h * 60 + m + dur;
  const hh = Math.floor(total / 60) % 24, mm = total % 60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}

// --- Capture UTM / referrer once ---------------------------------------------

function captureAttribution() {
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get('utm_source') || p.get('src') || '',
      utm_campaign: p.get('utm_campaign') || p.get('cmp') || '',
      utm_medium: p.get('utm_medium') || p.get('med') || '',
      landing_url: window.location.href.slice(0, 500),
      referrer: (document.referrer || '').slice(0, 500),
    };
  } catch { return {}; }
}

// ============================================================================
// PAGE
// ============================================================================

export default function PublicReservationPage() {
  const [t, lang] = useI18n();
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [occasion, setOccasion] = useState('');  // chip-selected celebration

  const [settings, setSettings] = useState(null);
  const [openingHours, setOpeningHours] = useState(getOpeningHours(new Date()));
  const [hourSlots, setHourSlots] = useState([]);
  const [selectedHour, setSelectedHour] = useState('');   // e.g. "21:00"
  const [availability, setAvailability] = useState({});   // hour-level snapshot

  const [isBooking, setIsBooking] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(null); // { customer_name, time, date, party_size, table_number }

  const [liveCount, setLiveCount] = useState(null);
  const [featuredMenu, setFeaturedMenu] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [showExitIntent, setShowExitIntent] = useState(false);
  const [tickerIndex, setTickerIndex] = useState(0);
  const bookingCardRef = useRef(null);
  const exitShownRef = useRef(false);

  // Names + cities for the live "X just booked" ticker. Anonymized to first
  // name only — same trick Booking.com uses.
  const TICKER_NAMES = [
    'דניאל', 'מיכל', 'רות', 'אסף', 'יואב', 'נועה', 'איתי', 'הילה',
    'תומר', 'שירה', 'עומר', 'מאיה', 'אורי', 'טל', 'גיל', 'אילן',
  ];
  const TICKER_MINUTES = [3, 6, 8, 12, 15, 18, 23, 27];

  // --- Load settings + live counter + featured menu + reviews once
  useEffect(() => {
    (async () => {
      try {
        const s = await invokePublic('getReservationSettings');
        if (s) setSettings(s);
      } catch (e) { console.warn('settings load failed', e); }
      // Fire all four public reads in parallel — none block each other
      const [countRes, menuRes, revRes] = await Promise.all([
        invokePublic('getRecentReservationCount', { hours: 3 }).catch(() => null),
        invokePublic('getPublicFeaturedMenuItems', { limit: 8 }).catch(() => null),
        invokePublic('getPublicRecentReviews', { limit: 6 }).catch(() => null),
      ]);
      if (countRes?.count != null) setLiveCount(countRes.count);
      if (Array.isArray(menuRes?.items)) setFeaturedMenu(menuRes.items);
      if (Array.isArray(revRes?.reviews)) setReviews(revRes.reviews);
    })();
  }, []);

  // --- Show sticky bottom CTA on mobile when user scrolls past the booking card
  useEffect(() => {
    const onScroll = () => {
      const el = bookingCardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setShowStickyCTA(rect.bottom < window.innerHeight * 0.4);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // --- Rotate the recent-bookings ticker every 4s
  useEffect(() => {
    const id = setInterval(() => setTickerIndex(i => (i + 1) % TICKER_NAMES.length), 4000);
    return () => clearInterval(id);
  }, []);

  // --- Exit-intent: when the cursor leaves through the top of the viewport, pop a recovery offer.
  // Desktop only; mobile uses the sticky CTA. Shown once per session.
  useEffect(() => {
    const onLeave = (e) => {
      if (exitShownRef.current) return;
      if (success) return;
      if (e.clientY <= 0 && window.innerWidth >= 768) {
        exitShownRef.current = true;
        setShowExitIntent(true);
      }
    };
    document.addEventListener('mouseleave', onLeave);
    return () => document.removeEventListener('mouseleave', onLeave);
  }, [success]);

  const scrollToBooking = () => {
    bookingCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // --- Active promos: from settings.promos JSON array, else defaults
  const promos = Array.isArray(settings?.promos) && settings.promos.length
    ? settings.promos
    : [
        { emoji: '🍷', label: 'ערב יין רביעי', detail: 'בקבוק יין השבוע ב-50% הנחה' },
        { emoji: '🥩', label: 'ימי בשר חמישי', detail: '20% הנחה על כל פלטות הבשר' },
        { emoji: '☀️', label: 'ארוחת צהריים עסקית', detail: 'תפריט מיוחד ב-89₪' },
        { emoji: '🎂', label: 'יום הולדת', detail: 'קינוח מתנה ושיר מהצוות' },
      ];

  // --- Recompute hours + slots when date or settings change
  useEffect(() => {
    const dayMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const currentDayName = dayMap[date.getDay()];
    let hoursToUse;
    if (settings?.opening_hours?.[currentDayName]) {
      const d = settings.opening_hours[currentDayName];
      hoursToUse = d.closed ? { start: '00:00', end: '00:00' } : { start: d.open, end: d.close };
    } else {
      hoursToUse = getOpeningHours(date);
    }
    setOpeningHours(hoursToUse);
    const slots = generateHourSlots(hoursToUse.start, hoursToUse.end);
    setHourSlots(slots);
    setSelectedHour('');
    setTime('');
  }, [date, settings]);

  // --- Fetch availability snapshot for the HOUR-level grid (one dot per hour)
  useEffect(() => {
    if (!hourSlots.length) { setAvailability({}); return; }
    if (Number(partySize) > 12) { setAvailability({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await invokePublic('getDayAvailabilitySnapshot', {
          date: format(date, 'yyyy-MM-dd'),
          party_size: Number(partySize),
          slots: hourSlots,
        });
        if (!cancelled && res?.availability) setAvailability(res.availability);
      } catch (e) { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [date, partySize, hourSlots.join(',')]);

  // --- When user picks an HOUR, fetch quarter-strip availability
  const [quarterStripAvail, setQuarterStripAvail] = useState({});
  useEffect(() => {
    if (!selectedHour) { setQuarterStripAvail({}); return; }
    if (Number(partySize) > 12) return;
    const strip = buildQuarterStrip(selectedHour, openingHours.start, openingHours.end);
    if (!strip.length) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await invokePublic('getDayAvailabilitySnapshot', {
          date: format(date, 'yyyy-MM-dd'),
          party_size: Number(partySize),
          slots: strip,
        });
        if (!cancelled && res?.availability) setQuarterStripAvail(res.availability);
      } catch (e) { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [selectedHour, date, partySize, openingHours.start, openingHours.end]);

  // --- Submit one-click booking
  const submitBooking = async () => {
    setErrorMsg('');
    if (Number(partySize) > 12) return setErrorMsg('יותר מ-12 סועדים נחשב לאירוע — מלא את טופס האירועים');
    if (!customerName.trim()) return setErrorMsg('יש למלא שם מלא');
    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 9) return setErrorMsg('יש למלא מספר טלפון תקין');
    if (!time) return setErrorMsg('יש לבחור שעה');

    setIsBooking(true);
    try {
      const attr = captureAttribution();
      const res = await invokePublic('createPublicReservation', {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        date: format(date, 'yyyy-MM-dd'),
        time,
        party_size: parseInt(partySize),
        special_requests: specialRequests.trim() || null,
        special_occasion: occasion || null,
        ...attr,
      });
      if (!res?.success) {
        if (res?.reason === 'too_large_use_events') {
          setErrorMsg('יותר מ-12 סועדים נחשב לאירוע — אנא מלא את טופס האירועים');
        } else {
          setErrorMsg(res?.reason === 'no_availability'
            ? 'מצטערים, השעה התמלאה רגע לפניך. נסה שעה אחרת.'
            : 'שגיאה בביצוע ההזמנה. אנא נסה שוב.');
        }
        return;
      }
      setSuccess({
        customer_name: customerName,
        time,
        end_time: estimateEndTime(time, partySize),
        date: format(date, 'EEEE dd/MM', { locale: he }),
        party_size: parseInt(partySize),
        table_number: res.table_number,
        occasion,
      });
    } catch (e) {
      setErrorMsg('שגיאה זמנית. נסה שוב בעוד רגע.');
    } finally {
      setIsBooking(false);
    }
  };

  // For party > 12 — render the events redirect block instead of booking flow
  const isEventSize = Number(partySize) > 12;

  // --- Derived data
  const restaurantName = settings?.restaurant_name || 'עלינא';
  const welcomeMessage = settings?.welcome_message || 'בשר על האש, אווירה אחרת, אנשים נכונים';
  const phone = settings?.phone || '03-1234567';
  const address = settings?.address || 'רוטשילד 104, ראשון לציון';
  const wazeUrl = `https://waze.com/ul?ll=31.96,34.79&navigate=yes`;
  const social = {
    instagram: settings?.instagram_url || 'https://instagram.com/alina_restaurant',
    tiktok:    settings?.tiktok_url    || 'https://tiktok.com/@alina_restaurant',
    facebook:  settings?.facebook_url  || null,
    whatsapp:  settings?.whatsapp_url  || `https://wa.me/972${phone.replace(/\D/g, '').replace(/^0/, '')}`,
  };

  // Date strip — today + next 6 days
  const dateOptions = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 7; i++) arr.push(addDays(new Date(), i));
    return arr;
  }, []);

  // ===========================================================================
  // RENDER — SUCCESS STATE
  // ===========================================================================
  if (success) {
    const OCCASION_LABEL = {
      birthday: '🎂 יום הולדת', anniversary: '💐 יום נישואין',
      date: '❤️ דייט', celebration: '🎉 חגיגה', business: '💼 פגישת עסקים',
    };
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-orange-100 p-4 py-8">
        <div className="max-w-lg w-full mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-8 space-y-5">
          <div className="text-center space-y-2">
            <div className="text-6xl">✨</div>
            <h1 className="text-3xl font-black text-gray-900">ההזמנה נקבעה!</h1>
            <p className="text-lg text-gray-700">{success.customer_name}, נשמח לראותך 🔥</p>
          </div>

          {/* Booking summary */}
          <div className="bg-gradient-to-l from-amber-50 to-rose-50 border border-amber-200 rounded-2xl p-4 space-y-2 text-right">
            <Row icon={<Calendar className="w-4 h-4 text-amber-600" />} label="תאריך" value={success.date} />
            <Row icon={<Clock className="w-4 h-4 text-amber-600" />} label="שעה" value={`${success.time}${success.end_time ? ` (עד ~${success.end_time})` : ''}`} />
            <Row icon={<Users className="w-4 h-4 text-amber-600" />} label="סועדים" value={success.party_size} />
            {success.table_number && (
              <Row icon={<Sparkles className="w-4 h-4 text-amber-600" />} label="שולחן" value={`#${success.table_number}`} />
            )}
            {success.occasion && OCCASION_LABEL[success.occasion] && (
              <Row icon={<span className="w-4 h-4">{OCCASION_LABEL[success.occasion].slice(0,2)}</span>} label="חוגגים" value={OCCASION_LABEL[success.occasion].slice(3)} />
            )}
          </div>

          {/* Parking info */}
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <div className="font-bold text-blue-900 flex items-center gap-2"><NavIcon className="w-4 h-4" /> איפה חונים?</div>
            <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc pr-5 leading-relaxed">
              <li><b>חניון בן גוריון</b> — חינם אחר הצהריים, 2 דק׳ הליכה</li>
              <li>רחובות סמוכים: רוטשילד, הרצל, וייצמן — חניה בכחול-לבן</li>
              <li>ניווט ב-Waze ישר ל"עלינא ראשון לציון"</li>
            </ul>
          </div>

          {/* Policy box — late arrival + cancellation */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2 text-sm">
            <div className="font-bold text-amber-900">📋 מה חשוב לדעת</div>
            <div className="text-amber-800 leading-relaxed">
              ⏱ <b>איחור:</b> השולחן ממתין עד 10 דקות. לאיחור גדול יותר אנא הודע מראש.<br />
              💳 <b>ביטול:</b> ניתן לבטל ללא חיוב <b>עד 3 שעות לפני</b>. אחרי זה — 30₪ פיקדון לסועד.<br />
              📩 בקרוב יישלח אישור בוואטסאפ עם הקישור לעדכון/ביטול.
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <a
              href="https://waze.com/ul?ll=31.96,34.79&navigate=yes"
              target="_blank" rel="noopener noreferrer"
              className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl text-center text-sm flex items-center justify-center gap-2"
            >
              <NavIcon className="w-4 h-4" /> נווט בוייז
            </a>
            <button
              onClick={() => setSuccess(null)}
              className="px-4 bg-white hover:bg-gray-50 text-gray-700 font-bold py-3 rounded-xl border border-gray-200 text-sm"
            >
              חזור
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // RENDER — MAIN
  // ===========================================================================
  return (
    <div dir="rtl" className="min-h-screen bg-white text-gray-900">

      {/* ============ HERO PHOTO (Ontopo-style) ============ */}
      <header className="relative">
        {/* Top utility bar — overlaid on photo */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent">
          <LanguagePicker />
          <a href={`tel:${phone.replace(/\D/g, '')}`} className="flex items-center gap-1.5 bg-white/15 backdrop-blur-md rounded-full px-3 py-1.5 text-xs text-white hover:bg-white/25 transition-colors">
            <Phone className="w-3.5 h-3.5" />
            <span>{phone}</span>
          </a>
        </div>

        {/* Wide aspect hero photo (settings.hero_image_url overrides) */}
        <div
          className="w-full h-[42vh] md:h-[55vh] min-h-[260px] max-h-[480px] relative overflow-hidden"
          style={{
            backgroundImage: settings?.hero_image_url
              ? `url(${settings.hero_image_url})`
              : `linear-gradient(135deg, #1c1917 0%, #57220a 40%, #92400e 100%)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Soft animated glow if no real photo */}
          {!settings?.hero_image_url && (
            <div className="absolute inset-0 pointer-events-none opacity-70">
              <div className="absolute -top-32 -right-20 w-[28rem] h-[28rem] bg-orange-600/35 rounded-full blur-3xl animate-pulse"></div>
              <div className="absolute -bottom-20 -left-32 w-[28rem] h-[28rem] bg-rose-700/25 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1.5s'}}></div>
            </div>
          )}
          {/* Bottom fade for legibility of identity strip */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-white via-white/60 to-transparent"></div>

          {/* Floating bonus pill — top-left, subtle */}
          <div className="absolute top-16 right-4 md:right-8 z-10">
            <div className="bg-gradient-to-l from-amber-500 to-rose-500 text-white rounded-full px-3 py-1.5 text-[11px] font-black shadow-lg flex items-center gap-1">
              🎁 פוקצ׳ה חינם
            </div>
          </div>
        </div>
      </header>

      {/* ============ IDENTITY STRIP ============ */}
      <section className="bg-white text-gray-900 -mt-12 relative z-10">
        <div className="max-w-5xl mx-auto px-4 md:px-8 pt-2 pb-5">
          <div className="flex items-start gap-3 md:gap-5">
            {/* Logo bubble */}
            <div className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-zinc-900 text-amber-400 flex items-center justify-center shadow-lg border-4 border-white text-xl md:text-2xl font-black">
              {settings?.logo_url
                ? <img src={settings.logo_url} alt={restaurantName} className="w-full h-full object-cover rounded-2xl" />
                : <span>עלינא</span>}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight">{restaurantName}</h1>
              <p className="text-sm text-gray-500 mt-0.5">ראשון לציון · רוטשילד 104</p>
              {/* Tags */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(settings?.tags && Array.isArray(settings.tags) ? settings.tags : ['בשר על האש', 'כשר', 'אלכוהול', 'אווירה']).map(tag => (
                  <span key={tag} className="bg-amber-50 text-amber-900 border border-amber-200 rounded-full px-2.5 py-0.5 text-[11px] font-bold">{tag}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Rating row */}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map(i => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
              <span className="font-black text-gray-900 mr-1">4.8</span>
              <span className="text-gray-500 text-xs">(1,247 ביקורות)</span>
            </div>
            {liveCount !== null && liveCount > 0 && (
              <div className="inline-flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-emerald-700 font-bold">{liveCount}</span>
                <span className="text-gray-500">הזמנות בשעות אחרונות</span>
              </div>
            )}
          </div>

          {/* Ticker — single-line, calm */}
          <div className="mt-2 h-4 text-[11px] text-gray-400 overflow-hidden">
            <div
              key={tickerIndex}
              className="flex items-center gap-1.5"
              style={{ animation: 'fadeIn 0.4s ease-out' }}
            >
              <span className="w-1 h-1 bg-emerald-400 rounded-full"></span>
              <span><b className="text-gray-700">{TICKER_NAMES[tickerIndex]}</b> הזמין/ה לפני {TICKER_MINUTES[tickerIndex % TICKER_MINUTES.length]} דק׳ · קבוצה של {2 + (tickerIndex % 4)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Tiny CSS keyframes (avoid global stylesheet edits) */}
      <style>{`
        @keyframes fadeIn { from {opacity:0; transform:translateY(4px)} to {opacity:1; transform:translateY(0)} }
        @keyframes pulseBtn { 0%,100% {box-shadow:0 10px 40px -10px rgba(245,158,11,0.5)} 50% {box-shadow:0 10px 40px -5px rgba(245,158,11,0.9)} }
        .cta-pulse { animation: pulseBtn 2.5s ease-in-out infinite; }
      `}</style>

      {/* ============ PROMO RIBBON ============ */}
      {/* Higher contrast, larger text, sits below hero curve so it never overlaps */}
      {promos.length > 0 && (
        <div className="bg-amber-400 border-y-2 border-amber-600 py-2 overflow-hidden relative z-[3]">
          <div className="flex gap-2 px-3 overflow-x-auto scrollbar-thin max-w-full mx-auto items-center">
            <span className="flex-shrink-0 text-[10px] font-black text-amber-900 uppercase tracking-wider opacity-70">מה קורה עכשיו:</span>
            {promos.map((p, i) => (
              <div key={i} className="flex-shrink-0 bg-zinc-900 text-amber-100 rounded-full px-3 py-1 text-xs font-bold flex items-center gap-1.5">
                <span className="text-sm">{p.emoji}</span>
                <span>{p.label}</span>
                {p.detail && <span className="opacity-80 font-normal hidden sm:inline">· {p.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ BOOKING CARD ============ */}
      <main ref={bookingCardRef} className="bg-white relative z-[2] px-3 md:px-6 pb-10">
        <div className="max-w-2xl mx-auto bg-gray-50 text-gray-900 rounded-3xl shadow-lg border border-gray-200 p-5 md:p-7 space-y-5">
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-black">הזמינו שולחן</h2>
            <p className="text-sm text-gray-500 mt-1">ללא דמי שירות · אישור מיידי · ביטול חופשי</p>
          </div>

          {/* Party size */}
          <div>
            <Label icon={<Users className="w-4 h-4" />}>כמות סועדים</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 13].map(n => (
                <Chip key={n} active={Number(partySize) === n} onClick={() => setPartySize(n)}>
                  {n === 13 ? '13+' : n}
                </Chip>
              ))}
            </div>
            <div className="text-[10px] text-gray-400 mt-1.5">
              {Number(partySize) <= 5 && '· משך שולחן 2:00 שעות'}
              {Number(partySize) >= 6 && Number(partySize) <= 10 && '· משך שולחן 2:15 שעות'}
              {Number(partySize) >= 11 && Number(partySize) <= 12 && '· משך שולחן 2:30 שעות'}
              {Number(partySize) > 12 && '· 13+ סועדים = אירוע פרטי, ראה למטה'}
            </div>
          </div>

          {/* 13+ guests — redirect to events flow */}
          {isEventSize && (
            <div className="bg-gradient-to-bl from-purple-50 to-rose-50 border-2 border-purple-200 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎉</span>
                <div className="font-bold text-purple-900">קבוצה גדולה? זה אירוע פרטי</div>
              </div>
              <p className="text-sm text-purple-800 leading-relaxed">
                ל-13 סועדים ומעלה אנחנו סוגרים תפריט אירוע אישי שמתאים בדיוק לקבוצה שלך —
                תאמת אישית עם בעלת המקום, מנות מרכזיות, שתייה ואפילו חדר פרטי.
              </p>
              <a
                href="/EventsInquiry"
                className="block w-full text-center bg-purple-700 hover:bg-purple-800 text-white font-black py-3 rounded-xl transition-colors"
              >
                למילוי טופס אירוע פרטי →
              </a>
            </div>
          )}

          {/* Date / Time / Form — hidden when party > 12 (events flow active) */}
          {!isEventSize && <>
          <div>
            <Label icon={<Calendar className="w-4 h-4" />}>תאריך</Label>
            <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
              {dateOptions.map(d => {
                const active = isSameDay(d, date);
                const day = format(d, 'EEE', { locale: he });
                const num = format(d, 'd', { locale: he });
                const mo = format(d, 'MMM', { locale: he });
                return (
                  <button
                    key={d.toISOString()}
                    onClick={() => setDate(d)}
                    className={`flex-shrink-0 min-w-[58px] rounded-xl px-2 py-2 border text-center transition-all
                      ${active
                        ? 'bg-amber-600 border-amber-700 text-white shadow-lg scale-105'
                        : 'bg-white border-gray-200 hover:border-amber-300 text-gray-700'}`}
                  >
                    <div className="text-[10px] font-bold uppercase opacity-80">{day}</div>
                    <div className="text-xl font-black leading-none mt-0.5">{num}</div>
                    <div className="text-[10px] opacity-70">{mo}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time slots — two-step: pick HOUR, then expand to quarter-hour strip */}
          <div>
            <Label icon={<Clock className="w-4 h-4" />}>שעה</Label>
            {hourSlots.length === 0 ? (
              <p className="text-sm text-red-600 mt-2 bg-red-50 border border-red-200 rounded-lg p-2">המסעדה סגורה בתאריך זה</p>
            ) : (
              <>
                {/* Step 1: hour grid */}
                <div className="grid grid-cols-4 md:grid-cols-6 gap-1.5 mt-2">
                  {hourSlots.map(slot => {
                    const av = availability[slot]; // open|tight|full|undefined
                    const isHourActive = selectedHour === slot;
                    const isFinal = time === slot;
                    const disabled = av === 'full';
                    return (
                      <button
                        key={slot}
                        disabled={disabled}
                        onClick={() => { setSelectedHour(slot); setTime(slot); }}
                        className={`relative rounded-xl py-2 text-sm font-bold border transition-all
                          ${(isHourActive || isFinal)
                            ? 'bg-amber-600 text-white border-amber-700 shadow'
                            : disabled
                              ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                              : 'bg-white text-gray-800 border-gray-200 hover:border-amber-400'}`}
                      >
                        {slot}
                        {av && !isHourActive && !isFinal && (
                          <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full
                            ${av === 'open' ? 'bg-emerald-400' : av === 'tight' ? 'bg-amber-400' : 'bg-red-400'}`}></span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Step 2: quarter-hour drill-down strip (appears after hour is picked) */}
                {selectedHour && (() => {
                  const strip = buildQuarterStrip(selectedHour, openingHours.start, openingHours.end);
                  return (
                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-2">
                      <div className="text-[10px] text-amber-800 font-bold mb-1.5 text-center">
                        רבעי שעה זמינים סביב {selectedHour}
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {strip.map(s => {
                          const av = quarterStripAvail[s];
                          const active = time === s;
                          const disabled = av === 'full';
                          return (
                            <button
                              key={s}
                              disabled={disabled}
                              onClick={() => setTime(s)}
                              className={`relative rounded-lg py-1.5 text-[13px] font-bold border transition-all
                                ${active
                                  ? 'bg-amber-700 text-white border-amber-800 shadow-md scale-105'
                                  : disabled
                                    ? 'bg-white/40 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'bg-white text-amber-900 border-amber-300 hover:border-amber-600'}`}
                            >
                              {s}
                              {av && !active && (
                                <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full
                                  ${av === 'open' ? 'bg-emerald-400' : av === 'tight' ? 'bg-amber-400' : 'bg-red-400'}`}></span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                <div className="flex gap-3 mt-2 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span> פתוח</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span> מעט מקום</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span> מלא</span>
                </div>
                {time && (
                  <div className="mt-2 text-[11px] text-gray-600 bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                    שעת סיום משוערת: <span className="font-bold">{estimateEndTime(time, partySize)}</span>
                    {' '}· משך שולחן: {partySize >= 11 ? '2:30' : partySize >= 6 ? '2:15' : '2:00'} שעות
                  </div>
                )}
              </>
            )}
          </div>

          {/* Special occasion chips */}
          <div>
            <Label>מה חוגגים? <span className="font-normal text-gray-400">(אופציונלי)</span></Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[
                {k:'birthday', l:'🎂 יום הולדת'},
                {k:'anniversary', l:'💐 יום נישואין'},
                {k:'date', l:'❤️ דייט'},
                {k:'celebration', l:'🎉 חגיגה'},
                {k:'business', l:'💼 עסקים'},
                {k:'', l:'בלי סיבה מיוחדת'},
              ].map(o => (
                <button
                  key={o.k}
                  type="button"
                  onClick={() => setOccasion(o.k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all
                    ${occasion === o.k
                      ? 'bg-rose-100 text-rose-700 border-rose-400'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-rose-300'}`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Name + Phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>שם מלא</Label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="ישראל ישראלי"
                className="mt-1 w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-base"
              />
            </div>
            <div>
              <Label>טלפון</Label>
              <input
                type="tel"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="050-1234567"
                dir="ltr"
                className="mt-1 w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-base text-right"
              />
            </div>
          </div>

          {/* Optional notes */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-amber-700 font-semibold list-none">
              <span className="group-open:hidden">+ הוסף הערה (אופציונלי)</span>
              <span className="hidden group-open:inline">− הסתר הערה</span>
            </summary>
            <input
              type="text"
              value={specialRequests}
              onChange={e => setSpecialRequests(e.target.value)}
              placeholder="יום הולדת, אלרגיות, בקשה מיוחדת..."
              className="mt-2 w-full px-3 py-2 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:outline-none text-sm"
            />
          </details>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex items-start gap-2">
              <span className="text-lg leading-none">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* CTA */}
          <button
            onClick={submitBooking}
            disabled={isBooking || !time}
            className="cta-pulse w-full bg-gradient-to-l from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 disabled:from-gray-300 disabled:to-gray-300 disabled:animate-none text-white font-black py-4 rounded-2xl text-lg shadow-xl flex items-center justify-center gap-2 transition-all"
          >
            {isBooking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Flame className="w-5 h-5" />}
            {isBooking ? 'מבצע הזמנה...' : '🔥 תפוס מקום עכשיו'}
          </button>
          <div className="text-center text-[11px] text-gray-400 leading-relaxed">
            <div>בלחיצה אתה מסכים לקבל אישור בוואטסאפ</div>
            <div className="mt-1">השולחן ממתין עד 10 דק׳ איחור · ביטול חופשי עד 3 שעות לפני · אחר כך 30₪ פיקדון לסועד</div>
          </div>
          </>}
        </div>
      </main>

      {/* ============ TRUST STRIP ============ */}
      <section className="bg-gray-50 px-3 py-8 border-t border-gray-200">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3">
          <TrustBlock icon="⚡" title="אישור מיידי" sub="ב-30 שניות" />
          <TrustBlock icon="🚫" title="ללא דמי שירות" sub="בלי הפתעות" />
          <TrustBlock icon="↩️" title="ביטול חינם" sub="עד 3 שעות לפני" />
          <TrustBlock icon="⭐" title="4.8 מתוך 5" sub="1,247 ביקורות אמיתיות" />
        </div>

        {/* "Why us vs Wolt" contrast — strong differentiator */}
        <div className="max-w-3xl mx-auto mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4">
            <div className="text-emerald-700 text-xs font-black uppercase tracking-wider mb-2">אצלנו</div>
            <ul className="text-sm text-emerald-900 space-y-1">
              <li>✅ שולחן שמור עם השם שלך</li>
              <li>✅ מנגל פתוח · בשר טרי</li>
              <li>✅ ללא עמלות · אישור 30 שניות</li>
              <li>✅ אווירה. אנשים. צחוקים.</li>
            </ul>
          </div>
          <div className="bg-gray-100 border-2 border-gray-200 rounded-2xl p-4">
            <div className="text-gray-500 text-xs font-black uppercase tracking-wider mb-2">משלוח עמלה</div>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>⛔ 30% עמלה ממחיר המנה</li>
              <li>⛔ אוכל קר אחרי 40 דק׳</li>
              <li>⛔ בלי אווירה · בבית לבד</li>
              <li>⛔ שירות לוקה בחסר</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ============ FEATURED MENU CAROUSEL ============ */}
      {featuredMenu.length > 0 && (
        <section className="bg-white px-3 md:px-5 py-10 border-t border-gray-200">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end justify-between mb-4 px-2">
              <div>
                <div className="text-xs text-amber-600 font-bold uppercase tracking-wider">המומלצים שלנו</div>
                <h3 className="text-2xl md:text-3xl font-black text-gray-900">תפריט שיפתח לך תיאבון</h3>
              </div>
              <a href="/menu" className="text-xs text-amber-700 hover:text-amber-900 flex items-center gap-0.5 font-bold">
                כל התפריט <ChevronRight className="w-3 h-3 rotate-180" />
              </a>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 px-2 snap-x snap-mandatory">
              {featuredMenu.map((item) => (
                <div key={item.id} className="flex-shrink-0 w-56 snap-start bg-white rounded-2xl overflow-hidden border border-gray-200 hover:border-amber-400 hover:shadow-lg transition-all">
                  {item.image_url && (
                    <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
                      <img src={item.image_url} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-bold text-gray-900 text-sm">{item.name}</div>
                    {item.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2 leading-snug">{item.description}</p>
                    )}
                    {item.price ? (
                      <div className="mt-2 text-amber-700 font-black text-sm">{Math.round(item.price)} ₪</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ REVIEWS BLOCK ============ */}
      {reviews.length > 0 && (
        <section className="bg-gray-50 px-3 md:px-5 py-10 border-t border-gray-200">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-5">
              <div className="flex items-center justify-center gap-1 mb-1">
                {[1,2,3,4,5].map(i => <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />)}
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-gray-900">מה הסועדים אומרים</h3>
              <p className="text-gray-500 text-sm mt-1">ביקורות אמיתיות מלקוחות עלינא</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 px-2 snap-x snap-mandatory">
              {reviews.map((r, i) => (
                <div key={i} className="flex-shrink-0 w-72 snap-start bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-1 mb-2">
                    {Array.from({ length: r.rating || 5 }).map((_, k) => (
                      <Star key={k} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-5">"{r.comment}"</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-700">— {r.name}</span>
                    {r.date && <span className="text-gray-400">{r.date}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ ABOUT / ATMOSPHERE ============ */}
      <section className="bg-white px-5 py-12 border-t border-gray-200">
        <div className="max-w-2xl mx-auto text-center space-y-3">
          <h3 className="text-2xl font-black text-gray-900">בשר. אלכוהול. אווירה. אנשים.</h3>
          <p className="text-gray-600 leading-relaxed">
            עלינא היא לא רק מסעדה — היא מקום שבו אתם מרגישים בבית.
            המנגל פתוח 13 שעות ביום, היין נשפך, הצחוקים גבוהים.
            מ-12:00 עד אחרונה.
          </p>
        </div>
      </section>

      {/* ============ CONTACT / ADDRESS / HOURS ============ */}
      <section className="bg-gray-50 px-5 py-10 border-t border-gray-200">
        <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <a href={wazeUrl} target="_blank" rel="noopener noreferrer"
             className="bg-white hover:bg-amber-50 border border-gray-200 hover:border-amber-300 rounded-2xl p-4 flex items-start gap-3 transition-colors">
            <NavIcon className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <div className="text-gray-500 text-xs">ניווט ב-Waze</div>
              <div className="text-gray-900 font-semibold mt-0.5">{address}</div>
            </div>
          </a>
          <a href={`tel:${phone.replace(/\D/g, '')}`}
             className="bg-white hover:bg-amber-50 border border-gray-200 hover:border-amber-300 rounded-2xl p-4 flex items-start gap-3 transition-colors">
            <Phone className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <div className="text-gray-500 text-xs">חייגו אלינו</div>
              <div className="text-gray-900 font-semibold mt-0.5" dir="ltr">{phone}</div>
            </div>
          </a>
          <div className="bg-white border border-gray-200 rounded-2xl p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <div className="text-gray-500 text-xs">שעות פתיחה היום</div>
              <div className="text-gray-900 font-semibold mt-0.5">
                {openingHours.start === '00:00' && openingHours.end === '00:00' ? 'סגור' : `${openingHours.start} - ${openingHours.end}`}
              </div>
            </div>
          </div>
        </div>

        {/* Social icons row */}
        <div className="mt-6 flex items-center justify-center gap-3">
          {social.instagram && <SocialIconLight href={social.instagram} label="Instagram"><Instagram className="w-4 h-4" /></SocialIconLight>}
          {social.tiktok    && <SocialIconLight href={social.tiktok}    label="TikTok"><Music2 className="w-4 h-4" /></SocialIconLight>}
          {social.facebook  && <SocialIconLight href={social.facebook}  label="Facebook"><Facebook className="w-4 h-4" /></SocialIconLight>}
          {social.whatsapp  && <SocialIconLight href={social.whatsapp}  label="WhatsApp"><MessageCircle className="w-4 h-4" /></SocialIconLight>}
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">© עלינא · אוכל · אלכוהול · אווירה · אנשים</p>
      </section>

      {/* ============ EXIT INTENT MODAL (desktop) ============ */}
      {showExitIntent && !success && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowExitIntent(false)}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 md:p-8 text-center space-y-4 relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowExitIntent(false)} className="absolute top-3 left-3 text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
            <div className="text-5xl">🔥</div>
            <h2 className="text-2xl font-black text-gray-900">רגע! לפני שאתה הולך...</h2>
            <p className="text-gray-700 leading-relaxed">
              הזמן עכשיו וקבל <b className="text-amber-600">פוקצ׳ה חמה מתנה</b> לשולחן.
              <br />
              <span className="text-xs text-gray-500">תקף 24 שעות. הזמנה אחת ללקוח חדש.</span>
            </p>
            <button
              onClick={() => { setShowExitIntent(false); scrollToBooking(); }}
              className="w-full bg-gradient-to-l from-amber-600 to-rose-600 text-white font-black py-3 rounded-2xl text-lg shadow-lg"
            >
              🎁 קח את המתנה
            </button>
            <p className="text-[11px] text-gray-400">לא תודה — אסגור</p>
          </div>
        </div>
      )}

      {/* ============ STICKY MOBILE CTA ============ */}
      {/* Appears once user has scrolled past the booking card — a single tap returns them to it */}
      {showStickyCTA && !success && (
        <button
          onClick={scrollToBooking}
          className="md:hidden fixed bottom-3 left-3 right-3 z-50 bg-gradient-to-l from-amber-600 to-rose-600 text-white font-black py-3.5 rounded-2xl shadow-2xl flex items-center justify-center gap-2 animate-in slide-in-from-bottom"
        >
          <Sparkles className="w-5 h-5" />
          הזמן שולחן עכשיו
        </button>
      )}
    </div>
  );
}

// --- Small reusable bits ----------------------------------------------------

function Label({ icon, children }) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
      {icon}
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[42px] h-10 px-3 rounded-xl font-bold text-sm border transition-all
        ${active
          ? 'bg-amber-600 text-white border-amber-700 shadow scale-105'
          : 'bg-white text-gray-700 border-gray-200 hover:border-amber-400'}`}
    >
      {children}
    </button>
  );
}

function Row({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon}
      <span className="text-gray-500">{label}:</span>
      <span className="font-bold text-gray-900 mr-auto">{value}</span>
    </div>
  );
}

function TrustBlock({ icon, title, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-3 text-center hover:border-amber-300 transition-colors">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-sm font-black text-gray-900">{title}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}

function SocialIcon({ href, label, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md hover:bg-white/20 flex items-center justify-center text-white transition-colors"
    >
      {children}
    </a>
  );
}

function SocialIconLight({ href, label, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="w-10 h-10 rounded-full bg-white border border-gray-200 hover:border-amber-400 hover:text-amber-700 flex items-center justify-center text-gray-600 transition-colors"
    >
      {children}
    </a>
  );
}
