import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, MessageCircle, Sparkles, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const STEP_LABELS = {
  welcome: 'ברוכים הבאים',
  restaurant_name: 'שם המסעדה',
  address: 'כתובת',
  opening_hours: 'שעות פתיחה',
  cuisine: 'סוג מטבח',
  employee_count: 'מספר עובדים',
  menu_intro: 'תפריט',
  done: 'סיום',
};

export default function OnboardingProgressCard() {
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await base44.functions.getMyOnboardingStatus({});
        const payload = res?.data || res;
        if (alive) setState({ loading: false, data: payload });
      } catch {
        if (alive) setState({ loading: false, data: null });
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  if (state.loading || !state.data?.onboarding) return null;
  const o = state.data.onboarding;
  if (o.is_done) return null; // hidden after completion

  const total = 7;
  const done = Array.isArray(o.completed_steps) ? o.completed_steps.length : 0;
  const currentLabel = STEP_LABELS[o.current_step] || o.current_step;

  return (
    <Card className="bg-gradient-to-l from-amber-50 to-orange-100 border-2 border-amber-300">
      <CardContent className="p-4 md:p-6">
        <div className="flex items-start gap-3">
          <div className="bg-amber-500 text-white rounded-full p-2 flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-amber-900 text-lg">בוא נסיים את ההקמה של המסעדה שלך</h3>
            <p className="text-sm text-amber-800 mt-1">
              המשך את השיחה שלנו בוואטסאפ — שלב נוכחי: <strong>{currentLabel}</strong>. אני שם, מחכה לתשובה שלך 💬
            </p>
            <div className="mt-3">
              <div className="flex items-center gap-2 text-xs text-amber-800 mb-1">
                <span className="font-bold">{o.progress_percent}%</span>
                <span>·</span>
                <span>{done}/{total} שלבים</span>
              </div>
              <div className="w-full bg-white/60 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-l from-amber-500 to-orange-500 h-full transition-all"
                  style={{ width: `${o.progress_percent}%` }}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Array.isArray(o.completed_steps) && o.completed_steps.map((s) => (
                <span key={s} className="text-xs bg-white/70 text-amber-900 px-2 py-1 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  {STEP_LABELS[s] || s}
                </span>
              ))}
            </div>
            <div className="mt-3 text-xs text-amber-700 flex items-center gap-1">
              <MessageCircle className="w-3 h-3" />
              פתח את הוואטסאפ שלך — יש שם הודעה חדשה שמחכה
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
