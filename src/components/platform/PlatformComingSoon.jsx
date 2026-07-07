import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowRight } from 'lucide-react';

// Lightweight placeholder for platform sections that are on the roadmap but not
// built yet. Keeps the nav complete and communicates what's coming, instead of
// a broken/blank page.
export default function PlatformComingSoon({ icon: Icon, title, phase, points = [] }) {
  return (
    <div className="p-4 md:p-6" dir="rtl">
      <div className="max-w-2xl mx-auto rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
          {Icon && <Icon className="w-8 h-8 text-amber-400" />}
        </div>
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        {phase && <div className="inline-block mt-2 text-xs font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1">{phase}</div>}
        {points.length > 0 && (
          <ul className="mt-6 text-right space-y-2 text-sm text-slate-300">
            {points.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <ArrowRight className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" /> <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to={createPageUrl('PlatformAdmin')} className="inline-block mt-6 text-sm text-slate-400 hover:text-slate-200">
          ← חזרה לדף הבית
        </Link>
      </div>
    </div>
  );
}
