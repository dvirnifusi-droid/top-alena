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
import SmartReserveBanner from '@/components/public/SmartReserveBanner';
import SpecialPopup from '@/components/public/SpecialPopup';

// --- Brand palette (mirrors alena.topalena.com) ------------------------------
//   terracotta  #A04A2E   →  primary CTA
//   olive       #44512C   →  deep secondary
//   brass       #B89556   →  premium accent
//   brass-soft  #D9BD83
//   cream       #F4ECD8
//   cream-soft  #FAF5E8
//   charcoal    #1F1B17

const HERO_FALLBACK_BG = 'linear-gradient(135deg, #1F1B17 0%, #44512C 55%, #A04A2E 100%)';

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

// --- Theme nights + specials catalogue ---------------------------------------
// Single source of truth for the "what we run" cards AND the in-form time tags.
// Edit this list to change copy across both surfaces.
const THEME_NIGHTS = [
  { id: 'happy', emoji: '🌅', title: 'Happy Hour',  blurb: '40% הנחה על כל האלכוהול — קוקטיילים, בירה, יין.',
    when: 'א׳-ה׳ · עד 20:00', match: (d,h) => d>=0 && d<=4 && h<20 },
  { id: 'biz',   emoji: '🍽',  title: 'עסקיות צהריים', blurb: 'תפריט עסקיות עשיר — מנה ראשונה, עיקרית ושתייה.',
    when: 'כל יום פתוח · 12:00-17:00', match: (d,h) => d!==5 && h>=12 && h<17 },
  { id: 'sun',   emoji: '🍔', title: 'Burger Night', blurb: 'ספיישלים של בקר טרי 220גר׳ — בורגרים שלא בתפריט הרגיל.',
    when: 'ראשון · כל הערב', match: (d) => d===0 },
  { id: 'mon',   emoji: '🍷', title: 'יין ללא תחתית', blurb: 'הסומליה בבר, כוסות מ-₪61, היין נמזג ברצף עד הסגירה.',
    when: 'שני · כל הערב', match: (d) => d===1 },
  { id: 'tue',   emoji: '🥩', title: 'Butcher Night', blurb: 'נתחי הפתעה ומנות שף חד-פעמיות — ישר מהקצב לגריל.',
    when: 'שלישי · כל הערב', match: (d) => d===2 },
  { id: 'thu',   emoji: '🔥', title: 'חמישי גבוה',    blurb: 'פתוחים עד 02:00, הצוות בכושר, מקום על הבר אם תהיו זריזים.',
    when: 'חמישי · עד 02:00', match: (d) => d===4 },
  { id: 'sat',   emoji: '✨', title: 'מוצ״ש בעלינא',   blurb: 'פותחים מ-20:15 — הערב הכי גבוה של השבוע.',
    when: 'שבת · מ-20:15', match: (d) => d===6 },
];

function getSpecialsForSlot(dateObj, hhmm) {
  if (!hhmm) return [];
  const d = dateObj.getDay();
  const h = Number(String(hhmm).split(':')[0]) || 0;
  return THEME_NIGHTS.filter(t => t.match(d, h));
}

