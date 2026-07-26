import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Lightbulb, Sparkles, Target, Check, Plus, Copy, ChevronDown, ChevronUp, Coins, Gauge, TrendingUp, Download } from 'lucide-react';

const EFFORT = { low: { t: 'מאמץ נמוך', c: 'bg-emerald-100 text-emerald-700' }, medium: { t: 'מאמץ בינוני', c: 'bg-amber-100 text-amber-700' }, high: { t: 'מאמץ גבוה', c: 'bg-rose-100 text-rose-700' } };
const IMPACT = { low: { t: 'אימפקט נמוך', c: 'text-slate-400' }, medium: { t: 'אימפקט בינוני', c: 'text-sky-600' }, high: { t: 'אימפקט גבוה', c: 'text-emerald-600' } };
const ACTION_HINT = {
  club_blast: '💬 מתאים להודעת מועדון',
  ad: '📣 מתאים למודעה ממומנת',
  design: '🎨 דורש עיצוב חומר',
  partner: '🤝 פנייה לשיתוף פעולה',
  manual: '',
};

// Draw wrapped, centered lines; returns the y after the block.
function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  const lines = [];
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  for (const l of lines) { ctx.fillText(l, cx, y); y += lineH; }
  return y;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
// Composite the clean Hebrew text ONTO the AI background → a finished, download-
// ready graphic (canvas renders Hebrew correctly, unlike the image model).
function composeDesign(imgB64, tc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const W = img.naturalWidth || 1080, H = img.naturalHeight || 1080;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      const grad = ctx.createLinearGradient(0, H * 0.4, 0, H);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.fillStyle = grad; ctx.fillRect(0, H * 0.4, W, H * 0.6);
      ctx.textAlign = 'center'; try { ctx.direction = 'rtl'; } catch { /* older browsers */ }
      const cx = W / 2;
      let y = H - H * 0.3;
      ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = W * 0.012;
      ctx.fillStyle = '#ffffff';
      if (tc?.headline) { ctx.font = `bold ${Math.round(W * 0.075)}px Arial, sans-serif`; y = wrapText(ctx, tc.headline, cx, y, W * 0.86, W * 0.09) + W * 0.02; }
      if (tc?.subtext) { ctx.font = `${Math.round(W * 0.04)}px Arial, sans-serif`; y = wrapText(ctx, tc.subtext, cx, y, W * 0.82, W * 0.055) + W * 0.03; }
      if (tc?.cta) {
        ctx.shadowBlur = 0; ctx.font = `bold ${Math.round(W * 0.04)}px Arial, sans-serif`;
        const tw = ctx.measureText(tc.cta).width, pw = tw + W * 0.07, ph = W * 0.085;
        ctx.fillStyle = '#f59e0b'; roundRect(ctx, cx - pw / 2, y, pw, ph, ph / 2); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(tc.cta, cx, y + ph / 2); ctx.textBaseline = 'alphabetic';
      }
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/png;base64,${imgB64}`;
  });
}

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
  const [assistKey, setAssistKey] = useState(null);  // key currently generating help
  const [assistOut, setAssistOut] = useState({});    // key → assist result
  const [finished, setFinished] = useState({});      // key → finished design dataURL
  const [composingKey, setComposingKey] = useState(null);

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

  const assist = async (t, key) => {
    setAssistKey(key);
    try {
      const res = await base44.functions.assistTactic({ title: t.title, why: t.why, action_type: t.action_type, steps: t.steps || [] });
      setAssistOut(o => ({ ...o, [key]: (res?.data || res) || null }));
    } catch (e) { setAssistOut(o => ({ ...o, [key]: { error: e?.message || 'לא הצלחתי' } })); }
    finally { setAssistKey(null); }
  };

  const makeFinished = async (key, imgB64, tc) => {
    setComposingKey(key);
    try {
      const url = await composeDesign(imgB64, tc);
      if (url) setFinished(f => ({ ...f, [key]: url }));
    } catch { /* noop */ }
    finally { setComposingKey(null); }
  };

  const copyText = (txt) => { try { navigator.clipboard?.writeText(txt || ''); } catch { /* noop */ } };

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

                      <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                        {added[key] ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><Check className="w-3.5 h-3.5" /> נוסף — בטאב "משימות"</span>
                        ) : (
                          <button onClick={() => addTask(t, key)} disabled={addingKey === key}
                            className="inline-flex items-center gap-1 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg disabled:opacity-60">
                            {addingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} הוסף כמשימה
                          </button>
                        )}
                        <button onClick={() => assist(t, key)} disabled={assistKey === key}
                          className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 bg-sky-100 hover:bg-sky-200 px-3 py-1.5 rounded-lg disabled:opacity-60">
                          {assistKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} עזור לי לבצע
                        </button>
                        <button onClick={() => copySteps(t, key)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1.5">
                          {copiedKey === key ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} העתק
                        </button>
                      </div>

                      {assistOut[key] && (
                        <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs">
                          {assistOut[key].error ? (
                            <span className="text-red-600">{assistOut[key].error}</span>
                          ) : assistOut[key].kind === 'message' ? (
                            <div>
                              <div className="font-bold text-sky-800 mb-1">✉️ הודעה מוכנה לשליחה</div>
                              <div className="bg-white border rounded-lg p-2 whitespace-pre-wrap text-slate-700">{assistOut[key].message}</div>
                              <button onClick={() => copyText(assistOut[key].message)} className="mt-1.5 inline-flex items-center gap-1 font-semibold text-sky-700"><Copy className="w-3 h-3" /> העתק הודעה</button>
                            </div>
                          ) : assistOut[key].kind === 'design' ? (
                            <div className="space-y-2">
                              {finished[key] ? (
                                <div>
                                  <div className="font-bold text-emerald-700 mb-1">✅ העיצוב מוכן</div>
                                  <img src={finished[key]} alt="finished" className="w-full max-h-72 object-contain rounded-lg border bg-white" />
                                  <a href={finished[key]} download={`design-${key}.png`} className="mt-1.5 inline-flex items-center gap-1 font-bold text-white bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 rounded-lg"><Download className="w-3.5 h-3.5" /> הורד עיצוב</a>
                                </div>
                              ) : (
                                <>
                                  <div className="font-bold text-sky-800">🎨 קונספט + טקסט</div>
                                  {assistOut[key].image_base64 && <img src={`data:image/png;base64,${assistOut[key].image_base64}`} alt="concept" className="w-full max-h-56 object-contain rounded-lg border bg-white" />}
                                  <div className="bg-white border rounded-lg p-2 space-y-0.5 text-slate-700">
                                    {assistOut[key].text_content?.headline && <div><b>כותרת:</b> {assistOut[key].text_content.headline}</div>}
                                    {assistOut[key].text_content?.subtext && <div><b>משנה:</b> {assistOut[key].text_content.subtext}</div>}
                                    {assistOut[key].text_content?.cta && <div><b>קריאה לפעולה:</b> {assistOut[key].text_content.cta}</div>}
                                  </div>
                                  {assistOut[key].image_base64 && (
                                    <button onClick={() => makeFinished(key, assistOut[key].image_base64, assistOut[key].text_content)} disabled={composingKey === key}
                                      className="inline-flex items-center gap-1 font-bold text-white bg-sky-600 hover:bg-sky-500 px-3 py-1.5 rounded-lg disabled:opacity-60">
                                      {composingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} הרכב עיצוב מוכן (עם הטקסט)
                                    </button>
                                  )}
                                  <p className="text-[11px] text-slate-500">העיצוב מרכיב את הטקסט העברי על הרקע — מוכן להורדה והדפסה.</p>
                                </>
                              )}
                            </div>
                          ) : assistOut[key].kind === 'ad' ? (
                            <div className="text-slate-700">📣 {assistOut[key].note || 'פתח את "בנה קמפיין מלא" למעלה עם המטרה הזו.'}</div>
                          ) : (assistOut[key].steps || []).length ? (
                            <ol className="space-y-1">{assistOut[key].steps.map((s, si) => <li key={si} className="text-slate-700">{si + 1}. {s}</li>)}</ol>
                          ) : (
                            <span className="text-slate-500">בצע לפי הצעדים למעלה.</span>
                          )}
                        </div>
                      )}
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
