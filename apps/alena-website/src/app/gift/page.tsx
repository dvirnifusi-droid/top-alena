import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { wa } from "@/lib/whatsapp";
import { env } from "@/lib/env";

export const metadata = pageMetadata({
  title: "שובר מתנה — עלינא, ראשון לציון",
  description:
    "שובר מתנה דיגיטלי למסעדת עלינא ברוטשילד 104. 3 חבילות מעוצבות לימי הולדת, ימי נישואים, הוקרה לעובד. רכישה תוך דקה.",
  path: "/gift",
});

type Pkg = {
  amount: number;
  title: string;
  pitch: string;
  includes: string[];
  highlight?: boolean;
  badge?: string;
};

const packages: Pkg[] = [
  {
    amount: 200,
    title: "שובר ערב זוגי",
    pitch: "ארוחה לזוג עם קוקטיילים — בלי החשבון בסוף.",
    includes: [
      "3 מנות משותפות מהתפריט",
      "2 קוקטיילי בית",
      "מנות קינוח",
    ],
  },
  {
    amount: 350,
    title: "שובר חברים",
    pitch: "ערב עם 4 חברים — ככה שכל אחד זוכר את זה.",
    includes: [
      "תפריט שף לחלוקה (4 איש)",
      "ברים פתוחים לשעה",
      "ערב נושא מותאם (בורגרים / יין / קצב)",
    ],
    highlight: true,
    badge: "הכי פופולרי",
  },
  {
    amount: 500,
    title: "שובר VIP",
    pitch: "אירוח שאומר ׳הכרתי על זה הרבה זמן׳ — לעובד, ללקוח, לבן/בת זוג.",
    includes: [
      "ארוחת שף מלאה ל-2",
      "בקבוק יין שלם או 4 קוקטיילים",
      "קינוח מיוחד מהשף",
      "השארה אישית של השף לשולחן",
    ],
  },
];

function whatsappForPackage(p: Pkg) {
  return wa.general().replace(
    /text=.*/,
    `text=${encodeURIComponent(
      `שלום! אני רוצה לרכוש שובר מתנה של ${p.title} (₪${p.amount}). אפשר לקבל פרטים על תהליך התשלום והמשלוח של השובר?`,
    )}`,
  );
}

