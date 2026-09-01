import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

export default function ReviewDashboard({ data, onSaved }) {
  const cur = data?.current || {};
  const [rating, setRating] = useState(cur.rating ?? '');
  const [count, setCount] = useState(cur.count ?? '');
  const [saving, setSaving] = useState(false);
  const t = data?.tracking || {};
  const toNext = data?.to_next;

  const save = async () => {
    setSaving(true);
    try {
      await base44.functions.setReviewCurrentStats({ rating: Number(rating), count: Number(count) });
      onSaved && onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4 bg-white">
        <div className="text-sm text-gray-500 mb-2">הדירוג הנוכחי בגוגל (עדכן ידנית עד שיהיה חיבור API)</div>
        <div className="flex gap-2 items-end flex-wrap">
          <label className="text-sm">דירוג
            <input type="number" step="0.1" min="0" max="5" value={rating}
              onChange={(e) => setRating(e.target.value)} className="border rounded px-2 py-1 w-24 block" />
          </label>
          <label className="text-sm">מס׳ ביקורות
            <input type="number" min="0" value={count}
              onChange={(e) => setCount(e.target.value)} className="border rounded px-2 py-1 w-28 block" />
          </label>
          <button onClick={save} disabled={saving} className="bg-emerald-600 text-white rounded px-3 py-1">שמור</button>
        </div>
      </div>

      {toNext && (
        <div className="rounded-xl border p-4 bg-emerald-50">
          <div className="text-lg font-semibold">כדי להגיע ל-{toNext.target}⭐ צריך עוד ~{toNext.reviews} ביקורות 5⭐</div>
          {Array.isArray(data.milestones) && (
            <ul className="text-sm text-gray-600 mt-2 space-y-0.5">
              {data.milestones.slice(0, 4).map((m) => (
                <li key={m.target}>ל-{m.target}⭐ → ~{m.reviews} ביקורות</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="סריקות (30 יום)" value={t.scans} />
        <Stat label="השלימו סקר" value={t.completed} />
        <Stat label="הופנו לגוגל" value={t.sent_to_google} />
        <Stat label="דירוג ממוצע בסקר" value={t.avg_rating} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border p-3 bg-white text-center">
      <div className="text-2xl font-bold">{value ?? '—'}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
