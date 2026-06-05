// Build a WhatsApp click-to-chat URL with a pre-filled message.
// The phone number lives in env so it can be swapped without redeploying logic.

import { env } from "./env";

const RAW_NUMBER = env.NEXT_PUBLIC_WHATSAPP_URL.replace(/[^0-9]/g, "");

export function whatsappLink(message: string): string {
  const text = encodeURIComponent(message);
  return `https://wa.me/${RAW_NUMBER}?text=${text}`;
}

// Common pre-filled messages used across the site
export const wa = {
  reserve: () =>
    whatsappLink("שלום, אני רוצה להזמין שולחן בעלינא. מתי יש מקום פנוי?"),
  event: () =>
    whatsappLink(
      "שלום, אני מעוניין/ת לארגן אירוע פרטי בעלינא. אשמח לדבר על האפשרויות.",
    ),
  delivery: () =>
    whatsappLink("שלום, אני רוצה להזמין משלוח / איסוף עצמי. אפשר תפריט?"),
  general: () => whatsappLink("שלום עלינא 👋"),
};
