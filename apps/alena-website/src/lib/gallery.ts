// Static gallery manifest — curated owner photos in /public/gallery/.
// Two sources: 6 originals owner uploaded to chat, plus 9 food shots
// processed from the Drive folder via scripts/process-gallery.mjs.
// Later all of this can move to Sanity for self-service editing.

export type GalleryPhoto = {
  src: string;
  alt: string;
  category: "אוכל" | "ברים" | "אורחים" | "מטבח" | "אווירה";
  featured?: boolean; // shown in the home InstagramStrip
  hero?: boolean; // optional single hero pick
};

export const galleryPhotos: GalleryPhoto[] = [
  // FOOD — the new hero direction. Burger leads.
  {
    src: "/gallery/burger-hero.jpg",
    alt: "המבורגר עלינא עם בצל מקורמל ולחמנייה ביתית",
    category: "אוכל",
    featured: true,
    hero: true,
  },
  {
    src: "/gallery/spread.jpg",
    alt: "סלט עגבניות, פוקצ'ה וקרפצ'יו על השולחן",
    category: "אוכל",
    featured: true,
  },
  {
    src: "/gallery/carpaccio.jpg",
    alt: "קרפצ'יו בקר עם רוקט, צנונית וקוקטייל",
    category: "אוכל",
    featured: true,
  },
  {
    src: "/gallery/fries-dip.jpg",
    alt: "צ'יפס בית טבול ברוטב הבית",
    category: "אוכל",
    featured: true,
  },
  {
    src: "/gallery/burger-1.jpg",
    alt: "המבורגר עלינא — חיתוך קלאסי",
    category: "אוכל",
    featured: true,
  },
  // BARS / COCKTAILS — owner's originals
  {
    src: "/gallery/IMG_6904.JPG",
    alt: "קוקטיילים אדומים בבר של עלינא",
    category: "ברים",
    featured: true,
  },
  {
    src: "/gallery/IMG_4682.JPG",
    alt: "מזיגת קוקטייל אחרי קוקטייל בבר",
    category: "ברים",
    featured: true,
  },
  // ATMOSPHERE / KITCHEN
  {
    src: "/gallery/IMG_6785.JPG",
    alt: "טבח בעבודה במטבח עלינא",
    category: "מטבח",
    featured: true,
  },
  // GUESTS
  {
    src: "/gallery/IMG_6892.JPG",
    alt: "אורחות נהנות בעלינא",
    category: "אורחים",
  },
  {
    src: "/gallery/IMG_6770.JPG",
    alt: "זוג אורחים על רקע קיר הגרפיטי",
    category: "אורחים",
  },
  {
    src: "/gallery/IMG_6829.JPG",
    alt: "חברים נהנים בארוחה",
    category: "אורחים",
  },
  // EXTRAS
  {
    src: "/gallery/spread-2.jpg",
    alt: "השולחן המלא — סלט, צ'יפס וקרפצ'יו",
    category: "אוכל",
  },
  {
    src: "/gallery/carpaccio-2.jpg",
    alt: "קרפצ'יו במבט קרוב",
    category: "אוכל",
  },
  {
    src: "/gallery/burger-2.jpg",
    alt: "המבורגר עלינא — זווית שנייה",
    category: "אוכל",
  },
  {
    src: "/gallery/fries-side.jpg",
    alt: "צ'יפס בקופסה מתכת עם רוטב הבית",
    category: "אוכל",
  },
];

export const heroPhoto = galleryPhotos.find((p) => p.hero) ?? galleryPhotos[0];
export const featuredPhotos = galleryPhotos.filter((p) => p.featured);
