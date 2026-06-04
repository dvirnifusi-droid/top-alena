import Link from "next/link";
import { Container } from "./Container";
import { ReservationCTA } from "@/components/shared/ReservationCTA";
import { Logo } from "@/components/shared/Logo";
import { routes } from "@/lib/routes";

const nav = [
  { href: routes.menu, label: "תפריט" },
  { href: routes.events, label: "אירועים" },
  { href: routes.delivery, label: "משלוחים" },
  { href: routes.gallery, label: "גלריה" },
  { href: routes.about, label: "אודות" },
  { href: routes.contact, label: "צור קשר" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-charcoal/5 bg-cream/85 backdrop-blur">
      <Container className="flex items-center justify-between py-3">
        <Link href="/" className="group">
          <Logo />
        </Link>
        <nav className="hidden gap-7 md:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-sm font-medium text-charcoal/75 transition hover:text-terracotta"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <ReservationCTA className="hidden md:inline-flex" />
      </Container>
    </header>
  );
}
