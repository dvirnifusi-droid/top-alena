// Static gallery manifest — owner-supplied photos in /public/gallery/.
// Later these can move to Sanity for self-service editing.

export type GalleryPhoto = {
  src: string;
  alt: string;
  category: "אוכל" | "ברים" | "אורחים" | "מטבח" | "אווירה";
  featured?: boolean; // shown in the home InstagramStrip
  hero?: boolean; // optional single hero pick
};

export const galleryPhotos: GalleryPhoto[] = [
  {
    src: "/gallery/IMG_6904.JPG",
    alt: "קוקטיילים אדומים בבר של עלינא",
    category: "ברים",
    featured: true,
    hero: true,
  },
  {
    src: "/gallery/IMG_4682.JPG",
    alt: "מזיגת קוקטייל אחרי קוקטייל בבר",
    category: "ברים",
    featured: true,
  },
  {
    src: "/gallery/IMG_6892.JPG",
    alt: "אורחות נהנות בעלינא",
    category: "אורחים",
    featured: true,
  },
  {
    src: "/gallery/IMG_6770.JPG",
    alt: "זוג אורחים על רקע קיר הגרפיטי",
    category: "אורחים",
    featured: true,
  },
  {
    src: "/gallery/IMG_6785.JPG",
    alt: "טבח בעבודה במטבח עלינא",
    category: "מטבח",
    featured: true,
  },
  {
    src: "/gallery/IMG_6829.JPG",
    alt: "חברים נהנים בארוחה",
    category: "אורחים",
    featured: true,
  },
];

export const heroPhoto = galleryPhotos.find((p) => p.hero) ?? galleryPhotos[0];
export const featuredPhotos = galleryPhotos.filter((p) => p.featured);
