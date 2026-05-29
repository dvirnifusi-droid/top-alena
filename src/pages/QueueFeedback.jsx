import React, { useState, useEffect } from 'react';
import { invokePublic } from '@/lib/publicFetch';

const GOOGLE_MAPS_URL = 'https://g.page/r/YOUR_GOOGLE_PLACE_ID/review'; // ← עדכן כאן

export default function QueueFeedback() {
  const urlParams = new URLSearchParams(window.location.search);
  const entryId = urlParams.get('id');

  const [entry, setEntry] = useState(null);
  const [rating, setRating] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entryId) { setLoading(false); return; }
    invokePublic('getQueueEntry', { entryId })
      .then(res => setEntry(res?.entry || null))
      .catch(() => setEntry(null))
      .finally(() => setLoading(false));
  }, [entryId]);

  const submitRating = async (stars) => {
    setRating(stars);
    await invokePublic('updateQueueEntry', { entryId, data: { feedback_rating: stars } });

    // אם דירוג גבוה - הפנה ל-Google Maps
    if (stars === 5) {
      setTimeout(() => { window.open(GOOGLE_MAPS_URL, '_blank'); }, 1500);
    }

    // אם דירוג נמוך - שלח push/התראה למנהל (נשמר ב-DB, המנהל רואה בדאשבורד)
    setSubmitted(true);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)' }}>
      <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-5" style={{ background: 'linear-gradient(135deg, #064e3b 0%, #065f46 100%)' }} dir="rtl">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm text-center">
        {!submitted ? (
          <>
            <div className="text-5xl mb-4">🍽️</div>
            <h2 className="text-2xl font-black text-gray-800 mb-2">נהניתם בעלינא?</h2>
            {entry && <p className="text-gray-400 text-sm mb-6">שלום {entry.customer_name}! איך הייתה החוויה?</p>}

            <p className="font-bold text-gray-600 mb-4">דרגו אותנו:</p>
            <div className="flex justify-center gap-3 mb-6">
              {[1,2,3,4,5].map(s => (
                <button
                  key={s}
                  onClick={() => submitRating(s)}
                  className="text-5xl transition-transform active:scale-90 hover:scale-110"
                >
                  {s <= (rating || 0) ? '⭐' : '☆'}
                </button>
              ))}
            </div>

            <div className="flex justify-center gap-4">
              {[
                { emoji: '😠', val: 1 }, { emoji: '😕', val: 2 }, { emoji: '😐', val: 3 },
                { emoji: '😊', val: 4 }, { emoji: '🤩', val: 5 }
              ].map(({ emoji, val }) => (
                <button key={val} onClick={() => submitRating(val)} className="text-4xl transition-transform active:scale-90 hover:scale-110">
                  {emoji}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-6xl mb-4 animate-bounce">{rating >= 4 ? '🎉' : rating >= 3 ? '🙏' : '💙'}</div>
            <h2 className="text-2xl font-black text-gray-800 mb-2">תודה על הפידבק!</h2>
            {rating === 5 && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mt-4">
                <p className="text-green-700 font-bold text-sm">😍 שמחנו לשמוע!</p>
                <p className="text-green-600 text-xs mt-1">מפנים אתכם לדף הביקורות שלנו בגוגל...</p>
              </div>
            )}
            {rating <= 2 && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mt-4">
                <p className="text-orange-700 font-bold text-sm">💛 מצטערים על חוות הדעת</p>
                <p className="text-orange-600 text-xs mt-1">ההנהלה תיצור קשר בקרוב לטפל בנושא.</p>
              </div>
            )}
          </>
        )}
      </div>
      <p className="text-emerald-400 text-xs mt-6">© מסעדת עלינא</p>
    </div>
  );
}