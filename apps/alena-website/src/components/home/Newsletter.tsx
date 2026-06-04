"use client";

import { useState } from "react";
import { Container } from "@/components/layout/Container";

export function Newsletter() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error("bad");
      setSent(true);
    } catch {
      setError("משהו לא עבד. נסו שוב או חייגו 03-622-8055.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-cream-soft py-20 md:py-24">
      <Container className="max-w-3xl text-center">
        <p className="text-xs uppercase tracking-[0.35em] text-brass">רשימת תפוצה</p>
        <h2 className="mt-4 font-display text-4xl text-charcoal md:text-5xl">
          הפרטים הראשונים מקבלים את הספיישלים
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-charcoal/70">
          ערבי נושא, מנות מתחלפות, אירועים מיוחדים. שתי הודעות בחודש, אפס ספאם.
        </p>
        {sent ? (
          <p className="mx-auto mt-10 max-w-md rounded-2xl bg-olive/10 p-6 text-olive">
            תודה! נשלח לך עדכון על הערב הבא הקרוב.
          </p>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mx-auto mt-10 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            <input
              type="email"
              required
              placeholder="האימייל שלך"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 rounded-full border border-charcoal/15 bg-white px-5 py-3 outline-none focus:border-terracotta"
            />
            <button
              disabled={loading}
              className="rounded-full bg-terracotta px-6 py-3 font-semibold text-cream shadow-lg shadow-terracotta/20 transition hover:bg-terracotta-600 disabled:opacity-60"
            >
              {loading ? "שולח..." : "הצטרפו"}
            </button>
          </form>
        )}
        {error ? <p className="mt-4 text-sm text-terracotta">{error}</p> : null}
        <p className="mx-auto mt-4 max-w-md text-xs text-charcoal/50">
          בלחיצה אתם מאשרים לקבל עדכונים מעלינא. אפשר להסיר את ההרשמה בכל זמן.
        </p>
      </Container>
    </section>
  );
}
