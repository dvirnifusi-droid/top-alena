"use client";

import { useState } from "react";
import { X } from "lucide-react";

// Owner-tunable announcement banner. Edit `banner.ts` to update copy.
import { activeBanner } from "@/content/banner";

export function TopBanner() {
  const [closed, setClosed] = useState(false);
  if (!activeBanner || closed) return null;
  return (
    <div className="relative z-50 bg-terracotta text-cream">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 text-sm sm:px-6">
        <a
          href={activeBanner.href}
          target={activeBanner.href.startsWith("http") ? "_blank" : undefined}
          rel="noopener"
          className="flex-1 text-center font-medium tracking-wide hover:underline"
        >
          {activeBanner.message}
          <span className="ms-2 font-bold underline">{activeBanner.cta} ←</span>
        </a>
        <button
          aria-label="סגור"
          onClick={() => setClosed(true)}
          className="shrink-0 rounded-full p-1 hover:bg-cream/15"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
