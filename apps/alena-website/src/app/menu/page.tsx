import Image from "next/image";
import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/JsonLd";
import { ReservationCTA } from "@/components/shared/ReservationCTA";
import { menu, drinks, softDrinks, type MenuItem } from "@/content/menu";

export const metadata = pageMetadata({
  title: "תפריט עלינא — חמארה ים-תיכונית כשרה בראשון לציון",
  description:
    "תפריט מלא: ברוסקטה אסאדו, עלינאבורגר, אנטריקוט רחוב, סנייה קבב, חצילוני, תפו״א קריספי, ברים מלאים ויינות. רוטשילד 104, ראשון לציון.",
  path: "/menu",
});

const TAG_COLORS: Record<string, string> = {
  "מומלץ": "bg-brass text-cream",
  "חדש": "bg-terracotta text-cream",
  "חריף": "bg-terracotta-600 text-cream",
  "חם": "bg-terracotta text-cream",
  "ללא גלוטן": "bg-olive text-cream",
  "טבעוני": "bg-olive text-cream",
};

function MenuCard({ item }: { item: MenuItem }) {
  return (
    <article className="flex gap-4 rounded-2xl bg-cream-soft p-4 shadow-sm ring-1 ring-brass/10 sm:p-5">
      {item.image ? (
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl sm:h-32 sm:w-32">
          <Image src={item.image} alt={item.name} fill sizes="128px" className="object-cover" />
        </div>
      ) : null}
      <div className="flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-xl text-charcoal sm:text-2xl">{item.name}</h3>
          <span className="font-numeric whitespace-nowrap text-base font-semibold text-terracotta">
            ₪{item.price}
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-charcoal/75">{item.description}</p>
        {item.tags?.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <span
                key={t}
                className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium ${TAG_COLORS[t] ?? "bg-charcoal/10 text-charcoal"}`}
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

function formatDrinkPrice(p: number | { glass?: number; bottle?: number }): string {
  if (typeof p === "number") return `₪${p}`;
  if (p.glass && p.bottle) return `₪${p.glass} / ₪${p.bottle}`;
  if (p.bottle) return `₪${p.bottle}`;
  if (p.glass) return `₪${p.glass}`;
  return "";
}

export default function MenuPage() {
  const menuLd = {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: "תפריט עלינא",
    hasMenuSection: menu.map((s) => ({
      "@type": "MenuSection",
      name: s.title,
      hasMenuItem: s.items.map((i) => ({
        "@type": "MenuItem",
        name: i.name,
        description: i.description,
        offers: { "@type": "Offer", price: i.price, priceCurrency: "ILS" },
      })),
    })),
  };

  return (
    <Container className="py-16">
      <header className="mb-12 text-center">
        <p className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-brass">
          <span className="h-px w-8 bg-brass" />
          תפריט
          <span className="h-px w-8 bg-brass" />
        </p>
        <h1 className="font-display text-5xl text-charcoal md:text-6xl">תפריט עלינא</h1>
        <p className="mx-auto mt-4 max-w-2xl text-charcoal/75">
          הכל יוצא מתנור הג׳וספר על 600 מעלות. תיבול השילוש הקדוש (מרווה, טימין, אורגנו) על הלב הצרוב.
          ערבי נושא: ראשון בורגרים, שני יין, שלישי קצבים.
        </p>
        <div className="mt-6 inline-block">
          <ReservationCTA />
        </div>
      </header>

      <nav className="sticky top-16 z-30 -mx-4 mb-10 overflow-x-auto bg-cream/85 py-3 backdrop-blur sm:mx-0">
        <ul className="flex justify-start gap-2 px-4 sm:justify-center">
          {[...menu, ...drinks].map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="whitespace-nowrap rounded-full border border-charcoal/10 bg-cream px-4 py-1.5 text-xs font-medium text-charcoal/80 hover:border-brass hover:text-brass"
              >
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-16">
        {menu.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-32">
            <div className="mb-6">
              <h2 className="font-display text-4xl text-olive">{section.title}</h2>
              {section.subtitle ? (
                <p className="mt-1 text-sm uppercase tracking-[0.2em] text-brass">{section.subtitle}</p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {section.items.map((it) => (
                <MenuCard key={it.name} item={it} />
              ))}
            </div>
          </section>
        ))}

        <hr className="border-brass/20" />

        {drinks.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-32">
            <div className="mb-6">
              <h2 className="font-display text-4xl text-olive">{section.title}</h2>
              {section.subtitle ? (
                <p className="mt-1 text-sm uppercase tracking-[0.2em] text-brass">{section.subtitle}</p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {section.items.map((d) => (
                <div
                  key={d.name}
                  className="flex items-start justify-between gap-4 rounded-xl bg-cream-soft px-4 py-3 ring-1 ring-brass/10"
                >
                  <div>
                    <p className="font-display text-lg text-charcoal">{d.name}</p>
                    {d.description ? <p className="text-sm text-charcoal/70">{d.description}</p> : null}
                  </div>
                  <span className="font-numeric whitespace-nowrap text-sm font-semibold text-terracotta">
                    {formatDrinkPrice(d.price as number | { glass?: number; bottle?: number })}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h2 className="mb-4 font-display text-3xl text-olive">שתייה קלה</h2>
          <div className="grid gap-2 sm:grid-cols-3">
            {softDrinks.map((d) => (
              <div
                key={d.name}
                className="flex justify-between rounded-lg bg-cream-soft px-3 py-2 text-sm ring-1 ring-brass/10"
              >
                <span>{d.name}</span>
                <span className="font-numeric font-semibold text-terracotta">₪{d.price}</span>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-3xl bg-olive p-8 text-cream">
          <p className="text-xs uppercase tracking-[0.25em] text-brass-soft">Happy Hour</p>
          <h3 className="mt-2 font-display text-3xl">שעות שמחות א׳–ה׳, 12:00–20:00</h3>
          <p className="mt-2 text-cream/85">
            40% הנחה על האלכוהול (כולל קוקטיילים), חוץ מבקבוקי יין שלמים. ערבי נושא: ראשון בורגרים, שני
            יין ללא תחתית מ-61 ₪, שלישי קצבים.
          </p>
        </aside>

        <p className="text-center text-xs text-charcoal/50">
          התפריט מתעדכן עונתית. ייתכנו שינויים בזמינות. צליאקים — אנא תאמו מראש (יש זיהום צולב). אנו
          כשרים למהדרין.
        </p>
      </div>

      <JsonLd data={menuLd} />
    </Container>
  );
}
