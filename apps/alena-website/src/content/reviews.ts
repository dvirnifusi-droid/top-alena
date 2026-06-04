// Real customer reviews from Google Maps, captured by the owner.
// Update by adding entries here — they auto-flow into ReviewsCarousel,
// AggregateRating schema, and the home page hero proof.

export type Review = {
  author: string;
  rating: 1 | 2 | 3 | 4 | 5;
  body: string;
  source: "Google" | "Direct" | "Facebook";
  date: string; // ISO date
  spend?: string; // optional, e.g. "₪150-200"
};

// Captured 2026-06 from Google Maps. All 5-star.
export const reviews: Review[] = [
  {
    author: "דלית דולב",
    rating: 5,
    body: "מסעדה מעולה, אוכל טעים טרי ומוגש באהבה, שירות מהיר ויעיל, תפריט עשיר ומעניין.",
    source: "Google",
    date: "2026-02-14",
    spend: "₪150-200",
  },
  {
    author: "Moshe Sinai",
    rating: 5,
    body: "אין עליכם צוות עלינא. אוכל טעים בטירוף, אווירת חופש תמידית. עוד לא קרה שהגעתי והתאכזבתי. שאפו עליכם.",
    source: "Google",
    date: "2026-03-21",
    spend: "₪100-150",
  },
  {
    author: "yehonatan bercovich",
    rating: 5,
    body: "אחלה שירות, אווירה טובה ממש. אחלה מלצרים — אני יכול לשתף אישית על זיו שמילצרה אותנו עם חיוך כל הזמן וסבלנות רבה.",
    source: "Google",
    date: "2026-03-21",
    spend: "₪50-100",
  },
  {
    author: "alon shafir",
    rating: 5,
    body: "זיו הייתה מלצרית מדהימה ברמה הכי גבוהה שיש. הזמנה ללא המתנה, מתאים לקבוצות מכל הגדלים.",
    source: "Google",
    date: "2026-03-28",
    spend: "₪100-150",
  },
  {
    author: "Dvir Shabi mentalist",
    rating: 5,
    body: "אווירה מעולה. אוכל טעים. שירות וואו. אין ספק שנחזור — תודה רבה לכם!",
    source: "Google",
    date: "2026-05-13",
  },
];

export const aggregateRating = {
  reviewCount: reviews.length,
  ratingValue:
    reviews.reduce((s, r) => s + r.rating, 0) / reviews.length,
};
