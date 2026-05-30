import React, { useState } from 'react';

// Owner-only utility: opens the current page inside an iframe at a real phone
// viewport so Tailwind responsive classes (md:, lg:) react like a real device
// and we can spot layout issues without leaving the browser.

const DEVICES = [
  { key: 'iphone-se',  label: 'iPhone SE',  w: 375, h: 667  },
  { key: 'iphone',     label: 'iPhone 14',  w: 390, h: 844  },
  { key: 'android',    label: 'Android',    w: 412, h: 915  },
  { key: 'ipad-mini',  label: 'iPad Mini',  w: 768, h: 1024 },
  { key: 'ipad',       label: 'iPad Pro',   w: 1024, h: 1366 },
];

export default function DevicePreviewToggle() {
  const [open, setOpen] = useState(false);
  const [device, setDevice] = useState(DEVICES[1]); // iPhone 14 default
  const withMarker = () => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    url.searchParams.set('devpreview', '1');
    return url.toString();
  };
  const [src, setSrc] = useState(withMarker);
  const reload = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('devpreview', '1');
    url.searchParams.set('_t', String(Date.now()));
    setSrc(url.toString());
  };

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => { setSrc(withMarker()); setOpen(true); }}
        className="fixed bottom-5 left-5 z-[9990] w-12 h-12 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-2xl shadow-2xl hidden lg:flex items-center justify-center"
        title="תצוגה במכשיר"
        aria-label="תצוגה במכשיר"
      >
        📱
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[9991] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-3"
          onClick={() => setOpen(false)}
          dir="rtl"
        >
          <div
            className="bg-white rounded-2xl shadow-xl mb-3 px-3 py-2 flex flex-wrap items-center gap-2 max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs font-bold text-slate-600 ml-2">📱 תצוגה במכשיר:</span>
            {DEVICES.map((d) => (
              <button
                key={d.key}
                onClick={() => setDevice(d)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition ${
                  device.key === d.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {d.label}
              </button>
            ))}
            <span className="text-xs text-slate-400 mx-2">{device.w}×{device.h}</span>
            <button
              onClick={reload}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-blue-100 hover:bg-blue-200 text-blue-700"
              title="רענן תצוגה"
            >🔄</button>
            <button
              onClick={() => setOpen(false)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-red-500 hover:bg-red-600 text-white"
            >✕ סגור</button>
          </div>

          <div
            className="bg-slate-950 rounded-[42px] p-2.5 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] border-4 border-slate-800 transition-all"
            onClick={(e) => e.stopPropagation()}
            style={{ maxHeight: '90vh' }}
          >
            <iframe
              key={device.key + src}
              src={src}
              width={device.w}
              height={Math.min(device.h, Math.floor(window.innerHeight * 0.85))}
              className="rounded-[28px] bg-white border-0 block"
              title="device preview"
            />
          </div>
          <p className="text-white/70 text-xs mt-3">הקלקה מחוץ למסך → סגירה</p>
        </div>
      )}
    </>
  );
}
