import React from 'react';
import { Input } from "@/components/ui/input";

// Native time input — supports any HH:mm including non-round times (e.g. 21:15).
// On mobile this opens the OS wheel picker, which handles minutes cleanly.
// Accepts either "HH:mm" or "HH:mm:ss" as value; always emits "HH:mm".
export default function TimePicker({ value, onChange }) {
  const normalized = value ? String(value).slice(0, 5) : '';

  const handleChange = (e) => {
    const v = e.target.value || '';
    onChange(v);
  };

  return (
    <Input
      type="time"
      step="60"
      value={normalized}
      onChange={handleChange}
      className="text-center"
      dir="ltr"
    />
  );
}
