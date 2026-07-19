import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarDays, RefreshCw } from 'lucide-react';

const HE_MON = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
const heDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} ב${HE_MON[m - 1]}`;
};

// Preset factors, so setting a holiday is a tap rather than a number the owner
// has to invent.
const PRESETS = [
  [0, 'סגור'],
  [0.4, 'חלש מאוד'],
  [0.7, 'חלש'],
  [1, 'רגיל'],
  [1.4, 'עמוס'],
  [2, 'כפול'],
];

// Holidays move takings, and the forecast cannot know by how much for THIS
// restaurant. The dates come from a real calendar; the effect is the owner's to
// set, seeded with what is typical.
export default function HolidayCalendarCard() {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await base44.functions.getHolidayCalendar({});
      setItems(((r?.data ?? r) || {}).holidays || []);
    } catch (e) {
      if (/forbidden|unauthorized|admin only|401|403/i.test(String(e?.message))) setDenied(true);
      setItems([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await base44.functions.syncHolidayCalendar({});
      const d = (r?.data ?? r) || {};
      setMsg(`נטענו ${d.total} מועדים`);
      await load();
    } catch (e) { setMsg(e?.message || 'שגיאה'); }
    setBusy(false);
  };

  const setFactor = async (h, factor) => {
    setBusy(true);
    try {
      await base44.functions.setHolidayFactor({
        date: h.date, revenue_factor: factor, closed: factor === 0,
      });
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  if (denied) return null;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (items || []).filter((h) => h.date >= today).slice(0, 20);

  return (
    <Card dir="rtl" className="mb-6 border-violet-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-violet-600" /> חגים ומועדים
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={sync} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 ml-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 ml-1" />}
            טען מועדים
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          חג לא רק מזיז תשלום — הוא משנה את הפדיון. התאריכים נמשכים מלוח עברי אמיתי;
          <b> כמה זה משפיע אצלך — זה מה שאתה קובע כאן.</b> המספרים ההתחלתיים הם הערכה
          למסעדה ישראלית, לא נתון על העסק שלך.
        </p>
        <p className="text-[11px] text-slate-400">
          ⏱ ההשפעה נכנסת לסליקה של השבוע <b>שאחרי</b> — הסליקה משלמת על מכירות שכבר היו,
          אז יום סגור מקטין את ההפקדה הבאה, לא את זו של אותו יום.
        </p>

        {!items ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-300" /></div>
        ) : !upcoming.length ? (
          <p className="text-sm text-slate-500 text-center py-4">
            אין מועדים טעונים. לחץ "טען מועדים".
          </p>
        ) : (
          <div className="space-y-1.5">
            {upcoming.map((h) => (
              <div key={h.date}
                className={`rounded-lg border p-2.5 ${
                  h.revenue_factor === 0 ? 'bg-red-50 border-red-200'
                    : h.revenue_factor < 1 ? 'bg-amber-50 border-amber-200'
                    : h.revenue_factor > 1 ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white'}`}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-sm font-medium truncate">
                    {h.name}
                    {h.edited && <span className="text-[10px] text-violet-600 mr-1.5">✎ שלך</span>}
                  </span>
                  <span className="text-xs text-slate-500 whitespace-nowrap">{heDate(h.date)}</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {PRESETS.map(([v, label]) => (
                    <button key={v} disabled={busy}
                      onClick={() => setFactor(h, v)}
                      className={`text-[11px] rounded-full px-2 py-0.5 border transition-colors ${
                        Math.abs(h.revenue_factor - v) < 0.05
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
      </CardContent>
    </Card>
  );
}
