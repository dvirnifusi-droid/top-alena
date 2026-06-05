"use client";

import { useEffect, useState } from "react";

type Hint = { eyebrow: string; title: string; body: string; tone: "warm" | "calm" | "alert" };

function pickHint(now: Date): Hint {
  const day = now.getDay();
  const hour = now.getHours();

  // Friday — closed
  if (day === 5) {
    return {
      eyebrow: "שישי",
      title: "סגורים היום",
      body: "פותחים מוצ״ש מ-20:15 עד הלקוח האחרון. הזמינו לערב שבת.",
      tone: "calm",
    };
  }

  // Saturday — motzaei shabbat
  if (day === 6) {
    if (hour < 20) {
      return {
        eyebrow: "שבת",
        title: "פותחים מ-20:15",
        body: "מוצ״ש בעלינא — האווירה הכי גבוהה של השבוע. הזמינו לשעות מאוחרות.",
        tone: "warm",
      };
    }
    return {
      eyebrow: "מוצ״ש",
      title: "פתוחים עד הלקוח האחרון",
      body: "האווירה בשיא. נשאר מקום אם תהיו זריזים.",
      tone: "warm",
    };
  }

  // Sunday — Burger Night
  if (day === 0) {
    if (hour < 18) {
      return {
        eyebrow: "הערב",
        title: "Burger Night 🍔",
        body: "ספיישלים שלא בתפריט הרגיל, מ-220 גרם בקר טרי. בערב ראשון תפסו מקום מראש.",
        tone: "warm",
      };
    }
    return {
      eyebrow: "ממש עכשיו",
      title: "Burger Night בעיצומו 🔥",
      body: "המקום מתמלא — אם אתם רוצים שולחן הערב, הזמינו מיד.",
      tone: "alert",
    };
  }

  // Monday — Wine Night
  if (day === 1) {
    if (hour < 18) {
      return {
        eyebrow: "הערב",
        title: "ערב יין ללא תחתית 🍷",
        body: "כוסות מ-₪61, יין נמזג ברצף עד הסגירה. שולחנות מתמלאים מהר.",
        tone: "warm",
      };
    }
    return {
      eyebrow: "ממש עכשיו",
      title: "ערב יין — כוסות זורמות 🍷",
      body: "הסומליה בבר. נשאר מקום אם תהיו זריזים.",
      tone: "alert",
    };
  }

  // Tuesday — Butcher Night
  if (day === 2) {
    if (hour < 18) {
      return {
        eyebrow: "הערב",
        title: "Butcher Night 🥩",
        body: "נתחי הפתעה ומנות שף חד-פעמיות, ישר מהקצב שלנו. ערב לחובבי בשר.",
        tone: "warm",
      };
    }
    return {
      eyebrow: "הלילה",
      title: "Butcher Night — נתחים שאוזלים",
      body: "אם יש משהו ספציפי שאתם רוצים, מומלץ להזמין מיד.",
      tone: "alert",
    };
  }

  // Wednesday + Thursday
  if (day === 3) {
    return {
      eyebrow: "הערב",
      title: "ערב קלאסי בעלינא",
      body: "התפריט המלא, השף בעבודה, וקוקטיילי הבית במיטבם. הזמינו ובואו.",
      tone: "calm",
    };
  }

  if (day === 4) {
    if (hour < 18) {
      return {
        eyebrow: "הערב",
        title: "חמישי — האווירה בשיא 🔥",
        body: "פתוחים עד 02:00. הזמינו לשעה מאוחרת ותפסו מקום על הבר.",
        tone: "warm",
      };
    }
    return {
      eyebrow: "ממש עכשיו",
      title: "חמישי בעיצומו",
      body: "המקום מלא, הצוות בכושר. עוד פתוחים — הזמינו מקום.",
      tone: "alert",
    };
  }

  return {
    eyebrow: "ברוכים הבאים",
    title: "הזמינו שולחן בעלינא",
    body: "ערב ים-תיכוני אמיתי מחכה.",
    tone: "calm",
  };
}

const TONE_STYLES = {
  warm: "from-olive via-olive to-charcoal text-cream ring-brass/30",
  calm: "from-cream-soft via-cream-soft to-cream text-charcoal ring-brass/20",
  alert: "from-terracotta via-terracotta to-terracotta-600 text-cream ring-brass/40",
};

export function SmartReserveBanner() {
  const [hint, setHint] = useState<Hint | null>(null);

  useEffect(() => {
    setHint(pickHint(new Date()));
    const t = setInterval(() => setHint(pickHint(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!hint) return null;

  return (
    <div
      className={`rounded-3xl bg-gradient-to-bl p-6 ring-1 shadow-xl shadow-charcoal/10 md:p-8 ${TONE_STYLES[hint.tone]}`}
    >
      <p className="text-xs uppercase tracking-[0.3em] opacity-80">{hint.eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl leading-tight md:text-4xl">{hint.title}</h2>
      <p className="mt-2 opacity-90">{hint.body}</p>
    </div>
  );
}
