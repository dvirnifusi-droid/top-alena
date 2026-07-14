import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { isMainAlena } from '@/lib/tenant';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const AUTH_ORIGIN = import.meta.env.VITE_AUTH_ORIGIN || 'https://topalena.com';
const LAST_TENANT_KEY = 'last_restaurant_slug';

// Neon brain + gold articulated arms — the Apollo emblem (inline SVG, glows on light).
function BrainEmblem({ size = 150 }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 220 172" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ filter: 'drop-shadow(0 6px 22px rgba(46,125,255,.4))' }}>
      <defs>
        <radialGradient id="ap_bglow" cx="50%" cy="45%" r="55%"><stop offset="0" stopColor="#8fbcff" /><stop offset=".5" stopColor="#2E7DFF" /><stop offset="1" stopColor="#1846C7" /></radialGradient>
        <linearGradient id="ap_gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#EFD79A" /><stop offset=".5" stopColor="#C9A15A" /><stop offset="1" stopColor="#7c5626" /></linearGradient>
        <filter id="ap_soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g fill="url(#ap_gold)" stroke="#5b3f22" strokeWidth="1.2">
        <g id="ap_arm">
          <rect x="6" y="120" width="46" height="15" rx="7" /><circle cx="52" cy="127" r="10" />
          <rect x="50" y="95" width="15" height="40" rx="7" /><circle cx="57" cy="96" r="9" />
          <path d="M57 88 q8 -10 20 -8 l6 8 q-10 2 -14 8 q-6 -6 -12 -8Z" />
        </g>
        <use href="#ap_arm" transform="translate(220,0) scale(-1,1)" />
      </g>
      <g stroke="url(#ap_gold)" strokeWidth="2" fill="none" opacity=".8">
        <path d="M110 40 V16" /><path d="M84 46 L66 22" /><path d="M136 46 L154 22" />
        <circle cx="110" cy="14" r="3.2" fill="#C9A15A" stroke="none" /><circle cx="64" cy="20" r="3.2" fill="#C9A15A" stroke="none" /><circle cx="156" cy="20" r="3.2" fill="#C9A15A" stroke="none" />
      </g>
      <g filter="url(#ap_soft)" className="ap-brain">
        <path d="M110 46 c-20 -16 -52 -10 -58 14 c-18 6 -18 34 2 40 c-2 20 22 32 38 22 c10 8 26 8 36 0 c16 10 40 -2 38 -22 c20 -6 20 -34 2 -40 c-6 -24 -38 -30 -58 -14Z" fill="url(#ap_bglow)" opacity=".92" />
        <g stroke="#dbe9ff" strokeWidth="2" fill="none" opacity=".85" strokeLinecap="round">
          <path d="M110 52 V150" /><path d="M92 62 q-14 16 0 30 q-14 12 0 26" /><path d="M128 62 q14 16 0 30 q14 12 0 26" />
        </g>
      </g>
    </svg>
  );
}

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from') || '/';
  const isTenant = !isMainAlena();

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [picker, setPicker] = useState(null);
  const googleBtnRef = useRef(null);

  const routeTo = (t, handoff) => {
    try { localStorage.setItem(LAST_TENANT_KEY, t.slug); } catch { /* noop */ }
    window.location.href = `${t.url}/login#handoff=${encodeURIComponent(handoff)}`;
  };
  const handleGoogleResult = (res) => {
    if (res?.route_to && res?.handoff) { routeTo(res.route_to, res.handoff); return; }
    if (res?.choose_tenant && res?.handoff) {
      let list = res.choose_tenant;
      try { const last = localStorage.getItem(LAST_TENANT_KEY); if (last) list = [...list].sort((a, b) => (b.slug === last) - (a.slug === last)); } catch { /* noop */ }
      setPicker({ tenants: list, handoff: res.handoff }); setLoading(false); return;
    }
    window.location.href = from;
  };
  const googleError = (err) => {
    const msg = err?.data?.error || err?.message;
    setError(msg === 'not_registered'
      ? 'המייל הזה לא רשום באף מסעדה. בקש מהמנהל להוסיף אותך, או השתמש בכתובת המסעדה שלך.'
      : (msg || 'התחברות Google נכשלה'));
    setLoading(false);
  };

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
      window.google.accounts.id.renderButton(googleBtnRef.current, { theme: 'filled_black', size: 'large', width: 300, text: 'signin_with', shape: 'pill', locale: 'he' });
    };
    if (window.google?.accounts?.id) init();
    else { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true; s.onload = init; document.head.appendChild(s); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  const submit = async (e) => {
    e.preventDefault(); setError(null); setLoading(true);
    try {
      if (mode === 'login') await base44.auth.login(email, password);
      else await base44.auth.register(email, password);
      window.location.href = from;
    } catch (err) { setError(err.message || 'ההתחברות נכשלה'); }
    finally { setLoading(false); }
  };

  const initial = (s) => (s?.name || s?.slug || '?').trim().charAt(0).toUpperCase();

  return (
    <div dir="rtl" className="ap-login min-h-screen flex items-center justify-center px-4 py-8">
      <style>{`
        .ap-login{ background:radial-gradient(120% 90% at 50% -10%, #FCF6E7 0%, #F3E7CA 55%, #E7D6AC 100%); position:relative; overflow:hidden; }
        .ap-login::before{ content:""; position:absolute; inset:0; opacity:.5; pointer-events:none;
          background-image:linear-gradient(#d9bd8355 1px,transparent 1px),linear-gradient(90deg,#d9bd8333 1px,transparent 1px); background-size:40px 40px; mask-image:radial-gradient(70% 60% at 50% 30%,#000,transparent); }
        .ap-card-in{ animation:apIn .5s cubic-bezier(.2,.8,.2,1); }
        @keyframes apIn{ from{ opacity:0; transform:translateY(14px) } to{ opacity:1; transform:none } }
        .ap-brain{ animation:apPulse 3.4s ease-in-out infinite; transform-origin:center; }
        @keyframes apPulse{ 0%,100%{ filter:brightness(1) } 50%{ filter:brightness(1.35) } }
        .ap-serif{ font-family:Georgia,"Times New Roman",serif; }
        .ap-in{ transition:border-color .15s, box-shadow .15s; }
        .ap-in:focus{ border-color:#8a6d2f; box-shadow:0 0 0 3px rgba(201,161,90,.22); }
        .ap-gold{ position:relative; overflow:hidden; }
        .ap-gold .sheen{ position:absolute; top:0; bottom:0; width:38%; left:-50%; background:linear-gradient(105deg,transparent,rgba(255,255,255,.55),transparent); animation:apSheen 3.4s linear infinite; }
        @keyframes apSheen{ to{ left:130% } }
        @media (prefers-reduced-motion: reduce){ .ap-brain,.ap-gold .sheen,.ap-card-in{ animation:none } }
      `}</style>

      <div className="ap-card-in w-full max-w-sm relative" style={{ zIndex: 1 }}>
        <div className="text-center mb-5">
          <div className="inline-block">{picker ? <BrainEmblem size={96} /> : <BrainEmblem size={150} />}</div>
          <h1 className="ap-serif text-3xl font-extrabold" style={{ letterSpacing: '.04em', marginTop: 2, background: 'linear-gradient(180deg,#7c5626,#c9a15a 55%,#7c5626)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>TOP Apollo</h1>
          <p className="text-sm font-semibold mt-1" style={{ color: '#8A755A' }}>{picker ? 'לאיזו מסעדה להיכנס?' : 'מנהל את העסק שלך.'}</p>
        </div>

        <div className="rounded-3xl p-6 shadow-2xl" style={{ background: 'linear-gradient(168deg,#33241a,#241811)', border: '1px solid rgba(201,161,90,.28)', boxShadow: '0 22px 50px rgba(36,24,17,.4)' }}>
          {picker ? (
            <div className="space-y-3">
              {picker.tenants.map((t) => (
                <button key={t.slug} type="button" onClick={() => routeTo(t, picker.handoff)}
                  className="w-full flex items-center gap-3 rounded-2xl p-3 text-right transition-all hover:brightness-105"
                  style={{ background: '#fbf5e6', border: '1px solid #e6d4a8' }}>
                  {t.logo_url ? <img src={t.logo_url} alt="" className="w-11 h-11 rounded-xl object-cover" />
                    : <span className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0" style={{ background: 'linear-gradient(135deg,#C9A15A,#7c5626)' }}>{initial(t)}</span>}
                  <span className="flex-1 min-w-0"><span className="block font-bold truncate" style={{ color: '#241811' }}>{t.name || t.slug}</span><span className="block text-xs truncate" style={{ color: '#8A755A' }}>{t.slug}.topalena.com</span></span>
                  <span style={{ color: '#C9A15A' }}>←</span>
                </button>
              ))}
              <button type="button" onClick={() => { setPicker(null); setError(null); }} className="w-full text-sm pt-1" style={{ color: '#c9b892' }}>→ חזרה</button>
            </div>
          ) : (
            <>
              {GOOGLE_CLIENT_ID && (
                <div className="space-y-3 mb-4">
                  <p className="text-center text-xs font-semibold" style={{ color: '#c9b892' }}>התחבר עם חשבון Google שלך</p>
                  {isTenant ? (
                    <button type="button" onClick={startHandoff} disabled={loading}
                      className="w-full flex items-center justify-center gap-2 rounded-full py-3 font-bold disabled:opacity-50"
                      style={{ background: '#fff', color: '#3c3627' }}>
                      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
                      התחבר עם Google
                    </button>
                  ) : (
                    <div className="flex justify-center" ref={googleBtnRef}></div>
                  )}
                  <div className="flex items-center gap-3 text-xs" style={{ color: '#8a7a5c' }}>
                    <span className="flex-1 h-px" style={{ background: 'rgba(201,161,90,.3)' }}></span>או במייל<span className="flex-1 h-px" style={{ background: 'rgba(201,161,90,.3)' }}></span>
                  </div>
                </div>
              )}

              <form onSubmit={submit} className="space-y-3">
                <input type="email" placeholder="כתובת מייל" value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="ap-in w-full px-4 py-3 rounded-xl outline-none" style={{ background: '#fbf5e6', border: '1px solid #6a5233', color: '#241811' }} />
                <input type="password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                  className="ap-in w-full px-4 py-3 rounded-xl outline-none" style={{ background: '#fbf5e6', border: '1px solid #6a5233', color: '#241811' }} />
                {error && <div className="text-sm text-center rounded-lg py-2 px-3" style={{ color: '#ffd9cf', background: 'rgba(155,44,26,.35)' }}>{error}</div>}
                <button type="submit" disabled={loading} className="ap-gold w-full font-extrabold py-3 rounded-xl disabled:opacity-50"
                  style={{ color: '#2a1c0e', background: 'linear-gradient(180deg,#EBD08A,#C9A15A 55%,#9A6F38)', boxShadow: '0 10px 22px rgba(201,161,90,.4)' }}>
                  <span className="sheen"></span>{loading ? '...' : mode === 'login' ? 'התחברות' : 'הרשמה'}
                </button>
              </form>

              <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
                className="w-full text-sm mt-4" style={{ color: '#c9b892' }}>
                {mode === 'login' ? 'אין לך חשבון? הירשם' : 'יש לך חשבון? התחבר'}
              </button>
            </>
          )}
        </div>
        <p className="text-center text-xs mt-5" style={{ color: '#9a8a68' }}>TOP Apollo · מנהל את העסק שלך, אתה נהנה מהחופש</p>
      </div>
    </div>
  );
}
