import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { ReservationCTA } from "@/components/shared/ReservationCTA";

export const metadata = pageMetadata({
  title: "אודות עלינא — חמארה ים-תיכונית כשרה ברוטשילד",
  description:
    "הסיפור של עלינא: בר-מסעדה חמארה ים-תיכונית כשרה ברוטשילד 104 ראשון לציון. תנור ג'וספר 600°, בשרים על האש, ערבי נושא קבועים.",
  path: "/about",
});

const pillars = [
  {
    title: "ג'וספר 600°",
    body: "כל הבשרים, הירקות והלחמים עוברים תחת גריל פחמים יפני שמגיע ל-600 מעלות. הצריבה הזו היא הסיבה שהאוכל מקבל אותו ניחוח עשן ייחודי שאי אפשר לזייף.",
  },
  {
    title: "השילוש הקדוש",
    body: "מרווה, טימין ואורגנו — תערובת התבלינים שאנחנו מתבלים בה כמעט הכל: מהפרנה הביתית ועד לסיגרי הבשר. זה ה-DNA של הטעם של עלינא.",
  },
  {
    title: "כשר למהדרין",
    body: "עלינא היא בר-מסעדה כשרה למהדרין. גם הבשרים, גם האלכוהול. אתם מוזמנים בשקט נפשי.",
  },
];

const themeNights = [
  { day: "ראשון", title: "Burger Night", desc: "ספיישלים של בורגרים שלא בתפריט הרגיל" },
  { day: "שני", title: "ערב יין", desc: "יין ללא תחתית בכוסות החל מ-61 ₪" },
  { day: "שלישי", title: "Butcher Night", desc: "נתחי הפתעה ומנות שף חד-פעמיות" },
  { day: "א׳-ה׳ עד 20:00", title: "Happy Hour", desc: "40% הנחה על כל האלכוהול והקוקטיילים" },
];

export default function AboutPage() {
  return (
    <Container className="max-w-4xl py-16">
      <header className="text-center">
        <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
          <span className="h-px w-8 bg-brass" />
          הסיפור
          <span className="h-px w-8 bg-brass" />
        </p>
        <h1 className="font-display text-5xl text-charcoal md:text-6xl">עלינא, ברוטשילד 104</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-charcoal/80">
          בר-מסעדה חמארה ים-תיכונית, כשרה למהדרין. אווירה של בר רחוב שמח, מטבח רציני
          על תנור פחמים יפני בלב ראשון לציון.
        </p>
        <div className="mt-6 inline-block">
          <ReservationCTA />
        </div>
      </header>

      <div className="mt-14 grid gap-6 md:grid-cols-3">
        {pillars.map((p) => (
          <article
            key={p.title}
            className="rounded-3xl bg-cream-soft p-6 ring-1 ring-brass/15"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-brass">קטע מהמותג</p>
            <h2 className="mt-2 font-display text-2xl text-charcoal">{p.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-charcoal/75">{p.body}</p>
          </article>
        ))}
      </div>

      <section className="mt-16 grid gap-10 md:grid-cols-2 md:items-center">
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl ring-1 ring-brass/20">
          <Image
            src="/gallery/IMG_6785.JPG"
            alt="טבח עלינא בעבודה במטבח"
            fill
            sizes="(min-width:768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div>
          <h2 className="font-display text-4xl text-olive">אווירה ואירוח</h2>
          <p className="mt-4 text-charcoal/80">
            השירות שלנו מקצועי אבל בגובה העיניים. המוטו — לא לוקחים הזמנה, מציעים. הברמן יציע צ׳ייסר.
            המלצרית תזכיר שיום שני זה ערב יין. אנחנו מנהלים את החוויה איתכם, לא מסביבכם.
          </p>
          <p className="mt-3 text-charcoal/80">
            מוזיקה ים-תיכונית ישראלית, תאורה רכה אחרי 19:00, וקצב שמתאים לשולחן זוגי או חבורה של 8.
          </p>
        </div>
      </section>

      <section className="mt-16 rounded-3xl bg-olive p-8 text-cream md:p-12">
        <p className="text-xs uppercase tracking-[0.25em] text-brass-soft">סדר השבוע</p>
        <h2 className="mt-2 font-display text-4xl">ערבי הנושא של עלינא</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {themeNights.map((n) => (
            <div key={n.day} className="rounded-2xl bg-cream/10 p-5">
              <p className="text-sm font-semibold uppercase tracking-wider text-brass-soft">{n.day}</p>
              <h3 className="mt-1 font-display text-2xl">{n.title}</h3>
              <p className="mt-2 text-sm text-cream/85">{n.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-10 md:grid-cols-2 md:items-center">
        <div>
          <h2 className="font-display text-4xl text-charcoal">אירועים פרטיים</h2>
          <p className="mt-4 text-charcoal/80">
            אולם פרטי עד 50 אורחים. ימי הולדת, אירועי חברה, אירוסים, ובר/בת מצווה. מתאימים את התפריט
            אישית לכל אירוע. שיחה אחת מספיקה כדי שנדע איך להוציא לכם את הערב הכי טוב.
          </p>
          <a
            href="/events"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-terracotta px-6 py-3 font-semibold text-cream hover:bg-terracotta-600"
          >
            פרטים והשארת לידים <span>←</span>
          </a>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-3xl ring-1 ring-brass/20">
          <Image
            src="/gallery/IMG_6892.JPG"
            alt="אורחות בעלינא"
            fill
            sizes="(min-width:768px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </section>
    </Container>
  );
}
