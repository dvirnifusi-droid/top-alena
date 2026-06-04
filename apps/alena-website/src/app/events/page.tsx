import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { EventInquiryForm } from "@/components/events/EventInquiryForm";
import { pageMetadata } from "@/lib/seo";
import { env } from "@/lib/env";

export const metadata = pageMetadata({
  title: "אירועים פרטיים בעלינא — אולם פרטי עד 50 איש, ראשון לציון",
  description:
    "מארגנים אירוע פרטי? עלינא ברוטשילד 104 — אולם פרטי עד 50 אורחים, מנות שף ים-תיכוניות מתנור ג׳וספר 600°, ברים מלאים, כשר למהדרין. סוכן AI חכם יבנה לכם הצעה ב-2 דקות.",
  path: "/events",
});

const AI_AGENT_URL = "https://topalena.com/EventsInquiry?utm_source=website";

const eventTypes = [
  {
    title: "אירועי חברה",
    desc: "ערבי גיבוש, סיכומי רבעון, מסיבות חנוכה. שולחנות שף, ברים מלאים, אווירת בר רחוב שמח.",
    icon: "🥂",
  },
  {
    title: "ימי הולדת",
    desc: "עגול קטן או גדול. תפריט מותאם, עוגה מהמטבח שלנו, מוזיקה ים-תיכונית.",
    icon: "🎂",
  },
  {
    title: "בר ובת מצווה",
    desc: "חגיגה כשרה למהדרין עם תפריט בשרים אמיתי, לא מפלסטיק. ההורים נושמים, הילד מצטלם.",
    icon: "✡️",
  },
  {
    title: "אירוסין ומסיבות רווקים/ות",
    desc: "אולם פרטי, קוקטיילים בית, אירוח מלוטש. רגעים שיישארו בזיכרון.",
    icon: "💍",
  },
];

const included = [
  {
    title: "אולם פרטי עד 50 אורחים",
    desc: "מופרד מהמסעדה, ישיבה רגועה או עמידה עם בר. מותאם לאירוע אישי.",
  },
  {
    title: "תפריט שף מותאם",
    desc: "מתאימים תפריט לכל אירוע — בשרי, חלבי-כשר, או מעורב. הכל יוצא מהג׳וספר.",
  },
  {
    title: "ברים מלאים",
    desc: "קוקטיילים בית (חמסה עליך, פלאייה פפאיה), יינות, ערקים מתובלים, בירות חבית.",
  },
  {
    title: "מוזיקה ותאורה",
    desc: "מוזיקה ים-תיכונית ישראלית. אנחנו יודעים להתאים אווירה — מאינטימי לפעלולי.",
  },
  {
    title: "חניה מסודרת",
    desc: "חניות סמוכות במרכז בן גוריון, כמה דקות הליכה. נשלח לאורחים הנחיות מראש.",
  },
  {
    title: "כשרות למהדרין",
    desc: "אין הפתעות. הצוות מקצועי, האורחים נכנסים בשקט נפשי.",
  },
];

