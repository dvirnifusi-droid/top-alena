// Itzik roadmap #4 (app side) — shift replacement finder.
// For a chosen day, show who SUBMITTED availability but was NOT scheduled — so
// when someone calls in sick it's one tap to reach a real candidate (WhatsApp /
// call). Backend: getReplacementCandidates (already returns phone + position).
// Self-contained: own date state (defaults to today) + own trigger button.
import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Repeat, MessageCircle, Phone, Calendar } from 'lucide-react';

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const waLink = (phone, text) => {
  const p = String(phone || '').replace(/[^\d]/g, '');
  const intl = p.startsWith('0') ? '972' + p.slice(1) : p;
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
};

export default function ShiftReplacementPanel({ initialDate }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(initialDate || todayStr());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async (d) => {
    setLoading(true); setErr(null);
    try {
      const r = await base44.functions.getReplacementCandidates({ date: d });
      setData(r?.data || r);
    } catch (e) { setErr(e?.message || 'שגיאה'); setData(null); }
    setLoading(false);
  }, []);

  const openPanel = () => { setOpen(true); load(date); };
  const changeDate = (d) => { setDate(d); load(d); };

  const candidates = data?.candidates || [];
  const heDate = (() => { try { return new Date(date + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'numeric' }); } catch { return date; } })();
  const msg = (name) => `היי ${name || ''}, יש לנו צורך בהחלפה למשמרת ב-${heDate}. תוכל/י להיכנס? 🙏`;

  return (
    <>
      <Button variant="outline" onClick={openPanel} className="border-orange-300 text-orange-800 hover:bg-orange-50 gap-1">
        <Repeat className="w-4 h-4" /> מי זמין להחלפה?
      </Button>
      {open && (
        <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" dir="rtl" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-extrabold flex items-center gap-2"><Repeat className="w-5 h-5 text-orange-600" /> מציאת החלפה למשמרת</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-slate-500" />
              <input type="date" value={date} onChange={(e) => changeDate(e.target.value)} className="h-9 rounded border border-slate-300 px-2 text-sm" />
              <div className="flex gap-1">
                <button onClick={() => changeDate(todayStr())} className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">היום</button>
                <button onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); changeDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); }} className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200">מחר</button>
              </div>
            </div>

            {err && <div className="text-sm bg-red-50 text-red-700 rounded px-3 py-2 mb-2">{err}</div>}
            {data && !loading && (
              <p className="text-xs text-slate-500 mb-2">
                {heDate} · {data.submitted_count || 0} הגישו זמינות · {data.scheduled_count || 0} שובצו · <b className="text-orange-700">{candidates.length} פנויים להחלפה</b>
              </p>
            )}

            {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : (
              <div className="space-y-2">
                {candidates.length === 0 && <p className="text-sm text-slate-500 text-center py-6">אין עובדים שהגישו זמינות ליום זה ולא שובצו.</p>}
                {candidates.map((c, i) => (
                  <div key={c.employee_id || i} className="flex items-center justify-between gap-2 border rounded-lg p-2.5">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{c.name || 'עובד'}</div>
                      <div className="text-[11px] text-slate-500">{c.position || ''}{c.position && c.availability_type ? ' · ' : ''}{c.availability_type ? `זמינות: ${c.availability_type}` : ''}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {c.phone ? (
                        <>
                          <a href={waLink(c.phone, msg(c.name))} target="_blank" rel="noreferrer" className="p-2 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100" title="שלח וואטסאפ"><MessageCircle className="w-4 h-4" /></a>
                          <a href={`tel:${c.phone}`} className="p-2 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100" title="התקשר"><Phone className="w-4 h-4" /></a>
                        </>
                      ) : <span className="text-[11px] text-slate-400">אין טלפון</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
