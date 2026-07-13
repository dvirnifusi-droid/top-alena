import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { isMainAlena } from '@/lib/tenant';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
// The one origin Google authorizes for the GIS button. Tenant subdomains bounce
// their Google sign-in through here (see GoogleHandoff.jsx).
const AUTH_ORIGIN = import.meta.env.VITE_AUTH_ORIGIN || 'https://topalena.com';
const LAST_TENANT_KEY = 'last_restaurant_slug';

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from') || '/';
  const isTenant = !isMainAlena();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Restaurant picker — set when a Google email belongs to several restaurants.
  const [picker, setPicker] = useState(null); // { tenants: [{slug,name,url}], handoff }
  const googleBtnRef = useRef(null);

  // Send the user on to the restaurant their email belongs to (via the handoff
  // token the tenant's /google-consume exchanges for a session).
  const routeTo = (t, handoff) => {
    try { localStorage.setItem(LAST_TENANT_KEY, t.slug); } catch { /* noop */ }
    window.location.href = `${t.url}/login#handoff=${encodeURIComponent(handoff)}`;
  };

  // Branch the /auth/google response: logged in here, routed to one restaurant,
  // or a choice of several.
  const handleGoogleResult = (res) => {
    if (res?.route_to && res?.handoff) { routeTo(res.route_to, res.handoff); return; }
    if (res?.choose_tenant && res?.handoff) {
      let list = res.choose_tenant;
      try {
        const last = localStorage.getItem(LAST_TENANT_KEY);
        if (last) list = [...list].sort((a, b) => (b.slug === last) - (a.slug === last));
      } catch { /* noop */ }
      setPicker({ tenants: list, handoff: res.handoff });
      setLoading(false);
      return;
    }
    // Logged in on this origin.
    window.location.href = from;
  };

  const googleError = (err) => {
    const msg = err?.data?.error || err?.message;
    setError(msg === 'not_registered'
      ? 'המייל הזה לא רשום באף מסעדה. בקש מהמנהל להוסיף אותך, או השתמש בכתובת המסעדה שלך.'
      : (msg || 'התחברות Google נכשלה'));
    setLoading(false);
  };

  // Returning from the central handoff page with #handoff=<token>.
  useEffect(() => {
    const m = (window.location.hash || '').match(/handoff=([^&]+)/);
    if (!m) return;
    const handoff = decodeURIComponent(m[1]);
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* noop */ }
    (async () => {
      setLoading(true); setError(null);
      try { await base44.auth.googleConsume(handoff); window.location.href = from; }
      catch (err) { googleError(err); }
    })();
  }, [from]);

  const startHandoff = () => {
    const ret = window.location.origin + window.location.pathname + window.location.search;
    window.location.href = `${AUTH_ORIGIN}/GoogleHandoff?return=${encodeURIComponent(ret)}`;
  };

  // GIS button (topalena.com only — the authorized origin).
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || isTenant) return;
    const handleCredential = async (response) => {
      setError(null); setLoading(true);
      try { handleGoogleResult(await base44.auth.googleLogin(response.credential)); }
      catch (err) { googleError(err); }
    };
    const init = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential });
      window.google.accounts.id.renderButton(googleBtnRef.current, { theme: 'outline', size: 'large', width: 300, text: 'signin_with', locale: 'he' });
    };
    if (window.google?.accounts?.id) init();
    else {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.onload = init;
      document.head.appendChild(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      if (mode === 'login') await base44.auth.login(email, password);
      else await base44.auth.register(email, password);
      window.location.href = from;
    } catch (err) {
      setError(err.message || 'ההתחברות נכשלה');
    } finally { setLoading(false); }
  };

  const initial = (s) => (s?.name || s?.slug || '?').trim().charAt(0).toUpperCase();

  return (
    <div dir="rtl" className="login-bg min-h-screen flex items-center justify-center px-4 py-8">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;800&display=swap');
        .login-bg{background:radial-gradient(circle at 25% 15%,#3c4a2b 0%,#26311d 42%,#161c11 100%);}
        .login-card{animation:cardIn .5s cubic-bezier(.2,.8,.2,1);}
        @keyframes cardIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
        .login-serif{font-family:'Frank Ruhl Libre',Georgia,serif;}
        .login-emblem{background:conic-gradient(from 210deg,#E7C87E,#B8894A,#E7C87E,#9a6f38,#E7C87E);}
        .brand-input:focus{border-color:#8a6d2f;box-shadow:0 0 0 3px rgba(184,149,86,.18);}
        .tenant-row:active{transform:scale(.98)}
      `}</style>

      <div className="login-card w-full max-w-sm">
        {/* Emblem + wordmark */}
        <div className="text-center mb-5">
          <div className="login-emblem w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg" style={{ boxShadow: '0 10px 30px rgba(184,137,74,.35)' }}>
            <span className="text-4xl" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.25))' }}>👑</span>
          </div>
          <h1 className="login-serif text-3xl font-extrabold tracking-wide" style={{ color: '#F4ECD8', letterSpacing: '.06em' }}>TOP APOLLO</h1>
          <p className="text-sm mt-1" style={{ color: '#C9BF9E' }}>
            {picker ? 'לאיזו מסעדה להיכנס?' : 'מערכת הניהול — התחבר כדי להמשיך'}
          </p>
        </div>

        <div className="rounded-3xl p-6 sm:p-7 shadow-2xl" style={{ background: '#FBF8F0', border: '1px solid #E8D9B5' }}>
          {picker ? (
            /* ── Restaurant picker (email belongs to several) ── */
            <div className="space-y-3">
              {picker.tenants.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  onClick={() => routeTo(t, picker.handoff)}
                  className="tenant-row w-full flex items-center gap-3 rounded-2xl p-3 text-right transition-all hover:shadow-md"
                  style={{ background: '#fff', border: '1px solid #E8D9B5' }}
                >
                  {t.logo_url
                    ? <img src={t.logo_url} alt="" className="w-11 h-11 rounded-xl object-cover" />
                    : <span className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg,#A04A2E,#B89556)' }}>{initial(t)}</span>}
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold truncate" style={{ color: '#1F1B17' }}>{t.name || t.slug}</span>
                    <span className="block text-xs truncate" style={{ color: '#7A6F5D' }}>{t.slug}.topalena.com</span>
                  </span>
                  <span style={{ color: '#A04A2E' }}>←</span>
                </button>
              ))}
              <button type="button" onClick={() => { setPicker(null); setError(null); }} className="w-full text-sm pt-1" style={{ color: '#7A6F5D' }}>→ חזרה</button>
            </div>
          ) : (
            <>
              {GOOGLE_CLIENT_ID && (
                <div className="space-y-3 mb-4">
                  {isTenant ? (
                    <button type="button" onClick={startHandoff} disabled={loading}
                      className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-semibold disabled:opacity-50 transition-colors"
                      style={{ background: '#fff', border: '1px solid #d9d2c2', color: '#3c3627' }}>
                      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                      התחבר עם Google
                    </button>
                  ) : (
                    <div className="flex justify-center" ref={googleBtnRef}></div>
                  )}
                  <div className="flex items-center gap-3 text-xs" style={{ color: '#a99f86' }}>
                    <span className="flex-1 h-px" style={{ background: '#E8D9B5' }}></span>או<span className="flex-1 h-px" style={{ background: '#E8D9B5' }}></span>
                  </div>
                </div>
              )}

              <form onSubmit={submit} className="space-y-3">
                <input type="email" placeholder="כתובת מייל" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="brand-input w-full px-4 py-3 rounded-xl outline-none transition" style={{ background: '#fff', border: '1px solid #E8D9B5' }} />
                <input type="password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                  className="brand-input w-full px-4 py-3 rounded-xl outline-none transition" style={{ background: '#fff', border: '1px solid #E8D9B5' }} />

                {error && <div className="text-sm text-center rounded-lg py-2 px-3" style={{ color: '#9b2c1a', background: '#fbeae6' }}>{error}</div>}

                <button type="submit" disabled={loading}
                  className="w-full text-white font-bold py-3 rounded-xl transition-all disabled:opacity-50 hover:brightness-110"
                  style={{ background: 'linear-gradient(135deg,#44512C,#65703f)', boxShadow: '0 8px 20px rgba(68,81,44,.28)' }}>
                  {loading ? '...' : mode === 'login' ? 'התחברות' : 'הרשמה'}
                </button>
              </form>

              <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
                className="w-full text-sm mt-4" style={{ color: '#7A6F5D' }}>
                {mode === 'login' ? 'אין לך חשבון? הירשם' : 'יש לך חשבון? התחבר'}
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs mt-5" style={{ color: '#8f866c' }}>מערכת ניהול מסעדות · TOP APOLLO</p>
      </div>
    </div>
  );
}
