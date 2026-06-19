import { aggregateRating as agg, reviews } from "@/content/reviews";

type Restaurant = { name: string; phone: string; address: string; url: string; image?: string };

// Sun-Wed 12:00-00:00, Thu 12:00-02:00, Fri closed, Sat 20:15-02:00
const OPENING_HOURS = [
  { "@type": "OpeningHoursSpecification", dayOfWeek: ["Sunday", "Monday", "Tuesday", "Wednesday"], opens: "12:00", closes: "23:59" },
  { "@type": "OpeningHoursSpecification", dayOfWeek: "Thursday", opens: "12:00", closes: "23:59" },
  { "@type": "OpeningHoursSpecification", dayOfWeek: "Thursday", opens: "00:00", closes: "02:00" },
  { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "20:15", closes: "23:59" },
  { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "00:00", closes: "02:00" },
];

export const restaurantSchema = (r: Restaurant) => ({
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "@id": `${r.url}#restaurant`,
  name: r.name,
  telephone: r.phone,
  url: r.url,
  image: [
    `${r.url}/gallery/IMG_4682.JPG`,
    `${r.url}/gallery/spread.jpg`,
    `${r.url}/icon-512.png`,
  ],
  logo: `${r.url}/icon-512.png`,
  servesCuisine: ["Mediterranean", "Kosher", "Israeli"],
  priceRange: "₪₪",
  hasMenu: `${r.url}/menu`,
  acceptsReservations: "True",
  paymentAccepted: "Cash, Credit Card",
  currenciesAccepted: "ILS",
  address: {
    "@type": "PostalAddress",
    streetAddress: r.address,
    addressLocality: "ראשון לציון",
    addressRegion: "מחוז המרכז",
    postalCode: "7565419",
    addressCountry: "IL",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: 31.965,
    longitude: 34.798,
  },
  openingHoursSpecification: OPENING_HOURS,
  sameAs: [
    "https://alenabepita.co.il",
    "https://topalena.com",
    "https://www.instagram.com/alena.hamara",
    "https://www.mishloha.co.il/restaurant/עלינא-בפיתה-ראשון-לציון",
    "https://ontopo.com/he/il/page/alena",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: agg.ratingValue.toFixed(1),
    reviewCount: agg.reviewCount,
    bestRating: 5,
    worstRating: 1,
  },
  review: reviews.slice(0, 5).map((rv) => ({
    "@type": "Review",
    author: { "@type": "Person", name: rv.author },
    reviewRating: { "@type": "Rating", ratingValue: rv.rating, bestRating: 5 },
    reviewBody: rv.body,
    ...(rv.date ? { datePublished: rv.date } : {}),
  })),
  potentialAction: {
    "@type": "ReserveAction",
    target: `${r.url}/reserve`,
    name: "הזמן שולחן",
  },
});

export const faqSchema = (faqs: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
});

export const breadcrumbSchema = (items: { name: string; url: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: it.name,
    item: it.url,
  })),
});

export const reviewSchema = (r: { author: string; rating: number; body: string; date?: string }) => ({
  "@context": "https://schema.org",
  "@type": "Review",
  author: { "@type": "Person", name: r.author },
  reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5 },
  reviewBody: r.body,
  datePublished: r.date,
});

export const aggregateRatingSchema = (count: number, value: number) => ({
  "@type": "AggregateRating",
  ratingValue: value,
  reviewCount: count,
});

export const eventSchema = (e: { name: string; description: string; url: string; image?: string }) => ({
  "@context": "https://schema.org",
  "@type": "Event",
  name: e.name,
  description: e.description,
  url: e.url,
  image: e.image,
  location: {
    "@type": "Place",
    name: "עלינא",
    address: "רוטשילד 104, ראשון לציון",
  },
});
