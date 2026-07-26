import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Lightbulb, Sparkles, Target, Check, Plus, Copy, ChevronDown, ChevronUp, Coins, Gauge, TrendingUp } from 'lucide-react';

const EFFORT = { low: { t: 'מאמץ נמוך', c: 'bg-emerald-100 text-emerald-700' }, medium: { t: 'מאמץ בינוני', c: 'bg-amber-100 text-amber-700' }, high: { t: 'מאמץ גבוה', c: 'bg-rose-100 text-rose-700' } };
const IMPACT = { low: { t: 'אימפקט נמוך', c: 'text-slate-400' }, medium: { t: 'אימפקט בינוני', c: 'text-sky-600' }, high: { t: 'אימפקט גבוה', c: 'text-emerald-600' } };
const ACTION_HINT = {
  club_blast: '💬 מתאים להודעת מועדון',
  ad: '📣 מתאים למודעה ממומנת',
  design: '🎨 דורש עיצוב חומר',
  partner: '🤝 פנייה לשיתוף פעולה',
  manual: '',
};

// Strategic marketing playbook: many diverse tactics (digital + real-world
// guerrilla) grouped into a plan, each actionable — add any idea to the work
// plan as a tracked task, or copy its steps to execute now.
export default function MarketingPlaybook() {
  const [goal, setGoal] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [openKey, setOpenKey] = useState(null);      // "ci-ti" expanded tactic
  const [added, setAdded] = useState({});            // key → true once added as task
  const [addingKey, setAddingKey] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  const build = async () => {
    setLoading(true); setError(''); setPlan(null); setAdded({});
    try {
      const res = await base44.functions.generateMarketingPlaybook({ goal });
      const d = res?.data || res || {};
      if (d.error && !(d.categories || []).length) setError(d.error);
      setPlan(d);
    } catch (e) { setError(e?.message || 'בניית התוכנית נכשלה'); }
    finally { setLoading(false); }
  };

  const addTask = async (t, key) => {
    setAddingKey(key);
    try {
      await base44.functions.addMarketingIdeaTask({
        title: t.title, why: t.why, steps: t.steps || [], cost_ils: t.cost_ils, action_type: t.action_type,
        priority: t.impact === 'high' ? 'high' : t.impact === 'low' ? 'low' : 'medium',
      });
      setAdded(a => ({ ...a, [key]: true }));
    } catch { setError('הוספת המשימה נכשלה'); }
    finally { setAddingKey(null); }
  };

  const copySteps = (t, key) => {
    const txt = `${t.title}\n${t.why || ''}\n\nצעדים:\n` + (t.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
    try { navigator.clipboard?.writeText(txt); setCopiedKey(key); setTimeout(() => setCopiedKey(null), 1800); } catch { /* noop */ }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4" dir="rtl">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-sky-500" />
          <h3 className="font-bold text-slate-800">💡 תוכנית שיווק ורעיונות</h3>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-3">הרבה רעיונות — דיגיטל וגרילה בעולם האמיתי (רול-אפ בכניסה, טעימות, שת"פים, פליירים ועוד) — מסודרים לתוכנית פעולה. כל רעיון אפשר להוסיף לתוכנית העבודה כמשימה.</p>

      <div className="flex gap-2 mb-3 flex-wrap">
        <input value={goal} onChange={(e) => setGoal(e.target.value)}
          placeholder='מטרה (לא חובה): "למלא צהריים באמצע השבוע", "לחשוף את הבר"'
          className="flex-1 min-w-[180px] border border-slate-300 rounded-xl px-3 py-2 text-sm" />
        <button onClick={build} disabled={loading}
          className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'בונה תוכנית…' : 'בנה תוכנית שיווק'}
        </button>
      </div>

      {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">{error}</div>}

      {plan && (
        <div className="space-y-4">
          {plan.strategy && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-800 mb-1"><Target className="w-4 h-4" /> אסטרטגיה</div>
              <p className="text-sm text-slate-700">{plan.strategy}</p>
            </div>
          )}

          {(plan.focus_this_week || []).length > 0 && (
            <div>
              <div className="text-xs font-bold text-slate-500 mb-1.5">🔥 לביצוע כבר השבוע</div>
              <div className="space-y-1">
                {plan.focus_this_week.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(plan.categories || []).map((cat, ci) => (
            <div key={ci}>
              <div className="text-sm font-bold text-slate-700 mb-2 border-b border-slate-100 pb-1">{cat.name}</div>
              <div className="space-y-2">
                {(cat.tactics || []).map((t, ti) => {
                  const key = `${ci}-${ti}`;
                  const open = openKey === key;
                  const eff = EFFORT[t.effort] || EFFORT.medium;
                  const imp = IMPACT[t.impact] || IMPACT.medium;
                  return (
                    <div key={ti} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm text-slate-800">{t.title}</div>
                          {t.why && <div className="text-xs text-slate-500 mt-0.5">{t.why}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-2 text-[11px]">
                        <span className="inline-flex items-center gap-1 bg-white border rounded-full px-2 py-0.5"><Coins className="w-3 h-3 text-amber-500" /> {t.cost_ils > 0 ? `₪${t.cost_ils}` : 'חינם'}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${eff.c}`}><Gauge className="w-3 h-3" /> {eff.t}</span>
                        <span className={`inline-flex items-center gap-1 font-semibold ${imp.c}`}><TrendingUp className="w-3 h-3" /> {imp.t}</span>
                        {ACTION_HINT[t.action_type] && <span className="text-slate-400">{ACTION_HINT[t.action_type]}</span>}
                      </div>

                      {(t.steps || []).length > 0 && (
                        <button onClick={() => setOpenKey(open ? null : key)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
                          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />} {open ? 'הסתר צעדים' : `הצג ${t.steps.length} צעדי ביצוע`}
                        </button>
                      )}
                      {open && (
                        <ol className="mt-1.5 mr-1 space-y-1">
                          {t.steps.map((s, si) => (
                            <li key={si} className="flex items-start gap-2 text-xs text-slate-600">
                              <span className="shrink-0 w-4 h-4 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center mt-0.5">{si + 1}</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ol>
                      )}

                      <div className="flex items-center gap-2 mt-2.5">
                        {added[key] ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><Check className="w-3.5 h-3.5" /> נוסף לתוכנית העבודה</span>
                        ) : (
                          <button onClick={() => addTask(t, key)} disabled={addingKey === key}
                            className="inline-flex items-center gap-1 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg disabled:opacity-60">
                            {addingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} הוסף כמשימה
                          </button>
                        )}
                        <button onClick={() => copySteps(t, key)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1.5">
                          {copiedKey === key ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} העתק
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {(plan.categories || []).length > 0 && (
            <p className="text-[11px] text-slate-400">המשימות שתוסיף מופיעות בטאב "משימות" למעקב וביצוע.</p>
          )}
        </div>
      )}
    </div>
  );
}
