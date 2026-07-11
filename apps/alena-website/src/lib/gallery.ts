// Static gallery manifest — curated owner photos in /public/gallery/.
// Sources: original owner uploads + KARELA 2026-06-24 shoot in /public/gallery/karela/web/.
// Owner request: no hummus shots, no owner portraits.
// Later all of this can move to Sanity for self-service editing.

export type GalleryPhoto = {
  src: string;
  alt: string;
  category: "אוכל" | "ברים" | "אורחים" | "מטבח" | "אווירה";
  featured?: boolean; // shown in the home InstagramStrip
  hero?: boolean; // optional single hero pick
};

// KARELA photoshoot base path (WebP web-optimised, max 1600px)
const K = "/gallery/karela/web";

export const galleryPhotos: GalleryPhoto[] = [
  // ===== KARELA 2026-06-24 PHOTOSHOOT =====
  // Signature grilled dish — the main food story
  {
    src: `${K}/karela-04859.webp`,
    alt: "מנת החתימה של עלינא — נתח מזוגג, טחינה וסלט ליווי",
    category: "אוכל",
    featured: true,
    hero: true,
  },
  {
    src: `${K}/karela-04899.webp`,
    alt: "מנת החתימה — top view עם רוטב אדום וטחינה",
    category: "אוכל",
    featured: true,
  },
  {
    src: `${K}/karela-04736.webp`,
    alt: "מנת החתימה — זווית פורטרט על קרש עץ",
    category: "אוכל",
  },
  {
    src: `${K}/karela-04745.webp`,
    alt: "מנת החתימה — זווית קרובה",
    category: "אוכל",
  },
  {
    src: `${K}/karela-04899-2.webp`,
    alt: "מנת החתימה — קומפוזיציה שנייה על שולחן העץ",
    category: "אוכל",
  },
  // Extra food
  {
    src: `${K}/karela-05019.webp`,
    alt: "ברוסקטה עם זיתים ולחם ז'ולייני",
    category: "אוכל",
    featured: true,
  },

  // ===== BAR / COCKTAILS =====
  {
    src: `${K}/karela-3.webp`,
    alt: "מזיגת קוקטייל דרמטית — בוקה על רקע בר כהה",
    category: "ברים",
    featured: true,
  },
  {
    src: `${K}/karela-5.webp`,
    alt: "קוקטייל אדום על גזע ארוך על רקע בוקה של בר",
    category: "ברים",
    featured: true,
  },
  {
    src: `${K}/karela-4.webp`,
    alt: "קוקטייל אדום ביד — רגע האמת",
    category: "ברים",
    featured: true,
  },
  {
    src: `${K}/karela-04946.webp`,
    alt: "ברמן בעבודה — מזיגת קוקטייל בבר עלינא",
    category: "ברים",
    featured: true,
  },
  {
    src: `${K}/karela-04951.webp`,
    alt: "ברמן שר עם קוקטייל — אנרגיה בבר",
    category: "ברים",
  },
  {
    src: `${K}/karela-04908.webp`,
    alt: "ברמן מכין קוקטייל — קלאסי",
    category: "ברים",
  },
  {
    src: `${K}/karela-05111.webp`,
    alt: "שולחן מלא עם משקאות — אווירת ערב בעלינא",
    category: "אווירה",
    featured: true,
  },

  // ===== GUESTS & LIFESTYLE =====
  {
    src: `${K}/karela-2.webp`,
    alt: "בחורה מחייכת עם המבורגר עלינא",
    category: "אורחים",
    featured: true,
  },
  {
    src: `${K}/karela-04796.webp`,
    alt: "אורחת בחולצה אדומה נהנית ממנת החתימה + יין אדום",
    category: "אורחים",
  },
  {
    src: `${K}/karela-04853.webp`,
    alt: "אורחת עם יין לבן ומנת החתימה — רגע אינטימי",
    category: "אורחים",
  },
  {
    src: `${K}/karela-04863.webp`,
    alt: "שתי אורחות בשולחן ליד החלון — מנה וסלט",
    category: "אורחים",
  },
  {
    src: `${K}/karela-05113.webp`,
    alt: "אורחת עם משקאות בשולחן ערב",
    category: "אורחים",
  },
  {
    src: `${K}/karela-04714.webp`,
    alt: "שקית טייק-אווי של עלינא בפיתה — ברנדינג",
    category: "אווירה",
  },

  // ===== ORIGINAL OWNER UPLOADS =====
  {
    src: "/gallery/burger-hero.jpg",
    alt: "המבורגר עלינא עם בצל מקורמל ולחמנייה ביתית",
    category: "אוכל",
    featured: true,
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
  {
    src: "/gallery/IMG_6785.JPG",
    alt: "טבח בעבודה במטבח עלינא",
    category: "מטבח",
    featured: true,
  },
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
