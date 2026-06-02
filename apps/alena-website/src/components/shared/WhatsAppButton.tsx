import { MessageCircle } from "lucide-react";
import { env } from "@/lib/env";

export function WhatsAppButton({ className }: { className?: string }) {
  return (
    <a href={env.NEXT_PUBLIC_WHATSAPP_URL} target="_blank" rel="noopener" className={className} aria-label="וואטסאפ">
      <MessageCircle className="size-4" /> <span>WhatsApp</span>
    </a>
  );
}
