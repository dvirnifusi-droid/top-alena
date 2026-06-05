"use client";

import { useEffect, useState } from "react";

// Show only Sun-Thu, and only when it's currently before 20:00 (the hour
// at which Happy Hour wraps up).
function isHappyHourActive(now: Date): boolean {
  const day = now.getDay();
  const hour = now.getHours();
  if (day === 5 || day === 6) return false; // Fri closed, Sat evening only
  return hour < 20;
}

export function HappyHourCallout() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const check = () => setActive(isHappyHourActive(new Date()));
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  if (!active) return null;

  return (
    <div className="rounded-2xl border-2 border-dashed border-brass bg-brass/10 p-5 text-center">
      <p className="text-xs uppercase tracking-[0.3em] text-brass">Happy Hour פעיל</p>
      <p className="mt-2 font-display text-2xl text-charcoal">
        40% הנחה על האלכוהול עד 20:00
      </p>
      <p className="mt-1 text-sm text-charcoal/70">
        כולל הקוקטיילים. אם אתם באים בקרוב — אתם בזמן.
      </p>
    </div>
  );
}
