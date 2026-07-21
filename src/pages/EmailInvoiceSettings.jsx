import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import PageHeader from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Mail, Trash2, RefreshCw, ShieldOff, Plus } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || '/api';

async function api(path, opts = {}) {
  const tok = localStorage.getItem('auth_token');
  const method = (opts.method || 'GET').toUpperCase();
  // Fastify rejects an empty body when Content-Type is application/json, so for
  // body-bearing methods (POST/DELETE with no explicit body) send at least {}.
  const body = opts.body ?? (method === 'GET' || method === 'HEAD' ? undefined : '{}');
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    body,
    headers: {
      'Content-Type': 'application/json',
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data;
}

export default function EmailInvoiceSettingsPage() {
  const [accounts, setAccounts] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [form, setForm] = useState({ email: '', app_password: '' });
  const [busy, setBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const refreshTimer = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => { return () => { isMounted.current = false; }; }, []);

  const load = useCallback(async (opts = {}) => {
    try {
      const [accs, rules] = await Promise.all([
        api('/email-accounts'),
        base44.entities.EmailSenderRule.filter({ rule: 'block' }),
      ]);
      setAccounts(accs || []);
      setBlocked(rules || []);
    } catch (e) {
      if (!opts.background) setMsg({ kind: 'err', text: e.message });
    }
  }, []);

  useEffect(() => {
    load();
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, [load]);

  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      await api('/email-accounts', { method: 'POST', body: JSON.stringify(form) });
      setForm({ email: '', app_password: '' });
      setMsg({ kind: 'ok', text: 'התיבה חוברה בהצלחה! הסריקה הראשונה (30 יום אחורה) תרוץ בדקות הקרובות.' });
      load();
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    } finally { setBusy(false); }
  };

  const disconnect = async (id, email) => {
    if (!window.confirm(`לנתק את ${email}?`)) return;
    setDeletingId(id);
    try {
      await api(`/email-accounts/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setDeletingId(null);
    }
  };

  const scanNow = async () => {
    if (scanBusy) return;
    setScanBusy(true); setMsg(null);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    try {
      await api('/email-accounts/scan-now', { method: 'POST' });
      setMsg({ kind: 'ok', text: 'הסריקה התחילה ברקע — תקבל הודעת WhatsApp אם נקלטו חשבוניות חדשות.' });
      refreshTimer.current = setTimeout(() => {
        if (!isMounted.current) return;
        load({ background: true });
        setScanBusy(false);
      }, 20000);
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
      setScanBusy(false);
    }
  };

  const unblock = async (rule) => {
    try {
      await base44.entities.EmailSenderRule.update(rule.id, { rule: 'auto', reject_count: 0 });
      load();
    } catch (e) {
      setMsg({ kind: 'err', text: e.message });
    }
  };

  const statusBadge = (a) => {
    if (a.status === 'active') return <Badge className="bg-green-100 text-green-800">מחובר</Badge>;
    if (a.status === 'disconnected') return <Badge className="bg-red-100 text-red-800">מנותק — חבר מחדש</Badge>;
    return <Badge className="bg-yellow-100 text-yellow-800">{a.status}</Badge>;
  };

  return (
    <div className="p-4 sm:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        <PageHeader title="תיבות מייל לחשבוניות" subtitle={'המערכת סורקת את התיבות המחוברות כל 10 דקות ומכניסה חשבוניות ספקים ל"בהמתנה".'} icon={Mail} />

        {msg && (
          <div className={`p-3 rounded-lg text-sm ${msg.kind === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {msg.text}
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>תיבות מחוברות</CardTitle>
            <Button variant="outline" size="sm" onClick={scanNow} disabled={scanBusy || accounts.length === 0}>
              <RefreshCw className={`w-4 h-4 ml-2 ${scanBusy ? 'animate-spin' : ''}`} />
              סרוק עכשיו
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <div className="font-medium" dir="ltr">{a.email}</div>
                  <div className="text-sm text-slate-500">
                    {a.last_checked_at ? `נבדק לאחרונה: ${new Date(a.last_checked_at).toLocaleString('he-IL')}` : 'טרם נסרק'}
                    {a.last_error ? ` · שגיאה: ${a.last_error}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(a)}
                  <Button variant="ghost" size="sm" onClick={() => disconnect(a.id, a.email)} disabled={deletingId === a.id}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
            {accounts.length === 0 && <p className="text-slate-500 text-sm">אין תיבות מחוברות עדיין.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>חיבור תיבה (Gmail)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">
              נדרשת <b>סיסמת אפליקציה</b> של Google (לא הסיסמה הרגילה): היכנס ל-
              <a className="text-blue-600 underline mx-1" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
                myaccount.google.com/apppasswords
              </a>
              (דורש אימות דו-שלבי פעיל), צור סיסמה חדשה בשם "TOP APOLLO" והדבק אותה כאן.
            </p>
            <Input placeholder="כתובת Gmail" dir="ltr" autoComplete="off" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            <Input placeholder="סיסמת אפליקציה (16 תווים)" dir="ltr" type="password" autoComplete="new-password" value={form.app_password}
              onChange={e => setForm(f => ({ ...f, app_password: e.target.value }))} />
            <Button onClick={connect} disabled={busy || !form.email || !form.app_password}>
              <Plus className="w-4 h-4 ml-2" />
              {busy ? 'בודק חיבור…' : 'חבר תיבה'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldOff className="w-5 h-5" />שולחים חסומים</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-slate-600">שולח נחסם אוטומטית אחרי שתי דחיות. אפשר להחזיר אותו כאן.</p>
            {blocked.map(r => (
              <div key={r.id} className="flex items-center justify-between border rounded-lg p-2">
                <span dir="ltr" className="text-sm">{r.sender_email}</span>
                <Button variant="outline" size="sm" onClick={() => unblock(r)}>הסר חסימה</Button>
              </div>
            ))}
            {blocked.length === 0 && <p className="text-slate-500 text-sm">אין שולחים חסומים.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
