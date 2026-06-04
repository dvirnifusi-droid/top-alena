import Link from "next/link";
import { Container } from "./Container";
import { Logo } from "@/components/shared/Logo";
import { routes } from "@/lib/routes";
import { env } from "@/lib/env";

const nav = [
  { href: routes.menu, label: "תפריט" },
  { href: routes.events, label: "אירועים" },
  { href: routes.delivery, label: "משלוחים" },
  { href: routes.gallery, label: "גלריה" },
  { href: routes.about, label: "אודות" },
  { href: routes.jobs, label: "דרושים" },
  { href: routes.contact, label: "צור קשר" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-charcoal/5 bg-cream/90 backdrop-blur">
      <Container className="flex flex-col items-center gap-3 py-4 md:gap-4 md:py-5">
        <Link href="/" className="block">
          <Logo />
        </Link>
        <nav className="hidden flex-wrap justify-center gap-8 md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-[0.85rem] uppercase tracking-[0.2em] text-charcoal/70 transition hover:text-terracotta"
            >
              {n.label}
            </Link>
          ))}
          <a
            href={env.NEXT_PUBLIC_ONTOPO_URL}
            target="_blank"
            rel="noopener"
            className="text-[0.85rem] uppercase tracking-[0.2em] font-semibold text-terracotta hover:text-terracotta-600"
          >
            הזמן שולחן ←
          </a>
        </nav>
      </Container>
    </header>
  );
}
