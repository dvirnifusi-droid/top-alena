import React, { useEffect, useState } from 'react';

// Day-aware banner for PublicReservation. Mirrors the alena-website
// /reserve experience but lives inside the topalena PublicReservation flow.
// Tones: 'warm' (olive panel), 'calm' (cream), 'alert' (terracotta).

function pickHint(now) {
  const day = now.getDay();
  const hour = now.getHours();

  if (day === 5) {
    return { eyebrow: 'שישי', title: 'סגורים היום', body: 'פותחים מוצ״ש מ-20:15 עד הלקוח האחרון.', tone: 'calm' };
  }
  if (day === 6) {
    if (hour < 20) return { eyebrow: 'שבת', title: 'פותחים מ-20:15', body: 'מוצ״ש בעלינא — האווירה הכי גבוהה של השבוע.', tone: 'warm' };
    return { eyebrow: 'מוצ״ש', title: 'פתוחים עד הלקוח האחרון', body: 'נשאר מקום אם תהיו זריזים.', tone: 'warm' };
  }
  if (day === 0) {
    if (hour < 18) return { eyebrow: 'הערב', title: 'Burger Night 🍔', body: 'ספיישלים שלא בתפריט הרגיל, מ-220 גרם בקר טרי.', tone: 'warm' };
    return { eyebrow: 'ממש עכשיו', title: 'Burger Night בעיצומו 🔥', body: 'המקום מתמלא — אם רוצים שולחן הערב, הזמינו מיד.', tone: 'alert' };
  }
  if (day === 1) {
    if (hour < 18) return { eyebrow: 'הערב', title: 'ערב יין ללא תחתית 🍷', body: 'כוסות מ-₪61, יין נמזג ברצף עד הסגירה.', tone: 'warm' };
    return { eyebrow: 'ממש עכשיו', title: 'ערב יין — כוסות זורמות 🍷', body: 'הסומליה בבר. נשאר מקום אם תהיו זריזים.', tone: 'alert' };
  }
  if (day === 2) {
    if (hour < 18) return { eyebrow: 'הערב', title: 'Butcher Night 🥩', body: 'נתחי הפתעה ומנות שף חד-פעמיות, ישר מהקצב.', tone: 'warm' };
    return { eyebrow: 'הלילה', title: 'Butcher Night — נתחים שאוזלים', body: 'אם רוצים משהו ספציפי, מומלץ להזמין מיד.', tone: 'alert' };
  }
  if (day === 3) {
    return { eyebrow: 'הערב', title: 'ערב קלאסי בעלינא', body: 'התפריט המלא, השף בעבודה, וקוקטיילי הבית במיטבם.', tone: 'calm' };
  }
  if (day === 4) {
    if (hour < 18) return { eyebrow: 'הערב', title: 'חמישי — האווירה בשיא 🔥', body: 'פתוחים עד 02:00. הזמינו לשעה מאוחרת ותפסו מקום על הבר.', tone: 'warm' };
    return { eyebrow: 'ממש עכשיו', title: 'חמישי בעיצומו', body: 'הצוות בכושר. עוד פתוחים — הזמינו מקום.', tone: 'alert' };
  }
  return { eyebrow: 'ברוכים הבאים', title: 'הזמינו שולחן בעלינא', body: 'ערב ים-תיכוני אמיתי מחכה.', tone: 'calm' };
}

const TONES = {
  warm:  { bg: 'linear-gradient(135deg, #44512C 0%, #44512C 60%, #1F1B17 100%)', text: '#F4ECD8', eyebrow: '#D9BD83' },
  calm:  { bg: '#FAF5E8', text: '#1F1B17', eyebrow: '#B89556' },
  alert: { bg: 'linear-gradient(135deg, #A04A2E 0%, #A04A2E 60%, #8B3D24 100%)', text: '#F4ECD8', eyebrow: '#D9BD83' },
};

export default function SmartReserveBanner() {
  const [hint, setHint] = useState(null);
  useEffect(() => {
    setHint(pickHint(new Date()));
    const t = setInterval(() => setHint(pickHint(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!hint) return null;
  const s = TONES[hint.tone];
  return (
    <div
      dir="rtl"
      style={{ background: s.bg, color: s.text }}
      className="rounded-2xl p-5 md:p-6 shadow-lg ring-1 ring-black/5"
    >
      <p className="text-[11px] uppercase font-bold tracking-[0.25em]" style={{ color: s.eyebrow }}>
        {hint.eyebrow}
      </p>
      <h2
        className="mt-1.5 text-2xl md:text-3xl leading-tight"
        style={{ fontFamily: '"Frank Ruhl Libre", serif', fontWeight: 900 }}
      >
        {hint.title}
      </h2>
      <p className="mt-1.5 text-sm md:text-base opacity-90">{hint.body}</p>
    </div>
  );
}
