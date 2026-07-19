import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, Undo2 } from 'lucide-react';
import { useTenantBranding } from '@/hooks/useTenantBranding';

// The page behind the "להסרה מרשימת הדיוור" link in every marketing message.
//
// It acts on load rather than asking for a confirmation click. Someone who
// followed this link has already decided; making them press another button is a
// dark pattern, and the law asks for a simple way to refuse — not a persuasive
// one. The undo is there for the misclick, which is the only reason to hesitate.
export default function Unsubscribe() {
  const [search] = useSearchParams();
  const c = search.get('c') || '';
  const s = search.get('s') || '';
  const [state, setState] = useState('working');   // working | done | already | error | resubscribed
  const [name, setName] = useState(null);
  const branding = useTenantBranding();
  const brand = branding?.name || 'המסעדה';

  useEffect(() => {
    if (!c || !s) { setState('error'); return; }
    (async () => {
      try {
        const r = await base44.asServiceRole.functions.unsubscribeByLink({ c, s });
        const d = r?.data || r || {};
        setName(d.name || null);
        setState(d.already ? 'already' : 'done');
      } catch { setState('error'); }
    })();
  }, [c, s]);

  const undo = async () => {
    setState('working');
    try {
      await base44.asServiceRole.functions.resubscribeByLink({ c, s });
      setState('resubscribed');
    } catch { setState('error'); }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl border shadow-sm p-8 text-center">
        <p className="text-sm text-slate-500 mb-5">{brand}</p>

        {state === 'working' && (
          <div className="py-6"><Loader2 className="w-6 h-6 animate-spin text-slate-300 mx-auto" /></div>
        )}

        {(state === 'done' || state === 'already') && (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-slate-800">
              {state === 'already' ? 'כבר הוסרת מהרשימה' : 'הוסרת מרשימת הדיוור'}
            </h1>
            <p className="text-sm text-slate-600 mt-2">
              {name ? `${name}, לא ` : 'לא '}נשלח אליך יותר דיוור שיווקי.
              {' '}הודעות על הזמנה שביצעת עדיין יגיעו.
            </p>
            <button onClick={undo}
              className="mt-6 text-sm text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5">
              <Undo2 className="w-4 h-4" /> לחצתי בטעות — החזירו אותי
            </button>
          </>
        )}

        {state === 'resubscribed' && (
          <>
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-slate-800">חזרת לרשימה</h1>
            <p className="text-sm text-slate-600 mt-2">תמשיך לקבל עדכונים והטבות.</p>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 className="text-xl font-bold text-slate-800">הקישור לא תקין</h1>
            <p className="text-sm text-slate-600 mt-2">
              ייתכן שהוא נחתך בהעתקה. אפשר להשיב להודעה שקיבלת במילה "הסר" ונטפל בזה.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
