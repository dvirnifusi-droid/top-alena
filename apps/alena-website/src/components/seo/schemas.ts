import { aggregateRating as agg } from "@/content/reviews";

type Restaurant = { name: string; phone: string; address: string; url: string; image?: string };

export const restaurantSchema = (r: Restaurant) => ({
  "@context": "https://schema.org",
  "@type": "Restaurant",
  name: r.name,
  telephone: r.phone,
  url: r.url,
  image: r.image,
  servesCuisine: ["Mediterranean", "Kosher", "Israeli"],
  priceRange: "₪₪",
  address: {
    "@type": "PostalAddress",
    streetAddress: r.address,
    addressLocality: "ראשון לציון",
    addressCountry: "IL",
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: agg.ratingValue.toFixed(1),
    reviewCount: agg.reviewCount,
    bestRating: 5,
    worstRating: 1,
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
