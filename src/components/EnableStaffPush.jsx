import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function detect() {
  if (typeof window === 'undefined') return { ios: false, android: false, standalone: false, pushReady: false };
  const ua = window.navigator.userAgent || '';
  // Multi-signal iOS detection (covers iPad-as-Mac and "Request Desktop Site")
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    /iPad|iPhone|iPod/.test(window.navigator.platform || '') ||
    (window.navigator.platform === 'MacIntel' && (window.navigator.maxTouchPoints || 0) > 1) ||
    typeof window.navigator.standalone !== 'undefined';
  const android = /Android/.test(ua);
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
  const pushReady = 'serviceWorker' in navigator && 'PushManager' in window;
  return { ios, android, standalone, pushReady };
}

/**
 * Banner-style "enable free notifications" prompt for staff.
 * Adapts to the device:
 *   - Subscribed already         -> hidden
 *   - Android Chrome (or any PWA-installed browser) -> "🔔 הפעל" subscribe flow
 *   - iOS Safari w/o PWA install -> shows Add-to-Home-Screen instructions
 *     (push only works once installed; iOS 16.4+)
 *   - Unsupported browser        -> shows a short note instead of vanishing
 *
 * Notifications cover: shift assignments, leave-status changes, swap replies.
 */
export default function EnableStaffPush() {
  const [{ ios, android, standalone, pushReady }] = useState(detect);
  const [state, setState] = useState('idle'); // idle | enabling | on | error | install
  const [hideUntilRefresh, setHideUntilRefresh] = useState(false);
  const [helpOpen, setHelpOpen] = useState(null); // 'ios' | 'android' | null

  // Push is reachable only when the PWA is installed AND the browser exposes
  // PushManager AND we have a VAPID key. Otherwise the user has to install
  // the PWA first — show install instructions for their platform.
  const canSubscribeHere = pushReady && (standalone || android) && VAPID;

  useEffect(() => {
    if (!canSubscribeHere) { setState('install'); return; }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (sub) setState('on'); })
      .catch(() => {});
  }, [canSubscribeHere]);

  const enable = async () => {
    setState('enabling');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState('error'); return; }
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID),
      });
      await base44.functions.enableStaffPush({ subscription: sub.toJSON() });
      setState('on');
    } catch (e) {
      console.error('staff push enable failed', e);
      setState('error');
    }
  };

  if (state === 'on' || hideUntilRefresh) return null;

  // Not subscribable from this window yet (no PWA install, or unsupported browser).
  // Show a friendly install/instructions card with platform-aware help.
  if (state === 'install') {
    return (
      <div dir="rtl" className="bg-gradient-to-l from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="text-3xl">📲</div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-emerald-900 text-sm">הפעל התראות חינמיות</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              כדי לקבל פושים על שיבוץ למשמרת, מענה לחופשה ותשובה לבקשת החלפה — צריך להתקין את האפליקציה במכשיר פעם אחת.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => setHelpOpen(helpOpen === 'ios' ? null : 'ios')} className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${helpOpen === 'ios' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'}`}>
                🍎 איך באייפון?
              </button>
              <button onClick={() => setHelpOpen(helpOpen === 'android' ? null : 'android')} className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${helpOpen === 'android' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'}`}>
                🤖 איך באנדרואיד?
              </button>
            </div>
            {helpOpen === 'ios' && (
              <ol className="mt-2 text-xs text-emerald-900 list-decimal pr-4 space-y-1 bg-white/70 rounded-lg p-2 border border-emerald-200">
                <li>פתח/י את האתר בדפדפן <b>Safari</b> (לא בכרום או באפליקציות אחרות).</li>
                <li>הקש/י על כפתור <b>שיתוף</b> ⬆️ בתחתית המסך.</li>
                <li>גלול/י ובחר/י <b>"הוסף למסך הבית"</b> ואז "הוסף".</li>
                <li>פתח/י את האפליקציה מהאייקון במסך הבית — כפתור "🔔 הפעל" יופיע כאן וצריך לאשר את ההתראות.</li>
                <li className="text-emerald-700"><b>חובה iOS 16.4 ומעלה</b> כדי שפושים יעבדו.</li>
              </ol>
            )}
            {helpOpen === 'android' && (
              <ol className="mt-2 text-xs text-emerald-900 list-decimal pr-4 space-y-1 bg-white/70 rounded-lg p-2 border border-emerald-200">
                <li>פתח/י את האתר בדפדפן <b>Chrome</b>.</li>
                <li>הקש/י על תפריט שלוש הנקודות בפינה ⋮ ובחר/י <b>"התקן אפליקציה"</b> או "הוסף למסך הבית".</li>
                <li>פתח/י את האפליקציה מהאייקון במסך הבית — כפתור "🔔 הפעל" יופיע ויבקש הרשאת התראות.</li>
              </ol>
            )}
          </div>
          <button onClick={() => setHideUntilRefresh(true)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-2" title="הסתר עד הרענון הבא">✕</button>
        </div>
      </div>
    );
  }

  // Default: ready to subscribe.
  return (
    <div dir="rtl" className="bg-gradient-to-l from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3 shadow-sm">
      <div className="text-3xl">🔔</div>
      <div className="flex-1 min-w-[180px]">
        <p className="font-black text-emerald-900 text-sm">הפעל התראות חינמיות</p>
        <p className="text-xs text-emerald-700">
          קבל/י עדכון מיידי על שיבוץ למשמרת, מענה לבקשת חופשה ותשובה לבקשת החלפה — בלי SMS.
        </p>
      </div>
      <button
        onClick={enable}
        disabled={state === 'enabling'}
        className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl text-sm transition"
      >
        {state === 'enabling' ? 'מפעיל…' : state === 'error' ? 'נסה שוב' : '🔔 הפעל'}
      </button>
      <button
        onClick={() => setHideUntilRefresh(true)}
        className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-2"
        title="הסתר עד הרענון הבא"
      >
        ✕
      </button>
    </div>
  );
}
