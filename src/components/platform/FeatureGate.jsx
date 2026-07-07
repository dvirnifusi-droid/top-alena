import React from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { useTenantModules } from '@/hooks/useTenantModules';

const WA = 'https://wa.me/972532181900?text=%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%A9%D7%93%D7%A8%D7%92%20%D7%90%D7%AA%20%D7%94%D7%97%D7%91%D7%99%D7%9C%D7%94';

// Gate any piece of UI behind a sub-feature flag.
//   enabled  → renders children.
//   locked   → renders a compact inline upsell (default).
//   disabled but not locked (owner turned off, no plan) → renders nothing.
// mode="show" forces children even when disabled (rarely needed).
export default function FeatureGate({ feature, title, children, mode = 'lock', className = '' }) {
  const { hasFeature, isFeatureLocked, featureUnlockPlan } = useTenantModules();
  if (hasFeature(feature)) return <>{children}</>;
  if (!isFeatureLocked(feature)) return mode === 'show' ? <>{children}</> : null;
  const plan = featureUnlockPlan(feature);
  return (
    <div className={`rounded-xl border border-amber-300 bg-amber-50 p-5 text-center ${className}`} dir="rtl">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-2">
        <Lock className="w-5 h-5 text-white" />
      </div>
      {title && <div className="font-bold text-slate-800">{title}</div>}
      <p className="text-sm text-slate-500 mt-1">
        {plan ? <>הפיצ'ר הזה זמין בחבילת <b className="text-amber-600">{plan}</b>.</> : 'הפיצ\'ר הזה לא כלול בחבילה הנוכחית שלך.'}
      </p>
      <a href={WA} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-3 bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold py-2 px-4 rounded-lg">
        <Sparkles className="w-4 h-4" /> שדרג
      </a>
    </div>
  );
}
