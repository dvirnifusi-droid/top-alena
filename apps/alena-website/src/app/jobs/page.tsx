import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { env } from "@/lib/env";

export const metadata = pageMetadata({
  title: "דרושים עובדים — עלינא, ראשון לציון",
  description:
    "מצטרפים לצוות עלינא בראשון לציון: מלצרים, ברמנים, מנהלי משמרת, ראנרים וצוות מטבח. סוכן AI חכם מסנן ומשבץ לתפקיד המתאים ב-2 דקות.",
  path: "/jobs",
});

const APPLY_URL = "https://topalena.com/apply?utm_source=websitenew";

const positions = [
  {
    title: "מלצרים / מלצריות",
    desc: "ניהול שולחן מקצה לקצה — אירוח פעיל, מכירת אלכוהול וקוקטיילים, תשלום במסופון בשולחן. שיטת ״לא שואלים — מציעים״.",
    icon: "🍽️",
  },
  {
    title: "ברמנים",
    desc: "הכנת קוקטיילי בית (חמסה עליך, פלאייה פפאיה), ניהול הבר, ערקייה של עלינא, אינטראקציה עם הלקוחות.",
    icon: "🍸",
  },
  {
    title: "מנהלי משמרת",
    desc: "המנצח על התזמורת. פתרון בעיות בזמן אמת, סנכרון בין הפלור למטבח, ניהול צוות של 5-12 איש.",
    icon: "⚡",
  },
  {
    title: "ראנרים / בקרים",
    desc: "הוצאת מנות לפי סדר, נראות המנה ואיכות ללא פשרות. נקודת כניסה מצוינת לצוות.",
    icon: "🏃",
  },
  {
    title: "מארחת",
    desc: "הפנים של עלינא. ניהול תור דיגיטלי, הושבה בחיוך, סנכרון מול תוכנת ההושבה.",
    icon: "✨",
  },
  {
    title: "צוות מטבח",
    desc: "עבודה על תנור ג׳וספר 600 מעלות, מנות עם שילוש קדוש, הקפדה על איכות. ניסיון לא חובה — מלמדים.",
    icon: "🔥",
  },
];

const why = [
  {
    title: "אווירה שמחה",
    body: "אנחנו מסעדה של בר רחוב שמח. הצוות שלנו זה הראש של המקום. אם אתה רוצה לבוא לעבודה ולחזור הביתה שמח — זה המקום.",
  },
  {
    title: "מקצועיות גבוהה",
    body: "תנור ג׳וספר 600°, מתכוני שילוש קדוש, אינטראקציה מתקדמת עם לקוחות. ההכשרה אצלנו נחשבת באוכל הישראלי.",
  },
  {
    title: "גמישות אמיתית",
    body: "חופשים בסופ״ש בקלות (מינימום 3 שבועות מראש דרך אפליקציה). שיתוף משמרות בקלות. אנחנו מבינים שיש לך חיים.",
  },
  {
    title: "צמיחה",
    body: "ראנר היום, מלצר בעוד 3 חודשים, מנהל משמרת בעוד שנה. הצלחה אצלנו זה מסלול ברור.",
  },
];

export default function JobsPage() {
  return (
    <Container className="py-16">
      <header className="text-center">
        <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.35em] text-brass">
          <span className="h-px w-8 bg-brass" />
          דרושים
          <span className="h-px w-8 bg-brass" />
        </p>
        <h1 className="font-display text-5xl text-charcoal md:text-6xl">
          הצטרפו לצוות עלינא
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-charcoal/80">
          אנחנו מגייסים לכל התפקידים — פלור, בר, מטבח, אירוח. סוכן AI חכם של עלינא יסנן ויתאים אתכם
          לתפקיד הנכון בשיחה אחת.
        </p>
      </header>

      {/* AI Agent CTA - primary */}
      <section className="mt-12 overflow-hidden rounded-3xl bg-gradient-to-bl from-olive via-olive to-charcoal text-cream shadow-2xl shadow-olive/30 ring-1 ring-brass/30">
        <div className="grid items-center gap-8 p-8 md:grid-cols-[1.3fr_1fr] md:p-12">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-brass/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brass-soft">
              ✨ סוכן AI לגיוס
            </p>
            <h2 className="mt-4 font-display text-4xl leading-tight md:text-5xl">
              מועמדות מהירה. תשובה תוך 24 שעות.
            </h2>
            <p className="mt-4 text-cream/85">
              הסוכן יכיר אתכם, יבין מה הניסיון שלכם וזמינות, ויתאים אתכם לתפקיד מסוים. אם אתם מתאימים —
              נקבע פגישה ישירות. אם לא — נחזיר משוב מנומק.
            </p>
            <a
              href={APPLY_URL}
              target="_blank"
              rel="noopener"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-cream px-8 py-4 text-lg font-bold text-olive shadow-xl transition hover:bg-brass hover:text-cream"
            >
              להגשת מועמדות <span>←</span>
            </a>
            <p className="mt-3 text-xs text-cream/60">לוקח ~2 דקות · מענה מיידי 24/7</p>
          </div>
          <div className="relative aspect-[4/5] overflow-hidden rounded-2xl ring-1 ring-brass/30">
            <Image
              src="/gallery/IMG_6785.JPG"
              alt="צוות המטבח של עלינא"
              fill
              sizes="(min-width:768px) 35vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Positions */}
      <section className="mt-20">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-brass">תפקידים</p>
          <h2 className="font-display text-4xl text-charcoal md:text-5xl">איזה תפקידים פתוחים</h2>
          <p className="mx-auto mt-3 max-w-xl text-charcoal/70">
            כולם פתוחים — הסוכן יסנן לפי הניסיון שלכם.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {positions.map((p) => (
            <article
              key={p.title}
              className="flex gap-4 rounded-2xl bg-cream-soft p-6 ring-1 ring-brass/15"
            >
              <div className="text-3xl">{p.icon}</div>
              <div>
                <h3 className="font-display text-xl text-charcoal">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-charcoal/75">{p.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Why us */}
      <section className="mt-20">
        <div className="mb-10 text-center">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-brass">למה אנחנו</p>
          <h2 className="font-display text-4xl text-charcoal md:text-5xl">מה תקבלו בעלינא</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {why.map((w) => (
            <div key={w.title} className="rounded-2xl border border-brass/20 bg-cream-soft p-7">
              <h3 className="font-display text-2xl text-charcoal">{w.title}</h3>
              <p className="mt-3 text-charcoal/75 leading-relaxed">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mt-20 rounded-3xl bg-cream-soft p-8 text-center ring-1 ring-brass/15 md:p-12">
        <h2 className="font-display text-3xl text-charcoal">מוכנים להגיש מועמדות?</h2>
        <p className="mx-auto mt-3 max-w-xl text-charcoal/75">
          הסוכן ייצור איתכם קשר תוך דקות. גם אם זו הפעם הראשונה במסעדה — אנחנו מתחילים מאפס יחד.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href={APPLY_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full bg-terracotta px-7 py-3.5 font-bold text-cream shadow-xl shadow-terracotta/30 transition hover:bg-terracotta-600"
          >
            להגשת מועמדות <span>←</span>
          </a>
          <a
            href={env.NEXT_PUBLIC_WHATSAPP_URL}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 rounded-full border-2 border-charcoal/15 px-7 py-3.5 font-bold text-charcoal hover:border-brass hover:text-brass"
          >
            או דברו איתנו בוואטסאפ
          </a>
        </div>
      </section>
    </Container>
  );
}
