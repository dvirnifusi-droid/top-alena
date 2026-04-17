import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

async function registerPushAndSave(entryId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const existing = await reg.pushManager.getSubscription();
    const sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: VAPID_PUBLIC_KEY,
    });

    await base44.entities.QueueEntry.update(entryId, {
      push_subscription: sub.toJSON(),
    });
  } catch (e) {
    console.warn('Push registration failed:', e);
  }
}

const ABANDON_REASONS = [
  { id: 'wait_too_long', label: '⏳ זמן המתנה ארוך מידי' },
  { id: 'no_vibe', label: '🌫️ לא התחברתי לאווירה' },
  { id: 'no_menu', label: '🍽️ לא התחברתי לתפריט' },
  { id: 'other', label: '✏️ אחר — ציין מה' },
];

export default function QueueJoin() {
  const urlParams = new URLSearchParams(window.location.search);
  const entryId = urlParams.get('id');

  const [phase, setPhase] = useState(entryId ? 'waiting' : 'register');
  const [showAbandonModal, setShowAbandonModal] = useState(false);
  const [abandonReason, setAbandonReason] = useState('');
  const [abandonOther, setAbandonOther] = useState('');
  const [abandonLoading, setAbandonLoading] = useState(false);
  const [form, setForm] = useState({ customer_name: '', phone: '', party_size: 2 });
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState(null);
  const [queuePosition, setQueuePosition] = useState(null);
  const [estimatedWait, setEstimatedWait] = useState(null);
  const [error, setError] = useState('');
  const [waitMinutes, setWaitMinutes] = useState(0);
  const [callSecondsLeft, setCallSecondsLeft] = useState(null);
  const callTimerRef = useRef(null);

  // רענון אוטומטי כל 10 שניות
  useEffect(() => {
    if (!entryId) return;

    const fetchStatus = async () => {
      const all = await base44.entities.QueueEntry.list('-timestamp_register', 300);
      const found = all.find(e => e.id === entryId);
      if (!found) return;
      setEntry(found);

      if (found.status === 'seated' || found.status === 'abandoned') {
        setPhase('done');
        return;
      }

      // מיקום בתור
      const activeQueue = all
        .filter(e => e.status === 'active')
        .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
      const pos = activeQueue.findIndex(e => e.id === entryId);
      setQueuePosition(pos >= 0 ? pos + 1 : null);
      setEstimatedWait(pos >= 0 ? pos * 7 : null); // 7 דקות ממוצע לפני כל שולחן

      // זמן המתנה מצטבר
      if (found.timestamp_approved) {
        setWaitMinutes(Math.round((Date.now() - new Date(found.timestamp_approved).getTime()) / 60000));
      }

      // טיימר קריאה למזדמן
      if (found.seat_called_at) {
        const elapsed = Math.floor((Date.now() - new Date(found.seat_called_at).getTime()) / 1000);
        const left = Math.max(0, 180 - elapsed);
        setCallSecondsLeft(left);
        // הפעל טיימר חי אם עדיין רץ
        if (callTimerRef.current) clearInterval(callTimerRef.current);
        if (left > 0) {
          callTimerRef.current = setInterval(() => {
            setCallSecondsLeft(prev => {
              if (prev <= 1) { clearInterval(callTimerRef.current); return 0; }
              return prev - 1;
            });
          }, 1000);
        }
      } else {
        setCallSecondsLeft(null);
        if (callTimerRef.current) clearInterval(callTimerRef.current);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => {
      clearInterval(interval);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [entryId]);

  // טיק-טוק עדכון זמן מצטבר בלייב
  useEffect(() => {
    if (!entry?.timestamp_approved) return;
    const tick = setInterval(() => {
      setWaitMinutes(Math.round((Date.now() - new Date(entry.timestamp_approved).getTime()) / 60000));
    }, 30000);
    return () => clearInterval(tick);
  }, [entry?.timestamp_approved]);

  const handleRegister = async () => {
    if (!form.customer_name.trim() || !form.phone.trim()) {
      setError('נא למלא שם ומספר טלפון');
      return;
    }
    setLoading(true);
    setError('');

    const maxOrder = 9999;
    const newEntry = await base44.entities.QueueEntry.create({
      customer_name: form.customer_name.trim(),
      phone: form.phone.trim(),
      party_size: parseInt(form.party_size),
      status: 'pending',
      timestamp_register: new Date().toISOString(),
      sort_order: maxOrder,
    });

    // סנכרון ל-CRM
    try {
      const existing = await base44.entities.Customer.filter({ phone: form.phone.trim() });
      if (existing.length === 0) {
        await base44.entities.Customer.create({
          full_name: form.customer_name.trim(),
          phone: form.phone.trim(),
          source: 'queue_qr',
        });
      }
    } catch (_) {}

    // רישום Push בלי לחסום את הניווט
    registerPushAndSave(newEntry.id).catch(() => {});

    setLoading(false);
    window.location.href = `/QueueJoin?id=${newEntry.id}`;
  };

  // ========== דף הרשמה ==========
  if (phase === 'register') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)' }} dir="rtl">
        {/* לוגו */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🍽️</div>
          <h1 className="text-3xl font-black text-white tracking-wide">עלינא</h1>
          <p className="text-emerald-300 text-sm mt-1">הצטרפו לתור שלנו</p>
        </div>

        {/* כרטיסית */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
          <h2 className="text-xl font-black text-gray-800 mb-6 text-center">פרטי הרשמה</h2>

          <div className="space-y-5">
            {/* שם */}
            <div>
              <label className="text-sm font-bold text-gray-600 block mb-1.5">👤 שם מלא</label>
              <input
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="הכנס שם מלא"
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
              />
            </div>

            {/* טלפון */}
            <div>
              <label className="text-sm font-bold text-gray-600 block mb-1.5">📱 מספר טלפון</label>
              <input
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-emerald-500 transition-colors"
                placeholder="050-0000000"
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && handleRegister()}
              />
            </div>

            {/* כמות סועדים */}
            <div>
              <label className="text-sm font-bold text-gray-600 block mb-2">🍴 כמות סועדים</label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                  <button
                    key={n}
                    onClick={() => setForm({ ...form, party_size: n })}
                    className={`py-3 rounded-xl font-bold text-lg transition-all ${
                      form.party_size === n
                        ? 'bg-emerald-600 text-white shadow-md scale-105'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {n === 8 ? '8+' : n}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}

            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-4 rounded-2xl text-lg transition-all disabled:opacity-50 shadow-lg mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  מצטרף לתור...
                </span>
              ) : '✅ הצטרף לתור'}
            </button>
          </div>
        </div>

        <p className="text-emerald-400 text-xs mt-6">© מסעדת עלינא</p>
      </div>
    );
  }

  // ========== דף סיום ==========
  if (phase === 'done') {
    const isSeated = entry?.status === 'seated';
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)' }} dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-sm text-center">
          <div className="text-7xl mb-4 animate-bounce">{isSeated ? '🎉' : '👋'}</div>
          <h2 className="text-2xl font-black text-gray-800 mb-3">
            {isSeated ? 'בתיאבון!' : 'להתראות!'}
          </h2>
          <p className="text-gray-500 leading-relaxed">
            {isSeated
              ? 'שולחן מוכן בשבילכם! תהנו מארוחה נפלאה במסעדת עלינא 🍽️'
              : 'תודה שביקרתם. נשמח לראותכם שוב בקרוב! 💚'}
          </p>
          {isSeated && (
            <div className="mt-6 bg-emerald-50 rounded-2xl p-4 border border-emerald-200">
              <p className="text-emerald-700 font-bold text-sm">הצוות שלנו ממתין לכם 🌟</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== דף המתנה ==========
  const isPending = entry?.status === 'pending';
  const isActive = entry?.status === 'active';

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-8 p-4" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)' }} dir="rtl">
      {/* לוגו */}
      <div className="text-center mb-6">
        <div className="text-4xl mb-1">🍽️</div>
        <h1 className="text-2xl font-black text-white">עלינא</h1>
      </div>

      {/* כרטיס ראשי */}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* כותרת */}
        <div className={`p-6 text-white text-center ${isPending ? 'bg-amber-500' : 'bg-emerald-600'}`}>
          <p className="font-black text-2xl">{entry?.customer_name || ''}</p>
          <p className="text-sm opacity-80 mt-1">{entry?.party_size} סועדים</p>
        </div>

        <div className="p-6 space-y-4">

          {/* סטטוס */}
          {isPending && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 text-center">
              <div className="text-3xl mb-2">⏳</div>
              <p className="font-black text-amber-800 text-lg">ממתין לאישור המארחת</p>
              <p className="text-amber-600 text-sm mt-1">המארחת תאשר את נוכחותך בקרוב</p>
            </div>
          )}

          {/* טיימר קריאה למזדמן */}
          {isActive && callSecondsLeft !== null && (
            <div className={`rounded-2xl p-5 text-center border-2 ${
              callSecondsLeft === 0
                ? 'bg-red-50 border-red-400 animate-pulse'
                : callSecondsLeft <= 60
                ? 'bg-orange-50 border-orange-400'
                : 'bg-green-50 border-green-400'
            }`}>
              <div className="text-4xl mb-2">{callSecondsLeft === 0 ? '❌' : '🔔'}</div>
              <p className={`font-black text-xl mb-1 ${
                callSecondsLeft === 0 ? 'text-red-700' : callSecondsLeft <= 60 ? 'text-orange-700' : 'text-green-700'
              }`}>
                {callSecondsLeft === 0 ? 'הזמן עבר!' : 'השולחן שלכם מוכן!'}
              </p>
              {callSecondsLeft > 0 && (
                <>
                  <p className={`text-5xl font-black mb-2 ${callSecondsLeft <= 60 ? 'text-orange-600' : 'text-green-600'}`}>
                    {Math.floor(callSecondsLeft / 60)}:{String(callSecondsLeft % 60).padStart(2, '0')}
                  </p>
                  <p className="text-sm text-gray-500 mb-4">גשו למארחת — יש לכם {Math.ceil(callSecondsLeft / 60)} דקות!</p>
                  <button
                    onClick={async () => {
                      await base44.entities.QueueEntry.update(entryId, {
                        status: 'seated',
                        timestamp_end: new Date().toISOString(),
                        timestamp_seated: new Date().toISOString(),
                        seat_called_at: null,
                      });
                      setPhase('done');
                    }}
                    className="w-full bg-green-500 hover:bg-green-600 active:scale-95 text-white font-black py-4 rounded-2xl text-xl transition-all shadow-lg"
                  >
                    ✅ הגעתי למארחת!
                  </button>
                </>
              )}
              {callSecondsLeft === 0 && (
                <p className="text-red-600 text-sm font-medium">הצוות עבר ללקוח הבא 😔</p>
              )}
            </div>
          )}

          {isActive && (
            <>
              {/* הודעת קבלת פנים */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                <p className="text-emerald-800 text-sm leading-relaxed font-medium text-center">
                  🌟 איזה כיף שבאתם אלינו!<br/>
                  <span className="text-xs text-emerald-600 font-normal">
                    אנו מתייחסים בתור רק לאנשים הנמצאים כאן.
                    במידה ותעזבו, המארחת תסיר אתכם מהרשימה.
                  </span>
                </p>
              </div>

              {/* מיקום + זמן */}
              {queuePosition != null && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
                    <p className="text-blue-800 font-black text-4xl">{queuePosition}</p>
                    <p className="text-blue-600 text-xs mt-1 font-medium">מקום בתור</p>
                  </div>
                  {estimatedWait != null && (
                    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-center">
                      <p className="text-purple-800 font-black text-4xl">~{estimatedWait}</p>
                      <p className="text-purple-600 text-xs mt-1 font-medium">דקות המתנה</p>
                    </div>
                  )}
                </div>
              )}

              {queuePosition === 1 && (
                <div className="bg-green-50 border-2 border-green-400 rounded-2xl p-3 text-center animate-pulse">
                  <p className="text-green-700 font-black">🎯 אתם הבאים בתור!</p>
                </div>
              )}

              {/* זמן המתנה מצטבר */}
              {entry?.timestamp_approved && (
                <div className="text-center">
                  <p className="text-gray-400 text-xs">ממתינים {waitMinutes} דקות</p>
                </div>
              )}
            </>
          )}

          {/* כפתור משחק */}
          {isActive && !callSecondsLeft && (
            <div className="text-center pt-1">
              <a
                href={`/QueueGame?entry=${entryId}&name=${encodeURIComponent(entry?.customer_name || 'אורח')}`}
                className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 active:scale-95 text-white font-black py-3.5 rounded-2xl text-base transition-all shadow-lg"
              >
                🎮 שחק עם שאר הממתינים!
              </a>
              <p className="text-gray-400 text-xs mt-1.5">טריוויה על המסעדה · תוצאות לייב</p>
            </div>
          )}

          {/* רענון אוטומטי */}
          <div className="text-center pt-2">
            <p className="text-gray-300 text-xs">📡 מתרענן אוטומטית כל 10 שניות</p>
          </div>

          {/* כפתור ויתרתי */}
          {!callSecondsLeft && <div className="border-t border-gray-100 pt-4">
            <button
              onClick={() => setShowAbandonModal(true)}
              className="w-full border-2 border-red-200 text-red-400 hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition-all rounded-2xl py-3 text-sm font-semibold"
            >
              😔 ויתרתי על התור
            </button>
          </div>}
        </div>
      </div>

      {/* מודאל נטישה */}
      {showAbandonModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl mb-4">
            <h3 className="text-lg font-black text-gray-800 mb-1 text-center">עוזבים אותנו? 😢</h3>
            <p className="text-gray-400 text-sm text-center mb-5">ספרו לנו למה — נשתפר בשבילכם</p>

            <div className="space-y-2 mb-4">
              {ABANDON_REASONS.map(r => (
                <button
                  key={r.id}
                  onClick={() => setAbandonReason(r.id)}
                  className={`w-full text-right px-4 py-3 rounded-2xl border-2 font-medium text-sm transition-all ${
                    abandonReason === r.id
                      ? 'border-red-400 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {abandonReason === 'other' && (
              <textarea
                className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-red-300 resize-none mb-4"
                rows={2}
                placeholder="ספר לנו מה..."
                value={abandonOther}
                onChange={e => setAbandonOther(e.target.value)}
              />
            )}

            <button
              disabled={!abandonReason || abandonLoading}
              onClick={async () => {
                setAbandonLoading(true);
                const reason = abandonReason === 'other'
                  ? `אחר: ${abandonOther}`
                  : ABANDON_REASONS.find(r => r.id === abandonReason)?.label;
                await base44.entities.QueueEntry.update(entryId, {
                  status: 'abandoned',
                  timestamp_end: new Date().toISOString(),
                  notes: reason,
                });
                setAbandonLoading(false);
                setShowAbandonModal(false);
                setPhase('done');
              }}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-black py-3.5 rounded-2xl text-base transition-all"
            >
              {abandonLoading ? 'שומר...' : 'אישור — עוזב את התור'}
            </button>

            <button
              onClick={() => { setShowAbandonModal(false); setAbandonReason(''); setAbandonOther(''); }}
              className="w-full text-gray-400 text-sm mt-3 py-2 hover:text-gray-600 transition-colors"
            >
              ← בעצם נשאר 😊
            </button>
          </div>
        </div>
      )}

      <p className="text-emerald-400 text-xs mt-6">© מסעדת עלינא</p>
    </div>
  );
}