export default function GiftPage() {
  return (
    <Container className="py-16">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-brass">שובר מתנה</p>
        <h1 className="mt-4 font-display text-5xl text-charcoal md:text-6xl">
          ערב בעלינא — במתנה
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-charcoal/80">
          מתנה ליום הולדת, יום נישואים, יום הולדת לעובד, או הוקרה שאומרת ״תודה״. שובר דיגיטלי מעוצב,
          תקף שנה מיום הרכישה, ניתן להעברה למתנת אדם אחר.
        </p>
      </header>

      <section className="mt-16 grid gap-6 md:grid-cols-3">
        {packages.map((p) => (
          <article
            key={p.amount}
            className={`relative flex flex-col rounded-3xl p-7 shadow-lg shadow-charcoal/5 transition ${
              p.highlight
                ? "bg-olive text-cream ring-2 ring-brass"
                : "bg-cream-soft text-charcoal ring-1 ring-brass/15"
            }`}
          >
            {p.badge ? (
              <span className="absolute -top-3 right-7 rounded-full bg-brass px-3 py-1 text-xs font-bold uppercase tracking-wider text-charcoal shadow">
                {p.badge}
              </span>
            ) : null}
            <div>
              <p className={`text-xs uppercase tracking-[0.25em] ${p.highlight ? "text-brass-soft" : "text-brass"}`}>
                שובר
              </p>
              <h2 className={`mt-3 font-display text-3xl ${p.highlight ? "text-cream" : "text-charcoal"}`}>
                {p.title}
              </h2>
              <p className="mt-1 text-sm opacity-80">{p.pitch}</p>
            </div>
            <p className="mt-6 font-numeric text-5xl font-black">₪{p.amount}</p>
            <ul className="mt-6 space-y-2 text-sm">
              {p.includes.map((inc) => (
                <li key={inc} className="flex items-start gap-2">
                  <span aria-hidden="true" className={p.highlight ? "text-brass-soft" : "text-brass"}>
                    ✓
                  </span>
                  <span>{inc}</span>
                </li>
              ))}
            </ul>
            <a
              href={whatsappForPackage(p)}
              target="_blank"
              rel="noopener"
              className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-bold shadow-lg transition ${
                p.highlight
                  ? "bg-cream text-olive hover:bg-brass hover:text-cream"
                  : "bg-terracotta text-cream hover:bg-terracotta-600"
              }`}
            >
              לרכישת השובר <span>←</span>
            </a>
          </article>
        ))}
      </section>

      <section className="mt-20 grid gap-12 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-brass">איך זה עובד</p>
          <h2 className="mt-3 font-display text-4xl text-charcoal">3 צעדים פשוטים</h2>
          <ol className="mt-6 space-y-4">
            {[
              "בחרו חבילה ולחצו ׳לרכישת השובר׳ — נפתח צ׳אט וואטסאפ עם הפרטים",
              "אנחנו שולחים לכם קישור תשלום מאובטח + פרטי השובר",
              "תוך שעות בודדות תקבלו במייל שובר מעוצב, מוכן למשלוח/הדפסה",
            ].map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-terracotta font-bold text-cream">
                  {i + 1}
                </span>
                <p className="text-lg text-charcoal/85">{step}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="relative aspect-[4/5] overflow-hidden rounded-3xl ring-1 ring-brass/20">
          <Image
            src="/gallery/IMG_6904.JPG"
            alt="קוקטיילים על הבר של עלינא"
            fill
            sizes="(min-width:768px) 45vw, 100vw"
            className="object-cover"
          />
        </div>
      </section>

      <section className="mt-20 rounded-3xl bg-cream-soft p-8 ring-1 ring-brass/15 md:p-12">
        <h2 className="font-display text-3xl text-charcoal">שאלות נפוצות</h2>
        <div className="mt-6 divide-y divide-charcoal/10">
          {[
            {
              q: "מה תוקף השובר?",
              a: "שנה מיום הרכישה. ניתן להאריך פעם אחת בחצי שנה נוספת על-ידי פנייה אלינו.",
            },
            {
              q: "האם השובר ניתן להעברה?",
              a: "כן, השובר מתנה. אתם רוכשים עבור עצמכם או עבור מישהו אחר.",
            },
            {
              q: "האם יש דרישת הזמנה מוקדמת?",
              a: "מומלץ להזמין שולחן מראש דרך OnTopo או בטלפון, במיוחד לערבי סופ״ש.",
            },
            {
              q: "האם השובר כולל אלכוהול?",
              a: "כן. כל החבילות כוללות אלכוהול כשר. אם המקבל לא צורך אלכוהול, נחליף בקוקטיילים ללא אלכוהול בשווי דומה.",
            },
            {
              q: "מה אם הסכום בארוחה גבוה מהשובר?",
              a: "תוספת תשלום במזומן או באשראי. אם הסכום נמוך מהשובר — היתרה נשארת כקרדיט לביקור הבא.",
            },
          ].map((qa) => (
            <details key={qa.q} className="group py-4">
              <summary className="cursor-pointer list-none font-display text-xl text-charcoal">
                {qa.q}
              </summary>
              <p className="mt-3 text-charcoal/80 leading-relaxed">{qa.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-16 text-center">
        <p className="text-charcoal/70">צריכים שובר בסכום שונה? עיצוב מיוחד?</p>
        <a
          href={`tel:${env.NEXT_PUBLIC_PHONE}`}
          className="mt-4 inline-block font-display text-3xl text-terracotta hover:underline"
        >
          {env.NEXT_PUBLIC_PHONE}
        </a>
      </section>
    </Container>
  );
}
