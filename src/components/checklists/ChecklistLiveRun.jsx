// Live "prep-sheet" view of a checklist. Shows every item in a flat, grouped
// card list (not the step-by-step wizard) where each mark saves LIVE to a single
// shared daily run — so a second cook / the kitchen manager see marks appear on
// their own, just like the prep sheet.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ChecklistExecution } from '@/entities/all';
import { UploadFile } from '@/integrations/Core';
import { Loader2, Check, Camera, X, StickyNote, ChefHat, ChevronDown, MessageCircle } from 'lucide-react';

const fmtWhen = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};
const keyOf = (item, i) => String(item?.id || (item?.order != null ? `o${item.order}` : `i${i}`));
const textOf = (item) => (typeof item === 'string' ? item : (item?.text || item?.task || item?.title || ''));

export default function ChecklistLiveRun({ checklist, user, onClose }) {
  const [execId, setExecId] = useState(null);
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState(true);
  const [uploadingKey, setUploadingKey] = useState(null);
  const lastInteractionRef = useRef(0);
  const mark = () => { lastInteractionRef.current = Date.now(); };
  // Each dish is a collapsible header — collapsed by default; open to mark its
  // sub-tasks. The header turns green once every sub-task is done.
  const [expanded, setExpanded] = useState({});
  const toggleGroup = (area) => setExpanded((p) => ({ ...p, [area]: !p[area] }));
  // Closing checklists get a footer: who closed + a one-tap WhatsApp to the chef.
  const isClosing = String(checklist?.category || '').toLowerCase() === 'closing';
  const [closedBy, setClosedBy] = useState('');
  const closedByFocused = useRef(false);
  // Footer language — follows the staff member's chosen/browser language so
  // non-Hebrew kitchens get an English (or Spanish) closing footer + WhatsApp.
  const lang = (() => {
    try { const s = localStorage.getItem('topalena_lang'); if (['he', 'en', 'es'].includes(s)) return s; } catch { /* noop */ }
    const n = ((typeof navigator !== 'undefined' && navigator.language) || '').toLowerCase();
    if (n.startsWith('es')) return 'es';
    if (n.startsWith('en')) return 'en';
    return 'he';
  })();
  const FTR = {
    closed_by: { he: 'נסגר ע"י', en: 'Closed by', es: 'Cerrado por' },
    name_ph:   { he: 'שם מלא', en: 'Full name', es: 'Nombre completo' },
    send_chef: { he: 'שלח לשף: המסעדה סגורה 🌙', en: 'Notify chef: kitchen closed 🌙', es: 'Avisar al chef: cocina cerrada 🌙' },
    chef_msg:  {
      he: 'היי שף, המסעדה סגורה ועברתי על הכל 🌙 לילה טוב',
      en: 'Hi chef, the restaurant is closed and I went over everything 🌙 Good night',
      es: 'Hola chef, el restaurante está cerrado y revisé todo 🌙 Buenas noches',
    },
  };
  const ft = (k) => FTR[k][lang] || FTR[k].he;

  const items = useMemo(() => (Array.isArray(checklist?.items) ? checklist.items : []), [checklist]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await base44.functions.openChecklistLiveRun({ checklist_id: checklist.id });
        const ex = (res?.data || res)?.execution;
        if (ex) { setExecId(ex.id); setResults(ex.results || {}); if (ex.notes) setClosedBy(ex.notes); }
      } catch (e) { console.warn('open live run', e); }
      setLoading(false);
    })();
  }, [checklist.id]);

  // Live refresh — every 12s + on focus, silent + idle-guarded so it never
  // clobbers a mark that's mid-flight.
  useEffect(() => {
    if (!execId) return;
    const pull = async () => {
      if (document.hidden || Date.now() - lastInteractionRef.current < 5000) return;
      try {
        const row = await ChecklistExecution.get(execId);
        if (row?.results) setResults((prev) => (JSON.stringify(prev) === JSON.stringify(row.results) ? prev : row.results));
        if (!closedByFocused.current && row?.notes != null) setClosedBy((prev) => (prev === row.notes ? prev : row.notes));
      } catch { /* ignore */ }
    };
    const iv = setInterval(pull, 12000);
    const onVis = () => { if (!document.hidden) pull(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
  }, [execId]);

  const groups = useMemo(() => {
    const m = new Map();
    items.forEach((it, i) => { const a = (typeof it === 'object' && it.area) ? it.area : 'כללי'; if (!m.has(a)) m.set(a, []); m.get(a).push({ it, i }); });
    return [...m.entries()];
  }, [items]);

  const summary = useMemo(() => {
    const total = items.length;
    const done = items.filter((it, i) => results[keyOf(it, i)]?.checked).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [items, results]);

  const toggle = async (item, i) => {
    if (!execId) return;
    mark();
    const k = keyOf(item, i);
    const nextChecked = !results[k]?.checked;
    const optimistic = nextChecked
      ? { checked: true, checked_by: user?.full_name || user?.email || 'עובד', checked_at: new Date().toISOString(), ...(results[k]?.photo_url ? { photo_url: results[k].photo_url } : {}) }
      : { checked: false };
    setResults((prev) => ({ ...prev, [k]: optimistic }));
    try {
      const res = await base44.functions.toggleChecklistLiveItem({ execution_id: execId, item_key: k, checked: nextChecked });
      const srv = (res?.data || res)?.results;
      if (srv) setResults(srv);
    } catch (e) { console.warn('toggle live item', e); }
  };

  const attachPhoto = async (item, i, file) => {
    if (!file || !execId) return;
    const k = keyOf(item, i);
    mark(); setUploadingKey(k);
    try {
      const { file_url } = await UploadFile({ file });
      const res = await base44.functions.toggleChecklistLiveItem({ execution_id: execId, item_key: k, checked: true, photo_url: file_url });
      const srv = (res?.data || res)?.results;
      if (srv) setResults(srv); else setResults((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), checked: true, photo_url: file_url } }));
    } catch (e) { console.warn('live photo', e); }
    setUploadingKey(null);
  };

  const saveClosedBy = async () => {
    closedByFocused.current = false;
    if (!execId) return;
    try { await ChecklistExecution.update(execId, { notes: closedBy }); } catch { /* ignore */ }
  };
  const chefMsg = `${ft('chef_msg')}${closedBy ? ` — ${closedBy}` : ''}`;
  const chefWaLink = `https://wa.me/?text=${encodeURIComponent(chefMsg)}`;

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl shadow-2xl w-full max-w-2xl my-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b rounded-t-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <ChefHat className="w-5 h-5 text-[#A04A2E] shrink-0" />
            <div className="min-w-0">
              <div className="font-black text-[#A04A2E] truncate">{checklist.title}</div>
              <div className="text-[11px] text-gray-500">תצוגת הכנות · עדכון חי</div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1"><X className="w-5 h-5" /></button>
        </div>

        {/* Summary */}
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="text-sm"><span className="text-xl font-black text-green-600">{summary.done}</span><span className="text-gray-500">/{summary.total} בוצעו</span></div>
            <div className="flex-1"><div className="h-2 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-green-500 transition-all" style={{ width: `${summary.pct}%` }} /></div></div>
            <div className="text-xs text-gray-500">{summary.pct}%</div>
          </div>
        </div>

        {/* Items */}
        <div className="px-3 pb-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-orange-600" /></div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-gray-500">אין פריטים בצ'קליסט הזה.</div>
          ) : groups.map(([area, rows]) => {
            const gTotal = rows.length;
            const gDone = rows.filter(({ it, i }) => results[keyOf(it, i)]?.checked).length;
            const allDone = gTotal > 0 && gDone === gTotal;
            const isOpen = !!expanded[area];
            return (
            <div key={area} className={`bg-white rounded-xl overflow-hidden border ${allDone ? 'border-green-300' : 'border-orange-100'}`}>
              {/* Dish header — click to expand its sub-tasks. Green when complete. */}
              <button
                onClick={() => toggleGroup(area)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-bold transition-colors ${allDone ? 'bg-green-500 text-white' : 'bg-gradient-to-l from-orange-100 to-amber-50 text-[#7A3722] hover:from-orange-200'}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {allDone && <Check className="w-4 h-4 shrink-0" />}
                  <span className="break-words text-right">{area}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-bold ${allDone ? 'text-white/90' : gDone > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{gDone}/{gTotal}</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {isOpen && (
              <div className="divide-y">
                {rows.map(({ it, i }) => {
                  const k = keyOf(it, i);
                  const r = results[k] || {};
                  const note = typeof it === 'object' ? it.note : '';
                  return (
                    <div key={k} className={`p-3 flex items-start justify-between gap-3 ${r.checked ? 'bg-green-50/50' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <span className={`font-medium break-words ${r.checked ? 'line-through text-gray-400' : 'text-slate-800'}`}>{textOf(it)}</span>
                        {note && <div className="text-xs text-gray-500 mt-0.5 flex items-start gap-1"><StickyNote className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" /><span className="break-words">{note}</span></div>}
                        {r.checked && r.checked_by && <div className="text-[10px] text-gray-500 mt-0.5">✓ {r.checked_by}{r.checked_at ? ` · ${fmtWhen(r.checked_at)}` : ''}</div>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.photo_url && <a href={r.photo_url} target="_blank" rel="noreferrer"><img src={r.photo_url} alt="" className="w-8 h-8 rounded object-cover border border-gray-200" /></a>}
                        <label className="cursor-pointer text-gray-400 hover:text-orange-600" title="צרף תמונה">
                          {uploadingKey === k ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; attachPhoto(it, i, f); }} />
                        </label>
                        <button onClick={() => toggle(it, i)} title="בוצע"
                          className={`w-8 h-8 rounded border-2 inline-flex items-center justify-center transition-colors ${r.checked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>{r.checked ? <Check className="w-4 h-4" /> : <span className="text-[9px] font-bold text-gray-400">בוצע</span>}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
            );
          })}

          {/* Closing footer — who closed + one-tap WhatsApp to the chef. */}
          {isClosing && !loading && (
            <div dir={lang === 'he' ? 'rtl' : 'ltr'} className="bg-white rounded-xl border border-rose-200 p-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-500">{ft('closed_by')}</label>
                <input
                  value={closedBy}
                  onChange={(e) => { closedByFocused.current = true; setClosedBy(e.target.value); }}
                  onFocus={() => { closedByFocused.current = true; }}
                  onBlur={saveClosedBy}
                  placeholder={ft('name_ph')}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
                />
              </div>
              <a
                href={chefWaLink}
                target="_blank"
                rel="noreferrer"
                onClick={saveClosedBy}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1fb457] text-white font-bold py-3 rounded-xl transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                {ft('send_chef')}
              </a>
              <p className="text-[11px] text-gray-400 text-center">"{ft('chef_msg')}"</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
