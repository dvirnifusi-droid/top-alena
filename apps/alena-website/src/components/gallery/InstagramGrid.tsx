"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

type IGItem = {
  id: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  media_url: string;
  permalink: string;
  thumbnail_url?: string;
  caption?: string;
};

export function InstagramGrid() {
  const [items, setItems] = useState<IGItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/instagram")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.data ?? []);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded) return <p className="text-charcoal/60">טוען תמונות...</p>;
  if (!items.length) {
    return (
      <p className="rounded-2xl bg-cream p-6 text-charcoal/70">
        פיד אינסטגרם יתעדכן בקרוב. בינתיים בקרו ב-
        <a className="text-terracotta" href="https://instagram.com/alena.hamara" target="_blank" rel="noopener">
          @alena.hamara
        </a>
        .
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {items.map((it) => (
        <a
          key={it.id}
          href={it.permalink}
          target="_blank"
          rel="noopener"
          className="group relative aspect-square overflow-hidden rounded-xl bg-cream"
        >
          <Image
            src={it.media_type === "VIDEO" ? it.thumbnail_url ?? it.media_url : it.media_url}
            alt={it.caption?.slice(0, 80) ?? "Instagram"}
            fill
            sizes="(min-width:768px) 25vw, 50vw"
            className="object-cover transition group-hover:scale-105"
          />
        </a>
      ))}
    </div>
  );
}
