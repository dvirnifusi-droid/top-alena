import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Link2, Check, ChevronDown, ChevronUp } from 'lucide-react';

// Self-serve campaign landing links — each tenant enters its own delivery /
// reservation / events / general URLs, which the auto-campaign uses so the ad
// drives to the right page. Any tenant owner can set these without us.
const FIELDS = [
  { k: 'delivery', label: '🛵 משלוחים', ph: 'Wolt / Tabit / האתר' },
  { k: 'reservation', label: '🍽️ שמירת מקום', ph: 'עמוד ההזמנות' },
  { k: 'events', label: '🎉 אירועים', ph: 'עמוד לידים לאירועים' },
  { k: 'general', label: '🔗 כללי (ברירת מחדל)', ph: 'דף הבית / עמוד נחיתה' },
];

export default function MarketingLinks() {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState({ delivery: '', reservation: '', events: '', general: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getMarketingLinks({});
      const d = res?.data || res || {};
      setLinks({ delivery: d.delivery || '', reservation: d.reservation || '', events: d.events || '', general: d.general || '' });
    } catch { /* first-time / no links yet */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open]);

  const save = async () => {
    setSaving(true); setErr(''); setSaved(false);
    try {
      await base44.functions.setMarketingLinks(links);
      setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch (e) { setErr(e?.message || 'השמירה נכשלה'); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl" dir="rtl">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-2 p-3">
        <span className="flex items-center gap-2 font-bold text-slate-800">
          <Link2 className="w-5 h-5 text-sky-500" /> 🔗 קישורי קמפיין
          <span className="text-xs font-normal text-slate-400">— לאן הקמפיינים מפנים</span>
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="p-4 pt-0 space-y-3">
          {loading ? (
            <div className="py-3 text-center"><Loader2 className="w-5 h-5 animate-spin text-sky-500 mx-auto" /></div>
          ) : (
            <>
              <p className="text-xs text-slate-500">הזן את הקישורים של העסק שלך. הקמפיין האוטומטי יפנה לדף המתאים למטרה (משלוח / שמירת מקום / אירוע).</p>
              {FIELDS.map(f => (
                <div key={f.k}>
                  <label className="text-xs font-semibold text-slate-600">{f.label}</label>
                  <input
                    type="url" dir="ltr" value={links[f.k]} placeholder={f.ph}
                    onChange={(e) => setLinks(l => ({ ...l, [f.k]: e.target.value }))}
                    className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
              {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
                {saved ? 'נשמר' : 'שמור קישורים'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
