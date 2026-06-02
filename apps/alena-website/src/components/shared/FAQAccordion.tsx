"use client";

import { useState } from "react";

export function FAQAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="divide-y divide-charcoal/10 rounded-2xl border border-charcoal/10 bg-cream">
      {items.map((it, i) => (
        <details
          key={i}
          open={open === i}
          onToggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open) setOpen(i);
          }}
          className="group p-4"
        >
          <summary className="cursor-pointer list-none font-semibold">{it.q}</summary>
          <p className="mt-2 text-charcoal/75">{it.a}</p>
        </details>
      ))}
    </div>
  );
}
