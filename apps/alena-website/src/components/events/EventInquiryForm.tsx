"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({
  name: z.string().min(2, "שם קצר מדי"),
  phone: z.string().min(9, "טלפון לא תקין"),
  email: z.string().email("מייל לא תקין").optional().or(z.literal("")),
  date: z.string(),
  guests: z.coerce.number().min(1),
  details: z.string().max(1000).optional(),
});

type FormData = z.infer<typeof schema>;

const inputCls =
  "w-full rounded-xl border border-charcoal/15 bg-white px-4 py-2 outline-none focus:border-terracotta";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-terracotta">{error}</span> : null}
    </label>
  );
}

export function EventInquiryForm() {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    const res = await fetch("/api/event-inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) setSent(true);
  };

  if (sent) {
    return (
      <p className="rounded-2xl bg-olive/10 p-6 text-olive">
        תודה! קיבלנו את הפנייה ונחזור אליך תוך 24 שעות.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
      <Field label="שם מלא" error={errors.name?.message}>
        <input {...register("name")} className={inputCls} />
      </Field>
      <Field label="טלפון" error={errors.phone?.message}>
        <input {...register("phone")} className={inputCls} />
      </Field>
      <Field label="מייל (אופציונלי)" error={errors.email?.message}>
        <input {...register("email")} className={inputCls} />
      </Field>
      <Field label="תאריך משוער" error={errors.date?.message}>
        <input type="date" {...register("date")} className={inputCls} />
      </Field>
      <Field label="מספר אורחים" error={errors.guests?.message}>
        <input type="number" {...register("guests")} className={inputCls} />
      </Field>
      <Field label="פרטים נוספים" error={errors.details?.message}>
        <textarea {...register("details")} rows={4} className={inputCls} />
      </Field>
      <button
        disabled={isSubmitting}
        className="rounded-full bg-terracotta px-6 py-3 font-semibold text-cream disabled:opacity-50"
      >
        {isSubmitting ? "שולח..." : "שלח פנייה"}
      </button>
    </form>
  );
}
