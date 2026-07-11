// Static gallery manifest — curated owner photos in /public/gallery/.
// Sources: original owner uploads + 48 photos from the "עלינא 24.6.26 bar" Drive shoot
// (see /public/gallery/karela/), processed via scripts/process-logo.mjs / manual sharp.
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
  // ===== KARELA 2026-06-24 PHOTOSHOOT — hero + signatures =====
  {
    src: `${K}/karela-04859.webp`,
    alt: "מנת החתימה — דג/חציל מזוגג עם טחינה, צ'ילי ופטרוזיליה",
    category: "אוכל",
    featured: true,
    hero: true,
  },
  {
    src: `${K}/karela-04899.webp`,
    alt: "מנה חמה על קרש עץ — עלינא ג'וספר",
    category: "אוכל",
    featured: true,
  },
  {
    src: `${K}/karela-05085.webp`,
    alt: "חומוס עם ירקות מוקפצים, לימון ופתיתי טחינה — מבט על",
    category: "אוכל",
    featured: true,
  },
  {
    src: `${K}/karela-05063.webp`,
    alt: "חומוס עם קובה טרייה על צלחת קרמיקה מעוטרת",
    category: "אוכל",
    featured: true,
  },
  {
    src: `${K}/karela-04884.webp`,
    alt: "חומוס פרימיום עם כובעי טחינה זרוקים — top view",
    category: "אוכל",
    featured: true,
  },
  {
    src: `${K}/karela-04825.webp`,
    alt: "חומוס בשרי + כוס יין לבן — קומפוזיציה",
    category: "אוכל",
    featured: true,
  },
  {
    src: `${K}/karela-05019.webp`,
    alt: "ברוסקטה עם זיתים ולחם ז'ולייני",
    category: "אוכל",
    featured: true,
  },
  {
    src: `${K}/karela-04764.webp`,
    alt: "חומוס כפרי עם פיתה על מגש עץ",
    category: "אוכל",
    featured: true,
  },
  {
    src: `${K}/karela-04736.webp`,
    alt: "מנת חתימה שנייה — דג/חציל מזוגג",
    category: "אוכל",
  },
  {
    src: `${K}/karela-04745.webp`,
    alt: "מנת חתימה — זווית קרובה",
    category: "אוכל",
  },
  {
    src: `${K}/karela-05080.webp`,
    alt: "חומוס עגבניה ולימון — מבט על",
    category: "אוכל",
  },
  {
    src: `${K}/karela-05063-2.webp`,
    alt: "חומוס עם קובה — קומפוזיציה שנייה",
    category: "אוכל",
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
    alt: "אורחת בחולצה אדומה נהנית ממנה חמה",
    category: "אורחים",
  },
  {
    src: `${K}/karela-04853.webp`,
    alt: "אורחת עם יין ומנה — רגע אינטימי בבר",
    category: "אורחים",
  },
  {
    src: `${K}/karela-04899-2.webp`,
    alt: "מנת חתימה על שולחן העץ",
    category: "אוכל",
  },
  {
    src: `${K}/karela-04863.webp`,
    alt: "מזיגת יין לכוס לצד סלט חם",
    category: "אווירה",
  },
  {
    src: `${K}/karela-05113.webp`,
    alt: "אורחת עם משקאות בשולחן ערב",
    category: "אורחים",
  },

  // ===== TEAM / PORTRAITS =====
  {
    src: `${K}/karela-04779.webp`,
    alt: "בעל המקום — דיוקן במעטפת הבר",
    category: "מטבח",
  },
  {
    src: `${K}/karela-04788.webp`,
    alt: "בעל המקום — דיוקן שני",
    category: "מטבח",
  },
  {
    src: `${K}/karela-04714.webp`,
    alt: "שקית טייק-אווי של עלינא בפיתה — ברנדינג",
    category: "אווירה",
  },

  // ===== ORIGINAL OWNER UPLOADS (kept for continuity) =====
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
