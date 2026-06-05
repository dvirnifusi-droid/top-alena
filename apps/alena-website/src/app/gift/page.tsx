import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { wa } from "@/lib/whatsapp";
import { env } from "@/lib/env";

export const metadata = pageMetadata({
  title: "שובר מתנה — עלינא, ראשון לציון",
  description:
    "שובר מתנה דיגיטלי למסעדת עלינא ברוטשילד 104. 3 סכומים לבחירה — המקבל בוחר את הארוחה. מתאים ליום הולדת, יום נישואים, הוקרה לעובד.",
  path: "/gift",
});

type Pkg = {
  amount: number;
  fitFor: string; // who this is good for
  vibe: string; // one-line vibe
  highlight?: boolean;
  badge?: string;
};

const packages: Pkg[] = [
  {
    amount: 200,
    fitFor: "מתנה אישית קטנה",
    vibe: "להזכיר למישהו שאתם חושבים עליו.",
  },
  {
    amount: 350,
    fitFor: "מתנה לזוגות / חברים",
    vibe: "ערב יציאה אמיתי, בלי לחשוב על המחיר.",
    highlight: true,
    badge: "הכי פופולרי",
  },
  {
    amount: 500,
    fitFor: "מתנה לעובד / לקוח / יקירים",
    vibe: "אירוח שאומר ׳הערכתי על זה הרבה זמן׳.",
  },
];

function whatsappForPackage(p: Pkg) {
  return wa.general().replace(
    /text=.*/,
    `text=${encodeURIComponent(
      `שלום! אני רוצה לרכוש שובר מתנה ע״ס ₪${p.amount}. אפשר לקבל פרטים על תהליך התשלום ועל איך השובר נשלח?`,
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
          שובר דיגיטלי בערך כספי. המקבל בוחר מה לאכול ומה לשתות, בכל ביקור, בכל שעה. תקף שנה, ניתן
          להעברה. מתאים ליום הולדת, יום נישואים, הוקרה לעובד.
        </p>
      </header>

      <section className="mt-16 grid gap-6 md:grid-cols-3">
        {packages.map((p) => (
          <article
            key={p.amount}
            className={`relative flex flex-col rounded-3xl p-8 text-center shadow-lg shadow-charcoal/5 transition ${
              p.highlight
                ? "bg-olive text-cream ring-2 ring-brass"
                : "bg-cream-soft text-charcoal ring-1 ring-brass/15"
            }`}
          >
            {p.badge ? (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brass px-3 py-1 text-xs font-bold uppercase tracking-wider text-charcoal shadow">
                {p.badge}
              </span>
            ) : null}

            <p
              className={`text-xs uppercase tracking-[0.25em] ${
                p.highlight ? "text-brass-soft" : "text-brass"
              }`}
            >
              שובר על סך
            </p>

            <p className="mt-4 font-numeric text-6xl font-black md:text-7xl">₪{p.amount}</p>

            <div className={`my-6 h-px w-12 self-center ${p.highlight ? "bg-brass-soft" : "bg-brass/40"}`} />

            <p className={`text-sm uppercase tracking-wider ${p.highlight ? "text-brass-soft" : "text-brass"}`}>
              {p.fitFor}
            </p>
            <p className="mt-2 text-base leading-relaxed opacity-85">
              {p.vibe}
            </p>

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
              לרכישת השובר <span aria-hidden="true">←</span>
            </a>
          </article>
        ))}
      </section>

      <p className="mt-8 text-center text-sm text-charcoal/65">
        סכום אחר? התקשרו{" "}
        <a href={`tel:${env.NEXT_PUBLIC_PHONE}`} className="font-semibold text-terracotta">
          {env.NEXT_PUBLIC_PHONE}
        </a>
      </p>

      <section className="mt-20 grid gap-12 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-brass">איך זה עובד</p>
          <h2 className="mt-3 font-display text-4xl text-charcoal">3 צעדים פשוטים</h2>
          <ol className="mt-6 space-y-4">
            {[
              "בוחרים סכום ולוחצים ׳לרכישת השובר׳ — נפתח צ׳אט וואטסאפ עם הפרטים",
              "מקבלים קישור תשלום מאובטח + מי שיקבל את השובר",
              "תוך שעות בודדות נשלח שובר מעוצב במייל — מוכן להדפסה או למשלוח דיגיטלי",
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
              a: "כן, השובר מתנה — בעת רכישה אתם מציינים על שם מי הוא, או משאירים אותו ללא שם והמקבל פשוט מציג אותו במסעדה.",
            },
            {
              q: "מה אם הסכום בארוחה גבוה מהשובר?",
              a: "תוספת תשלום במזומן או באשראי. אם הסכום נמוך מהשובר — היתרה נשארת כקרדיט לביקור הבא.",
            },
            {
              q: "האם השובר ניתן למימוש בכל יום?",
              a: "בכל יום שהמסעדה פתוחה — ראשון עד חמישי + שבת. ביום שישי אנחנו סגורים. מומלץ להזמין שולחן מראש.",
            },
            {
              q: "השובר נשלח מודפס או דיגיטלי?",
              a: "כברירת מחדל — דיגיטלי במייל. אם תרצו עותק מודפס מעוצב — תוסיפו 30 ₪ ונדאג לכם להדפסה איכותית עם מעטפה.",
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
    </Container>
  );
}
