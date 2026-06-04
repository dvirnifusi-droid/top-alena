"use client";

import { useEffect, useState } from "react";
import { ReservationCTA } from "@/components/shared/ReservationCTA";

// Theme nights mapped to JS day-of-week (0=Sun ... 6=Sat in JS).
// Friday (5) is closed → skipped. Sat = late motzaei-shabbat opening.
const SCHEDULE = [
  { jsDay: 0, name: "Burger Night 🍔", desc: "המבורגרים ספיישלים שלא בתפריט הרגיל" },
  { jsDay: 1, name: "ערב יין 🍷", desc: "יין ללא תחתית בכוסות החל מ-61 ₪" },
  { jsDay: 2, name: "Butcher Night 🥩", desc: "נתחי הפתעה ומנות שף חד-פעמיות" },
  { jsDay: 3, name: "ערב רגיל ✨", desc: "התפריט המלא + Happy Hour עד 20:00" },
  { jsDay: 4, name: "חמישי בעלינא 🔥", desc: "פתוחים עד 02:00 - האווירה בשיא" },
  { jsDay: 6, name: "מוצ״ש 🌙", desc: "פותחים מ-20:15 עד הלקוח האחרון" },
];

function getNextNight(now: Date) {
  const today = now.getDay();
  // Find the next scheduled day, skipping Friday (5)
  for (let i = 0; i < 7; i++) {
    const dayIdx = (today + i) % 7;
    if (dayIdx === 5) continue; // Friday closed
    const night = SCHEDULE.find((s) => s.jsDay === dayIdx);
    if (night) {
      // For "today", only count it if it's before 20:00
      if (i === 0 && now.getHours() >= 20) continue;
      return { night, daysFromNow: i };
    }
  }
  return null;
}

export function NextNight() {
  const [data, setData] = useState<{
    night: (typeof SCHEDULE)[number];
    daysFromNow: number;
  } | null>(null);

  useEffect(() => {
    setData(getNextNight(new Date()));
    const t = setInterval(() => setData(getNextNight(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!data) return null;
  const label =
    data.daysFromNow === 0 ? "הערב" : data.daysFromNow === 1 ? "מחר" : `בעוד ${data.daysFromNow} ימים`;

  return (
    <section className="relative -mt-1 bg-charcoal py-12 text-cream md:py-16">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass to-transparent" />
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-4 text-center sm:px-6 md:flex-row md:justify-between md:text-right">
        <div className="md:max-w-2xl">
          <p className="text-xs uppercase tracking-[0.35em] text-brass-soft">{label}</p>
          <h3 className="mt-2 font-display text-3xl text-cream md:text-4xl">
            {data.night.name}
          </h3>
          <p className="mt-2 text-cream/80">{data.night.desc}</p>
        </div>
        <ReservationCTA label={data.daysFromNow === 0 ? "תפסו מקום הערב" : "הזמינו עכשיו"} />
      </div>
    </section>
  );
}
