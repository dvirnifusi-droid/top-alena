"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { BannerContent } from "@/content/banner";

export function TopBannerClient({ banner }: { banner: BannerContent }) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
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
