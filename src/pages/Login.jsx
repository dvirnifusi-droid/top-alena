import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function Login() {
  const params = new URLSearchParams(window.location.search);
  const from = params.get('from') || '/';

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
