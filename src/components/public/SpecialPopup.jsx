import React, { useEffect, useState } from 'react';

// Context-aware marketing popup for PublicReservation.
// One component, several content variants. The variant is picked from the
// real-world date+hour at mount time, NOT from the user's date-picker —
// because the goal is to convert the moment they're browsing.
//
// Variants (ordered by priority):
//   1. lunch    — Sun-Thu, 11:00-14:30 → business lunch upsell
//   2. midweek  — Mon/Tue/Wed evening (≥16:00) → that night's theme
//   3. mots-s   — Sat ≥18:00 → high-vibe urgency
//   4. events   — every other case → private-event upsell
//
// Dismissal is sticky for 24h via localStorage so we don't pester repeat
// visitors. Appears 7s after mount — late enough that the form has had
// a moment to register, early enough that scrollers still see it.

const DISMISS_KEY = 'alena_popup_dismissed_at';
const DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000;

function pickContent() {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  // 1. Business lunch — only during/near lunch hours on open weekdays
  if (day !== 5 && hour >= 11 && hour < 15) {
    return {
      id: 'lunch',
      eyebrow: 'בצהריים אצלנו',
      emoji: '🍽',
      title: 'ארוחות צהריים עסקיות',
      body: 'תפריט עסקי במחיר מיוחד, 12:00-17:00. מנה ראשונה, עיקרית ושתייה — והשולחן כולו רק שלכם.',
      cta: 'הזמן צהריים',
      action: 'scroll',
    };
  }

  // 2. Midweek theme push — Mon/Tue/Wed evening
  if (hour >= 16 && (day === 1 || day === 2 || day === 3)) {
    const themes = {
      1: { emoji: '🍷', title: 'הערב — יין ללא תחתית',  body: 'הסומליה בבר, כוסות מ-₪61, יין נמזג ברצף עד הסגירה. הערב הכי שקט-עם-עומק של השבוע.' },
      2: { emoji: '🥩', title: 'הערב — Butcher Night',     body: 'נתחי הפתעה ומנות שף חד-פעמיות. ישר מהקצב לגריל. כשנגמר — נגמר.' },
      3: { emoji: '🍸', title: 'הערב — רביעי קלאסי',       body: 'התפריט המלא, השף בעבודה, וקוקטיילי הבית במיטבם. אווירת מועדון שקטה ומדויקת.' },
    };
    return { id: 'midweek-' + day, eyebrow: 'אמצע שבוע', ...themes[day], cta: 'תפוס שולחן הערב', action: 'scroll' };
  }

  // 3. Saturday high-vibe urgency
  if (day === 6 && hour >= 18) {
    return {
      id: 'sat',
      eyebrow: 'מוצ״ש',
      emoji: '✨',
      title: 'הערב הכי גבוה של השבוע',
      body: 'פותחים מ-20:15 עד הלקוח האחרון. הצוות בכושר, המקום מתמלא — אם רוצים שולחן הלילה, עכשיו זה הזמן.',
      cta: 'תפוס שולחן עכשיו',
      action: 'scroll',
    };
  }

  // 4. Default — private events upsell (always relevant)
  return {
    id: 'events',
    eyebrow: 'אירועים פרטיים',
    emoji: '🎉',
    title: 'מארגנים אירוע אצלכם בעסק או בחיים?',
    body: 'יום הולדת 30, מסיבת רווקות, אירוע חברה, מפגש לקוחות — אצלנו סוגרים תפריט אישי, חדר פרטי, ובר פתוח. עלינא מנוסה באירוח גבוה.',
    cta: 'בקשת הצעת מחיר לאירוע',
    action: 'events',
  };
}

export default function SpecialPopup() {
  const [shown, setShown] = useState(false);
  const [content, setContent] = useState(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && (Date.now() - dismissedAt) < DISMISS_WINDOW_MS) return;
    } catch { /* localStorage unavailable — proceed without persistence */ }
    const c = pickContent();
    const t = setTimeout(() => {
      if (cancelled) return;
      setContent(c);
      setShown(true);
    }, 7000);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShown(false);
  };

  const handleCta = (e) => {
    e.preventDefault();
    if (!content) return dismiss();
    if (content.action === 'scroll') {
      const el = document.getElementById('booking');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (content.action === 'events') {
      window.location.href = '/EventsInquiry';
      return; // let navigation happen, no need to dismiss locally
    }
    dismiss();
  };

  if (!shown || !content) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-3 md:p-6"
      style={{ background: 'rgba(31,27,23,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', animation: 'popupFade 0.25s ease-out' }}
      onClick={dismiss}
    >
      <style>{`@keyframes popupFade { from { opacity:0 } to { opacity:1 } } @keyframes popupRise { from { opacity:0; transform: translateY(20px) scale(0.98) } to { opacity:1; transform: translateY(0) scale(1) } }`}</style>
      <div
        className="relative w-full max-w-md rounded-3xl p-6 md:p-7"
        style={{
          background: '#FFFEFB',
          border: '1px solid rgba(184,149,86,0.45)',
          boxShadow: '0 40px 80px -20px rgba(31,27,23,0.55), 0 12px 24px -8px rgba(31,27,23,0.30)',
          animation: 'popupRise 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          fontFamily: 'Heebo, system-ui, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={dismiss}
          aria-label="סגור"
          className="absolute top-3 left-3 w-9 h-9 rounded-full flex items-center justify-center text-xl leading-none transition-colors"
          style={{ background: 'rgba(31,27,23,0.06)', color: '#1F1B17' }}
        >
          ×
        </button>

        <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2" style={{ color: '#B89556' }}>
          {content.eyebrow}
        </div>
        <div className="text-5xl mb-3 leading-none">{content.emoji}</div>
        <h3 className="text-2xl md:text-3xl leading-tight mb-3" style={{ fontFamily: '"Frank Ruhl Libre", serif', fontWeight: 900, color: '#1F1B17' }}>
          {content.title}
        </h3>
        <p className="text-sm md:text-base leading-relaxed mb-5" style={{ color: '#44512C' }}>
          {content.body}
        </p>

        <a
          href={content.action === 'events' ? '/EventsInquiry' : '#booking'}
          onClick={handleCta}
          className="block w-full text-center font-black py-3.5 rounded-2xl text-base md:text-lg transition-transform hover:scale-[1.02]"
          style={{
            background: 'linear-gradient(to left, #A04A2E, #8B3D24)',
            color: '#F4ECD8',
            boxShadow: '0 12px 28px -10px rgba(160,74,46,0.55)',
          }}
        >
          {content.cta} ←
        </a>

        <button
          onClick={dismiss}
          className="block w-full text-center mt-3 text-xs font-medium transition-colors"
          style={{ color: '#8B7F65' }}
        >
          לא עכשיו, תודה
        </button>
      </div>
    </div>
  );
}
