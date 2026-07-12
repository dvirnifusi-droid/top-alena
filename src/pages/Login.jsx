import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { isMainAlena } from '@/lib/tenant';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
// The one origin Google authorizes for the GIS button. Tenant subdomains bounce
// their Google sign-in through here (see GoogleHandoff.jsx).
const AUTH_ORIGIN = import.meta.env.VITE_AUTH_ORIGIN || 'https://topalena.com';

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from') || '/';
  // On a real tenant subdomain the GIS button can't render (origin not
  // authorized) — use the central handoff instead.
  const isTenant = !isMainAlena();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const googleBtnRef = useRef(null);

  // Returning from the central handoff page with #handoff=<token> — exchange it
  // for this tenant's session. Clear the fragment first so the token doesn't
  // linger in the URL / browser history.
  useEffect(() => {
    const m = (window.location.hash || '').match(/handoff=([^&]+)/);
    if (!m) return;
    const handoff = decodeURIComponent(m[1]);
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* noop */ }
    (async () => {
      setLoading(true); setError(null);
      try {
        await base44.auth.googleConsume(handoff);
        window.location.href = from;
      } catch (err) {
        const msg = err?.data?.error || err?.message;
        setError(msg === 'not_registered'
          ? 'המייל הזה לא רשום במערכת. פנה למנהל כדי שיוסיף אותך.'
          : (msg || 'התחברות Google נכשלה'));
        setLoading(false);
      }
    })();
  }, [from]);

  const startHandoff = () => {
    const ret = window.location.origin + window.location.pathname + window.location.search;
    window.location.href = `${AUTH_ORIGIN}/GoogleHandoff?return=${encodeURIComponent(ret)}`;
  };

  // Load Google Identity Services and render the "Sign in with Google" button.
  // Skipped on tenant subdomains (they use the handoff redirect instead).
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || isTenant) return;
    const handleCredential = async (response) => {
      setError(null);
      setLoading(true);
      try {
        await base44.auth.googleLogin(response.credential);
        window.location.href = from;
      } catch (err) {
        const msg = err?.data?.error || err.message;
        setError(
          msg === 'not_registered'
            ? 'המייל הזה לא רשום במערכת. פנה למנהל כדי שיוסיף אותך.'
            : msg || 'התחברות Google נכשלה',
        );
        setLoading(false);
      }
    };

    const init = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 300,
        text: 'signin_with',
        locale: 'he',
      });
    };

    if (window.google?.accounts?.id) {
      init();
    } else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = init;
      document.head.appendChild(s);
    }
  }, [from]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await base44.auth.login(email, password);
      else await base44.auth.register(email, password);
      window.location.href = from;
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50">
      <form
        onSubmit={submit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-8 space-y-5"
      >
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-3xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">TOP APOLLO</h1>
          <p className="text-slate-500 text-sm mt-1">
            {mode === 'login' ? 'התחבר כדי להמשיך' : 'יצירת חשבון חדש'}
          </p>
        </div>

        {GOOGLE_CLIENT_ID && (
          <div className="space-y-3">
            {isTenant ? (
              <button
                type="button"
                onClick={startHandoff}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 border border-slate-300 rounded-xl py-2.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Sign in with Google
              </button>
            ) : (
              <div className="flex justify-center" ref={googleBtnRef}></div>
            )}
            <div className="flex items-center gap-3 text-slate-400 text-xs">
              <span className="flex-1 h-px bg-slate-200"></span>
              או
              <span className="flex-1 h-px bg-slate-200"></span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <input
            type="email"
            placeholder="כתובת מייל"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-green-700"
          />
          <input
            type="password"
            placeholder="סיסמה"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-green-700"
          />
        </div>

        {error && (
          <div className="text-red-600 text-sm text-center">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-700 hover:bg-green-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {loading ? '...' : mode === 'login' ? 'התחברות' : 'הרשמה'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
          className="w-full text-sm text-slate-600 hover:text-slate-800"
        >
          {mode === 'login' ? 'אין לך חשבון? הירשם' : 'יש לך חשבון? התחבר'}
        </button>
      </form>
    </div>
  );
}
