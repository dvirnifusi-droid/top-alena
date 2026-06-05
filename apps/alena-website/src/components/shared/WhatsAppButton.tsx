import { MessageCircle } from "lucide-react";
import { wa } from "@/lib/whatsapp";

type Kind = "reserve" | "event" | "delivery" | "general";

export function WhatsAppButton({
  className,
  kind = "general",
  label = "WhatsApp",
}: {
  className?: string;
  kind?: Kind;
  label?: string;
}) {
  return (
    <a
      href={wa[kind]()}
      target="_blank"
      rel="noopener"
      aria-label={`שלחו הודעה ב-WhatsApp — ${label}`}
      className={className}
    >
      <MessageCircle className="size-4" aria-hidden="true" />
      <span>{label}</span>
    </a>
  );
}