export default function EventsPage() {
  return (
    <Container className="py-16">
      <header className="text-center">
        <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
          <span className="h-px w-8 bg-brass" />
          אירועים פרטיים
          <span className="h-px w-8 bg-brass" />
        </p>
        <h1 className="font-display text-5xl text-charcoal md:text-6xl">אירוע פרטי בעלינא</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-charcoal/80">
          אולם פרטי עד 50 אורחים בלב רוטשילד 104. תפריט שף מותאם אישית, ברים מלאים, ואווירת בר רחוב שמח שמתכוננת אליכם.
        </p>
      </header>

      {/* PRIMARY CTA: AI Agent */}
      <section className="mt-12 overflow-hidden rounded-3xl bg-gradient-to-bl from-olive via-olive to-charcoal text-cream shadow-2xl shadow-olive/30 ring-1 ring-brass/30">
        <div className="grid items-center gap-8 p-8 md:grid-cols-[1.3fr_1fr] md:p-12">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brass/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brass-soft">
              ✨ סוכן AI חכם
            </p>
            <h2 className="mt-4 font-display text-4xl leading-tight md:text-5xl">
              בונים יחד את האירוע — בשיחה אחת
            </h2>
            <p className="mt-4 text-cream/85">
              הסוכן החכם של עלינא מכיר את האולם, התפריטים, המחירים והזמינות. תספרו כמה אנשים, מתי, ומה
              הסגנון — הוא יחזיר לכם הצעת מחיר מותאמת, ויסגור איתכם את העסקה בזמן אמת.
            </p>
            <a
              href={AI_AGENT_URL}
              target="_blank"
              rel="noopener"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-cream px-8 py-4 text-lg font-bold text-olive shadow-xl transition hover:bg-brass hover:text-cream"
            >
              לבניית האירוע <span>←</span>
            </a>
            <p className="mt-3 text-xs text-cream/60">לוקח ~2 דקות · מענה מיידי 24/7</p>
          </div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl ring-1 ring-brass/30">
            <Image
              src="/gallery/IMG_6770.JPG"
              alt="זוג אורחים בעלינא — אירוע פרטי"
              fill
              sizes="(min-width:768px) 35vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Event types */}
      <section className="mt-20">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-brass">איזה אירוע</p>
          <h2 className="font-display text-4xl text-charcoal">מה אנחנו מארגנים</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {eventTypes.map((e) => (
            <article
              key={e.title}
              className="flex gap-5 rounded-2xl bg-cream-soft p-6 ring-1 ring-brass/15"
            >
              <div className="text-4xl">{e.icon}</div>
              <div>
                <h3 className="font-display text-2xl text-charcoal">{e.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal/75">{e.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* What's included */}
      <section className="mt-20">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-brass">החבילה</p>
          <h2 className="font-display text-4xl text-charcoal">מה כלול בכל אירוע</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {included.map((i) => (
            <div key={i.title} className="rounded-2xl border border-brass/20 bg-cream-soft p-5">
              <p className="text-xs uppercase tracking-wider text-brass">{i.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-charcoal/80">{i.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Visual section */}
      <section className="mt-20">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="relative aspect-square overflow-hidden rounded-3xl ring-1 ring-brass/20">
            <Image src="/gallery/burger-hero.jpg" alt="עלינאבורגר" fill sizes="(min-width:640px) 33vw, 100vw" className="object-cover" />
          </div>
          <div className="relative aspect-square overflow-hidden rounded-3xl ring-1 ring-brass/20">
            <Image src="/gallery/spread.jpg" alt="שולחן מלא בעלינא" fill sizes="(min-width:640px) 33vw, 100vw" className="object-cover" />
          </div>
          <div className="relative aspect-square overflow-hidden rounded-3xl ring-1 ring-brass/20">
            <Image src="/gallery/IMG_6904.JPG" alt="קוקטיילים על הבר" fill sizes="(min-width:640px) 33vw, 100vw" className="object-cover" />
          </div>
        </div>
      </section>

      {/* Closing CTA + human fallback */}
      <section className="mt-20 rounded-3xl bg-cream-soft p-8 ring-1 ring-brass/15 md:p-12">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-brass">לסיכום</p>
            <h2 className="mt-2 font-display text-3xl text-charcoal">להתחיל לבנות אירוע?</h2>
            <p className="mt-3 text-charcoal/80">
              הדרך הכי מהירה ומדויקת — דרך הסוכן החכם של עלינא. הוא יקח אתכם מ-״רעיון״ להצעת מחיר בכמה
              שאלות פשוטות.
            </p>
            <a
              href={AI_AGENT_URL}
              target="_blank"
              rel="noopener"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-terracotta px-7 py-3.5 font-bold text-cream shadow-xl shadow-terracotta/30 transition hover:bg-terracotta-600"
            >
              לסוכן האירועים <span>←</span>
            </a>
          </div>
          <aside className="rounded-2xl bg-olive/10 p-6">
            <p className="text-sm font-semibold text-olive">מעדיפים בני אדם?</p>
            <p className="mt-2 text-sm text-charcoal/80">חייגו ישירות:</p>
            <a
              href={`tel:${env.NEXT_PUBLIC_PHONE}`}
              className="mt-3 inline-block font-display text-3xl text-terracotta"
            >
              {env.NEXT_PUBLIC_PHONE}
            </a>
            <p className="mt-4 text-sm text-charcoal/80">או השאירו פרטים ונחזור אליכם תוך 24 שעות:</p>
            <div className="mt-4">
              <EventInquiryForm />
            </div>
          </aside>
        </div>
      </section>
    </Container>
  );
}
