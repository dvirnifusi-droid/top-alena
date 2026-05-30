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

/**
 * Small banner-style button that asks the logged-in employee to enable free
 * Web Push notifications on this device. Once enabled (or unsupported / no
 * VAPID key configured), the banner hides itself.
 *
 * Notifications cover: shift assignments, leave-status changes, swap replies.
 */
export default function EnableStaffPush() {
  const [state, setState] = useState('idle'); // idle | enabling | on | unsupported | error
  const [hideUntilRefresh, setHideUntilRefresh] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID) {
      setState('unsupported');
      return;
    }
    // Already subscribed in this browser? Hide the banner.
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => { if (sub) setState('on'); })
      .catch(() => {});
  }, []);

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

  if (state === 'on' || state === 'unsupported' || hideUntilRefresh) return null;

  return (
    <div dir="rtl" className="bg-gradient-to-l from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3 shadow-sm">
      <div className="text-3xl">🔔</div>
      <div className="flex-1 min-w-[180px]">
        <p className="font-black text-emerald-900 text-sm">הפעל התראות חינמיות</p>
        <p className="text-xs text-emerald-700">
          קבל/י עדכון מיידי על שיבוץ למשמרת, מענה לבקשת חופשה, ותשובה לבקשת החלפה — בלי SMS.
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
