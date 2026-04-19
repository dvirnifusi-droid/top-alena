import React, { useState, useEffect } from 'react';

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [fontSize, setFontSize] = useState(100);
  const [highContrast, setHighContrast] = useState(false);
  const [largeLinks, setLargeLinks] = useState(false);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}%`;
  }, [fontSize]);

  useEffect(() => {
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [highContrast]);

  useEffect(() => {
    if (largeLinks) {
      document.body.classList.add('large-links');
    } else {
      document.body.classList.remove('large-links');
    }
  }, [largeLinks]);

  const reset = () => {
    setFontSize(100);
    setHighContrast(false);
    setLargeLinks(false);
  };

  return (
    <>
      <style>{`
        body.high-contrast {
          filter: contrast(1.5) brightness(1.1);
        }
        body.large-links a, body.large-links button {
          font-size: 1.15em !important;
          font-weight: 800 !important;
          text-decoration: underline !important;
        }
      `}</style>

      {/* כפתור פתיחה */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="פתח תפריט נגישות"
        title="נגישות"
        className="fixed bottom-6 left-4 z-50 w-12 h-12 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-xl flex items-center justify-center text-xl transition-all"
        style={{ fontSize: '22px' }}
      >
        ♿
      </button>

      {/* תפריט */}
      {open && (
        <div
          dir="rtl"
          role="dialog"
          aria-label="תפריט נגישות"
          className="fixed bottom-20 left-4 z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 w-56 space-y-3"
        >
          <p className="font-black text-gray-800 text-sm text-center border-b pb-2 mb-1">♿ הגדרות נגישות</p>

          {/* גודל טקסט */}
          <div>
            <p className="text-xs text-gray-500 mb-1 font-bold">גודל טקסט</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFontSize(f => Math.max(80, f - 10))}
                aria-label="הקטן טקסט"
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-black text-gray-700 text-base transition-all"
              >
                A-
              </button>
              <span className="flex-1 text-center text-xs text-gray-600 font-bold">{fontSize}%</span>
              <button
                onClick={() => setFontSize(f => Math.min(150, f + 10))}
                aria-label="הגדל טקסט"
                className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 font-black text-gray-700 text-base transition-all"
              >
                A+
              </button>
            </div>
          </div>

          {/* ניגודיות */}
          <button
            onClick={() => setHighContrast(v => !v)}
            aria-pressed={highContrast}
            className={`w-full py-2 rounded-xl text-sm font-bold transition-all ${
              highContrast
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {highContrast ? '✅' : '◐'} ניגודיות גבוהה
          </button>

          {/* קישורים בולטים */}
          <button
            onClick={() => setLargeLinks(v => !v)}
            aria-pressed={largeLinks}
            className={`w-full py-2 rounded-xl text-sm font-bold transition-all ${
              largeLinks
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
            }`}
          >
            {largeLinks ? '✅' : '🔗'} קישורים בולטים
          </button>

          {/* איפוס */}
          <button
            onClick={reset}
            className="w-full py-2 rounded-xl text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 transition-all"
          >
            ↺ איפוס הגדרות
          </button>

          {/* קישור להצהרת נגישות */}
          <a
            href="/PrivacyPolicy"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center text-xs text-blue-600 underline font-bold"
          >
            הצהרת נגישות
          </a>
        </div>
      )}
    </>
  );
}