// All specials relevant to a given day at ANY hour during open windows.
// Used for the day-level tag chip that appears after the user picks a date.
function getDaySpecials(dateObj) {
  const d = dateObj.getDay();
  const seen = new Set();
  const out = [];
  for (const h of [13, 18, 21]) {
    THEME_NIGHTS.forEach(t => {
      if (!seen.has(t.id) && t.match(d, h)) { seen.add(t.id); out.push(t); }
    });
  }
  return out;
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
  const [customerEmail, setCustomerEmail] = useState('');
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
        customer_email: customerEmail.trim() || null,
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
      <div dir="rtl" className="min-h-screen p-4 py-8" style={{ background: 'linear-gradient(135deg, #FAF5E8 0%, #F4ECD8 60%, #E8D9B5 100%)', fontFamily: 'Heebo, system-ui, sans-serif' }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;900&family=Heebo:wght@300;400;500;600;700&display=swap'); .brand-display{font-family:'Frank Ruhl Libre',serif;font-weight:900;letter-spacing:-0.01em}`}</style>
        <div className="max-w-lg w-full mx-auto rounded-3xl shadow-2xl p-6 md:p-8 space-y-5" style={{ background: '#FFFEFB', border: '1px solid rgba(184,149,86,0.3)' }}>
          <div className="text-center space-y-2">
            <div className="text-6xl">✨</div>
            <h1 className="brand-display text-3xl md:text-4xl" style={{ color: '#1F1B17' }}>ההזמנה נקבעה!</h1>
            <p className="text-lg" style={{ color: '#44512C' }}>{success.customer_name}, נשמח לראותך 🔥</p>
          </div>

          {/* Booking summary */}
          <div className="rounded-2xl p-4 space-y-2 text-right" style={{ background: 'linear-gradient(to left, #FAF5E8, #F4ECD8)', border: '1px solid rgba(184,149,86,0.4)' }}>
            <Row icon={<Calendar className="w-4 h-4" style={{ color: '#A04A2E' }} />} label="תאריך" value={success.date} />
            <Row icon={<Clock className="w-4 h-4" style={{ color: '#A04A2E' }} />} label="שעה" value={`${success.time}${success.end_time ? ` (עד ~${success.end_time})` : ''}`} />
            <Row icon={<Users className="w-4 h-4" style={{ color: '#A04A2E' }} />} label="סועדים" value={success.party_size} />
            {success.table_number && (
              <Row icon={<Sparkles className="w-4 h-4" style={{ color: '#A04A2E' }} />} label="שולחן" value={`#${success.table_number}`} />
            )}
            {success.occasion && OCCASION_LABEL[success.occasion] && (
              <Row icon={<span className="w-4 h-4">{OCCASION_LABEL[success.occasion].slice(0,2)}</span>} label="חוגגים" value={OCCASION_LABEL[success.occasion].slice(3)} />
            )}
          </div>

          {/* Parking info */}
          <div className="rounded-2xl p-4" style={{ background: 'rgba(68,81,44,0.07)', border: '1px solid rgba(68,81,44,0.25)' }}>
            <div className="font-bold flex items-center gap-2" style={{ color: '#44512C' }}><NavIcon className="w-4 h-4" /> איפה חונים?</div>
            <ul className="text-sm mt-2 space-y-1 list-disc pr-5 leading-relaxed" style={{ color: '#44512C' }}>
              <li><b>חניון בן גוריון</b> — חינם אחר הצהריים, 2 דק׳ הליכה</li>
              <li>רחובות סמוכים: רוטשילד, הרצל, וייצמן — חניה בכחול-לבן</li>
              <li>ניווט ב-Waze ישר ל"עלינא ראשון לציון"</li>
            </ul>
          </div>

          {/* Policy box — late arrival + cancellation */}
          <div className="rounded-2xl p-4 space-y-2 text-sm" style={{ background: 'rgba(184,149,86,0.10)', border: '1px solid rgba(184,149,86,0.35)' }}>
            <div className="font-bold" style={{ color: '#8B5A3A' }}>📋 מה חשוב לדעת</div>
            <div className="leading-relaxed" style={{ color: '#6B4626' }}>
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
              className="flex-1 font-bold py-3 rounded-xl text-center text-sm flex items-center justify-center gap-2 transition-colors"
              style={{ background: '#1F1B17', color: '#F4ECD8' }}
            >
              <NavIcon className="w-4 h-4" /> נווט בוייז
            </a>
            <button
              onClick={() => setSuccess(null)}
              className="px-4 font-bold py-3 rounded-xl text-sm transition-colors"
              style={{ background: '#FFFEFB', color: '#44512C', border: '1px solid rgba(184,149,86,0.4)' }}
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
    <div dir="rtl" className="min-h-screen bg-white text-gray-900" style={{ fontFamily: 'Heebo, system-ui, sans-serif' }}>

      {/* ============ BRAND FONT INJECTION ============ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;500;700;900&family=Heebo:wght@300;400;500;600;700&display=swap');
        .brand-display { font-family: 'Frank Ruhl Libre', serif; font-weight: 900; letter-spacing: -0.01em; }
      `}</style>

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
          className="w-full h-[40vh] md:h-[54vh] min-h-[280px] md:min-h-[340px] max-h-[480px] relative overflow-hidden"
          style={{
            backgroundImage: settings?.hero_image_url
              ? `url(${settings.hero_image_url})`
              : `linear-gradient(180deg, rgba(31,27,23,0.35) 0%, rgba(31,27,23,0.55) 60%, rgba(31,27,23,0.80) 100%), url('https://alena.topalena.com/gallery/spread.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 40%',
          }}
        >
          {/* Bottom fade for legibility of identity strip */}
          <div className="absolute inset-x-0 bottom-0 h-28" style={{ background: 'linear-gradient(to top, #FFFEFB 0%, rgba(255,254,251,0.72) 50%, transparent 100%)' }}></div>

          {/* Hero center stack: logo + wordmark */}
          <div className="absolute inset-0 z-[5] flex flex-col items-center justify-center text-center pointer-events-none px-4">
            {/* Olive-branch logo medallion */}
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center mb-3 md:mb-4" style={{ background: 'rgba(31,27,23,0.55)', backdropFilter: 'blur(6px)', border: '1px solid rgba(217,189,131,0.45)' }}>
              <svg viewBox="0 0 64 64" className="w-14 h-14 md:w-16 md:h-16" aria-hidden="true">
                <path d="M6 38 Q20 22 32 28 Q44 34 58 22" fill="none" stroke="#D9BD83" strokeWidth="2.4" strokeLinecap="round" />
                <ellipse cx="12" cy="32" rx="5" ry="2.8" transform="rotate(-30 12 32)" fill="#7A8A48" />
                <ellipse cx="24" cy="27" rx="5" ry="2.8" transform="rotate(-10 24 27)" fill="#7A8A48" />
                <ellipse cx="38" cy="29" rx="5" ry="2.8" transform="rotate(14 38 29)" fill="#7A8A48" />
                <ellipse cx="52" cy="25" rx="5" ry="2.8" transform="rotate(-6 52 25)" fill="#7A8A48" />
                <circle cx="6" cy="38" r="1.6" fill="#D9BD83" />
                <circle cx="58" cy="22" r="1.6" fill="#D9BD83" />
              </svg>
            </div>
            <p className="text-[10px] md:text-xs uppercase tracking-[0.4em] drop-shadow" style={{ color: '#D9BD83' }}>
              רוטשילד 104 · ראשון לציון
            </p>
            <h2
              className="brand-display mt-2 drop-shadow-lg"
              style={{ color: '#F4ECD8', fontSize: 'clamp(3.5rem, 10vw, 6.5rem)', lineHeight: 1 }}
            >
              עלינא
            </h2>
            <div className="flex items-center justify-center gap-2 mt-3" aria-hidden="true">
              <span style={{ width: 32, height: 1, background: 'rgba(217,189,131,0.7)' }} />
              <span style={{ width: 4, height: 4, borderRadius: 2, background: '#D9BD83' }} />
              <span style={{ width: 32, height: 1, background: 'rgba(217,189,131,0.7)' }} />
            </div>
            <p className="mt-3 text-sm md:text-base font-medium drop-shadow" style={{ color: 'rgba(244,236,216,0.92)' }}>
              חמארה ים-תיכונית · כשרה
            </p>
          </div>
        </div>
      </header>

      {/* ============ COMPACT TRUST STRIP (hero already carries the wordmark) ============ */}
      <section className="-mt-10 md:-mt-12 relative z-10" style={{ background: '#FFFEFB' }}>
        <div className="max-w-3xl mx-auto px-4 md:px-8 pt-3 pb-4 text-center">
          {/* Tags */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {(settings?.tags && Array.isArray(settings.tags) ? settings.tags : ['בשר על האש', 'כשר', 'אלכוהול', 'אווירה']).map(tag => (
              <span key={tag} className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: 'rgba(184,149,86,0.15)', color: '#8B5A3A', border: '1px solid rgba(184,149,86,0.4)' }}>{tag}</span>
            ))}
          </div>

          {/* Rating + live count — single line on desktop, wraps on mobile */}
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1">
              {[1,2,3,4,5].map(i => <Star key={i} className="w-3.5 h-3.5" style={{ fill: '#B89556', color: '#B89556' }} />)}
              <span className="font-black mr-1" style={{ color: '#1F1B17' }}>4.8</span>
              <span className="text-xs" style={{ color: '#8B7F65' }}>(1,247 ביקורות)</span>
            </div>
            {liveCount !== null && liveCount > 0 && (
              <div className="inline-flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#44512C' }}></span>
                <span className="font-bold" style={{ color: '#44512C' }}>{liveCount}</span>
                <span style={{ color: '#8B7F65' }}>הזמנות בשעות אחרונות</span>
              </div>
            )}
          </div>

          {/* Ticker — only shown if there ARE recent reservations.
              Capped to liveCount so it never claims more activity than the API reports. */}
          {liveCount > 0 && (
            <div className="mt-1.5 h-4 text-[11px] overflow-hidden" style={{ color: '#A8967A' }}>
              <div
                key={tickerIndex}
                className="flex items-center justify-center gap-1.5"
                style={{ animation: 'fadeIn 0.4s ease-out' }}
              >
                <span className="w-1 h-1 rounded-full" style={{ background: '#44512C' }}></span>
                <span><b style={{ color: '#44512C' }}>{TICKER_NAMES[tickerIndex % Math.max(1, Math.min(liveCount, TICKER_NAMES.length))]}</b> הזמין/ה לפני {TICKER_MINUTES[tickerIndex % TICKER_MINUTES.length]} דק׳ · קבוצה של {2 + (tickerIndex % 4)}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Tiny CSS keyframes (avoid global stylesheet edits) */}
      <style>{`
        @keyframes fadeIn { from {opacity:0; transform:translateY(4px)} to {opacity:1; transform:translateY(0)} }
        @keyframes pulseBtn { 0%,100% {box-shadow:0 12px 40px -10px rgba(160,74,46,0.45)} 50% {box-shadow:0 14px 44px -6px rgba(160,74,46,0.85)} }
        .cta-pulse { animation: pulseBtn 2.5s ease-in-out infinite; }
        .brand-input:focus { border-color: #B89556 !important; box-shadow: 0 0 0 3px rgba(184,149,86,0.20); }
      `}</style>

      {/* ============ THEME RIBBON — live day-aware catalogue ============ */}
      {(() => {
        const now = new Date();
        const todayD = now.getDay();
        const todayH = now.getHours();
        return (
          <div className="border-y-2 py-2 overflow-hidden relative z-[3]" style={{ background: '#B89556', borderTopColor: '#8B5A3A', borderBottomColor: '#8B5A3A' }}>
            <div className="flex gap-2 px-3 overflow-x-auto scrollbar-thin max-w-full mx-auto items-center">
              <span className="flex-shrink-0 text-[10px] font-black uppercase tracking-wider opacity-80" style={{ color: '#1F1B17' }}>הערבים שלנו:</span>
              {THEME_NIGHTS.map(t => {
                const activeNow = t.match(todayD, todayH);
                return (
                  <div
                    key={t.id}
                    className="flex-shrink-0 rounded-full px-3 py-1 text-xs font-bold flex items-center gap-1.5 transition-all"
                    style={activeNow
                      ? { background: '#F4ECD8', color: '#1F1B17', boxShadow: '0 0 0 2px #1F1B17, 0 4px 10px -3px rgba(31,27,23,0.4)' }
                      : { background: '#1F1B17', color: '#F4ECD8' }}
                    title={t.blurb}
                  >
                    <span className="text-sm">{t.emoji}</span>
                    <span>{t.title}</span>
                    {activeNow && <span className="text-[9px] uppercase tracking-wider opacity-75 hidden sm:inline">· עכשיו</span>}
                    <span className="opacity-70 font-normal hidden md:inline">· {t.when}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ============ TWO-COLUMN SECTION (banner+form left, menu sidebar right on desktop) ============ */}
      <div className="relative z-[2] px-3 md:px-6 pt-6 pb-12" style={{ background: 'linear-gradient(180deg, #FFFEFB 0%, #FAF5E8 25%, #F4ECD8 100%)' }}>
        <div className="max-w-6xl mx-auto lg:grid lg:grid-cols-12 lg:gap-8">
          {/* LEFT — SmartBanner + Booking card */}
          <div className="lg:col-span-7 space-y-4">
            <SmartReserveBanner />
            {/* ============ BOOKING CARD ============ */}
            <main id="booking" ref={bookingCardRef} className="rounded-3xl p-5 md:p-8 space-y-5" style={{ background: '#FFFEFB', border: '1px solid rgba(184,149,86,0.4)', boxShadow: '0 30px 60px -25px rgba(31,27,23,0.30), 0 8px 20px -10px rgba(31,27,23,0.15)' }}>
          <div className="text-center">
            <h2 className="brand-display text-3xl md:text-4xl" style={{ color: '#1F1B17' }}>הזמינו שולחן</h2>
            <p className="text-sm mt-1" style={{ color: '#6B7A4F' }}>ללא דמי שירות · אישור מיידי · ביטול חופשי</p>
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
            <div className="rounded-2xl p-4 space-y-3" style={{ background: 'linear-gradient(135deg, rgba(68,81,44,0.08), rgba(184,149,86,0.12))', border: '2px solid rgba(68,81,44,0.30)' }}>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎉</span>
                <div className="brand-display text-lg" style={{ color: '#1F1B17' }}>קבוצה גדולה? זה אירוע פרטי</div>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: '#44512C' }}>
                ל-13 סועדים ומעלה אנחנו סוגרים תפריט אירוע אישי שמתאים בדיוק לקבוצה שלך —
                תאמת אישית עם בעלת המקום, מנות מרכזיות, שתייה ואפילו חדר פרטי.
              </p>
              <a
                href="/EventsInquiry"
                className="block w-full text-center font-black py-3 rounded-xl transition-colors"
                style={{ background: '#44512C', color: '#F4ECD8' }}
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
                    className="flex-shrink-0 min-w-[64px] rounded-xl px-2 py-2.5 text-center transition-all"
                    style={active
                      ? { background: '#A04A2E', border: '1px solid #8B3D24', color: '#F4ECD8', boxShadow: '0 8px 16px -6px rgba(160,74,46,0.55)', transform: 'scale(1.05)' }
                      : { background: '#FFFEFB', border: '1px solid rgba(184,149,86,0.35)', color: '#44512C' }}
                  >
                    <div className="text-[10px] font-bold uppercase opacity-80">{day}</div>
                    <div className="text-xl font-black leading-none mt-0.5">{num}</div>
                    <div className="text-[10px] opacity-70">{mo}</div>
                  </button>
                );
              })}
            </div>
            {/* Day-level specials tag — visible as soon as a date is picked */}
            {(() => {
              const dayItems = getDaySpecials(date);
              if (dayItems.length === 0) return null;
              return (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: '#B89556' }}>ביום הזה אצלנו:</span>
                  {dayItems.map(t => (
                    <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: 'rgba(184,149,86,0.14)', color: '#1F1B17', border: '1px solid rgba(184,149,86,0.45)' }} title={t.blurb}>
                      <span className="text-sm leading-none">{t.emoji}</span>
                      <span>{t.title}</span>
                    </span>
                  ))}
                </div>
              );
            })()}
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
                        className="relative rounded-xl py-3 text-sm font-bold transition-all min-h-[48px]"
                        style={(isHourActive || isFinal)
                          ? { background: '#A04A2E', color: '#F4ECD8', border: '1px solid #8B3D24', boxShadow: '0 6px 14px -5px rgba(160,74,46,0.55)' }
                          : disabled
                            ? { background: '#F4ECD8', color: '#C8B889', border: '1px solid rgba(184,149,86,0.15)', cursor: 'not-allowed' }
                            : { background: '#FFFEFB', color: '#1F1B17', border: '1px solid rgba(184,149,86,0.35)' }}
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
                    <div className="mt-3 rounded-xl p-2.5" style={{ background: 'rgba(68,81,44,0.06)', border: '1px solid rgba(68,81,44,0.25)' }}>
                      <div className="text-[10px] font-bold mb-1.5 text-center tracking-wider" style={{ color: '#44512C' }}>
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
                              className="relative rounded-lg py-1.5 text-[13px] font-bold transition-all"
                              style={active
                                ? { background: '#44512C', color: '#F4ECD8', border: '1px solid #2F3A1E', boxShadow: '0 5px 12px -4px rgba(68,81,44,0.55)', transform: 'scale(1.05)' }
                                : disabled
                                  ? { background: '#FFFEFB', color: '#C8B889', border: '1px solid rgba(184,149,86,0.15)', cursor: 'not-allowed' }
                                  : { background: '#FFFEFB', color: '#44512C', border: '1px solid rgba(68,81,44,0.30)' }}
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
                  <div className="mt-2 text-[11px] rounded-lg px-2 py-1.5 text-center" style={{ color: '#44512C', background: 'rgba(184,149,86,0.10)', border: '1px solid rgba(184,149,86,0.25)' }}>
                    שעת סיום משוערת: <span className="font-bold" style={{ color: '#1F1B17' }}>{estimateEndTime(time, partySize)}</span>
                    {' '}· משך שולחן: {partySize >= 11 ? '2:30' : partySize >= 6 ? '2:15' : '2:00'} שעות
                  </div>
                )}

                {/* Specials active in the chosen slot — pulls from THEME_NIGHTS catalogue */}
                {time && (() => {
                  const specials = getSpecialsForSlot(date, time);
                  if (specials.length === 0) return null;
                  return (
                    <div className="mt-3 rounded-xl p-3" style={{ background: 'linear-gradient(135deg, rgba(184,149,86,0.12), rgba(68,81,44,0.08))', border: '1px solid rgba(184,149,86,0.40)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: '#B89556' }}>
                        בשעה שבחרת
                      </p>
                      <div className="space-y-2">
                        {specials.map(s => (
                          <div key={s.id} className="flex items-start gap-2">
                            <span className="text-xl leading-none">{s.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-sm" style={{ color: '#1F1B17' }}>{s.title}</div>
                              <div className="text-[12px] leading-snug" style={{ color: '#44512C' }}>{s.blurb}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
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
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={occasion === o.k
                    ? { background: 'rgba(160,74,46,0.12)', color: '#A04A2E', border: '1px solid #A04A2E' }
                    : { background: '#FFFEFB', color: '#44512C', border: '1px solid rgba(184,149,86,0.35)' }}
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
                className="mt-1 w-full px-3 py-2.5 rounded-xl focus:outline-none text-base brand-input"
                style={{ background: '#FFFEFB', border: '2px solid rgba(184,149,86,0.35)', color: '#1F1B17' }}
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
                className="mt-1 w-full px-3 py-2.5 rounded-xl focus:outline-none text-base text-right brand-input"
                style={{ background: '#FFFEFB', border: '2px solid rgba(184,149,86,0.35)', color: '#1F1B17' }}
              />
            </div>
          </div>

          {/* Optional email — for email confirmation */}
          <div>
            <Label>אימייל <span className="font-normal text-gray-400">(אופציונלי, לאישור במייל)</span></Label>
            <input
              type="email"
              value={customerEmail}
              onChange={e => setCustomerEmail(e.target.value)}
              placeholder="you@example.com"
              dir="ltr"
              className="mt-1 w-full px-3 py-2.5 rounded-xl focus:outline-none text-base text-right brand-input"
              style={{ background: '#FFFEFB', border: '2px solid rgba(184,149,86,0.35)', color: '#1F1B17' }}
            />
          </div>

          {/* Optional notes */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold list-none" style={{ color: '#44512C' }}>
              <span className="group-open:hidden">+ הוסף הערה (אופציונלי)</span>
              <span className="hidden group-open:inline">− הסתר הערה</span>
            </summary>
            <input
              type="text"
              value={specialRequests}
              onChange={e => setSpecialRequests(e.target.value)}
              placeholder="יום הולדת, אלרגיות, בקשה מיוחדת..."
              className="mt-2 w-full px-3 py-2 rounded-xl focus:outline-none text-sm brand-input"
              style={{ background: '#FFFEFB', border: '2px solid rgba(184,149,86,0.35)', color: '#1F1B17' }}
            />
          </details>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex items-start gap-2">
              <span className="text-lg leading-none">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* CTA — brand terracotta */}
          <button
            onClick={submitBooking}
            disabled={isBooking || !time}
            className="cta-pulse w-full font-black py-4 rounded-2xl text-lg shadow-xl flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:animate-none"
            style={{
              background: (isBooking || !time)
                ? 'linear-gradient(to left, #d1d5db, #d1d5db)'
                : 'linear-gradient(to left, #A04A2E, #8B3D24)',
              color: '#F4ECD8',
            }}
          >
            {isBooking ? <Loader2 className="w-5 h-5 animate-spin" /> : <Flame className="w-5 h-5" />}
            {isBooking ? 'מבצע הזמנה...' : '🔥 תפוס מקום עכשיו'}
          </button>
          <div className="text-center text-[11px] text-gray-400 leading-relaxed">
            <div>בלחיצה אתה מסכים לקבל אישור בוואטסאפ</div>
            <div className="mt-1">השולחן ממתין עד 10 דק׳ איחור · ביטול חופשי עד 3 שעות לפני · אחר כך 30₪ פיקדון לסועד</div>
          </div>
          </>}
      </main>
          </div>{/* /LEFT col */}

          {/* RIGHT — Featured menu vertical sidebar (desktop only) */}
          {featuredMenu.length > 0 && (
            <aside className="hidden lg:block lg:col-span-5 mt-8 lg:mt-0">
              <div className="lg:sticky lg:top-6">
                <div className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: '#B89556' }}>המומלצים שלנו</div>
                <h3 className="brand-display text-2xl md:text-3xl mt-1 mb-4" style={{ color: '#1F1B17' }}>תפריט שיפתח לך תיאבון</h3>
                <div className="space-y-3">
                  {featuredMenu.slice(0, 4).map((item) => (
                    <div key={item.id} className="flex gap-3 rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5" style={{ background: '#FFFEFB', border: '1px solid rgba(184,149,86,0.30)', boxShadow: '0 4px 12px -4px rgba(31,27,23,0.08)' }}>
                      {item.image_url && (
                        <div className="w-24 h-24 flex-shrink-0 overflow-hidden" style={{ background: '#F4ECD8' }}>
                          <img src={item.image_url} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 p-3 flex flex-col justify-center">
                        <div className="font-bold text-sm leading-tight" style={{ color: '#1F1B17' }}>{item.name}</div>
                        {item.description && (
                          <p className="text-[11px] mt-1 line-clamp-2 leading-snug" style={{ color: '#6B7A4F' }}>{item.description}</p>
                        )}
                        {item.price ? (
                          <div className="mt-1.5 font-black text-sm" style={{ color: '#A04A2E' }}>{Math.round(item.price)} ₪</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <a href="/menu" className="block mt-4 text-center font-bold text-sm rounded-xl py-3 transition-colors" style={{ background: 'rgba(68,81,44,0.08)', color: '#44512C', border: '1px solid rgba(68,81,44,0.25)' }}>
                  כל התפריט ←
                </a>
              </div>
            </aside>
          )}
        </div>{/* /grid */}
      </div>{/* /two-column section */}

      {/* ============ FEATURED MENU CAROUSEL — mobile only (below form) ============ */}
      {featuredMenu.length > 0 && (
        <section className="lg:hidden px-3 md:px-5 py-12" style={{ background: '#FFFEFB', borderTop: '1px solid rgba(184,149,86,0.25)' }}>
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end justify-between mb-5 px-2">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.25em]" style={{ color: '#B89556' }}>המומלצים שלנו</div>
                <h3 className="brand-display text-2xl md:text-3xl mt-1" style={{ color: '#1F1B17' }}>תפריט שיפתח לך תיאבון</h3>
              </div>
              <a href="/menu" className="text-xs flex items-center gap-0.5 font-bold transition-colors" style={{ color: '#44512C' }}>
                כל התפריט <ChevronRight className="w-3 h-3 rotate-180" />
              </a>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 px-2 snap-x snap-mandatory">
              {featuredMenu.map((item) => (
                <div key={item.id} className="flex-shrink-0 w-56 snap-start rounded-2xl overflow-hidden transition-all hover:-translate-y-1" style={{ background: '#FFFEFB', border: '1px solid rgba(184,149,86,0.30)', boxShadow: '0 4px 12px -4px rgba(31,27,23,0.08)' }}>
                  {item.image_url && (
                    <div className="aspect-[4/3] overflow-hidden" style={{ background: '#F4ECD8' }}>
                      <img src={item.image_url} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-bold text-sm" style={{ color: '#1F1B17' }}>{item.name}</div>
                    {item.description && (
                      <p className="text-xs mt-1 line-clamp-2 leading-snug" style={{ color: '#6B7A4F' }}>{item.description}</p>
                    )}
                    {item.price ? (
                      <div className="mt-2 font-black text-sm" style={{ color: '#A04A2E' }}>{Math.round(item.price)} ₪</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ THEME NIGHTS — what's on at עלינא, every day ============ */}
      <section className="px-3 md:px-5 py-12" style={{ background: '#1F1B17', borderTop: '1px solid rgba(184,149,86,0.25)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-7">
            <div className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: '#B89556' }}>הערבים של עלינא</div>
            <h3 className="brand-display text-2xl md:text-3xl mt-1" style={{ color: '#F4ECD8' }}>כל יום — סיפור אחר</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {THEME_NIGHTS.map(t => (
              <div key={t.id} className="rounded-2xl p-4 transition-all hover:-translate-y-0.5" style={{ background: 'rgba(244,236,216,0.06)', border: '1px solid rgba(184,149,86,0.30)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl leading-none">{t.emoji}</span>
                  <div className="brand-display text-lg" style={{ color: '#F4ECD8' }}>{t.title}</div>
                </div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] mb-1.5" style={{ color: '#D9BD83' }}>{t.when}</div>
                <p className="text-sm leading-snug" style={{ color: 'rgba(244,236,216,0.82)' }}>{t.blurb}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ REVIEWS BLOCK ============ */}
      {reviews.length > 0 && (
        <section className="px-3 md:px-5 py-12" style={{ background: '#FAF5E8', borderTop: '1px solid rgba(184,149,86,0.25)' }}>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-6">
              <div className="flex items-center justify-center gap-1 mb-2">
                {[1,2,3,4,5].map(i => <Star key={i} className="w-5 h-5" style={{ fill: '#B89556', color: '#B89556' }} />)}
              </div>
              <h3 className="brand-display text-2xl md:text-3xl" style={{ color: '#1F1B17' }}>מה הסועדים אומרים</h3>
              <p className="text-sm mt-1" style={{ color: '#6B7A4F' }}>ביקורות אמיתיות מלקוחות עלינא</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 px-2 snap-x snap-mandatory">
              {reviews.map((r, i) => (
                <div key={i} className="flex-shrink-0 w-72 snap-start rounded-2xl p-4" style={{ background: '#FFFEFB', border: '1px solid rgba(184,149,86,0.30)', boxShadow: '0 4px 12px -4px rgba(31,27,23,0.08)' }}>
                  <div className="flex items-center gap-1 mb-2">
                    {Array.from({ length: r.rating || 5 }).map((_, k) => (
                      <Star key={k} className="w-3.5 h-3.5" style={{ fill: '#B89556', color: '#B89556' }} />
                    ))}
                  </div>
                  <p className="text-sm leading-relaxed line-clamp-5" style={{ color: '#1F1B17' }}>"{r.comment}"</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-bold" style={{ color: '#44512C' }}>— {r.name}</span>
                    {r.date && <span style={{ color: '#A8967A' }}>{r.date}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ ABOUT / ATMOSPHERE ============ */}
      <section className="px-5 py-14" style={{ background: '#FFFEFB', borderTop: '1px solid rgba(184,149,86,0.25)' }}>
        <div className="max-w-2xl mx-auto text-center space-y-3">
          <h3 className="brand-display text-3xl md:text-4xl" style={{ color: '#1F1B17' }}>בשר. אלכוהול. אווירה. אנשים.</h3>
          <div className="flex items-center justify-center gap-2 my-3">
            <span style={{ width: 28, height: 1, background: '#B89556' }} />
            <span style={{ width: 4, height: 4, borderRadius: 2, background: '#B89556' }} />
            <span style={{ width: 28, height: 1, background: '#B89556' }} />
          </div>
          <p className="leading-relaxed" style={{ color: '#44512C' }}>
            עלינא היא לא רק מסעדה — היא מקום שבו אתם מרגישים בבית.
            המנגל פתוח 13 שעות ביום, היין נשפך, הצחוקים גבוהים.
            מ-12:00 עד אחרונה.
          </p>
        </div>
      </section>

      {/* ============ ATMOSPHERE GALLERY ============ */}
      <section className="px-3 md:px-5 py-10" style={{ background: '#FAF5E8', borderTop: '1px solid rgba(184,149,86,0.25)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: '#B89556' }}>האווירה</div>
            <h3 className="brand-display text-2xl md:text-3xl mt-1" style={{ color: '#1F1B17' }}>איך זה נראה אצלנו</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
            {[
              'spread.jpg', 'burger-hero.jpg', 'carpaccio.jpg',
              'IMG_6829.JPG', 'fries-side.jpg', 'IMG_4682.JPG',
            ].map((file) => (
              <a
                key={file}
                href="https://alena.topalena.com/gallery"
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square rounded-2xl overflow-hidden transition-all hover:scale-[1.02]"
                style={{ border: '1px solid rgba(184,149,86,0.30)' }}
              >
                <img
                  src={`https://alena.topalena.com/gallery/${file}`}
                  alt="עלינא"
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              </a>
            ))}
          </div>
          <div className="text-center mt-5">
            <a href="https://alena.topalena.com/gallery" target="_blank" rel="noopener noreferrer" className="inline-block font-bold text-sm rounded-xl px-5 py-3 transition-colors" style={{ background: 'rgba(68,81,44,0.10)', color: '#44512C', border: '1px solid rgba(68,81,44,0.30)' }}>
              לכל הגלריה ←
            </a>
          </div>
        </div>
      </section>

      {/* ============ CONTACT / ADDRESS / HOURS ============ */}
      <section className="px-5 py-12" style={{ background: '#1F1B17', borderTop: '1px solid rgba(184,149,86,0.30)' }}>
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <a href={wazeUrl} target="_blank" rel="noopener noreferrer"
             className="rounded-2xl p-4 flex items-start gap-3 transition-colors"
             style={{ background: 'rgba(244,236,216,0.06)', border: '1px solid rgba(184,149,86,0.30)' }}>
            <NavIcon className="w-5 h-5 mt-0.5" style={{ color: '#B89556' }} />
            <div>
              <div className="text-xs" style={{ color: '#D9BD83' }}>ניווט ב-Waze</div>
              <div className="font-semibold mt-0.5" style={{ color: '#F4ECD8' }}>{address}</div>
            </div>
          </a>
          <a href={`tel:${phone.replace(/\D/g, '')}`}
             className="rounded-2xl p-4 flex items-start gap-3 transition-colors"
             style={{ background: 'rgba(244,236,216,0.06)', border: '1px solid rgba(184,149,86,0.30)' }}>
            <Phone className="w-5 h-5 mt-0.5" style={{ color: '#B89556' }} />
            <div>
              <div className="text-xs" style={{ color: '#D9BD83' }}>חייגו אלינו</div>
              <div className="font-semibold mt-0.5" dir="ltr" style={{ color: '#F4ECD8' }}>{phone}</div>
            </div>
          </a>
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(244,236,216,0.06)', border: '1px solid rgba(184,149,86,0.30)' }}>
            <Clock className="w-5 h-5 mt-0.5" style={{ color: '#B89556' }} />
            <div>
              <div className="text-xs" style={{ color: '#D9BD83' }}>שעות פתיחה היום</div>
              <div className="font-semibold mt-0.5" style={{ color: '#F4ECD8' }}>
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

        <p className="text-center text-xs mt-6" style={{ color: '#8B7F65' }}>© עלינא · אוכל · אלכוהול · אווירה · אנשים</p>
      </section>

      {/* ============ STICKY MOBILE CTA ============ */}
      {/* Appears once user has scrolled past the booking card — a single tap returns them to it */}
      {showStickyCTA && !success && (
        <button
          onClick={scrollToBooking}
          className="md:hidden fixed bottom-3 left-3 right-3 z-50 font-black py-3.5 rounded-2xl shadow-2xl flex items-center justify-center gap-2 animate-in slide-in-from-bottom"
          style={{ background: 'linear-gradient(to left, #A04A2E, #8B3D24)', color: '#F4ECD8' }}
        >
          <Sparkles className="w-5 h-5" />
          הזמן שולחן עכשיו
        </button>
      )}

      {/* Context-aware marketing popup (events / midweek theme / lunch / mots"s) */}
      {!success && <SpecialPopup />}
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
      className="min-w-[48px] h-12 px-3.5 rounded-xl font-bold text-sm transition-all"
      style={active
        ? { background: '#A04A2E', color: '#F4ECD8', border: '1px solid #8B3D24', boxShadow: '0 6px 14px -5px rgba(160,74,46,0.55)', transform: 'scale(1.05)' }
        : { background: '#FFFEFB', color: '#1F1B17', border: '1px solid rgba(184,149,86,0.35)' }}
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
      className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
      style={{ background: 'rgba(244,236,216,0.08)', border: '1px solid rgba(184,149,86,0.40)', color: '#D9BD83' }}
    >
      {children}
    </a>
  );
}
