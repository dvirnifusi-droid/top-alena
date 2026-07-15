// AdminAmbient — central control panel for the ambient computing layer
// (KitchenScreen TV, daily Morning Report, Critical-3 push filter).
// Lets the owner trigger reports manually, monitor push throttle status,
// and link out to the kitchen TV display.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Tv, Bell, ExternalLink, Loader2, CheckCircle2, Zap, Power, PlayCircle } from 'lucide-react';
import { createPageUrl } from '@/utils';

function fmtClock(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' });
}

function MorningReportSection() {
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    const send = async () => {
        if (!confirm('לשלוח דוח בוקרי עכשיו לבעל העסק?\n\nהדוח כולל סיכום של אתמול + המלצה מ-Gemini.')) return;
        setSending(true); setError(null); setResult(null);
        try {
            const res = await base44.functions.sendMorningReport({});
            const r = res?.data ?? res;
            setResult(r);
        } catch (e) { setError(e?.message || String(e)); }
        finally { setSending(false); }
    };

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                    <Mail className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                        <h3 className="font-bold text-lg">דוח בוקרי יומי</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            רץ אוטומטית כל יום ב-07:30 IL. שולח ל-<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">dvirnifusi@gmail.com</code> סיכום של אתמול
                            (קופה Beecomm, משלוחים Gomiley, מכירות גמיפיקציה, בקשות ממתינות) + המלצה אחת מ-Gemini.
                        </p>
                    </div>
                </div>
                <Button onClick={send} disabled={sending} className="bg-amber-600 hover:bg-amber-700">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Mail className="w-4 h-4 ml-2" />}
                    {sending ? 'שולח...' : 'שלח דוח עכשיו'}
                </Button>
                {result?.ok && (
                    <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm">
                        <div className="flex items-center gap-2 font-bold text-emerald-800 mb-1">
                            <CheckCircle2 className="w-4 h-4" />
                            נשלח בהצלחה
                        </div>
                        <div className="text-emerald-700 text-xs">
                            <div>נמען: {result.sent_to}</div>
                            <div>תאריך הדוח: {result.date}</div>
                            {result.insight && (
                                <div className="mt-2 p-2 bg-white rounded border border-emerald-100">
                                    <div className="font-bold mb-1">💡 ההמלצה שנשלחה:</div>
                                    <div>{result.insight}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {error && <p className="text-xs text-red-700 mt-2">❌ {error}</p>}
            </CardContent>
        </Card>
    );
}

function KitchenScreenSection() {
    const [data, setData] = useState(null);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const res = await base44.functions.getKitchenScreenData({});
                if (alive) setData(res?.data ?? res);
            } catch (e) { /* silent */ }
        };
        load();
        const i = setInterval(load, 30_000);
        return () => { alive = false; clearInterval(i); };
    }, []);

    const url = createPageUrl('KitchenScreen');

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                    <Tv className="w-6 h-6 text-[#B89556] flex-shrink-0 mt-1" />
                    <div className="flex-1">
                        <h3 className="font-bold text-lg">מסך מטבח (TV)</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            מסך אווירתי לטלוויזיה במטבח/בר. מתעדכן כל 30 שניות. מראה לצוות את כל מה שצריך
                            לדעת בלי להסתכל בטלפון: קופה, משלוחים תקועים, מלצרים, יעדים, צפי שעה הבאה.
                        </p>
                    </div>
                </div>

                <div className="flex gap-2 mb-3">
                    <Button onClick={() => window.open(url, '_blank')} className="bg-[#B89556] hover:bg-[#8A6E3A]">
                        <ExternalLink className="w-4 h-4 ml-2" />
                        פתח בחלון חדש
                    </Button>
                    <Button variant="outline" onClick={() => window.open(url, '_blank', 'fullscreen=yes,width=1920,height=1080')}>
                        פתח Fullscreen
                    </Button>
                </div>

                {data && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <StatBox label="קופה היום" value={data.beecomm ? `₪${Math.round(data.beecomm.total_today).toLocaleString('he-IL')}` : '—'} />
                        <StatBox label="משלוחים פתוחים" value={data.gomiley?.pending_count ?? '—'} warn={data.gomiley?.stuck_count > 0} />
                        <StatBox label="מלצרים במשמרת" value={Array.isArray(data.beecomm?.workers) ? data.beecomm.workers.length : 0} />
                        <StatBox label={`צפי ${data.predicted_hour?.hour ?? '?'}:00`} value={data.predicted_hour?.avg_diners > 0 ? `${data.predicted_hour.avg_diners} סועדים` : 'אין היסטוריה'} />
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function StatBox({ label, value, warn }) {
    return (
        <div className={`p-2 rounded border ${warn ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
            <div className="text-[10px] text-gray-500 mb-1">{label}</div>
            <div className={`font-bold ${warn ? 'text-amber-800' : 'text-gray-800'}`}>{value}</div>
        </div>
    );
}

function Critical3Section() {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            try {
                const res = await base44.functions.getCritical3Status({});
                if (alive) {
                    setStatus(res?.data ?? res);
                    setError(null);
                }
            } catch (e) { if (alive) setError(e?.message); }
        };
        load();
        const i = setInterval(load, 60_000);
        return () => { alive = false; clearInterval(i); };
    }, []);

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                    <Bell className="w-6 h-6 text-[#A04A2E] flex-shrink-0 mt-1" />
                    <div className="flex-1">
                        <h3 className="font-bold text-lg">Critical-3 — סינון Push</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            מסנן push notifications לפי 2 חוקים:
                            <br />
                            <b>1. שעות שקט:</b> 13:00-15:00 ו-19:00-22:00 — אפס push חוץ מ-<code className="bg-gray-100 px-1 rounded text-xs">critical:true</code>
                            <br />
                            <b>2. מקסימום 3 ביום לקטגוריה</b> — לא יותר מ-3 הודעות בקטגוריה (shift_alert / gomiley_alert / וכו׳).
                        </p>
                    </div>
                </div>

                {status && (
                    <div className={`p-3 rounded-lg mb-3 ${status.quiet_hour_now ? 'bg-[#F4ECD8] border border-purple-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                        <div className="flex items-center gap-2 font-bold text-sm mb-1">
                            {status.quiet_hour_now ? '🤫 שעת שקט כרגע' : '🔔 פעיל — pushים יוצאים'}
                        </div>
                        <div className="text-xs text-gray-700">תאריך: {status.today}</div>
                    </div>
                )}

                {status && Object.keys(status.counters || {}).length > 0 && (
                    <div className="mt-3">
                        <h4 className="text-sm font-bold mb-2">פושים היום לפי קטגוריה</h4>
                        <div className="space-y-1">
                            {Object.entries(status.counters).map(([cat, count]) => (
                                <div key={cat} className="flex justify-between items-center text-sm py-1 px-2 bg-gray-50 rounded">
                                    <span className="font-mono text-xs">{cat}</span>
                                    <span className={`font-bold ${count >= 3 ? 'text-red-600' : count >= 2 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        {count} / 3
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {status && Object.keys(status.counters || {}).length === 0 && (
                    <div className="text-sm text-gray-500 text-center py-3">אין pushים היום עדיין</div>
                )}

                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900">
                    <b>סטטוס יישום:</b> תשתית מוכנה (פונקציה <code>shouldSendThrottledPush</code> זמינה לקריאה).
                    הptיון לעטוף את הpushover calls הקיימים — ממתין להחלטה שלך איזה pushים critical ואיזה לא.
                </div>

                {error && <p className="text-xs text-red-700 mt-2">❌ {error}</p>}
            </CardContent>
        </Card>
    );
}

function BeecommAutoCreditSection() {
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [runResult, setRunResult] = useState(null);
    const [error, setError] = useState(null);

    const load = async () => {
        try {
            const res = await base44.functions.getBeecommAutoCreditStatus({});
            setStatus(res?.data ?? res);
            setError(null);
        } catch (e) { setError(e?.message); }
    };

    useEffect(() => {
        load();
        const i = setInterval(load, 30_000);
        return () => clearInterval(i);
    }, []);

    const toggle = async () => {
        const target = !status?.enabled;
        if (target && !confirm('להפעיל auto-credit מ-Beecomm?\n\nהמערכת תזכה אוטומטית מלצרים על מנות שתואמות את היעד הפעיל. ניתן לעצור בכל רגע.')) return;
        setBusy(true); setError(null);
        try {
            await base44.functions.toggleBeecommAutoCredit({ enabled: target });
            await load();
        } catch (e) { setError(e?.message || String(e)); }
        finally { setBusy(false); }
    };

    const runNow = async () => {
        setBusy(true); setError(null); setRunResult(null);
        try {
            const res = await base44.functions.runBeecommAutoCreditNow({});
            setRunResult(res?.data ?? res);
            await load();
        } catch (e) { setError(e?.message || String(e)); }
        finally { setBusy(false); }
    };

    return (
        <Card className="mb-4" dir="rtl">
            <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                    <Zap className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                        <h3 className="font-bold text-lg">Auto-Credit מ-Beecomm</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            המערכת בודקת כל snapshot של Beecomm (כל 3 דק׳), משווה למה שהיה ב-snapshot הקודם.
                            אם מנות שמתאימות ליעד נמכרו → מזכה את המלצר עם הגידול הגדול ביותר ב-₪.
                            <br />
                            <b>שימו לב:</b> זה <i>heuristic</i> — אם 2 מלצרים מכרו באותו snapshot, רק זה שעלה הכי הרבה מקבל קרדיט.
                            ניתן לבטל ידנית עם undo בכפתורי הסופרבייזר.
                        </p>
                    </div>
                </div>

                {status && (
                    <div className={`p-3 rounded-lg mb-3 ${status.enabled ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50 border border-gray-200'}`}>
                        <div className="font-bold text-sm">
                            {status.enabled ? '✅ פעיל — המערכת מזכה אוטומטית' : '⏸ כבוי'}
                        </div>
                    </div>
                )}

                <div className="flex gap-2">
                    <Button onClick={toggle} disabled={busy} className={status?.enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}>
                        {busy ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Power className="w-4 h-4 ml-2" />}
                        {status?.enabled ? 'כבה' : 'הפעל'}
                    </Button>
                    <Button onClick={runNow} disabled={busy} variant="outline">
                        <PlayCircle className="w-4 h-4 ml-2" />
                        רוץ עכשיו (בדיקה)
                    </Button>
                </div>

                {runResult && (
                    <div className={`mt-3 p-3 rounded-lg text-sm ${runResult.ok ? 'bg-[#F4ECD8] border border-[#E8D9B5]' : 'bg-amber-50 border border-amber-200'}`}>
                        <div className="font-bold mb-1">תוצאת ריצה ידנית:</div>
                        {runResult.ok ? (
                            <div>
                                <div>זוכו: <b>{runResult.credited || 0}</b> מכירות</div>
                                {runResult.reason && <div className="text-xs text-gray-600">סיבה: {runResult.reason}</div>}
                                {runResult.details?.length > 0 && (
                                    <div className="mt-2 text-xs">
                                        {runResult.details.map((d, i) => (
                                            <div key={i} className="mt-1 p-2 bg-white rounded">
                                                <b>{d.goal_label}</b> × {d.units} → {d.to_waiter}
                                                <div className="text-gray-500">מנות תואמות: {d.matched_dishes.join(', ')}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div>נכשל: {runResult.reason}</div>
                        )}
                    </div>
                )}

                {status?.recent_log?.length > 0 && (
                    <div className="mt-4">
                        <h4 className="text-sm font-bold mb-2">📋 לוג ריצות אחרונות (20 אחרונות)</h4>
                        <div className="space-y-1 max-h-60 overflow-y-auto">
                            {status.recent_log.map((entry, i) => {
                                const d = entry.details;
                                const time = new Date(entry.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' });
                                return (
                                    <div key={i} className="text-xs p-2 bg-gray-50 rounded">
                                        <span className="text-gray-500">{time}</span>{' '}
                                        {d.skip ? (
                                            <span className="text-amber-700">דילוג: {d.skip} ({d.beecomm_name})</span>
                                        ) : (
                                            <span className="text-emerald-700">זוכו {d.credited} ל-{d.top_worker?.name}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {error && <p className="text-xs text-red-700 mt-2">❌ {error}</p>}
            </CardContent>
        </Card>
    );
}

export default function AdminAmbient() {
    return (
        <div className="p-6 max-w-4xl mx-auto" dir="rtl">
            <h1 className="text-2xl font-bold mb-2">🌅 Ambient Operations</h1>
            <p className="text-sm text-gray-600 mb-6">
                ניהול שכבת ה-Ambient — מסך מטבח TV, דוח בוקרי יומי, וסינון Push. הכל בנוי על
                העיקרון שהצוות לא יהיה משועבד לטלפון: המידע במסך, ההמלצות במייל יומי, רק קריטי
                יוצא כ-push.
            </p>

            <MorningReportSection />
            <KitchenScreenSection />
            <BeecommAutoCreditSection />
            <Critical3Section />
        </div>
    );
}
