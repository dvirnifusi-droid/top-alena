import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Calendar as CalendarIcon, CheckCircle2, Trash2, MessageCircle, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

const TZ = 'Asia/Jerusalem';
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function israelYMD(d) {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: TZ });
}
function israelHHMM(d) {
  return new Date(d).toLocaleTimeString('he-IL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
}
function israelDayName(ymd) {
  try { return HE_DAYS[new Date(`${ymd}T12:00:00.000Z`).getDay()]; } catch { return ''; }
}
function relativeDayLabel(ymd) {
  const today = israelYMD(new Date());
  if (ymd === today) return 'היום';
  const tomorrow = israelYMD(new Date(Date.now() + 86_400_000));
  if (ymd === tomorrow) return 'מחר';
  const dayAfter = israelYMD(new Date(Date.now() + 2 * 86_400_000));
  if (ymd === dayAfter) return 'מחרתיים';
  return '';
}

export default function MySchedulePage() {
  const [data, setData] = useState({ events: [], tasks: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.listMyEvents({});
      const payload = res?.data || res || {};
      setData({ events: payload.events || [], tasks: payload.tasks || [] });
    } catch (e) {
      console.error('[my-schedule]', e);
      setData({ events: [], tasks: [] });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const completeTask = async (id) => {
    if (!window.confirm('לסמן כבוצע?')) return;
    setBusy(id);
    try {
      await base44.functions.completeMyTask({ id });
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusy(null); }
  };
  const cancelEvent = async (id, title) => {
    if (!window.confirm(`לבטל את "${title}"?`)) return;
    setBusy(id);
    try {
      await base44.functions.cancelMyEvent({ id });
      await load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusy(null); }
  };

  // Group events by date (Israel timezone)
  const eventsByDate = {};
  for (const e of data.events) {
    const ymd = israelYMD(e.event_at);
    (eventsByDate[ymd] = eventsByDate[ymd] || []).push(e);
  }
  const sortedDates = Object.keys(eventsByDate).sort();

  return (
    <PageShell>
      <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="הלוז שלי"
        subtitle="הפגישות והמשימות שהזנת דרך העוזר ב-WhatsApp."
        icon={CalendarIcon}
        action={(
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
          </Button>
        )}
      />

      <Card className="bg-emerald-50 border-emerald-200">
        <CardContent className="p-4 text-sm text-emerald-900 flex items-start gap-2">
          <MessageCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <strong>איך להוסיף פגישה או משימה?</strong> שלח לעוזר ב-WhatsApp הודעה כמו
            "<em>פגישה עם דביר מחר 14:00</em>" או "<em>תוסיף משימה: להזמין יין</em>".
            הוא יציע, תאשר ב"כן" — והכל יופיע כאן.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-emerald-500" /> פגישות הקרובות
          </CardTitle>
          <CardDescription>{data.events.length} פגישות מתוזמנות. לחיצה על פח לביטול.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : sortedDates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              אין פגישות עתידיות. שלח לעוזר ב-WhatsApp הודעה כדי להוסיף.
            </p>
          ) : (
            <div className="space-y-4">
              {sortedDates.map((ymd) => {
                const rel = relativeDayLabel(ymd);
                return (
                  <div key={ymd}>
                    <div className="text-sm font-bold mb-2 pb-1 border-b border-slate-200">
                      📅 {israelDayName(ymd)} · {ymd}{rel ? ` · ${rel}` : ''}
                    </div>
                    <div className="space-y-1.5">
                      {eventsByDate[ymd].map((e) => (
                        <div key={e.id} className="flex items-center gap-3 p-2 bg-[#F4ECD8] border border-[#E8D9B5] rounded-lg text-sm hover:bg-[#EFE3C9] transition">
                          <div className="font-mono text-blue-900 font-bold text-xs whitespace-nowrap min-w-[44px]">
                            {israelHHMM(e.event_at)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold truncate">{e.title}</div>
                            <div className="text-xs text-slate-600">
                              ⏰ תזכורת {e.lead_min} דק' לפני
                              {e.source === 'google_calendar' && <span className="ml-2 text-blue-700">📅 Google</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => cancelEvent(e.id, e.title)}
                            disabled={busy === e.id}
                            className="text-slate-400 hover:text-red-600 transition flex-shrink-0 p-1"
                            title="בטל פגישה"
                          >
                            {busy === e.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> משימות פתוחות
          </CardTitle>
          <CardDescription>{data.tasks.length} משימות. לחיצה על ✓ לסימון כבוצע.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : data.tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              אין משימות פתוחות. כל הכבוד!
            </p>
          ) : (
            <div className="space-y-1.5">
              {data.tasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 p-2 bg-white border rounded-lg text-sm hover:bg-slate-50 transition">
                  <Badge variant="outline" className="text-xs whitespace-nowrap">{t.id.slice(-6)}</Badge>
                  <div className="flex-1 truncate font-medium">📌 {t.title}</div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                    onClick={() => completeTask(t.id)}
                    disabled={busy === t.id}
                  >
                    {busy === t.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><CheckCircle2 className="w-3.5 h-3.5 ml-1" /> בוצע</>}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </PageShell>
  );
}
