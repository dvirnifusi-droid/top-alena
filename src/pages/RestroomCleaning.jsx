import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function RestroomCleaning() {
  const [checks, setChecks] = useState([]);
  const [covered, setCovered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const [pushState, setPushState] = useState('idle'); // idle | enabling | on | error
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState(null);
  const [allPositions, setAllPositions] = useState([]);

  const load = async () => {
    try {
      const res = await base44.functions.getRestroomStatus({});
      setChecks(res?.data?.checks || []);
      setCovered(!!res?.data?.currentHourCovered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, []);

  // admin detection + settings + position options
  useEffect(() => {
    base44.auth.me().then(async (me) => {
      const admin = (me?.role === 'admin' || me?.role === 'owner');
      setIsAdmin(admin);
      if (admin) {
        try {
          const s = await base44.functions.getRestroomSettings({});
          setSettings(s?.data?.settings || { enabled: true, target_positions: [] });
          const emps = await base44.entities.Employee.list('-created_date', 500);
          const set = new Set();
          (emps || []).forEach((e) => {
            if (typeof e.role === 'string' && e.role) set.add(e.role);
            (Array.isArray(e.positions) ? e.positions : []).forEach((p) => {
              // positions are objects like { position_name, rate } (or sometimes strings)
              const name = typeof p === 'string' ? p : (p?.position_name || p?.name);
              if (name) set.add(name);
            });
          });
          setAllPositions([...set]);
        } catch (e) { console.warn(e); }
      }
    }).catch(() => {});
  }, []);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotoUrl(file_url);
    } catch (err) {
      alert('שגיאה בהעלאת התמונה');
    } finally {
      setUploading(false);
    }
  };

  const submitCheck = async () => {
    setSaving(true);
    try {
      await base44.functions.recordRestroomCheck({ photo_url: photoUrl || null, notes: notes || null });
      setPhotoUrl('');
      setNotes('');
      await load();
    } catch (e) {
      alert('שגיאה בשמירת הבדיקה');
    } finally {
      setSaving(false);
    }
  };

  const enablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('הדפדפן הזה לא תומך בהתראות');
      return;
    }
    if (!VAPID_PUBLIC_KEY) {
      alert('התראות לא מוגדרות בשרת');
      return;
    }
    setPushState('enabling');
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setPushState('error'); return; }
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      await base44.functions.enableStaffPush({ subscription: sub.toJSON() });
      setPushState('on');
    } catch (e) {
      console.error('push enable failed', e);
      setPushState('error');
    }
  };

  const toggleTarget = (p) => {
    setSettings((s) => {
      const cur = Array.isArray(s.target_positions) ? s.target_positions : [];
      const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
      return { ...s, target_positions: next };
    });
  };

  const saveSettings = async () => {
    try {
      await base44.functions.saveRestroomSettings({
        enabled: settings.enabled !== false,
        target_positions: settings.target_positions || [],
      });
      alert('ההגדרות נשמרו');
    } catch (e) {
      alert('שגיאה בשמירת ההגדרות');
    }
  };

  return (
    <div dir="rtl" className="max-w-2xl mx-auto p-4 space-y-5">
      <div className="text-center">
        <div className="text-5xl mb-2">🚽</div>
        <h1 className="text-2xl font-black text-slate-800">ניקיון שירותים</h1>
        <p className="text-slate-500 text-sm">תזכורת כל שעה עגולה לצוות שבמשמרת</p>
      </div>

      {/* current-hour status */}
      <div className={`rounded-2xl p-4 text-center border-2 ${covered ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'}`}>
        <p className={`font-black text-lg ${covered ? 'text-emerald-700' : 'text-amber-700'}`}>
          {covered ? '✅ השעה הנוכחית נבדקה' : '⏳ השעה הנוכחית עדיין לא נבדקה'}
        </p>
      </div>

      {/* mark check */}
      <div className="bg-white rounded-2xl shadow border border-slate-200 p-4 space-y-3">
        <p className="font-bold text-slate-700">סמן בדיקה</p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="הערה (אופציונלי) — למשל: חסר נייר, נוקה"
          className="w-full border-2 border-slate-200 rounded-xl p-2.5 text-sm resize-none h-16 focus:outline-none focus:border-slate-400"
        />
        <div className="flex items-center gap-3">
          <label className="flex-1 cursor-pointer bg-slate-100 hover:bg-slate-200 rounded-xl py-2.5 text-center text-sm font-bold text-slate-600 transition">
            {uploading ? 'מעלה…' : photoUrl ? '📷 תמונה צורפה ✓' : '📷 צרף תמונה (אופציונלי)'}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
          </label>
        </div>
        {photoUrl && <img src={photoUrl} alt="" className="w-24 h-24 object-cover rounded-xl border" />}
        <button
          onClick={submitCheck}
          disabled={saving || uploading}
          className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white font-black py-3 rounded-2xl transition"
        >
          {saving ? 'שומר…' : '✅ בדקתי את השירותים'}
        </button>
      </div>

      {/* enable notifications on this device */}
      <button
        onClick={enablePush}
        disabled={pushState === 'enabling' || pushState === 'on'}
        className={`w-full font-bold py-3 rounded-2xl transition border-2 ${
          pushState === 'on'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
            : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
        }`}
      >
        {pushState === 'on' ? '🔔 התראות מופעלות במכשיר זה ✓'
          : pushState === 'enabling' ? 'מפעיל…'
          : pushState === 'error' ? '⚠️ לא הצלחנו להפעיל — נסה שוב'
          : '🔔 הפעל התראות במכשיר הזה'}
      </button>

      {/* today's timeline */}
      <div className="bg-white rounded-2xl shadow border border-slate-200 p-4">
        <p className="font-bold text-slate-700 mb-3">בדיקות היום ({checks.length})</p>
        {loading ? (
          <p className="text-slate-400 text-sm text-center py-4">טוען…</p>
        ) : checks.length === 0 ? (
          <p className="text-slate-400 text-sm text-center py-4">עדיין לא בוצעו בדיקות היום</p>
        ) : (
          <div className="space-y-2">
            {checks.map((c) => (
              <div key={c.id} className="flex items-center gap-3 bg-slate-50 rounded-xl p-2.5">
                {c.photo_url ? (
                  <a href={c.photo_url} target="_blank" rel="noreferrer">
                    <img src={c.photo_url} alt="" className="w-12 h-12 object-cover rounded-lg border" />
                  </a>
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-xl">🚽</div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-700 text-sm">{c.checked_by_name || 'צוות'}</p>
                  {c.notes && <p className="text-xs text-slate-500 truncate">{c.notes}</p>}
                </div>
                <span className="text-sm font-bold text-slate-500">{fmtTime(c.checked_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* admin settings */}
      {isAdmin && settings && (
        <div className="bg-white rounded-2xl shadow border border-slate-200 p-4 space-y-3">
          <p className="font-bold text-slate-700">⚙️ הגדרות (מנהל)</p>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={settings.enabled !== false}
              onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
              className="w-4 h-4"
            />
            תזכורת שעתית פעילה
          </label>
          <div>
            <p className="text-xs text-slate-500 mb-2">מי מקבל את ההתראה (אם לא נבחר אף אחד — כל מי שבמשמרת):</p>
            <div className="flex flex-wrap gap-2">
              {allPositions.map((p) => {
                const on = (settings.target_positions || []).includes(p);
                return (
                  <button
                    key={p}
                    onClick={() => toggleTarget(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition ${
                      on ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          <button onClick={saveSettings} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl transition">
            שמור הגדרות
          </button>
        </div>
      )}
    </div>
  );
}
