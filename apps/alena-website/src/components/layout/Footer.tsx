import Link from "next/link";
import { Container } from "./Container";
import { routes } from "@/lib/routes";
import { env } from "@/lib/env";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-brass/20 bg-charcoal py-14 text-sm text-cream/75">
      <Container className="grid gap-10 md:grid-cols-4">
        <div>
          <p className="font-display text-3xl text-cream">עלינא</p>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-brass">חמארה · ראשון לציון</p>
          <p className="mt-4 max-w-xs leading-relaxed">
            חמארה ים-תיכונית כשרה. בר רחוב שמח שמתחפש לאוצר שכונתי.
          </p>
        </div>
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.25em] text-brass">ניווט</p>
          <ul className="space-y-2">
            <li><Link href={routes.menu} className="hover:text-cream">תפריט</Link></li>
            <li><Link href={routes.events} className="hover:text-cream">אירועים</Link></li>
            <li><Link href={routes.delivery} className="hover:text-cream">משלוחים</Link></li>
            <li><Link href={routes.about} className="hover:text-cream">אודות</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.25em] text-brass">יצירת קשר</p>
          <ul className="space-y-2">
            <li><a href={`tel:${env.NEXT_PUBLIC_PHONE}`} className="hover:text-cream">{env.NEXT_PUBLIC_PHONE}</a></li>
            <li><a href={env.NEXT_PUBLIC_WHATSAPP_URL} target="_blank" rel="noopener" className="hover:text-cream">WhatsApp</a></li>
            <li><a href="https://instagram.com/alena.hamara" target="_blank" rel="noopener" className="hover:text-cream">Instagram</a></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.25em] text-brass">שעות</p>
          <ul className="space-y-1.5 text-xs leading-relaxed">
            <li>ראשון–רביעי · 12:00–00:00</li>
            <li>חמישי · 12:00–02:00</li>
            <li>שישי · סגור</li>
            <li>שבת · 20:15–02:00</li>
          </ul>
        </div>
      </Container>
      <Container className="mt-10 border-t border-cream/10 pt-5 text-xs text-cream/45">
        © {new Date().getFullYear()} עלינא · כל הזכויות שמורות
      </Container>
    </footer>
  );
}
