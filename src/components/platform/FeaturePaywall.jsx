import React from 'react';
import { Lock, Sparkles, X } from 'lucide-react';

// In-app upsell. Shown when a tenant clicks a feature that isn't in their plan.
// `info` = { title, plan } (plan = name of the tier that unlocks it) or null.
export default function FeaturePaywall({ info, onClose }) {
  if (!info) return null;
  return (
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/60 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 left-3 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">{info.title}</h2>
        <p className="text-slate-500 mt-2">
          {info.plan
            ? <>הפיצ'ר הזה זמין בחבילת <b className="text-amber-600">{info.plan}</b>.</>
            : 'הפיצ\'ר הזה לא כלול בחבילה הנוכחית שלך.'}
        </p>
        <div className="mt-5 space-y-2">
          <a
            href="https://wa.me/972532181900?text=%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%A9%D7%93%D7%A8%D7%92%20%D7%90%D7%AA%20%D7%94%D7%97%D7%91%D7%99%D7%9C%D7%94"
            target="_blank" rel="noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-white font-bold py-3 rounded-xl transition"
          >
            <Sparkles className="w-4 h-4" /> אני רוצה לשדרג
          </a>
          <button onClick={onClose} className="w-full text-sm text-slate-400 hover:text-slate-600 py-1">אולי בפעם אחרת</button>
        </div>
      </div>
    </div>
  );
}
