export const routes = {
  home: "/",
  menu: "/תפריט",
  events: "/אירועים",
  delivery: "/משלוחים",
  gallery: "/גלריה",
  about: "/אודות",
  contact: "/צור-קשר",
  blog: "/בלוג",
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
