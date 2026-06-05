import Link from "next/link";
import { Container } from "@/components/layout/Container";

export default function NotFound() {
  return (
    <Container className="py-24 text-center md:py-32">
      <p className="text-xs uppercase tracking-[0.35em] text-brass">404</p>
      <h1 className="mt-4 font-display text-6xl text-charcoal md:text-8xl">לא מצאנו</h1>
      <p className="mx-auto mt-6 max-w-md text-lg text-charcoal/70">
        הדף שחיפשתם לא קיים, או אולי עברנו לרוטשילד 104 ואתם עוד מחכים על הכתובת הישנה.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full bg-terracotta px-7 py-3.5 font-bold text-cream shadow-xl shadow-terracotta/25 hover:bg-terracotta-600"
        >
          חזרה לבית <span>←</span>
        </Link>
        <Link
          href="/menu"
          className="inline-flex items-center gap-2 rounded-full border-2 border-charcoal/15 px-7 py-3.5 font-semibold text-charcoal hover:border-brass hover:text-brass"
        >
          לתפריט
        </Link>
      </div>
    </Container>
  );
}
