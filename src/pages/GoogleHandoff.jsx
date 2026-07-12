// Central Google sign-in handoff — hosted on the authorized origin
// (topalena.com). Tenant subdomains (which Google won't authorize as origins,
// no wildcards) bounce the user here with ?return=<tenant-login-url>. We render
// the real GIS button, verify the credential on our api, mint a short-lived
// handoff token, and send the user back to the tenant with #handoff=<token>.
// The tenant then exchanges it for its own session (see Login.jsx).
import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

// Only ever redirect back to an https *.topalena.com origin — never an arbitrary
// URL an attacker could put in ?return= to steal the handoff token.
function safeReturn(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!/^([a-z0-9-]+\.)*topalena\.com$/i.test(u.hostname)) return null;
    return u;
  } catch { return null; }
}

export default function GoogleHandoff() {
  const params = new URLSearchParams(window.location.search);
  const returnUrl = safeReturn(params.get('return') || '');
  const btnRef = useRef(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!returnUrl) { setError('קישור חזרה לא תקין'); return; }
    if (!GOOGLE_CLIENT_ID) { setError('Google לא מוגדר'); return; }

    const handleCredential = async (response) => {
      setError(null); setBusy(true);
      try {
        const handoff = await base44.auth.googleHandoff(response.credential);
        // Hand the token back to the tenant in the URL fragment (never sent to a
        // server / not logged). The tenant page reads it and clears it.
        const dest = new URL(returnUrl.href);
        dest.hash = `handoff=${encodeURIComponent(handoff)}`;
        window.location.href = dest.href;
      } catch (err) {
        setError(err?.data?.error || err?.message || 'התחברות Google נכשלה');
        setBusy(false);
      }
    };

    const init = () => {
      if (!window.google?.accounts?.id || !btnRef.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential });
      window.google.accounts.id.renderButton(btnRef.current, { theme: 'outline', size: 'large', width: 300, text: 'signin_with' });
    };

    if (window.google?.accounts?.id) { init(); }
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true; s.defer = true; s.onload = init;
      document.head.appendChild(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-5 text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-3xl">🔐</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Sign in with Google</h1>
          <p className="text-slate-500 text-sm mt-1">
            {returnUrl ? `Continue to ${returnUrl.hostname}` : 'Secure sign-in'}
          </p>
        </div>
        {error ? (
          <div className="text-red-600 text-sm">{error}</div>
        ) : busy ? (
          <div className="text-slate-500 text-sm">…</div>
        ) : (
          <div className="flex justify-center" ref={btnRef}></div>
        )}
      </div>
    </div>
  );
}
