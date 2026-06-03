import React, { useState, useRef, useEffect } from 'react';
import { SUPPORTED_LANGUAGES, useI18n } from '@/lib/i18n';

// Floating language picker — top-right corner on public pages.
// Click reveals the 4 language options. Persists choice to localStorage and
// updates document.dir so the layout flips RTL/LTR.

export default function LanguagePicker({ className = '' }) {
  const [, lang, setLang] = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={`relative inline-block ${className}`} style={{ zIndex: 50 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-white border-2 border-slate-200 rounded-full px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
      >
        <span className="text-lg leading-none">{current.flag}</span>
        <span>{current.label}</span>
        <span className="text-slate-400 text-xs">▼</span>
      </button>
      {open && (
        <div className="absolute mt-2 left-0 right-0 bg-white border-2 border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
          {SUPPORTED_LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => { setLang(l.code); setOpen(false); }}
              className={`w-full text-right px-3 py-2 text-sm flex items-center gap-2 hover:bg-slate-50 ${l.code === lang ? 'bg-emerald-50 font-bold' : ''}`}
              dir={l.dir}
            >
              <span className="text-lg">{l.flag}</span>
              <span className="flex-1">{l.label}</span>
              {l.code === lang && <span className="text-emerald-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
