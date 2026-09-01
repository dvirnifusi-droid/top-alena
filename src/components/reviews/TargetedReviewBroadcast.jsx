import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const DEFAULT_MSG = 'היי {name}! תודה שביקרת אצלנו בעלינא 🙏 נשמח מאוד אם תשאיר/י לנו ביקורת בגוגל, זה עוזר לנו המון: ';

export default function TargetedReviewBroadcast({ reviewLink }) {
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState(DEFAULT_MSG + reviewLink);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const doPreview = async () => {
    setBusy(true); setResult(null); setError(null); setPreview(null);
    try {
      const res = await base44.functions.previewReviewAudienceByDate({ date });
      setPreview(res.data);
    } catch (e) {
      setError(e?.message || 'שגיאה בבדיקת הנמענים');
    } finally { setBusy(false); }
  };

  const doSend = async () => {
    if (!preview?.customer_ids?.length) return;
    if (!window.confirm(`לשלוח בקשת ביקורת ל-${preview.count} לקוחות מרוצים?`)) return;
    setBusy(true); setError(null);
    try {
      const res = await base44.functions.sendCustomerCampaign({
        segment: 'manual',
        custom_filter: { customer_ids: preview.customer_ids },
        message_template: msg,
        channel: 'whatsapp',
        campaign_key: 'review_request',
        campaign_label: `בקשת ביקורת - ${date}`,
      });
      setResult(res.data);
      setPreview(null);
    } catch (e) {
      setError(e?.message || 'שגיאה בשליחה');
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border p-4 bg-white space-y-3">
      <div className="font-semibold">🎯 תפוצה ממוקדת לפי תאריך ביקור</div>
      <div className="text-xs text-gray-500">נשלח רק ללקוחות מרוצים עם הסכמת שיווק. שום דבר לא נשלח בלי אישור שלך.</div>
      <div className="flex gap-2 items-end flex-wrap">
        <label className="text-sm">תאריך הביקור/אירוע
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1 block" />
        </label>
        <button onClick={doPreview} disabled={!date || busy} className="bg-gray-800 text-white rounded px-3 py-1">בדוק כמה נמענים</button>
      </div>
      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} className="border rounded w-full px-2 py-1 text-sm" dir="rtl" />

      {error && <div className="rounded-lg bg-red-50 text-red-700 p-2 text-sm">{error}</div>}

      {preview && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm">
          <div>נמצאו <b>{preview.count}</b> לקוחות מרוצים עם הסכמת שיווק{preview.throttled_out ? ` (${preview.throttled_out} דולגו בגלל הגבלת 24 שעות)` : ''}.</div>
          {preview.sample?.length > 0 && (
            <ul className="text-xs text-gray-600 mt-1">{preview.sample.map((c) => <li key={c.id}>{c.name} · {c.phone}</li>)}</ul>
          )}
          <button onClick={doSend} disabled={busy || !preview.count} className="mt-2 bg-emerald-600 text-white rounded px-3 py-1 disabled:opacity-50">
            שלח ל-{preview.count} לקוחות
          </button>
        </div>
      )}

      {result && (
        <div className="rounded-lg bg-blue-50 p-3 text-sm">נשלח: {result.sent} · נכשל: {result.failed} · דולגו: {result.skipped_throttled}</div>
      )}
    </div>
  );
}
