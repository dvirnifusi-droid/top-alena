import React, { useEffect, useState } from 'react';
import { useTenantBranding } from '@/hooks/useTenantBranding';

// Floating "install app" prompt. On Android/Chrome it uses the native
// beforeinstallprompt; on iOS Safari (which has no such event) it shows the
// manual "Share → Add to Home Screen" hint. Dismissible + remembers choice.
const DISMISS_KEY = 'pwa_install_dismissed';

function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}
function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
}

export default function InstallPrompt() {
  const { name: brandName } = useTenantBranding();
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY) === '1') return;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS never fires beforeinstallprompt — show the manual hint instead.
    if (isIos()) {
      const t = setTimeout(() => setShow(true), 2500);
      return () => {
        clearTimeout(t);
        window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      };
    }
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  const install = async () => {
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
      setShow(false);
    } else if (isIos()) {
      setIosHint(true);
    }
  };

  if (!show) return null;

  return (
    <div
      dir="rtl"
      style={{ zIndex: 2147483000 }}
      className="fixed bottom-4 inset-x-3 mx-auto max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 p-4"
    >
      <div className="flex items-center gap-3">
        <img src="/icons/icon-192.png" alt={brandName} className="w-12 h-12 rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-800 text-sm">התקן את אפליקציית {brandName}</p>
          <p className="text-slate-500 text-xs">גישה מהירה ממסך הבית + התראות</p>
        </div>
        <button onClick={dismiss} className="text-slate-300 hover:text-slate-500 text-xl leading-none px-1" aria-label="סגור">×</button>
      </div>

      {iosHint ? (
        <div className="mt-3 bg-slate-50 rounded-xl p-3 text-xs text-slate-600 leading-relaxed">
          להתקנה באייפון: הקש על כפתור <b>שיתוף</b> ⬆️ בתחתית הדפדפן, ואז בחר <b>"הוסף למסך הבית"</b>.
        </div>
      ) : (
        <button
          onClick={install}
          className="mt-3 w-full bg-[#3a4a1f] hover:bg-[#2c3917] active:scale-95 text-white font-bold py-2.5 rounded-xl text-sm transition-all"
        >
          📲 התקן עכשיו
        </button>
      )}
    </div>
  );
}
