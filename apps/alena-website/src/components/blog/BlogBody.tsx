import Image from "next/image";
import Link from "next/link";
import type { Block } from "@/content/blog";

// Inline bold via **markdown** asterisks
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-charcoal">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export function BlogBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-6">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "p":
            return (
              <p key={i} className="text-lg leading-relaxed text-charcoal/85">
                {renderInline(b.text)}
              </p>
            );
          case "h2":
            return (
              <h2 key={i} className="mt-12 font-display text-3xl text-charcoal md:text-4xl">
                {b.text}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-8 font-display text-xl text-olive md:text-2xl">
                {b.text}
              </h3>
            );
          case "ul":
            return (
              <ul key={i} className="space-y-3 ps-6">
                {b.items.map((it, j) => (
                  <li
                    key={j}
                    className="relative text-lg leading-relaxed text-charcoal/85 before:absolute before:-start-5 before:top-3 before:h-1.5 before:w-1.5 before:rounded-full before:bg-brass"
                  >
                    {renderInline(it)}
                  </li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="my-8 border-r-4 border-brass pe-6 ps-3"
              >
                <p className="font-display text-2xl italic leading-relaxed text-charcoal">
                  ״{b.text}״
                </p>
                {b.cite ? (
                  <cite className="mt-3 block text-sm not-italic text-charcoal/60">
                    — {b.cite}
                  </cite>
                ) : null}
              </blockquote>
            );
          case "img":
            return (
              <figure key={i} className="my-10">
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl ring-1 ring-brass/20">
                  <Image
                    src={b.src}
                    alt={b.alt}
                    fill
                    sizes="(min-width:768px) 720px, 100vw"
                    className="object-cover"
                  />
                </div>
                {b.caption ? (
                  <figcaption className="mt-3 text-center text-sm italic text-charcoal/60">
                    {b.caption}
                  </figcaption>
                ) : null}
              </figure>
            );
          case "cta":
            return (
              <div key={i} className="my-10 text-center">
                <Link
                  href={b.href}
                  target={b.href.startsWith("http") ? "_blank" : undefined}
                  rel="noopener"
                  className="inline-flex items-center gap-2 rounded-full bg-terracotta px-7 py-3.5 font-bold text-cream shadow-xl shadow-terracotta/25 transition hover:bg-terracotta-600"
                >
                  {b.text} <span>←</span>
                </Link>
              </div>
            );
          case "faq":
            return (
              <div key={i} className="my-10 rounded-3xl border border-brass/20 bg-cream-soft p-6">
                <p className="mb-5 text-xs uppercase tracking-[0.25em] text-brass">FAQ</p>
                <div className="divide-y divide-charcoal/10">
                  {b.items.map((qa, j) => (
                    <details key={j} className="group py-4">
                      <summary className="cursor-pointer list-none font-display text-xl text-charcoal">
                        {qa.q}
                      </summary>
                      <p className="mt-3 text-charcoal/80 leading-relaxed">{qa.a}</p>
                    </details>
                  ))}
                </div>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
