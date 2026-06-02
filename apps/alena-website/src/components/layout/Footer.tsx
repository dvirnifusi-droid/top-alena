import Link from "next/link";
import { Container } from "./Container";
import { routes } from "@/lib/routes";
import { env } from "@/lib/env";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-charcoal/10 bg-cream py-12 text-sm text-charcoal/80">
      <Container className="grid gap-8 md:grid-cols-4">
        <div>
          <p className="font-display text-2xl text-terracotta">עלינא</p>
          <p className="mt-2 max-w-xs">חמארה ים-תיכונית כשרה. רוטשילד 104, ראשון לציון.</p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-charcoal">ניווט</p>
          <ul className="space-y-1">
            <li><Link href={routes.menu}>תפריט</Link></li>
            <li><Link href={routes.events}>אירועים</Link></li>
            <li><Link href={routes.delivery}>משלוחים</Link></li>
            <li><Link href={routes.about}>אודות</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-charcoal">יצירת קשר</p>
          <ul className="space-y-1">
            <li><a href={`tel:${env.NEXT_PUBLIC_PHONE}`}>{env.NEXT_PUBLIC_PHONE}</a></li>
            <li><a href={env.NEXT_PUBLIC_WHATSAPP_URL} target="_blank" rel="noopener">WhatsApp</a></li>
            <li><a href="https://instagram.com/alena.hamara" target="_blank" rel="noopener">Instagram</a></li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-charcoal">שעות</p>
          <ul className="space-y-1 text-xs">
            <li>ראשון–רביעי: 12:00–00:00</li>
            <li>חמישי: 12:00–02:00</li>
            <li>שישי: סגור</li>
            <li>שבת: 20:15–02:00</li>
          </ul>
        </div>
      </Container>
      <Container className="mt-8 border-t border-charcoal/10 pt-4 text-xs text-charcoal/50">
        © {new Date().getFullYear()} עלינא · כל הזכויות שמורות
      </Container>
    </footer>
  );
}
