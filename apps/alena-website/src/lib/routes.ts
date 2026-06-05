export const routes = {
  home: "/",
  menu: "/menu",
  events: "/events",
  delivery: "/delivery",
  gallery: "/gallery",
  about: "/about",
  contact: "/contact",
  blog: "/blog",
  jobs: "/jobs",
  accessibility: "/accessibility",
  studio: "/studio",
} as const;

export const landingSlugs = [
  "חמארה-בראשון-לציון",
  "בר-מסעדה-כשר-בראשון",
  "המבורגר-בראשון",
  "בשר-כשר-בראשון",
  "סטייק-בראשון",
  "ארוחת-בוקר-בראשון",
  "אירועי-חברה-בראשון",
] as const;

export type LandingSlug = (typeof landingSlugs)[number];
