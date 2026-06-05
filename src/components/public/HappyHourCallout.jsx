import React from 'react';

// Inline Happy Hour reminder for the booking form. Pass the picked time as
// "HH:mm" — appears only when the selected time falls before 20:00 on Sun-Thu.
export default function HappyHourCallout({ time, dateObj }) {
  if (!time || !dateObj) return null;
  const day = dateObj.getDay();
  if (day === 5 || day === 6) return null; // Fri closed, Sat evening only
  const [hh] = String(time).split(':');
  const h = Number(hh);
  if (!Number.isFinite(h) || h >= 20) return null;
  return (
    <div
      className="rounded-xl border-2 border-dashed p-3 text-center text-sm"
      style={{ borderColor: '#B89556', background: 'rgba(184, 149, 86, 0.10)' }}
    >
      <p className="text-[10px] uppercase font-bold tracking-[0.25em]" style={{ color: '#B89556' }}>
        Happy Hour פעיל
      </p>
      <p className="mt-1 font-bold" style={{ color: '#1F1B17' }}>
        🎉 40% הנחה על האלכוהול בשעה שבחרת
      </p>
      <p className="mt-0.5 text-xs" style={{ color: 'rgba(31, 27, 23, 0.7)' }}>
        כולל הקוקטיילים. אם אתם באים בקרוב — אתם בזמן.
      </p>
    </div>
  );
}
