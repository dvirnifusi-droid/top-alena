import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from') || '/';

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const googleBtnRef = useRef(null);

  // Load Google Identity Services and render the "Sign in with Google" button.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
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
          <h1 className="text-2xl font-bold text-slate-800">TOP ALENA</h1>
          <p className="text-slate-500 text-sm mt-1">
            {mode === 'login' ? 'התחבר כדי להמשיך' : 'יצירת חשבון חדש'}
          </p>
        </div>

        {GOOGLE_CLIENT_ID && (
          <div className="space-y-3">
            <div className="flex justify-center" ref={googleBtnRef}></div>
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
