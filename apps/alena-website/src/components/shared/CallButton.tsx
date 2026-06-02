import { Phone } from "lucide-react";
import { env } from "@/lib/env";

export function CallButton({ className }: { className?: string }) {
  return (
    <a href={`tel:${env.NEXT_PUBLIC_PHONE}`} className={className} aria-label="התקשר אלינו">
      <Phone className="size-4" /> <span>{env.NEXT_PUBLIC_PHONE}</span>
    </a>
  );
}
