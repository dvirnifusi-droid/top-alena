import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Loader2, Building, RefreshCw, ExternalLink, LogIn, Send, MessageCircle,
  Activity, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';

const STATUS_BADGE = {
  pending_approval: { label: 'ממתינה לאישור', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  pending_provisioning: { label: 'בתור התקנה', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  provisioning: { label: 'מתקין...', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  live: { label: '✅ פעילה', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  failed: { label: '⚠️ נכשלה', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  rejected: { label: 'נדחתה', cls: 'bg-slate-700 text-slate-300 border-slate-600' },
};

const ONBOARDING_LABEL = {
  welcome: 'טרם התחיל', name: 'שם', address: 'כתובת', hours: 'שעות', cuisine: 'מטבח',
  website: 'אתר', menu: 'תפריט', seating: 'הושבה', employees: 'עובדים', roles: 'תפקידים',
  checklists: 'צ׳קליסטים', suppliers: 'ספקים', training: 'הכשרה', customers: 'מועדון',
  knowledge: 'ידע', slots: 'סלוטים', invoice: 'חשבוניות', active: 'בתהליך', done: '✅ הושלם',
};

function ProgressBar({ percent, label }) {
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  const done = p >= 100;
  return (
    <div className="min-w-[120px]">
      <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full ${done ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${p}%` }} />
      </div>
      <div className="text-[10px] text-slate-400 mt-1">{label} · {p}%</div>
    </div>
  );
}

export default function PlatformAdminTenants() {
  const [tenants, setTenants] = useState([]);
  const [metricsById, setMetricsById] = useState({});
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [busyKind, setBusyKind] = useState(null);
  const [diagOpen, setDiagOpen] = useState(false);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagResult, setDiagResult] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [listRes, metricsRes, plansRes] = await Promise.all([
        base44.functions.listTenants(filter === 'all' ? {} : { status: filter }),
        base44.functions.getSuperAdminMetrics({}).catch(() => null),
        base44.functions.listPlans({}).catch(() => null),
      ]);
      setTenants((listRes?.data || listRes)?.tenants || []);
      const per = (metricsRes?.data || metricsRes)?.per_tenant || [];
      const map = {};
      for (const m of per) map[m.id] = m;
      setMetricsById(map);
      setPlans((plansRes?.data || plansRes)?.plans || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const act = async (t, kind, fn, confirmMsg, okMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusyId(t.id); setBusyKind(kind);
    try {
      const res = await fn();
      if (okMsg) alert(typeof okMsg === 'function' ? okMsg(res?.data || res) : okMsg);
      return res?.data || res;
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusyId(null); setBusyKind(null); }
  };

  const impersonate = (t) => act(t, 'imp', async () => {
    const r = await base44.functions.impersonateTenant({ tenant_id: t.id });
    const d = r?.data || r;
    if (d?.redirect_url) window.open(d.redirect_url, '_blank');
    return r;
  }, `להיכנס כ-owner של "${t.restaurant_name}"? ייפתח טאב חדש עם ההרשאות שלה.`);

  const resendWelcome = (t) => act(t, 'welcome', () => base44.functions.resendTenantWelcome({ tenant_id: t.id }),
    `לשלוח מחדש פרטי כניסה לבעלים של "${t.restaurant_name}" (SMS+מייל+WhatsApp)? הסיסמה תוחלף בזמנית חדשה.`,
    (r) => {
      const dots = [
        r.channels?.sms === 'sent' ? '📱✅' : r.channels?.sms === 'failed' ? '📱❌' : '📱⚪',
        r.channels?.email === 'sent' ? '📧✅' : r.channels?.email === 'failed' ? '📧❌' : '📧⚪',
        r.channels?.whatsapp === 'sent' ? '💬✅' : r.channels?.whatsapp === 'failed' ? '💬❌' : '💬⚪',
      ].join(' ');
      const errs = [r.user_seed_error && `משתמש: ${r.user_seed_error}`, r.sms_error, r.email_error, r.whatsapp_error].filter(Boolean).join('\n');
      return `תוצאה: ${dots}${errs ? '\n\nשגיאות:\n' + errs : ''}`;
    });

  const reprovision = (t) => act(t, 'reprov', () => base44.functions.reprovisionTenant({ tenant_id: t.id }),
    `להתקין מחדש את "${t.restaurant_name}"? מחזיר לתור התקנה (Job חדש). הנתונים ב-DB נשמרים.`,
    (r) => `✅ נכנס לתור התקנה מחדש.\n${r?.message || ''}\nחכה 30-60 שניות ורענן.`).then(() => load());

  const restartOnboarding = (t) => act(t, 'onb', () => base44.functions.restartTenantOnboarding({ tenant_id: t.id }),
    `להפעיל שיחת Onboarding בוואטסאפ עם הבעלים של "${t.restaurant_name}"? הבעלים יקבל הודעה מיידית.`,
    '✅ הודעת Onboarding נשלחה בוואטסאפ');

  const editOwner = async (t) => {
    const phone = window.prompt(`טלפון הבעלים של "${t.restaurant_name}" (וואטסאפ):\nהשאר ריק לא לשנות.`, t.owner_phone || '');
    if (phone === null) return;
    const email = window.prompt(`מייל הבעלים של "${t.restaurant_name}":\nהשאר ריק לא לשנות.`, t.owner_email || '');
    if (email === null) return;
    const payload = { tenant_id: t.id };
    if (phone.trim() && phone.trim() !== (t.owner_phone || '')) payload.owner_phone = phone.trim();
    if (email.trim() && email.trim() !== (t.owner_email || '')) payload.owner_email = email.trim();
    if (!payload.owner_phone && !payload.owner_email) { alert('לא שונה כלום.'); return; }
    await act(t, 'edit', () => base44.functions.updateTenantOwner(payload), null,
      (r) => `✅ עודכן.\nטלפון: ${r?.owner?.owner_phone || '—'}\nמייל: ${r?.owner?.owner_email || '—'}`);
    load();
  };

  // A FAILED tenant is re-driven through reprovisionTenant (resets status →
  // queues a fresh provisioning Job). approveTenant refuses a 'failed' status
  // ("cannot approve") — it's only for pending_approval.
  const retryFailed = (t) => act(t, 'retry', () => base44.functions.reprovisionTenant({ tenant_id: t.id }),
    `לנסות שוב להקים את "${t.restaurant_name}"? מחזיר לתור התקנה (Job חדש). הנתונים ב-DB נשמרים.`,
    (r) => `✅ נכנס לתור התקנה מחדש.\n${r?.message || ''}\nחכה 30-60 שניות ורענן.`).then(() => load());

  const deleteTenant = async (t) => {
    const typed = window.prompt(
      `⚠️ מחיקת "${t.restaurant_name}".\n\nהעסק ייעלם מהקונסולה. הנתונים נשמרים וניתן לשחזר (מחיקה מלאה של הסכמה/קונטיינר תתבצע בנפרד).\n\nלאישור, הקלד את המילה:  מחק`,
      '',
    );
    if (typed === null) return;
    if (typed.trim() !== 'מחק') { alert('לא נמחק. יש להקליד בדיוק: מחק'); return; }
    // The button is already restricted to the platform owner; this is just an
    // anti-misclick guard. The backend still verifies the slug, which the client
    // supplies automatically (no secret to expose).
    await act(t, 'del', () => base44.functions.deleteTenant({ tenant_id: t.id, confirm_slug: t.slug }), null,
      (r) => `🗑️ "${r?.restaurant_name || t.restaurant_name}" הוסר מהקונסולה.`);
    load();
  };

  const assignPlan = async (t, planKey) => {
    if (!planKey || planKey === (t.plan_key || '')) return;
    const plan = plans.find(p => p.key === planKey);
    if (!window.confirm(`להקצות את "${t.restaurant_name}" לחבילת ${plan?.name || planKey}?\nזה יעדכן את הפיצ׳רים הזמינים למסעדה מיד.`)) return;
    await act(t, 'plan', () => base44.functions.assignTenantPlan({ tenant_id: t.id, plan_key: planKey }), null,
      (r) => `✅ הוקצתה חבילת ${plan?.name || planKey} — ${r?.modules_materialised || 0} מודולים עודכנו.`);
    load();
  };

  const runDiagnose = async () => {
    setDiagBusy(true); setDiagResult(null);
    try {
      const res = await base44.functions.diagnoseChannels({});
      setDiagResult(res?.data || res);
    } catch (e) { setDiagResult({ error: e?.message || String(e) }); }
    finally { setDiagBusy(false); }
  };

  const busy = (t, kind) => busyId === t.id && busyKind === kind;
  const spin = <Loader2 className="w-3.5 h-3.5 animate-spin" />;

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Building className="w-6 h-6 text-blue-400" /> כל המסעדות
        </h1>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> רענן
        </button>
      </div>

      {/* Channel diagnostics (collapsible) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900">
        <button onClick={() => setDiagOpen(o => !o)} className="w-full flex items-center gap-2 p-4 text-right">
          <Activity className="w-5 h-5 text-slate-400" />
          <span className="font-semibold text-slate-200 flex-1">בריאות מערכת — בדיקת ערוצים (SMS / מייל / WhatsApp)</span>
          {diagOpen ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </button>
        {diagOpen && (
          <div className="px-4 pb-4">
            <button onClick={runDiagnose} disabled={diagBusy}
              className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-3 py-1.5 rounded-lg inline-flex items-center gap-2">
              {diagBusy ? spin : 'הרץ בדיקה'}
            </button>
            {diagResult && (
              <div className="mt-3 text-xs">
                {diagResult.error ? (
                  <div className="p-3 rounded bg-red-500/10 text-red-300">שגיאה: {diagResult.error}</div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(diagResult.env || {}).map(([k, v]) => (
                      <div key={k} className={`p-2 rounded ${String(v).includes('MISSING') ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                        <div className="font-mono text-[10px] opacity-70">{k}</div>
                        <div className="font-semibold">{String(v)}</div>
                      </div>
                    ))}
                    {['email_send', 'sms_send', 'whatsapp_send'].map(k => {
                      const r = diagResult.tests?.[k]; if (!r) return null;
                      const ok = r.ok || r.success || r.status === 200; const skipped = r.skipped;
                      const bg = skipped ? 'bg-slate-800 text-slate-400' : ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300';
                      return (
                        <div key={k} className={`p-2 rounded ${bg}`}>
                          <div className="font-mono text-[10px] opacity-70">{k}</div>
                          <div className="font-semibold">{skipped ? `⚪ ${r.skipped}` : ok ? '✅ OK' : '❌ ' + (r.error || `HTTP ${r.status}`)}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'live', 'pending_approval', 'pending_provisioning', 'failed', 'rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-sm px-3 py-1.5 rounded-lg border ${filter === f
              ? 'bg-amber-500 text-slate-900 border-amber-500 font-semibold'
              : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'}`}>
            {f === 'all' ? 'הכל' : STATUS_BADGE[f]?.label || f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : tenants.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
          <Building className="w-12 h-12 mx-auto text-slate-700 mb-2" /> אין מסעדות בקטגוריה הזו.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/60 text-xs text-slate-400">
                <tr>
                  <th className="p-3 text-right">מסעדה</th>
                  <th className="p-3 text-right">בעלים</th>
                  <th className="p-3 text-right">סטטוס</th>
                  <th className="p-3 text-right">חבילה</th>
                  <th className="p-3 text-center">משתמשים</th>
                  <th className="p-3 text-center">עובדים</th>
                  <th className="p-3 text-right">הטמעה</th>
                  <th className="p-3 text-right">פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tenants.map(t => {
                  const st = STATUS_BADGE[t.status] || { label: t.status, cls: 'bg-slate-700 text-slate-300 border-slate-600' };
                  const m = metricsById[t.id];
                  const isLive = t.status === 'live';
                  const zeroEmployees = isLive && m && (m.employees === 0);
                  const onb = m?.onboarding;
                  return (
                    <tr key={t.id} className="hover:bg-slate-800/40">
                      <td className="p-3">
                        <div className="font-semibold text-white flex items-center gap-1">
                          {m?.is_main && <span className="text-amber-400 text-xs">👑</span>}{t.restaurant_name}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <code>{t.slug}</code>
                          {isLive && t.subdomain_url && (
                            <a href={t.subdomain_url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-0.5">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        {m?.error && <div className="text-[11px] text-red-400 mt-0.5">⚠ {m.error}</div>}
                      </td>
                      <td className="p-3">
                        <div className="text-slate-200">{t.owner_name || '—'}</div>
                        <div className="text-[11px] text-slate-500" dir="ltr">{t.owner_phone || ''}</div>
                      </td>
                      <td className="p-3"><span className={`inline-block px-2 py-0.5 rounded border text-[11px] ${st.cls}`}>{st.label}</span></td>
                      <td className="p-3">
                        {isLive && !m?.is_main ? (
                          <select
                            value={t.plan_key || ''}
                            disabled={busy(t, 'plan')}
                            onChange={(e) => assignPlan(t, e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:border-amber-500 outline-none"
                          >
                            <option value="">— ללא —</option>
                            {plans.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                          </select>
                        ) : <span className="text-[11px] text-slate-600">—</span>}
                        {t.trial_ends_at && isLive && (
                          <div className="text-[10px] text-amber-400/70 mt-0.5">ניסיון עד {String(t.trial_ends_at).slice(0, 10)}</div>
                        )}
                      </td>
                      <td className="p-3 text-center text-slate-300">{isLive ? (m?.users ?? '—') : '—'}</td>
                      <td className="p-3 text-center">
                        {isLive
                          ? <span className={zeroEmployees ? 'text-red-400 font-bold' : 'text-slate-300'}>{m?.employees ?? '—'}{zeroEmployees ? ' ⚠' : ''}</span>
                          : '—'}
                      </td>
                      <td className="p-3">
                        {onb
                          ? <ProgressBar percent={onb.progress_percent} label={ONBOARDING_LABEL[onb.current_step] || onb.current_step || ''} />
                          : <span className="text-[11px] text-slate-600">—</span>}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {t.status === 'failed' ? (
                            <button onClick={() => retryFailed(t)} disabled={busy(t, 'retry')}
                              className="text-xs px-2 py-1 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1">
                              {busy(t, 'retry') ? spin : 'נסה שוב'}
                            </button>
                          ) : !m?.is_main && (
                            <>
                              {isLive && (
                                <button onClick={() => impersonate(t)} disabled={busy(t, 'imp')} title="היכנס כבעלים"
                                  className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-500 inline-flex items-center gap-1">
                                  {busy(t, 'imp') ? spin : <><LogIn className="w-3.5 h-3.5" /> היכנס</>}
                                </button>
                              )}
                              <button onClick={() => resendWelcome(t)} disabled={busy(t, 'welcome')} title="שלח פרטי כניסה"
                                className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/30 inline-flex items-center gap-1">
                                {busy(t, 'welcome') ? spin : <><Send className="w-3.5 h-3.5" /> פרטים</>}
                              </button>
                              <button onClick={() => restartOnboarding(t)} disabled={busy(t, 'onb')} title="הפעל onboarding בוואטסאפ"
                                className="text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 inline-flex items-center gap-1">
                                {busy(t, 'onb') ? spin : <><MessageCircle className="w-3.5 h-3.5" /> הטמעה</>}
                              </button>
                              <button onClick={() => reprovision(t)} disabled={busy(t, 'reprov')} title="התקן מחדש"
                                className="text-xs px-2 py-1 rounded bg-orange-500/10 text-orange-300 border border-orange-500/30 inline-flex items-center gap-1">
                                {busy(t, 'reprov') ? spin : <><RefreshCw className="w-3.5 h-3.5" /></>}
                              </button>
                              <button onClick={() => editOwner(t)} disabled={busy(t, 'edit')} title="ערוך בעלים"
                                className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-500">
                                {busy(t, 'edit') ? spin : '✏️'}
                              </button>
                              <button onClick={() => deleteTenant(t)} disabled={busy(t, 'del')} title="מחק עסק"
                                className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-300 border border-red-500/30 hover:border-red-500/60 inline-flex items-center gap-1">
                                {busy(t, 'del') ? spin : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
