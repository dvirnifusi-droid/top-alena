import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Crown, CheckCircle2, Clock, AlertTriangle, Building, RefreshCw, Users, DollarSign, Zap, LogIn, ExternalLink, MessageCircle, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

function PlatformAdminInner() {
  const [stats, setStats] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [pending, setPending] = useState([]);
  const [failed, setFailed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [impersonatingId, setImpersonatingId] = useState(null);
  const [restartingId, setRestartingId] = useState(null);
  const [actioningId, setActioningId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, metricsRes, pendingRes, failedRes, provisioningRes] = await Promise.all([
        base44.functions.getTenantStats({}),
        base44.functions.getSuperAdminMetrics({}),
        base44.functions.listTenants({ status: 'pending_approval' }),
        base44.functions.listTenants({ status: 'failed' }),
        base44.functions.listTenants({ status: 'pending_provisioning' }),
      ]);
      setStats(statsRes?.data || statsRes);
      setMetrics(metricsRes?.data || metricsRes);
      const pendingList = (pendingRes?.data || pendingRes)?.tenants || [];
      const provisioningList = (provisioningRes?.data || provisioningRes)?.tenants || [];
      setPending([...pendingList, ...provisioningList]);
      setFailed((failedRes?.data || failedRes)?.tenants || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const approveTenant = async (t) => {
    if (!window.confirm(`לאשר ולהקים את "${t.restaurant_name}" (${t.slug}.topalena.com)?`)) return;
    setActioningId(t.id);
    try {
      await base44.functions.approveTenant({ tenant_id: t.id });
      alert(`✅ ${t.restaurant_name} אושר. ההקמה תתחיל תוך 2 דקות.`);
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setActioningId(null); }
  };

  const rejectTenant = async (t) => {
    if (!window.confirm(`לדחות את "${t.restaurant_name}"? הפעולה בלתי הפיכה.`)) return;
    setActioningId(t.id);
    try {
      await base44.functions.rejectTenant({ tenant_id: t.id });
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setActioningId(null); }
  };

  const restartOnboarding = async (t) => {
    if (!window.confirm(`להפעיל שיחת Onboarding בוואטסאפ עם הבעלים של "${t.name}"? הבעלים יקבל הודעה מיידית.`)) return;
    setRestartingId(t.id);
    try {
      await base44.functions.restartTenantOnboarding({ tenant_id: t.id });
      alert('✅ הודעת Onboarding נשלחה בוואטסאפ');
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setRestartingId(null); }
  };

  const resendWelcome = async (t) => {
    const label = t.restaurant_name || t.name || t.slug;
    if (!window.confirm(`לשלוח מחדש את פרטי הכניסה לבעלים של "${label}" ב-SMS + מייל + WhatsApp? הסיסמה הישנה תוחלף בסיסמה זמנית חדשה.`)) return;
    setActioningId(t.id);
    try {
      const res = await base44.functions.resendTenantWelcome({ tenant_id: t.id });
      const r = res?.data || res;
      const dots = [
        r.channels?.sms === 'sent' ? '📱✅' : (r.channels?.sms === 'failed' ? '📱❌' : '📱⚪'),
        r.channels?.email === 'sent' ? '📧✅' : (r.channels?.email === 'failed' ? '📧❌' : '📧⚪'),
        r.channels?.whatsapp === 'sent' ? '💬✅' : (r.channels?.whatsapp === 'failed' ? '💬❌' : '💬⚪'),
      ].join(' ');
      const errors = [r.sms_error, r.email_error, r.whatsapp_error].filter(Boolean).join('\n');
      alert(`תוצאה: ${dots}${errors ? '\n\nשגיאות:\n' + errors : ''}`);
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setActioningId(null); }
  };

  const [diagBusy, setDiagBusy] = useState(false);
  const [diagResult, setDiagResult] = useState(null);
  const runDiagnose = async () => {
    setDiagBusy(true); setDiagResult(null);
    try {
      const res = await base44.functions.diagnoseChannels({});
      setDiagResult(res?.data || res);
    } catch (e) { setDiagResult({ error: e?.message || String(e) }); }
    finally { setDiagBusy(false); }
  };

  const impersonate = async (t) => {
    if (!window.confirm(`להיכנס כ-owner של "${t.name}"? תיפתח בטאב חדש עם ההרשאות שלה.`)) return;
    setImpersonatingId(t.id);
    try {
      const res = await base44.functions.impersonateTenant({ tenant_id: t.id });
      const data = res?.data || res;
      window.open(data.redirect_url, '_blank');
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setImpersonatingId(null); }
  };

  const statCards = stats ? [
    { label: 'מסעדות פעילות', value: stats.live, icon: Building, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'ממתינות לאישור', value: stats.pending_approval, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'בתהליך התקנה', value: stats.provisioning, icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'נכשלו', value: stats.failed, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
  ] : [];

  const totals = metrics?.totals || {};
  const perTenant = metrics?.per_tenant || [];

  const formatIls = (n) => `₪${(Number(n) || 0).toLocaleString('en-IL')}`;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir="rtl">
      <div className="bg-gradient-to-l from-amber-500 to-orange-600 text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <Crown className="w-8 h-8" />
          <div>
            <h1 className="text-2xl font-bold">Platform Admin — God Mode</h1>
            <p className="text-sm text-white/80 mt-1">
              קונסולת ניהול-על. אתה רואה כאן את *כל* המסעדות שרצות על TopAlena, לא רק שלך.
            </p>
          </div>
          <button onClick={load} className="ml-auto bg-white/20 hover:bg-white/30 rounded-lg p-2">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading || !stats ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : (
        <>
          {/* Channel diagnostics — one-click self-test for SMS/Email/WhatsApp */}
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-bold text-sm">🩺 בדיקת ערוצים</div>
                  <div className="text-xs text-slate-500 mt-0.5">בודק את כל ערוצי המשלוח (SMS, מייל, WhatsApp) ושולח אליך הודעות בדיקה</div>
                </div>
                <Button onClick={runDiagnose} disabled={diagBusy} size="sm" className="bg-slate-700 hover:bg-slate-800 text-white">
                  {diagBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הרץ בדיקה'}
                </Button>
              </div>
              {diagResult && (
                <div className="mt-4 space-y-2 text-xs">
                  {diagResult.error ? (
                    <div className="p-3 rounded bg-red-50 text-red-800">שגיאה: {diagResult.error}</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {Object.entries(diagResult.env || {}).map(([k, v]) => (
                          <div key={k} className={`p-2 rounded ${String(v).includes('MISSING') ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
                            <div className="font-mono text-[10px] opacity-70">{k}</div>
                            <div className="font-semibold">{String(v)}</div>
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
                        {['resend', 'twilio', 'email_send', 'sms_send', 'whatsapp_send'].map(k => {
                          const r = diagResult.tests?.[k];
                          if (!r) return null;
                          const ok = r.ok || r.success || r.status === 200;
                          const skipped = r.skipped;
                          const bg = skipped ? 'bg-slate-100 text-slate-600' : (ok ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800');
                          return (
                            <div key={k} className={`p-3 rounded ${bg}`}>
                              <div className="font-mono text-[10px] opacity-70">{k}</div>
                              <div className="font-semibold">{skipped ? `⚪ ${r.skipped}` : (ok ? '✅ OK' : '❌ ' + (r.error || `HTTP ${r.status}`))}</div>
                              {r.body && <div className="text-[10px] opacity-70 mt-1 break-all">{String(r.body).slice(0, 150)}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCards.map(c => (
              <Card key={c.label} className={c.bg}>
                <CardContent className="p-4 flex items-center gap-3">
                  <c.icon className={`w-8 h-8 ${c.color}`} />
                  <div>
                    <div className="text-xs text-slate-600">{c.label}</div>
                    <div className="text-2xl font-bold mt-0.5">{c.value}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pending tenants — signups awaiting owner approval */}
          {pending.length > 0 && (
            <Card className="border-amber-300 bg-amber-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-600" /> ממתין לאישורך ({pending.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {pending.map(t => (
                    <div key={t.id} className="p-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <div className="font-bold">{t.restaurant_name || t.slug}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <code>{t.slug}.topalena.com</code>
                          {t.owner_name && <span className="mx-2">·</span>}
                          {t.owner_name && <span>{t.owner_name}</span>}
                          {t.owner_phone && <span className="mx-2">·</span>}
                          {t.owner_phone && <span dir="ltr">{t.owner_phone}</span>}
                        </div>
                        <div className="text-xs mt-1">
                          <span className={`inline-block px-2 py-0.5 rounded ${t.status === 'pending_approval' ? 'bg-amber-200 text-amber-900' : 'bg-blue-200 text-blue-900'}`}>
                            {t.status === 'pending_approval' ? 'ממתין לאישור' : 'בהתקנה'}
                          </span>
                        </div>
                      </div>
                      {t.status === 'pending_approval' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveTenant(t)} disabled={actioningId === t.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white">
                            {actioningId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 ml-1" /> אשר והקם</>}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejectTenant(t)} disabled={actioningId === t.id}
                            className="border-red-300 text-red-700 hover:bg-red-50">
                            דחה
                          </Button>
                        </div>
                      )}
                      {t.status === 'pending_provisioning' && (
                        <Button size="sm" onClick={() => resendWelcome(t)} disabled={actioningId === t.id}
                          className="bg-blue-600 hover:bg-blue-700 text-white" title="סגור ידנית + שלח פרטי כניסה בוואטסאפ">
                          {actioningId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><MessageCircle className="w-4 h-4 ml-1" /> סגור ושלח פרטים</>}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Failed tenants — provisioning errors that need attention */}
          {failed.length > 0 && (
            <Card className="border-red-300 bg-red-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-800">
                  <AlertTriangle className="w-5 h-5 text-red-600" /> נכשלו בהקמה ({failed.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {failed.map(t => (
                    <div key={t.id} className="p-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-[200px]">
                        <div className="font-bold">{t.restaurant_name || t.slug}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          <code>{t.slug}.topalena.com</code>
                          {t.owner_phone && <span className="mx-2">·</span>}
                          {t.owner_phone && <span dir="ltr">{t.owner_phone}</span>}
                        </div>
                      </div>
                      <Button size="sm" onClick={() => approveTenant(t)} disabled={actioningId === t.id}
                        className="bg-blue-600 hover:bg-blue-700 text-white">
                        {actioningId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'נסה שוב'}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Aggregated metrics across all tenants */}
          {metrics && (
            <div>
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                📊 סה"כ על פני {metrics.tenant_count} מסעדות
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Card className="bg-white border-2 border-purple-100">
                  <CardContent className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> משתמשים</div>
                    <div className="text-2xl font-bold mt-1">{totals.users || 0}</div>
                  </CardContent>
                </Card>
                <Card className="bg-white border-2 border-emerald-100">
                  <CardContent className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> עובדים פעילים</div>
                    <div className="text-2xl font-bold mt-1">{totals.employees || 0}</div>
                  </CardContent>
                </Card>
                <Card className="bg-white border-2 border-blue-100">
                  <CardContent className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><Zap className="w-3 h-3" /> משמרות עכשיו</div>
                    <div className="text-2xl font-bold mt-1">{totals.active_shifts || 0}</div>
                  </CardContent>
                </Card>
                <Card className="bg-white border-2 border-amber-100">
                  <CardContent className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><DollarSign className="w-3 h-3" /> חוזי אירועים</div>
                    <div className="text-lg font-bold mt-1">{formatIls(totals.contract_revenue)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-white border-2 border-red-100">
                  <CardContent className="p-4">
                    <div className="text-xs text-slate-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> חשבוניות לא שולמו</div>
                    <div className="text-2xl font-bold mt-1">{totals.unpaid_invoices || 0}</div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Per-tenant breakdown */}
          {perTenant.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">📈 השוואה לפי מסעדה</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs">
                      <tr className="text-slate-600">
                        <th className="p-3 text-right">מסעדה</th>
                        <th className="p-3 text-center">משתמשים</th>
                        <th className="p-3 text-center">עובדים</th>
                        <th className="p-3 text-center">משמרות עכשיו</th>
                        <th className="p-3 text-center">חוזי אירועים</th>
                        <th className="p-3 text-center">לא שולמו</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {perTenant.map(t => (
                        <tr key={t.id} className={`hover:bg-slate-50 ${t.is_main ? 'bg-amber-50/40' : ''}`}>
                          <td className="p-3 font-semibold">
                            {t.is_main && <span className="text-amber-600 text-xs ml-1">👑</span>}
                            {t.name}
                            <div className="text-xs text-slate-400 mt-0.5"><code>{t.slug}</code></div>
                            {t.error && <div className="text-xs text-red-600 mt-0.5">⚠ {t.error}</div>}
                            {!t.is_main && t.welcome && (t.welcome.sms?.status || t.welcome.email?.status || t.welcome.whatsapp?.status) && (
                              <div className="text-xs mt-1 flex gap-2 items-center flex-wrap" title={t.last_welcome_at ? `נשלח לאחרונה: ${new Date(t.last_welcome_at).toLocaleString('he-IL')}` : ''}>
                                <span className={t.welcome.sms?.status === 'sent' ? 'text-emerald-600' : t.welcome.sms?.status === 'failed' ? 'text-red-600' : 'text-slate-400'}
                                  title={`SMS: ${t.welcome.sms?.status || 'no attempt'}${t.welcome.sms?.error ? ' — ' + t.welcome.sms.error : ''}`}>
                                  📱{t.welcome.sms?.status === 'sent' ? '✓' : t.welcome.sms?.status === 'failed' ? '✗' : '—'}
                                </span>
                                <span className={t.welcome.email?.status === 'sent' ? 'text-emerald-600' : t.welcome.email?.status === 'failed' ? 'text-red-600' : 'text-slate-400'}
                                  title={`Email: ${t.welcome.email?.status || 'no attempt'}${t.welcome.email?.error ? ' — ' + t.welcome.email.error : ''}`}>
                                  📧{t.welcome.email?.status === 'sent' ? '✓' : t.welcome.email?.status === 'failed' ? '✗' : '—'}
                                </span>
                                <span className={t.welcome.whatsapp?.status === 'sent' ? 'text-emerald-600' : t.welcome.whatsapp?.status === 'failed' ? 'text-red-600' : 'text-slate-400'}
                                  title={`WhatsApp: ${t.welcome.whatsapp?.status || 'no attempt'}${t.welcome.whatsapp?.error ? ' — ' + t.welcome.whatsapp.error : ''}`}>
                                  💬{t.welcome.whatsapp?.status === 'sent' ? '✓' : t.welcome.whatsapp?.status === 'failed' ? '✗' : '—'}
                                </span>
                                {t.welcome.wa_link && (
                                  <a href={t.welcome.wa_link} target="_blank" rel="noreferrer" className="text-blue-600 underline text-[10px]">קישור וואטסאפ</a>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-center">{t.users}</td>
                          <td className="p-3 text-center">{t.employees}</td>
                          <td className="p-3 text-center">{t.active_shifts > 0 ? <span className="font-bold text-emerald-700">{t.active_shifts}</span> : '0'}</td>
                          <td className="p-3 text-center whitespace-nowrap">{formatIls(t.contract_revenue)}</td>
                          <td className="p-3 text-center">{t.unpaid_invoices > 0 ? <span className="font-bold text-red-600">{t.unpaid_invoices}</span> : '0'}</td>
                          <td className="p-3">
                            {!t.is_main && (
                              <div className="flex gap-1 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={impersonatingId === t.id}
                                  onClick={() => impersonate(t)}
                                  className="text-xs whitespace-nowrap"
                                  title="היכנס כ-owner של המסעדה"
                                >
                                  {impersonatingId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><LogIn className="w-3.5 h-3.5 ml-1" /> היכנס</>}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={actioningId === t.id}
                                  onClick={() => resendWelcome(t)}
                                  className="text-xs whitespace-nowrap border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800"
                                  title="שלח פרטי כניסה מחדש ב-SMS + מייל + WhatsApp"
                                >
                                  {actioningId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Send className="w-3.5 h-3.5 ml-1" /> שלח פרטי כניסה</>}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={restartingId === t.id}
                                  onClick={() => restartOnboarding(t)}
                                  className="text-xs whitespace-nowrap border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800"
                                  title="שלח שיחת Onboarding בוואטסאפ"
                                >
                                  {restartingId === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><MessageCircle className="w-3.5 h-3.5 ml-1" /> Onboarding</>}
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Link to={createPageUrl('PlatformAdminPending')} className="block">
          <Card className="hover:border-amber-400 transition cursor-pointer h-full">
            <CardContent className="p-5">
              <div className="bg-amber-500 text-white rounded-lg p-2 inline-block">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="font-bold mt-3">אישור מסעדות חדשות</h3>
              <p className="text-sm text-slate-600 mt-1">אשר או דחה בקשות הצטרפות למערכת</p>
              {stats?.pending_approval > 0 && (
                <div className="mt-2 text-xs font-bold text-amber-600">{stats.pending_approval} ממתינות</div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link to={createPageUrl('PlatformAdminTenants')} className="block">
          <Card className="hover:border-blue-400 transition cursor-pointer h-full">
            <CardContent className="p-5">
              <div className="bg-blue-500 text-white rounded-lg p-2 inline-block">
                <Building className="w-5 h-5" />
              </div>
              <h3 className="font-bold mt-3">כל המסעדות</h3>
              <p className="text-sm text-slate-600 mt-1">רשימה עם פילטרים לפי סטטוס</p>
            </CardContent>
          </Card>
        </Link>

        <a href="/Signup" target="_blank" rel="noreferrer" className="block">
          <Card className="hover:border-emerald-400 transition cursor-pointer h-full">
            <CardContent className="p-5">
              <div className="bg-emerald-500 text-white rounded-lg p-2 inline-block">
                <ExternalLink className="w-5 h-5" />
              </div>
              <h3 className="font-bold mt-3">קישור רישום ציבורי</h3>
              <p className="text-sm text-slate-600 mt-1">שתף עם מסעדות חדשות: topalena.com/Signup</p>
            </CardContent>
          </Card>
        </a>
      </div>
    </div>
  );
}

function PlatformOwnerOnly({ children }) {
  const [check, setCheck] = useState({ loading: true, allowed: false });
  useEffect(() => {
    (async () => {
      try {
        const res = await base44.functions.getMyPlatformInfo({});
        const data = res?.data || res;
        setCheck({ loading: false, allowed: !!data?.is_platform_owner });
      } catch {
        setCheck({ loading: false, allowed: false });
      }
    })();
  }, []);
  if (check.loading) return <div className="p-8 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>;
  if (!check.allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center p-8 max-w-md">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Crown className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">אין גישה לדף זה</h1>
          <p className="text-gray-500 mb-6">
            הדף הזה שמור לבעלים של האפליקציה (Platform Owner) בלבד. אם אתה בעל מסעדה, החשבון שלך מנהל את המסעדה שלך אבל לא את כל הפלטפורמה.
          </p>
        </div>
      </div>
    );
  }
  return children;
}

export default function PlatformAdmin() {
  return (
    <PageGuard pageName="PlatformAdmin" pageTitle="Platform Admin">
      <PlatformOwnerOnly>
        <PlatformAdminInner />
      </PlatformOwnerOnly>
    </PageGuard>
  );
}
