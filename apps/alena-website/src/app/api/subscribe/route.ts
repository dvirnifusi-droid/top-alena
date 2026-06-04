import { NextResponse } from "next/server";
import { Resend } from "resend";
import { z } from "zod";
import { env } from "@/lib/env";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }
  // No Resend configured = soft-success so the UI confirms.
  // When Resend is added, this forwards the lead to the owner inbox.
  if (!env.RESEND_API_KEY || !env.EVENT_INQUIRY_TO) {
    return NextResponse.json({ ok: true, note: "resend not configured" });
  }
  const resend = new Resend(env.RESEND_API_KEY);
  await resend.emails.send({
    from: "Alena List <list@alenabepita.co.il>",
    to: env.EVENT_INQUIRY_TO,
    subject: `הצטרפות חדשה לרשימת תפוצה`,
    text: `מייל: ${parsed.data.email}`,
  });
  return NextResponse.json({ ok: true });
}
