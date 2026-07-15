import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { isMainAlena } from '@/lib/tenant';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { Mail, Lock, LogIn, ChevronLeft, ArrowRight } from 'lucide-react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const AUTH_ORIGIN = import.meta.env.VITE_AUTH_ORIGIN || 'https://topalena.com';
const LAST_TENANT_KEY = 'last_restaurant_slug';

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
  const branding = useTenantBranding();

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

  // ── Presentation only: per-tenant hero identity (falls back to warm Alena) ──
  const brandName = branding?.name || 'TOP APOLLO';
  const brandLogo = branding?.logo_url || null;
  const brandCover = branding?.cover_photo_url || null;
  const bc = branding?.brand_colors || {};
  const primary = bc.primary || '#A04A2E';
  const secondary = bc.secondary || '#44512C';
  const accent = bc.accent || '#C9A15A';
  const hasCover = !!brandCover;
  const brandInitial = (brandName || '?').trim().charAt(0).toUpperCase();
  // Base gradient always paints (shows under/around any photo). The cover photo
  // layers on top with a slow Ken Burns drift for a living, premium feel.
  const heroBase = { background: `radial-gradient(130% 120% at 12% 8%, ${accent}66 0%, transparent 42%), linear-gradient(140deg, ${primary} 0%, ${secondary} 78%, ${primary} 130%)` };
  const scrimStyle = hasCover
    // Bottom-weighted scrim: dark where the name sits (legible), lighter up top so
    // the photo breathes.
    ? { background: `linear-gradient(to top, ${secondary}f2 0%, ${primary}80 46%, ${primary}24 100%)` }
    : { background: `radial-gradient(120% 120% at 85% 15%, ${accent}59 0%, transparent 55%)` };

  return (
    <div dir="rtl" className="lg-root min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE]">
      <style>{`
        .lg-root .lg-in{ transition: border-color .15s ease, box-shadow .15s ease; }
        .lg-root .lg-in:focus{ border-color: var(--brand-primary, #A04A2E); box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand-primary, #A04A2E) 16%, transparent); }
        .lg-root .lg-btn{ transition: filter .15s ease, transform .15s ease; box-shadow: 0 14px 26px -10px color-mix(in srgb, var(--brand-primary, #A04A2E) 55%, transparent); }
        .lg-root .lg-btn:hover:not(:disabled){ filter: brightness(1.05); transform: translateY(-1px); }
        .lg-root .lg-hero-photo{ animation: lgKen 22s ease-in-out infinite alternate; will-change: transform; }
        @keyframes lgKen{ from{ transform: scale(1) } to{ transform: scale(1.08) } }
        @media (prefers-reduced-motion: reduce){ .lg-root .lg-hero-photo{ animation: none } }
      `}</style>

      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
        <div className="rounded-[28px] overflow-hidden bg-white border border-[#EADFC8] shadow-[0_24px_60px_-15px_rgba(80,60,30,0.28)]">
          {/* ── HERO ── tenant cover photo (or brand gradient) + logo + name */}
          <div className="relative h-52 sm:h-56 flex items-end" style={heroBase}>
            {hasCover && (
              <div className="lg-hero-photo absolute inset-0" style={{ backgroundImage: `url("${brandCover}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            )}
            <div className="absolute inset-0" style={scrimStyle} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(80% 55% at 82% 0%, rgba(255,255,255,0.18), transparent 60%)' }} />
            <div className="relative w-full p-6 flex items-center gap-4">
              {brandLogo ? (
                <img src={brandLogo} alt="" className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white/40 shadow-lg shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shrink-0 ring-2 ring-white/25 shadow-lg" style={{ background: 'rgba(255,255,255,0.16)' }}>
                  {brandInitial}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-display text-3xl sm:text-4xl font-black text-white leading-none drop-shadow-sm truncate">{brandName}</h1>
                <p className="text-white/85 text-sm mt-2 font-medium">מערכת הניהול החכמה של המסעדה</p>
              </div>
            </div>
          </div>

          {/* ── BODY ── */}
          <div className="p-6 sm:p-7">
            {picker ? (
              <div className="space-y-3">
                <div className="mb-1">
                  <h2 className="font-display text-2xl font-black text-[#2A2018] leading-none">בחירת מסעדה</h2>
                  <p className="text-[#8A7C64] text-sm mt-1.5">לאיזו מסעדה להיכנס?</p>
                </div>
                {picker.tenants.map((t) => (
                  <button key={t.slug} type="button" onClick={() => routeTo(t, picker.handoff)}
                    className="w-full flex items-center gap-3 rounded-2xl p-3 text-right bg-[#FAF5E8] border border-[#EADFC8] transition hover:border-[var(--brand-primary,#A04A2E)] hover:shadow-sm">
                    {t.logo_url ? <img src={t.logo_url} alt="" className="w-11 h-11 rounded-xl object-cover shrink-0" />
                      : <span className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold text-white shrink-0" style={{ background: 'var(--brand-primary, #A04A2E)' }}>{initial(t)}</span>}
                    <span className="flex-1 min-w-0"><span className="block font-bold truncate text-[#2A2018]">{t.name || t.slug}</span><span className="block text-xs truncate text-[#8A7C64]">{t.slug}.topalena.com</span></span>
                    <ChevronLeft className="w-5 h-5 shrink-0" style={{ color: 'var(--brand-primary, #A04A2E)' }} />
                  </button>
                ))}
                <button type="button" onClick={() => { setPicker(null); setError(null); }} className="w-full flex items-center justify-center gap-1.5 text-sm pt-1 text-[#8A7C64] hover:text-[#2A2018] transition">
                  <ArrowRight className="w-4 h-4" /> חזרה
                </button>
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <h2 className="font-display text-3xl font-black text-[#2A2018] leading-none">{mode === 'login' ? 'התחברות' : 'הרשמה'}</h2>
                  <p className="text-[#8A7C64] text-sm mt-1.5">{mode === 'login' ? 'טוב לראות אותך שוב' : 'הצטרפות למערכת הניהול'}</p>
                </div>

                {GOOGLE_CLIENT_ID && (
                  <div className="space-y-3 mb-5">
                    {isTenant ? (
                      <button type="button" onClick={startHandoff} disabled={loading}
                        className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-3.5 font-bold bg-white border border-[#EADFC8] text-[#2A2018] shadow-sm transition hover:shadow-md hover:border-[#DDD0B5] disabled:opacity-50">
                        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" /><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" /></svg>
                        התחבר עם Google
                      </button>
                    ) : (
                      <div className="flex justify-center" ref={googleBtnRef}></div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-[#B3A488]">
                      <span className="flex-1 h-px bg-[#EADFC8]"></span>או במייל<span className="flex-1 h-px bg-[#EADFC8]"></span>
                    </div>
                  </div>
                )}

                <form onSubmit={submit} className="space-y-3">
                  <div className="relative">
                    <Mail className="w-5 h-5 text-[#B3A488] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" strokeWidth={2} />
                    <input type="email" placeholder="כתובת מייל" value={email} onChange={(e) => setEmail(e.target.value)} required
                      className="lg-in w-full ps-11 pe-4 py-3.5 rounded-2xl outline-none bg-[#FAF5E8] border border-[#EADFC8] text-[#2A2018] placeholder-[#B3A488]" />
                  </div>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-[#B3A488] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" strokeWidth={2} />
                    <input type="password" placeholder="סיסמה" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                      className="lg-in w-full ps-11 pe-4 py-3.5 rounded-2xl outline-none bg-[#FAF5E8] border border-[#EADFC8] text-[#2A2018] placeholder-[#B3A488]" />
                  </div>
                  {error && <div className="text-sm text-center rounded-xl py-2.5 px-3 text-[#9B2C1A] bg-[#F7E4DE] border border-[#EBCBC1]">{error}</div>}
                  <button type="submit" disabled={loading} className="lg-btn w-full flex items-center justify-center gap-2 font-bold text-white py-3.5 rounded-2xl disabled:opacity-60"
                    style={{ background: 'var(--brand-primary, #A04A2E)' }}>
                    {loading ? '...' : <><LogIn className="w-5 h-5" strokeWidth={2.2} />{mode === 'login' ? 'התחברות' : 'הרשמה'}</>}
                  </button>
                </form>

                <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
                  className="w-full text-sm mt-4 text-[#8A7C64] hover:text-[var(--brand-primary,#A04A2E)] transition">
                  {mode === 'login' ? 'אין לך חשבון? הירשם' : 'יש לך חשבון? התחבר'}
                </button>
              </>
            )}
          </div>
        </div>
        <p className="text-center text-xs mt-5 text-[#9A8A68]">מופעל על ידי TOP Apollo · ניהול חכם, אתה נהנה מהחופש</p>
      </div>
    </div>
  );
}
