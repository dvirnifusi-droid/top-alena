import React, { useEffect, useState } from 'react';
import { invokePublic } from '@/lib/publicFetch';

// Context-aware marketing popup for PublicReservation.
//
// Content is fetched from the SpecialPopup table at mount time so the owner
// can edit copy at /SpecialsAdmin without a code push. The client still
// picks WHICH variant to show — using the popup's target_days / target_hour_*
// filters + priority. Every show / dismiss / click is sent back as a
// PopupEvent so the admin dashboard can see what converts.
//
// Conversion: PublicReservation calls window.__alenaTrackPopupConversion()
// on a successful reservation, which fires a 'converted' event tagged to the
// last clicked variant in the same session.

const DISMISS_KEY = 'alena_popup_dismissed_at';
const DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000;
const SESSION_KEY = 'alena_popup_session';
const LAST_CLICK_KEY = 'alena_popup_last_clicked';

function ensureSessionId() {
  try {
    let s = sessionStorage.getItem(SESSION_KEY);
    if (!s) {
      s = 'sess_' + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);
      sessionStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch { return 'anon'; }
}

function track(variant, action) {
  if (!variant || !action) return;
  const sessionId = ensureSessionId();
  // Fire-and-forget — analytics shouldn't slow the UI down.
  invokePublic('trackPopupEvent', { variant, action, sessionId }).catch(() => {});
}

// Pick the active popup for the current moment. Filters by target_days
// (CSV of day numbers) and target_hour_from / target_hour_to. Highest
// priority wins; ties broken by createdAt (server returns them in order).
function pickActivePopup(popups) {
  if (!Array.isArray(popups) || !popups.length) return null;
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  for (const p of popups) {
    // Day filter
    if (p.target_days) {
      const allowed = String(p.target_days).split(',').map((x) => parseInt(x, 10));
      if (!allowed.includes(day)) continue;
    }
    // Hour range filter
    if (p.target_hour_from != null && hour < p.target_hour_from) continue;
    if (p.target_hour_to != null && hour >= p.target_hour_to) continue;
    return p;
  }
  return null;
}

// Expose a conversion-tracker on window so PublicReservation can call it
// from submitBooking success without importing the chat module.
function installConversionHook() {
  if (typeof window === 'undefined' || window.__alenaTrackPopupConversion) return;
  window.__alenaTrackPopupConversion = () => {
    try {
      const last = sessionStorage.getItem(LAST_CLICK_KEY);
      if (last) track(last, 'converted');
    } catch {}
  };
}

export default function SpecialPopup() {
  const [shown, setShown] = useState(false);
  const [content, setContent] = useState(null);

  useEffect(() => {
    installConversionHook();
    let cancelled = false;

    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (dismissedAt && (Date.now() - dismissedAt) < DISMISS_WINDOW_MS) return;
    } catch {}

    (async () => {
      let popups = [];
      try {
        popups = await invokePublic('getActiveSpecialPopups', {});
        if (!Array.isArray(popups)) popups = [];
      } catch {
        // Endpoint missing or DB empty — silently no popup.
        return;
      }
      const pick = pickActivePopup(popups);
      if (!pick) return;
      // Delay so the form has a moment to register first.
      const t = setTimeout(() => {
        if (cancelled) return;
        setContent(pick);
        setShown(true);
        track(pick.variant, 'shown');
      }, 7000);
      return () => clearTimeout(t);
    })();

    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    if (content) track(content.variant, 'dismissed');
    setShown(false);
  };

  const handleCta = (e) => {
    e.preventDefault();
    if (!content) return dismiss();
    try { sessionStorage.setItem(LAST_CLICK_KEY, content.variant); } catch {}
    track(content.variant, 'clicked');
    const href = content.cta_href;
    if (href && !href.startsWith('#')) {
      // External path → navigate
      window.location.href = href;
      return;
    }
    // Default → scroll to booking
    const el = document.getElementById('booking');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Persist dismissal so it doesn't pop again the same day after clicking
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setShown(false);
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

        {content.eyebrow && (
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2" style={{ color: '#B89556' }}>
            {content.eyebrow}
          </div>
        )}
        {content.emoji && <div className="text-5xl mb-3 leading-none">{content.emoji}</div>}
        <h3 className="text-2xl md:text-3xl leading-tight mb-3" style={{ fontFamily: '"Frank Ruhl Libre", serif', fontWeight: 900, color: '#1F1B17' }}>
          {content.title}
        </h3>
        <p className="text-sm md:text-base leading-relaxed mb-5" style={{ color: '#44512C' }}>
          {content.body}
        </p>

        <a
          href={content.cta_href || '#booking'}
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
