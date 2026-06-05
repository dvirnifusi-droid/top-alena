"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Accessibility, X, RotateCcw } from "lucide-react";

// Keys mirrored to <html> classList for CSS targeting.
const KEYS = {
  fontStep: "a11y-font-step", // -1 / 0 / 1 / 2
  contrast: "a11y-contrast",
  saturation: "a11y-grayscale",
  links: "a11y-underline-links",
  headings: "a11y-highlight-headings",
  motion: "a11y-no-motion",
  bigCursor: "a11y-big-cursor",
} as const;

type State = {
  fontStep: number; // 0 default
  contrast: boolean;
  grayscale: boolean;
  underlineLinks: boolean;
  highlightHeadings: boolean;
  noMotion: boolean;
  bigCursor: boolean;
};

const DEFAULT: State = {
  fontStep: 0,
  contrast: false,
  grayscale: false,
  underlineLinks: false,
  highlightHeadings: false,
  noMotion: false,
  bigCursor: false,
};

const STORAGE = "alena-a11y-prefs";

function applyToHtml(s: State) {
  const html = document.documentElement;
  html.classList.toggle("a11y-font-down", s.fontStep < 0);
  html.classList.toggle("a11y-font-up", s.fontStep === 1);
  html.classList.toggle("a11y-font-xl", s.fontStep === 2);
  html.classList.toggle("a11y-contrast", s.contrast);
  html.classList.toggle("a11y-grayscale", s.grayscale);
  html.classList.toggle("a11y-underline-links", s.underlineLinks);
  html.classList.toggle("a11y-highlight-headings", s.highlightHeadings);
  html.classList.toggle("a11y-no-motion", s.noMotion);
  html.classList.toggle("a11y-big-cursor", s.bigCursor);
}

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<State>(DEFAULT);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE);
      if (saved) {
        const parsed = { ...DEFAULT, ...JSON.parse(saved) } as State;
        setState(parsed);
        applyToHtml(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  function update(patch: Partial<State>) {
    const next = { ...state, ...patch };
    setState(next);
    applyToHtml(next);
    try {
      localStorage.setItem(STORAGE, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function reset() {
    setState(DEFAULT);
    applyToHtml(DEFAULT);
    try {
      localStorage.removeItem(STORAGE);
    } catch {
      /* ignore */
    }
  }

  if (!mounted) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="הגדרות נגישות"
        title="הגדרות נגישות"
        style={{ WebkitTapHighlightColor: "transparent" }}
        className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-med-blue text-cream shadow-xl shadow-charcoal/30 ring-2 ring-cream hover:bg-charcoal md:bottom-6 md:right-6 md:h-14 md:w-14"
      >
        <Accessibility className="size-6 md:size-7" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="סגור הגדרות נגישות"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[55] bg-charcoal/55"
          />
          <div
            role="dialog"
            aria-label="הגדרות נגישות"
            className="fixed bottom-0 right-0 z-[60] w-full max-w-md overflow-hidden rounded-t-3xl bg-cream shadow-2xl md:bottom-6 md:right-6 md:rounded-3xl"
          >
            <div className="flex items-center justify-between border-b border-brass/15 bg-med-blue px-5 py-4 text-cream">
              <div className="flex items-center gap-2">
                <Accessibility className="size-5" aria-hidden="true" />
                <h2 className="font-display text-xl">הגדרות נגישות</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="סגור"
                className="rounded-full p-1.5 hover:bg-cream/15"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5">
              {/* Font size */}
              <Group title="גודל טקסט">
                <div className="grid grid-cols-4 gap-2">
                  <SizeBtn label="א-" active={state.fontStep === -1} onClick={() => update({ fontStep: -1 })} small />
                  <SizeBtn label="א" active={state.fontStep === 0} onClick={() => update({ fontStep: 0 })} />
                  <SizeBtn label="א+" active={state.fontStep === 1} onClick={() => update({ fontStep: 1 })} big />
                  <SizeBtn label="א++" active={state.fontStep === 2} onClick={() => update({ fontStep: 2 })} bigger />
                </div>
              </Group>

              {/* Toggles */}
              <Group title="התאמות תצוגה">
                <Toggle label="ניגודיות גבוהה" active={state.contrast} onClick={() => update({ contrast: !state.contrast })} />
                <Toggle label="גווני אפור" active={state.grayscale} onClick={() => update({ grayscale: !state.grayscale })} />
                <Toggle label="הדגשת קישורים" active={state.underlineLinks} onClick={() => update({ underlineLinks: !state.underlineLinks })} />
                <Toggle label="הדגשת כותרות" active={state.highlightHeadings} onClick={() => update({ highlightHeadings: !state.highlightHeadings })} />
                <Toggle label="עצור אנימציות" active={state.noMotion} onClick={() => update({ noMotion: !state.noMotion })} />
                <Toggle label="סמן עכבר גדול" active={state.bigCursor} onClick={() => update({ bigCursor: !state.bigCursor })} />
              </Group>

              {/* Reset + statement */}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-charcoal/15 px-5 py-2.5 text-sm font-semibold text-charcoal hover:border-terracotta hover:text-terracotta"
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  איפוס הגדרות
                </button>
                <Link
                  href="/accessibility"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center rounded-full bg-charcoal px-5 py-2.5 text-sm font-semibold text-cream hover:bg-terracotta"
                >
                  הצהרת נגישות
                </Link>
              </div>

              <p className="mt-4 text-center text-[0.7rem] text-charcoal/55">
                העדפותיכם נשמרות בדפדפן זה ועובדות בכל ביקור חוזר
              </p>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-[0.7rem] uppercase tracking-[0.2em] text-brass">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SizeBtn({
  label,
  active,
  onClick,
  small,
  big,
  bigger,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  small?: boolean;
  big?: boolean;
  bigger?: boolean;
}) {
  const size = small ? "text-sm" : big ? "text-lg" : bigger ? "text-2xl" : "text-base";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex aspect-square items-center justify-center rounded-xl border-2 font-bold transition ${size} ${
        active
          ? "border-terracotta bg-terracotta text-cream"
          : "border-charcoal/15 bg-cream-soft text-charcoal hover:border-terracotta"
      }`}
    >
      {label}
    </button>
  );
}

function Toggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
        active
          ? "border-terracotta bg-terracotta/10 text-terracotta"
          : "border-charcoal/10 bg-cream-soft text-charcoal hover:border-terracotta/50"
      }`}
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 rounded-full transition ${active ? "bg-terracotta" : "bg-charcoal/20"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream transition ${
            active ? "right-0.5" : "right-[1.375rem]"
          }`}
        />
      </span>
    </button>
  );
}
