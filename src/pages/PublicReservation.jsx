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

// Build half-hour slots (more compact UI than the previous 15-min picker)
function generateTimeSlots(startTime, endTime) {
  if (startTime === '00:00' && endTime === '00:00') return [];
  const slots = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let mins = sh * 60 + Math.ceil(sm / 30) * 30;
  const endMins = eh * 60 + em;
  while (mins <= endMins) {
    const h = Math.floor(mins / 60), m = mins % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    mins += 30;
  }
  return slots;
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

  const [settings, setSettings] = useState(null);
  const [openingHours, setOpeningHours] = useState(getOpeningHours(new Date()));
  const [timeSlots, setTimeSlots] = useState([]);
  const [availability, setAvailability] = useState({}); // { "20:00": "open"|"tight"|"full" }

  const [isBooking, setIsBooking] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(null); // { customer_name, time, date, party_size, table_number }

  const [liveCount, setLiveCount] = useState(null);
  const [featuredMenu, setFeaturedMenu] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const bookingCardRef = useRef(null);

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
      // Show when bottom of booking card has scrolled above the viewport bottom
      setShowStickyCTA(rect.bottom < window.innerHeight * 0.4);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
    const slots = generateTimeSlots(hoursToUse.start, hoursToUse.end);
    setTimeSlots(slots);
    // Auto-pick a sensible default time (first slot >= 19:00 or first slot)
    if (slots.length && !slots.includes(time)) {
      const dinnerSlot = slots.find(s => s >= '19:00') || slots[Math.floor(slots.length / 2)];
      setTime(dinnerSlot);
    }
  }, [date, settings]);

  // --- Fetch availability snapshot for the chosen date/party
  useEffect(() => {
    if (!timeSlots.length) { setAvailability({}); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await invokePublic('getDayAvailabilitySnapshot', {
          date: format(date, 'yyyy-MM-dd'),
          party_size: Number(partySize),
          slots: timeSlots,
        });
        if (!cancelled && res?.availability) setAvailability(res.availability);
      } catch (e) { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [date, partySize, timeSlots.join(',')]);

  // --- Submit one-click booking
  const submitBooking = async () => {
    setErrorMsg('');
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
        ...attr,
      });
      if (!res?.success) {
        setErrorMsg(res?.reason === 'no_availability'
          ? 'מצטערים, השעה התמלאה רגע לפניך. נסה שעה אחרת.'
          : 'שגיאה בביצוע ההזמנה. אנא נסה שוב.');
        return;
      }
      setSuccess({
        customer_name: customerName,
        time,
        date: format(date, 'EEEE dd/MM', { locale: he }),
        party_size: parseInt(partySize),
        table_number: res.table_number,
      });
    } catch (e) {
      setErrorMsg('שגיאה זמנית. נסה שוב בעוד רגע.');
    } finally {
      setIsBooking(false);
    }
  };

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
    const confettiSize = settings?.confirmation_message || `הזמנתך נשמרה ל-${success.date} בשעה ${success.time} עבור ${success.party_size} סועדים`;
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-amber-50 via-rose-50 to-orange-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center space-y-4">
          <div className="text-6xl">✨</div>
          <h1 className="text-3xl font-black text-gray-900">ההזמנה נקבעה!</h1>
          <p className="text-lg text-gray-700">{success.customer_name}, נשמח לראותך 🔥</p>
          <div className="bg-gradient-to-l from-amber-50 to-rose-50 border border-amber-200 rounded-2xl p-4 space-y-2 text-right">
            <Row icon={<Calendar className="w-4 h-4 text-amber-600" />} label="תאריך" value={success.date} />
            <Row icon={<Clock className="w-4 h-4 text-amber-600" />} label="שעה" value={success.time} />
            <Row icon={<Users className="w-4 h-4 text-amber-600" />} label="סועדים" value={success.party_size} />
            {success.table_number && (
              <Row icon={<Sparkles className="w-4 h-4 text-amber-600" />} label="שולחן" value={`#${success.table_number}`} />
            )}
          </div>
          <p className="text-xs text-gray-500">📩 תקבל אישור בוואטסאפ בקרוב</p>
          <button onClick={() => setSuccess(null)} className="text-sm text-amber-700 underline">חזור לעמוד הראשי</button>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // RENDER — MAIN
  // ===========================================================================
  return (
    <div dir="rtl" className="min-h-screen bg-zinc-950 text-white">

      {/* ============ HERO ============ */}
      <header
        className="relative overflow-hidden"
        style={{
          background: HERO_FALLBACK_BG,
          backgroundImage: settings?.hero_image_url
            ? `linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.85) 100%), url(${settings.hero_image_url})`
            : HERO_FALLBACK_BG,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 z-10">
          <LanguagePicker />
          <a href={`tel:${phone.replace(/\D/g, '')}`} className="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-full px-3 py-1.5 text-xs hover:bg-white/20">
            <Phone className="w-3.5 h-3.5" />
            <span>{phone}</span>
          </a>
        </div>

        <div className="px-5 pt-24 pb-12 max-w-4xl mx-auto text-center relative z-[1]">
          <div className="inline-flex items-center gap-1 bg-amber-500/20 border border-amber-400/30 rounded-full px-3 py-1 text-xs text-amber-200 mb-3">
            <Flame className="w-3 h-3" />
            רוטשילד 104, ראשון לציון
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-3">{restaurantName}</h1>
          <p className="text-lg md:text-xl text-amber-100 max-w-xl mx-auto leading-relaxed">{welcomeMessage}</p>

          {/* Social proof */}
          {liveCount !== null && liveCount > 0 && (
            <div className="mt-5 inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 rounded-full px-4 py-1.5 text-sm">
              <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
              <span className="font-bold text-emerald-200">{liveCount} הזמנות</span>
              <span className="text-emerald-100/80">ב-3 שעות אחרונות</span>
            </div>
          )}

          {/* Social icons */}
          <div className="mt-6 flex items-center justify-center gap-3">
            {social.instagram && <SocialIcon href={social.instagram} label="Instagram"><Instagram className="w-4 h-4" /></SocialIcon>}
            {social.tiktok    && <SocialIcon href={social.tiktok}    label="TikTok"><Music2 className="w-4 h-4" /></SocialIcon>}
            {social.facebook  && <SocialIcon href={social.facebook}  label="Facebook"><Facebook className="w-4 h-4" /></SocialIcon>}
            {social.whatsapp  && <SocialIcon href={social.whatsapp}  label="WhatsApp"><MessageCircle className="w-4 h-4" /></SocialIcon>}
          </div>
        </div>

        {/* Curve divider */}
        <div className="h-6 bg-gradient-to-b from-transparent to-white/5"></div>
      </header>

      {/* ============ PROMO RIBBON ============ */}
      {promos.length > 0 && (
        <div className="bg-gradient-to-l from-amber-500 via-rose-500 to-orange-500 py-2 overflow-hidden">
          <div className="flex gap-2 px-3 overflow-x-auto scrollbar-thin max-w-full mx-auto">
            {promos.map((p, i) => (
              <div key={i} className="flex-shrink-0 bg-black/20 backdrop-blur-sm rounded-full px-3 py-1.5 text-xs font-bold text-white border border-white/20 flex items-center gap-1.5">
                <span className="text-base">{p.emoji}</span>
                <span>{p.label}</span>
                {p.detail && <span className="opacity-80 font-normal">· {p.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ BOOKING CARD ============ */}
      <main ref={bookingCardRef} className="-mt-8 relative z-[2] px-3 md:px-6 pb-10">
        <div className="max-w-2xl mx-auto bg-white text-gray-900 rounded-3xl shadow-2xl p-5 md:p-7 space-y-5">
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-black">הזמינו שולחן</h2>
            <p className="text-sm text-gray-500 mt-1">ללא דמי שירות · אישור מיידי · ביטול חופשי</p>
          </div>

          {/* Party size */}
          <div>
            <Label icon={<Users className="w-4 h-4" />}>כמות סועדים</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => (
                <Chip key={n} active={Number(partySize) === n} onClick={() => setPartySize(n)}>
                  {n === 12 ? '12+' : n}
                </Chip>
              ))}
            </div>
          </div>

          {/* Date strip */}
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

          {/* Time slots with availability dots */}
          <div>
            <Label icon={<Clock className="w-4 h-4" />}>שעה</Label>
            {timeSlots.length === 0 ? (
              <p className="text-sm text-red-600 mt-2 bg-red-50 border border-red-200 rounded-lg p-2">המסעדה סגורה בתאריך זה</p>
            ) : (
              <>
                <div className="grid grid-cols-4 md:grid-cols-6 gap-1.5 mt-2">
                  {timeSlots.map(slot => {
                    const av = availability[slot]; // open|tight|full|undefined
                    const active = time === slot;
                    const disabled = av === 'full';
                    return (
                      <button
                        key={slot}
                        disabled={disabled}
                        onClick={() => setTime(slot)}
                        className={`relative rounded-xl py-2 text-sm font-bold border transition-all
                          ${active
                            ? 'bg-amber-600 text-white border-amber-700 shadow'
                            : disabled
                              ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                              : 'bg-white text-gray-800 border-gray-200 hover:border-amber-400'}`}
                      >
                        {slot}
                        {av && !active && (
                          <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full
                            ${av === 'open' ? 'bg-emerald-400' : av === 'tight' ? 'bg-amber-400' : 'bg-red-400'}`}></span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-3 mt-2 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span> פתוח</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span> מעט מקום</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-red-400 rounded-full"></span> מלא</span>
                </div>
              </>
            )}
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
            className="w-full bg-gradient-to-l from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 disabled:from-gray-300 disabled:to-gray-300 text-white font-black py-4 rounded-2xl text-lg shadow-xl flex items-center justify-center gap-2 transition-all"
          >
            {isBooking ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
            {isBooking ? 'מבצע הזמנה...' : 'הזמן עכשיו'}
          </button>
          <p className="text-center text-[11px] text-gray-400">בלחיצה אתה מסכים לקבל אישור בוואטסאפ</p>
        </div>
      </main>

      {/* ============ FEATURED MENU CAROUSEL ============ */}
      {featuredMenu.length > 0 && (
        <section className="bg-zinc-900 px-3 md:px-5 py-10">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-end justify-between mb-4 px-2">
              <div>
                <div className="text-xs text-amber-400 font-bold uppercase tracking-wider">המומלצים שלנו</div>
                <h3 className="text-2xl md:text-3xl font-black text-white">תפריט שיפתח לך תיאבון</h3>
              </div>
              <a href="/menu" className="text-xs text-amber-300 hover:text-amber-100 flex items-center gap-0.5">
                כל התפריט <ChevronRight className="w-3 h-3 rotate-180" />
              </a>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 px-2 snap-x snap-mandatory">
              {featuredMenu.map((item) => (
                <div key={item.id} className="flex-shrink-0 w-56 snap-start bg-zinc-800 rounded-2xl overflow-hidden border border-zinc-700/50 hover:border-amber-500/50 transition-colors">
                  {item.image_url && (
                    <div className="aspect-[4/3] bg-zinc-900 overflow-hidden">
                      <img src={item.image_url} alt={item.name} loading="lazy" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="font-bold text-white text-sm">{item.name}</div>
                    {item.description && (
                      <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-snug">{item.description}</p>
                    )}
                    {item.price ? (
                      <div className="mt-2 text-amber-400 font-black text-sm">{Math.round(item.price)} ₪</div>
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
        <section className="bg-zinc-950 px-3 md:px-5 py-10 border-t border-zinc-800">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-5">
              <div className="flex items-center justify-center gap-1 mb-1">
                {[1,2,3,4,5].map(i => <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />)}
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-white">מה הסועדים אומרים</h3>
              <p className="text-zinc-400 text-sm mt-1">ביקורות אמיתיות מלקוחות עלינא</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 px-2 snap-x snap-mandatory">
              {reviews.map((r, i) => (
                <div key={i} className="flex-shrink-0 w-72 snap-start bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700/50 rounded-2xl p-4">
                  <div className="flex items-center gap-1 mb-2">
                    {Array.from({ length: r.rating || 5 }).map((_, k) => (
                      <Star key={k} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-zinc-200 leading-relaxed line-clamp-5">"{r.comment}"</p>
                  <div className="mt-3 flex items-center justify-between text-xs">
                    <span className="font-bold text-amber-300">— {r.name}</span>
                    {r.date && <span className="text-zinc-500">{r.date}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============ ABOUT / ATMOSPHERE ============ */}
      <section className="bg-zinc-900 px-5 py-12">
        <div className="max-w-2xl mx-auto text-center space-y-3">
          <h3 className="text-2xl font-black text-amber-100">בשר. אלכוהול. אווירה. אנשים.</h3>
          <p className="text-zinc-300 leading-relaxed">
            עלינא היא לא רק מסעדה — היא מקום שבו אתם מרגישים בבית.
            המנגל פתוח 13 שעות ביום, היין נשפך, הצחוקים גבוהים.
            מ-12:00 עד אחרונה.
          </p>
        </div>
      </section>

      {/* ============ CONTACT / ADDRESS / HOURS ============ */}
      <section className="bg-zinc-950 px-5 py-10 border-t border-zinc-800">
        <div className="max-w-2xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <a href={wazeUrl} target="_blank" rel="noopener noreferrer"
             className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl p-4 flex items-start gap-3 transition-colors">
            <NavIcon className="w-5 h-5 text-amber-400 mt-0.5" />
            <div>
              <div className="text-zinc-400 text-xs">ניווט ב-Waze</div>
              <div className="text-white font-semibold mt-0.5">{address}</div>
            </div>
          </a>
          <a href={`tel:${phone.replace(/\D/g, '')}`}
             className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-2xl p-4 flex items-start gap-3 transition-colors">
            <Phone className="w-5 h-5 text-amber-400 mt-0.5" />
            <div>
              <div className="text-zinc-400 text-xs">חייגו אלינו</div>
              <div className="text-white font-semibold mt-0.5" dir="ltr">{phone}</div>
            </div>
          </a>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-400 mt-0.5" />
            <div>
              <div className="text-zinc-400 text-xs">שעות פתיחה היום</div>
              <div className="text-white font-semibold mt-0.5">
                {openingHours.start === '00:00' && openingHours.end === '00:00' ? 'סגור' : `${openingHours.start} - ${openingHours.end}`}
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-zinc-600 text-xs mt-8">© עלינא · אוכל · אלכוהול · אווירה · אנשים</p>
      </section>

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
