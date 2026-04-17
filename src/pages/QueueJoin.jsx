import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

// דף ציבורי - הלקוח מגיע דרך QR
export default function QueueJoin() {
  const urlParams = new URLSearchParams(window.location.search);
  const entryId = urlParams.get('id'); // אם יש ID - מצב המתנה

  const [phase, setPhase] = useState(entryId ? 'waiting' : 'register');
  const [form, setForm] = useState({ customer_name: '', phone: '', party_size: 2 });
  const [loading, setLoading] = useState(false);
  const [entry, setEntry] = useState(null);
  const [queuePosition, setQueuePosition] = useState(null);
  const [error, setError] = useState('');
  const [showHidePosition, setShowHidePosition] = useState(true);

  // שליפת נתוני ה-entry בזמן אמת
  useEffect(() => {
    if (!entryId) return;

    const fetchEntry = async () => {
      const activeList = await base44.entities.QueueEntry.list('-sort_order', 200);
      const found = activeList.find(e => e.id === entryId);
      if (found) {
        setEntry(found);
        if (found.status === 'seated' || found.status === 'abandoned') {
          setPhase('done');
          return;
        }
        // חישוב מיקום בתור
        const activeQueue = activeList
          .filter(e => e.status === 'active')
          .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
        const pos = activeQueue.findIndex(e => e.id === entryId);
        setQueuePosition(pos >= 0 ? pos + 1 : null);
      }
    };

    fetchEntry();
    const interval = setInterval(fetchEntry, 10000); // רענון כל 10 שניות
    return () => clearInterval(interval);
  }, [entryId]);

  const handleRegister = async () => {
    if (!form.customer_name || !form.phone) {
      setError('נא למלא שם ומספר טלפון');
      return;
    }
    setLoading(true);
    setError('');

    const now = new Date().toISOString();
    const newEntry = await base44.entities.QueueEntry.create({
      ...form,
      party_size: parseInt(form.party_size),
      status: 'pending',
      timestamp_register: now,
      sort_order: 9999,
    });

    // סנכרון ל-CRM (Customer)
    try {
      const existing = await base44.entities.Customer.filter({ phone: form.phone });
      if (existing.length === 0) {
        await base44.entities.Customer.create({
          full_name: form.customer_name,
          phone: form.phone,
          source: 'queue_qr',
        });
      }
    } catch (e) {
      // CRM sync not critical
    }

    setLoading(false);
    // ניווט לדף ההמתנה עם ה-ID
    window.location.href = `/QueueJoin?id=${newEntry.id}`;
  };

  // --- דף הרשמה ---
  if (phase === 'register') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-700 to-teal-900 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🍽️</div>
            <h1 className="text-2xl font-black text-gray-800">הצטרף לתור</h1>
            <p className="text-gray-500 text-sm mt-1">מסעדת עלינא</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">שם מלא *</label>
              <input
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="הכנס שם מלא"
                value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">מספר טלפון *</label>
              <input
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="050-0000000"
                type="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1">כמות סועדים *</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5, 6].map(n => (
                  <button
                    key={n}
                    onClick={() => setForm({ ...form, party_size: n })}
                    className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all ${
                      form.party_size === n
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  onClick={() => setForm({ ...form, party_size: 7 })}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${
                    form.party_size >= 7
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  7+
                </button>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm text-center">{error}</p>}

            <button
              onClick={handleRegister}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl text-lg transition-all disabled:opacity-50"
            >
              {loading ? '⏳ מצטרף...' : '✅ הצטרף לתור'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- דף ה"סיום" (הוּשב / נטש) ---
  if (phase === 'done') {
    const isSeated = entry?.status === 'seated';
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-700 to-teal-900 flex items-center justify-center p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
          <div className="text-6xl mb-4">{isSeated ? '🎉' : '👋'}</div>
          <h2 className="text-2xl font-black text-gray-800 mb-2">
            {isSeated ? 'בתיאבון!' : 'להתראות!'}
          </h2>
          <p className="text-gray-500">
            {isSeated ? 'תהנו מהארוחה במסעדת עלינא 🍽️' : 'מקווים לראותכם בקרוב!'}
          </p>
        </div>
      </div>
    );
  }

  // --- דף המתנה ---
  const waitMinutes = entry?.timestamp_approved
    ? Math.round((Date.now() - new Date(entry.timestamp_approved).getTime()) / 60000)
    : null;

  const avgWaitPerPerson = 7; // דקות ממוצעות לכל אדם לפני
  const estimatedWait = queuePosition != null ? queuePosition * avgWaitPerPerson : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-700 to-teal-900 flex flex-col items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-2">🍽️</div>
        <h1 className="text-xl font-black text-gray-800 mb-1">מסעדת עלינא</h1>

        {entry?.status === 'pending' ? (
          <div className="mt-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
              <div className="text-3xl mb-2">⏳</div>
              <p className="font-bold text-yellow-800">ממתין לאישור המארחת</p>
              <p className="text-yellow-600 text-sm mt-1">המארחת תאשר את נוכחותך בקרוב</p>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
              <p className="text-emerald-700 font-semibold text-sm">שלום {entry?.customer_name}! 👋</p>
              <p className="text-gray-600 text-sm mt-2">
                איזה כיף שבאתם אלינו! אנו מתייחסים בתור רק לאנשים הנמצאים כאן.
                במידה ותעזבו, המארחת תסיר אתכם מהרשימה.
              </p>
            </div>

            {showHidePosition && queuePosition != null && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-blue-800 font-bold text-3xl">{queuePosition}</p>
                <p className="text-blue-600 text-sm">מקום בתור</p>
                {estimatedWait != null && (
                  <p className="text-blue-500 text-sm mt-1">⏱️ זמן המתנה משוער: ~{estimatedWait} דקות</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-400">
            נרשמת: {entry?.timestamp_register ? new Date(entry.timestamp_register).toLocaleTimeString('he-IL') : ''}
          </p>
        </div>
      </div>
    </div>
  );
}