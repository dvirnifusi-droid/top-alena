"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { staticBanner, byDay, defaultBanner, type BannerContent } from "@/content/banner";

function pickBanner(now: Date): BannerContent | null {
  if (staticBanner) return staticBanner;
  return byDay[now.getDay()] ?? defaultBanner;
}

export function TopBanner() {
  const [closed, setClosed] = useState(false);
  const [banner, setBanner] = useState<BannerContent | null>(null);

  useEffect(() => {
    setBanner(pickBanner(new Date()));
    // Re-evaluate every 30 min in case the user lingers across midnight
    const t = setInterval(() => setBanner(pickBanner(new Date())), 1800_000);
    return () => clearInterval(t);
  }, []);

  if (!banner || closed) return null;
  return (
    <div role="region" aria-label="הודעת אתר" className="relative z-50 bg-terracotta text-cream">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 text-sm sm:px-6">
        <a
          href={banner.href}
          target={banner.href.startsWith("http") ? "_blank" : undefined}
          rel="noopener"
          className="flex-1 text-center font-medium tracking-wide hover:underline"
        >
          {banner.message}
          <span className="ms-2 font-bold underline">{banner.cta} ←</span>
        </a>
        <button
          type="button"
          aria-label="סגור הודעה"
          onClick={() => setClosed(true)}
          className="shrink-0 rounded-full p-1 hover:bg-cream/15"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
