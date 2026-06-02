import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "@/lib/env";

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().min(9),
  email: z.string().email().optional().or(z.literal("")),
  date: z.string(),
  guests: z.coerce.number().min(1),
  details: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (!env.RESEND_API_KEY || !env.EVENT_INQUIRY_TO) {
    return NextResponse.json({ ok: true, note: "resend not configured" });
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const { name, phone, email, date, guests, details } = parsed.data;
  await resend.emails.send({
    from: "Alena Events <events@alenabepita.co.il>",
    to: env.EVENT_INQUIRY_TO,
    replyTo: email || undefined,
    subject: `אירוע חדש — ${name} (${guests} אורחים)`,
    text: `שם: ${name}\nטלפון: ${phone}\nמייל: ${email || "-"}\nתאריך: ${date}\nאורחים: ${guests}\nפרטים: ${details || "-"}`,
  });
  return NextResponse.json({ ok: true });
}
