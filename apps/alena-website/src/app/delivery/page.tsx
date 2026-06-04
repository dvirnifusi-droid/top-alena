import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { env } from "@/lib/env";

export const metadata = pageMetadata({
  title: "משלוחים ו-Take Away — עלינא, ראשון לציון",
  description:
    "הזמנת משלוח ואיסוף עצמי מעלינא ברוטשילד 104, ראשון לציון. הזמנה אונליין דרך ValueCard, או חיוג ישיר. כל החמארה, הבשרים והקוקטיילים — עד הבית.",
  path: "/delivery",
});

const VALUECARD_URL = "https://valuecard.co.il/Orders/alenabepita";

const highlights = [
  {
    title: "המבורגרים ובשרים",
    desc: "עלינאבורגר, אנטריקוט רחוב, נתח קצבים — ארוזים בקפידה ויוצאים חמים.",
    image: "/gallery/burger-hero.jpg",
  },
  {
    title: "חמארה וסלטים",
    desc: "ברוסקטה אסאדו, סלט שוק, חצילוני, תפו״א קריספי, פרנה בפחמים.",
    image: "/gallery/spread.jpg",
  },
  {
    title: "ערקים מתובלים",
    desc: "ערק שחור, אדום ומתובל — מהערקייה של עלינא, ישר לבר הביתי שלכם.",
    image: "/gallery/IMG_4682.JPG",
  },
];

export default function DeliveryPage() {
  return (
    <Container className="py-16">
      <header className="text-center">
        <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
          <span className="h-px w-8 bg-brass" />
          משלוחים ו-Take Away
          <span className="h-px w-8 bg-brass" />
        </p>
        <h1 className="font-display text-5xl text-charcoal md:text-6xl">עלינא עד הבית</h1>
        <p className="mx-auto mt-4 max-w-2xl text-charcoal/80">
          ההזמנה מנוהלת דרך מערכת ValueCard — תפריט מלא, מחירים מעודכנים, ותשלום מאובטח בלחיצה אחת.
          איסוף עצמי או משלוח ישירות לכתובת.
        </p>
      </header>

      {/* Primary CTA */}
      <section className="mt-12 overflow-hidden rounded-3xl bg-olive text-cream shadow-2xl shadow-olive/30 ring-1 ring-brass/30">
        <div className="grid items-center gap-8 p-8 md:grid-cols-[1.2fr_1fr] md:p-12">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-brass-soft">הזמנה אונליין</p>
            <h2 className="mt-2 font-display text-4xl leading-tight md:text-5xl">
              הזמינו עכשיו דרך ValueCard
            </h2>
            <p className="mt-4 text-cream/85">
              תפריט מלא של עלינא בממשק נוח: חמארה, בשרים, קוקטיילים, וערקי הבית. בחרו בין משלוח לכתובת
              לבין איסוף עצמי ברוטשילד 104.
            </p>
            <a
              href={VALUECARD_URL}
              target="_blank"
              rel="noopener"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-cream px-8 py-4 text-lg font-bold text-olive shadow-xl transition hover:bg-brass hover:text-cream"
            >
              להזמנה אונליין <span>←</span>
            </a>
            <p className="mt-3 text-xs text-cream/60">valuecard.co.il/Orders/alenabepita</p>
          </div>
          <div className="relative aspect-square overflow-hidden rounded-2xl ring-1 ring-brass/30">
            <Image
              src="/gallery/burger-hero.jpg"
              alt="עלינאבורגר ארוז למשלוח"
              fill
              sizes="(min-width:768px) 40vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Quick contact alternatives */}
      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <a
          href={`tel:${env.NEXT_PUBLIC_PHONE}`}
          className="rounded-2xl bg-cream-soft p-6 text-center ring-1 ring-brass/15 hover:ring-brass"
        >
          <div className="text-2xl">📞</div>
          <p className="mt-2 font-display text-xl text-charcoal">חיוג ישיר</p>
          <p className="mt-1 text-sm text-charcoal/70">לפרטים והזמנה בטלפון</p>
          <p className="mt-3 font-numeric text-lg font-semibold text-terracotta">{env.NEXT_PUBLIC_PHONE}</p>
        </a>
        <a
          href={env.NEXT_PUBLIC_WHATSAPP_URL}
          target="_blank"
          rel="noopener"
          className="rounded-2xl bg-cream-soft p-6 text-center ring-1 ring-brass/15 hover:ring-brass"
        >
          <div className="text-2xl">💬</div>
          <p className="mt-2 font-display text-xl text-charcoal">WhatsApp</p>
          <p className="mt-1 text-sm text-charcoal/70">הזמנה ושאלות בצ׳אט</p>
          <p className="mt-3 text-sm font-semibold text-terracotta">שלחו הודעה →</p>
        </a>
        <div className="rounded-2xl bg-cream-soft p-6 text-center ring-1 ring-brass/15">
          <div className="text-2xl">🏠</div>
          <p className="mt-2 font-display text-xl text-charcoal">איסוף עצמי</p>
          <p className="mt-1 text-sm text-charcoal/70">רוטשילד 104, ראשון לציון</p>
          <p className="mt-3 text-sm text-charcoal/60">חניה במרכז בן גוריון</p>
        </div>
      </section>

      {/* Highlights */}
      <section className="mt-16">
        <div className="mb-8 text-center">
          <p className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
            <span className="h-px w-8 bg-brass" />
            מה נשלח אליכם
          </p>
          <h2 className="font-display text-4xl text-charcoal">חוויה מלאה, גם בבית</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {highlights.map((h) => (
            <article key={h.title} className="overflow-hidden rounded-3xl bg-cream-soft ring-1 ring-brass/15">
              <div className="relative aspect-[4/3]">
                <Image src={h.image} alt={h.title} fill sizes="33vw" className="object-cover" />
              </div>
              <div className="p-5">
                <h3 className="font-display text-xl text-charcoal">{h.title}</h3>
                <p className="mt-2 text-sm text-charcoal/75">{h.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Hours + small print */}
      <section className="mt-16 grid gap-8 rounded-3xl bg-cream-soft p-8 ring-1 ring-brass/15 md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-brass">שעות זמינות</p>
          <h3 className="mt-2 font-display text-2xl text-charcoal">מתי אפשר להזמין</h3>
          <ul className="mt-4 space-y-1.5 text-charcoal/80">
            <li>ראשון–רביעי · 12:00–00:00</li>
            <li>חמישי · 12:00–02:00</li>
            <li>שישי · סגור</li>
            <li>שבת · 20:15–02:00 (מוצ״ש)</li>
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-brass">חשוב לדעת</p>
          <h3 className="mt-2 font-display text-2xl text-charcoal">לפני שמזמינים</h3>
          <ul className="mt-4 space-y-2 text-sm text-charcoal/80">
            <li>• תפריט מלא ומחירים — בכפתור ההזמנה למעלה</li>
            <li>• כשרים למהדרין</li>
            <li>• לאלרגיות וזיהום צולב (גלוטן) — בקשו טלפונית מראש</li>
            <li>• מסלולי משלוח לפי איזורי ראשון לציון והסביבה</li>
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mt-12 text-center">
        <a
          href={VALUECARD_URL}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 rounded-full bg-terracotta px-8 py-4 text-lg font-bold text-cream shadow-xl shadow-terracotta/30 transition hover:bg-terracotta-600"
        >
          הזמינו עכשיו <span>→</span>
        </a>
      </section>
    </Container>
  );
}
