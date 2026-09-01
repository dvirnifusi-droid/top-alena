import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const GBP_REPLY_URL = 'https://business.google.com/reviews';

export default function ReviewReplyInbox() {
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  // paste form
  const [rating, setRating] = useState(5);
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.listGoogleReviews({});
      setRows(res.data?.rows || []);
      setPending(res.data?.pending || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!text.trim() && rating >= 4) { /* allow rating-only */ }
    setAdding(true); setError(null);
    try {
      await base44.functions.addGoogleReview({ rating, author: author.trim(), text: text.trim() });
      setAuthor(''); setText(''); setRating(5);
      await load();
    } catch (e) {
      setError(e?.message || 'שגיאה בהוספת הביקורת');
    } finally { setAdding(false); }
  };

  return (
    <div className="rounded-xl border p-4 bg-white space-y-4">
      <div className="font-semibold">💬 תגובות לביקורות {pending > 0 && <span className="text-sm text-amber-600">({pending} ממתינות)</span>}</div>
      <div className="text-xs text-gray-500">הדבק ביקורת מגוגל → ה-AI מנסח תגובה מוכנה → אתה עורך, מעתיק ומפרסם בגוגל. (פרסום בקליק יתווסף כשיאושר ה-API)</div>

      {/* paste form */}
      <div className="rounded-lg border p-3 space-y-2 bg-gray-50">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-sm">דירוג:</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} onClick={() => setRating(n)}
              className={`px-2 py-1 rounded ${rating >= n ? 'text-yellow-500' : 'text-gray-300'}`}>★</button>
          ))}
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="שם הכותב (אופציונלי)"
            className="border rounded px-2 py-1 text-sm flex-1 min-w-[140px]" />
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} dir="rtl"
          placeholder="הדבק כאן את טקסט הביקורת מגוגל…" className="border rounded w-full px-2 py-1 text-sm" />
        <button onClick={add} disabled={adding} className="bg-emerald-600 text-white rounded px-3 py-1 disabled:opacity-50">
          {adding ? 'מנסח תגובה…' : 'שמור ונסח תגובה'}
        </button>
        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>

      {/* list */}
      {loading ? <div className="text-sm text-gray-500">טוען…</div> : (
        <div className="space-y-3">
          {rows.length === 0 && <div className="text-sm text-gray-400">עדיין אין ביקורות. הדבק את הראשונה למעלה.</div>}
          {rows.map((r) => <ReviewCard key={r.id} review={r} onChange={load} />)}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review, onChange }) {
  const [reply, setReply] = useState(review.reply_text || '');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const replied = review.reply_status === 'replied';

  const redraft = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.draftReviewReply({ review_id: review.id });
      setReply(res.data?.reply || reply);
    } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(reply); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  const markReplied = async () => {
    setBusy(true);
    try { await base44.functions.markReviewReplied({ review_id: review.id, reply_text: reply }); await onChange(); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('למחוק את הביקורת מהרשימה?')) return;
    setBusy(true);
    try { await base44.functions.deleteGoogleReview({ review_id: review.id }); await onChange(); }
    finally { setBusy(false); }
  };

  return (
    <div className={`rounded-lg border p-3 ${replied ? 'bg-gray-50 opacity-80' : 'bg-white'}`}>
      <div className="flex justify-between items-center text-sm">
        <div>
          <span className="text-yellow-500">{'★'.repeat(review.rating)}<span className="text-gray-300">{'★'.repeat(5 - review.rating)}</span></span>
          {review.author && <span className="text-gray-600 mr-2"> · {review.author}</span>}
          {replied && <span className="text-emerald-600 mr-2">✓ טופל</span>}
        </div>
        <button onClick={remove} disabled={busy} className="text-gray-400 hover:text-red-500 text-xs">מחק</button>
      </div>
      {review.text && <div className="text-sm text-gray-700 mt-1">{review.text}</div>}

      <div className="mt-2">
        <div className="text-xs text-gray-500 mb-1">תגובה מוצעת:</div>
        <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} dir="rtl"
          className="border rounded w-full px-2 py-1 text-sm" />
        <div className="flex gap-2 mt-2 flex-wrap">
          <button onClick={copy} className="bg-gray-800 text-white rounded px-3 py-1 text-sm">{copied ? 'הועתק ✓' : 'העתק תגובה'}</button>
          <a href={GBP_REPLY_URL} target="_blank" rel="noreferrer" className="bg-blue-600 text-white rounded px-3 py-1 text-sm">פתח בגוגל להשבה</a>
          <button onClick={redraft} disabled={busy} className="border rounded px-3 py-1 text-sm">{busy ? '…' : 'נסח מחדש'}</button>
          {!replied && <button onClick={markReplied} disabled={busy} className="bg-emerald-600 text-white rounded px-3 py-1 text-sm">סמן כטופל</button>}
        </div>
      </div>
    </div>
  );
}
