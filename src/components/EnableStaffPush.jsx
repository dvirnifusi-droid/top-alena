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
  if (typeof window === 'undefined') return { ios: false, standalone: false, supported: false };
  const ua = window.navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window;
  return { ios, standalone, supported };
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
  const [{ ios, standalone, supported }] = useState(detect);
  const [state, setState] = useState('idle'); // idle | enabling | on | error | ios_install | unsupported
  const [hideUntilRefresh, setHideUntilRefresh] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (ios && !standalone) { setState('ios_install'); return; }
    if (!supported || !VAPID) { setState('unsupported'); return; }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (sub) setState('on'); })
      .catch(() => {});
  }, [ios, standalone, supported]);

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

  // iOS without the PWA installed yet — show instructions instead of subscribe.
  if (state === 'ios_install') {
    return (
      <div dir="rtl" className="bg-gradient-to-l from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl p-4 mb-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="text-3xl">📲</div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-emerald-900 text-sm">להפעיל התראות באייפון</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              כדי לקבל פושים על שיבוץ למשמרת, מענה לחופשה ועוד — צריך להוסיף את האפליקציה למסך הבית פעם אחת.
            </p>
            <button
              onClick={() => setShowIosHelp((v) => !v)}
              className="mt-2 text-emerald-700 underline text-xs font-bold"
            >
              {showIosHelp ? 'הסתר הוראות' : 'איך עושים זאת?'}
            </button>
            {showIosHelp && (
              <ol className="mt-2 text-xs text-emerald-800 list-decimal pr-4 space-y-0.5">
                <li>הקש על כפתור <b>שיתוף</b> ⬆️ בתחתית הדפדפן ספארי</li>
                <li>גלוט/לי ובחר <b>"הוסף למסך הבית"</b></li>
                <li>פתח את האפליקציה ממסך הבית — כפתור "🔔 הפעל" יופיע כאן</li>
              </ol>
            )}
          </div>
          <button onClick={() => setHideUntilRefresh(true)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-2" title="הסתר עד הרענון הבא">✕</button>
        </div>
      </div>
    );
  }

  // Browser doesn't expose ServiceWorker/PushManager or VAPID isn't configured.
  if (state === 'unsupported') {
    return (
      <div dir="rtl" className="bg-slate-50 border border-slate-200 rounded-2xl p-3 mb-6 flex items-center gap-3">
        <div className="text-2xl">🔕</div>
        <p className="flex-1 text-xs text-slate-600">
          הדפדפן הזה לא תומך בהתראות פוש. נסה/י בכרום באנדרואיד, או הוסף/י את האפליקציה למסך הבית באייפון.
        </p>
        <button onClick={() => setHideUntilRefresh(true)} className="text-slate-500 hover:text-slate-700 text-xs font-bold px-2">✕</button>
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
