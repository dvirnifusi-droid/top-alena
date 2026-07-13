import React, { useEffect, useState, useRef } from 'react';
import { Input } from '@/components/ui/input';

// Reliable Hebrew time picker.
// Two side-by-side number fields (HH, MM) instead of the native <input type="time">
// because the iOS wheel picker silently snaps to 5-minute steps and forces the
// user to scroll past hours of options. Two text fields with inputMode="numeric"
// give the OS numeric keypad and accept any 0-23 / 0-59 value.
//
// Accepts value as "HH:mm" or "HH:mm:ss". Emits "HH:mm".
function clamp(n, lo, hi) {
  if (Number.isNaN(n)) return lo;
  if (n < lo) return lo;
  if (n > hi) return hi;
  return n;
}

function splitValue(v) {
  if (!v) return { hh: '', mm: '' };
  const s = String(v).slice(0, 5);
  const [h = '', m = ''] = s.split(':');
  return { hh: h, mm: m };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export default function TimePicker({ value, onChange, autoFocus = false, id, size = 'md' }) {
  const { hh: initialHH, mm: initialMM } = splitValue(value);
  const [hh, setHH] = useState(initialHH);
  const [mm, setMM] = useState(initialMM);
  const mmRef = useRef(null);
  // Compact variant for dense tables/cards (Tips staff rows on mobile): narrower
  // fields + smaller text so HH:MM fits a tight column instead of overflowing.
  const sm = size === 'sm';
  const fieldCls = sm
    ? 'text-center text-sm font-bold w-9 px-1'
    : 'text-center text-lg font-bold w-16 px-2';
  const colonCls = sm ? 'text-sm font-bold text-slate-500' : 'text-lg font-bold text-slate-500';

  // Keep local fields in sync if parent updates the value externally.
  useEffect(() => {
    const next = splitValue(value);
    if (next.hh !== hh) setHH(next.hh);
    if (next.mm !== mm) setMM(next.mm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (newHH, newMM) => {
    // Only emit a FULL value when both fields have 2 digits. During typing
    // (single-digit state), don't push back to the parent — otherwise the
    // parent re-emits a padded "0X" that the useEffect sync clobbers the
    // local state with, and the second digit the user types overwrites the
    // padded "0X" instead of appending to "X". That's the bug where typing
    // "2" then "0" landed as "02" instead of "20".
    if (newHH === '' && newMM === '') {
      onChange('');
      return;
    }
    if (newHH.length < 2 || newMM.length < 2) return; // hold until complete
    const h = clamp(parseInt(newHH, 10), 0, 23);
    const m = clamp(parseInt(newMM, 10), 0, 59);
    onChange(`${pad2(h)}:${pad2(m)}`);
  };

  const handleHHChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setHH(raw);
    // Auto-advance to minutes only AFTER 2 digits, never on a single 3-9 — that
    // older heuristic stole focus before the user finished typing "20"/"21" etc.
    if (raw.length === 2) {
      setTimeout(() => mmRef.current?.focus(), 0);
    }
    emit(raw, mm);
  };

  const handleMMChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2);
    setMM(raw);
    emit(hh, raw);
  };

  const handleBlur = (which) => () => {
    // Pad short values on blur so "9" becomes "09" and emit the now-complete value.
    if (which === 'hh' && hh.length === 1) {
      const padded = pad2(clamp(parseInt(hh, 10), 0, 23));
      setHH(padded);
      emit(padded, mm);
    } else if (which === 'mm' && mm.length === 1) {
      const padded = pad2(clamp(parseInt(mm, 10), 0, 59));
      setMM(padded);
      emit(hh, padded);
    } else {
      // Both already 2 digits, or empty — make sure parent has the current value.
      emit(hh, mm);
    }
  };

  return (
    <div className="flex items-center gap-1 justify-center" dir="ltr">
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoFocus={autoFocus}
        value={hh}
        onChange={handleHHChange}
        onBlur={handleBlur('hh')}
        onFocus={(e) => e.target.select()}
        maxLength={2}
        placeholder="HH"
        className={fieldCls}
        aria-label="שעה"
      />
      <span className={colonCls}>:</span>
      <Input
        ref={mmRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={mm}
        onChange={handleMMChange}
        onBlur={handleBlur('mm')}
        onFocus={(e) => e.target.select()}
        maxLength={2}
        placeholder="MM"
        className={fieldCls}
        aria-label="דקות"
      />
    </div>
  );
}
