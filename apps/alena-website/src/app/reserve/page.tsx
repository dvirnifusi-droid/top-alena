import { Container } from "@/components/layout/Container";
import { pageMetadata } from "@/lib/seo";
import { env } from "@/lib/env";

export const metadata = pageMetadata({
  title: "הזמנת שולחן — עלינא, ראשון לציון",
  description:
    "הזמינו שולחן בעלינא ברוטשילד 104, ראשון לציון. הזמנה מיידית דרך OnTopo. אישור SMS תוך דקות.",
  path: "/reserve",
});

export default function ReservePage() {
  return (
    <Container className="py-16">
      <header className="text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-brass">הזמנת שולחן</p>
        <h1 className="mt-4 font-display text-5xl text-charcoal md:text-6xl">הזמינו שולחן</h1>
        <p className="mx-auto mt-4 max-w-xl text-charcoal/70">
          הזמינו ישירות דרך OnTopo. אישור מיידי ב-SMS.
        </p>
      </header>

      <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-3xl bg-cream-soft shadow-xl ring-1 ring-brass/15">
        <iframe
          title="הזמנת שולחן בעלינא דרך OnTopo"
          src={env.NEXT_PUBLIC_ONTOPO_URL}
          width="100%"
          height="900"
          frameBorder="0"
          className="block w-full"
          loading="lazy"
        />
      </div>

      <aside className="mx-auto mt-10 max-w-3xl rounded-2xl bg-olive/10 p-6 text-center">
        <p className="text-sm text-charcoal/75">
          מעדיפים בני אדם? חייגו{" "}
          <a href={`tel:${env.NEXT_PUBLIC_PHONE}`} className="font-semibold text-terracotta">
            {env.NEXT_PUBLIC_PHONE}
          </a>{" "}
          או שלחו{" "}
          <a href={env.NEXT_PUBLIC_WHATSAPP_URL} target="_blank" rel="noopener" className="font-semibold text-terracotta">
            WhatsApp
          </a>
          .
        </p>
      </aside>
    </Container>
  );
}
