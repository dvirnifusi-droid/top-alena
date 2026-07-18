import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Save, Plus, Trash2, ChevronDown, Check, X } from 'lucide-react';

const BASE_LEVELS = [
  { v: 'admin', l: 'ניהול מלא' },
  { v: 'manager', l: 'מנהל' },
  { v: 'shift_lead', l: 'אחראי משמרת' },
  { v: 'employee', l: 'עובד' },
];

// The page catalog is derived from the REAL sidebar definitions, so it can never
// drift from what actually exists. Category headers (url '#') become groups.
// Takes the link arrays as ARGUMENTS (not an import of Layout) so this module
// never forms an import cycle with Layout.jsx.
export function buildCatalog(adminLinks = [], employeeLinks = []) {
  const groups = [];
  let current = null;
  const push = (links, fallbackGroup) => {
    for (const l of links) {
      if (l.isCategory) {
        current = { name: String(l.title || '').trim(), pages: [] };
        groups.push(current);
        continue;
      }
      const key = String(l.url || '').replace(/^\//, '').split('?')[0];
      if (!key || key === '#') continue;
      if (!current) { current = { name: fallbackGroup, pages: [] }; groups.push(current); }
      if (!current.pages.some((p) => p.key === key)) current.pages.push({ key, label: String(l.title || key) });
    }
  };
  current = { name: 'ראשי', pages: [] }; groups.push(current);
  push(adminLinks, 'ראשי');
  current = { name: 'מסכי עובד', pages: [] }; groups.push(current);
  push(employeeLinks, 'מסכי עובד');
  // Drop empty groups + de-dupe pages that appear in more than one group.
  const seen = new Set();
  return groups
    .map((g) => ({ ...g, pages: g.pages.filter((p) => (seen.has(p.key) ? false : seen.add(p.key))) }))
    .filter((g) => g.pages.length);
}

export default function PermissionTierEditor({ tiers, catalog = [], onSaved, onCancel }) {
  const allKeys = useMemo(() => catalog.flatMap((g) => g.pages.map((p) => p.key)), [catalog]);
  const [draft, setDraft] = useState(() =>
    (tiers?.length ? tiers : [{ label: 'מנהל / בעלים', base_level: 'admin' }]).map((t) => ({
      id: t.id, label: t.label, base_level: t.base_level,
      allowed_pages: Array.isArray(t.allowed_pages) ? [...t.allowed_pages] : null,
    })),
  );
  const [openIdx, setOpenIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const patch = (i, key, val) => setDraft((d) => d.map((t, j) => (j === i ? { ...t, [key]: val } : t)));
  const addTier = () => setDraft((d) => [...d, { label: '', base_level: 'employee', allowed_pages: null }]);
  const removeTier = (i) => { setDraft((d) => d.filter((_, j) => j !== i)); setOpenIdx(null); };

  const togglePage = (i, key) => setDraft((d) => d.map((t, j) => {
    if (j !== i) return t;
    const cur = Array.isArray(t.allowed_pages) ? t.allowed_pages : [...allKeys]; // null = everything → start from all
    return { ...t, allowed_pages: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] };
  }));
  const setGroup = (i, group, on) => setDraft((d) => d.map((t, j) => {
    if (j !== i) return t;
    const cur = Array.isArray(t.allowed_pages) ? t.allowed_pages : [...allKeys];
    const keys = group.pages.map((p) => p.key);
    return { ...t, allowed_pages: on ? [...new Set([...cur, ...keys])] : cur.filter((k) => !keys.includes(k)) };
  }));
  const setAll = (i, on) => patch(i, 'allowed_pages', on ? [...allKeys] : []);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await base44.functions.savePermissionTiers({
        tiers: draft.filter((t) => t.label && t.label.trim()).map((t) => ({
          id: t.id, label: t.label.trim(), base_level: t.base_level,
          allowed_pages: Array.isArray(t.allowed_pages) ? t.allowed_pages : null,
        })),
      });
      if (onSaved) onSaved();
    } catch (e) { setErr(e?.message || 'שגיאה בשמירה'); }
    setSaving(false);
  };

  return (
    <div dir="rtl" className="text-right">
      <p className="text-[11px] text-slate-500 mb-2 leading-snug">
        לכל תפקיד סמן בדיוק אילו עמודים הוא רואה. תפקיד ללא סימון כלל = רואה הכל (התנהגות ישנה).
        <b> הבעלים תמיד רואה הכל.</b>
      </p>
      {err && <div className="text-[11px] text-red-600 mb-2">{err}</div>}

      <div className="space-y-2 max-h-[55vh] overflow-y-auto pl-1">
        {draft.map((t, i) => {
          const configured = Array.isArray(t.allowed_pages);
          const count = configured ? t.allowed_pages.length : allKeys.length;
          const open = openIdx === i;
          return (
            <div key={i} className="rounded-xl border bg-white overflow-hidden">
              {/* The editor lives inside the ~320px sidebar, so the name gets its
                  OWN full-width row — cramming it next to the level select and the
                  pages button collapsed it to ~13px and the label looked empty. */}
              <div className="p-1.5 space-y-1.5">
                <input
                  value={t.label || ''}
                  onChange={(e) => patch(i, 'label', e.target.value)}
                  placeholder="שם התפקיד"
                  className="w-full text-[12.5px] font-bold border rounded-lg px-2 py-1.5"
                />
                <div className="flex items-center gap-1.5">
                  <select
                    value={t.base_level}
                    onChange={(e) => patch(i, 'base_level', e.target.value)}
                    className="flex-1 min-w-0 text-[11px] border rounded-lg px-1 py-1 bg-white"
                  >
                    {BASE_LEVELS.map((b) => <option key={b.v} value={b.v}>{b.l}</option>)}
                  </select>
                  <button onClick={() => setOpenIdx(open ? null : i)}
                    className={`shrink-0 text-[11px] font-bold rounded-lg px-2 py-1 border flex items-center gap-1 ${configured ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600'}`}>
                    {count} עמודים <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <button onClick={() => removeTier(i)} className="shrink-0 text-slate-400 hover:text-red-600 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {open && (
                <div className="border-t bg-slate-50 p-2">
                  <div className="flex gap-1.5 mb-2">
                    <button onClick={() => setAll(i, true)} className="text-[10px] font-bold rounded px-2 py-0.5 bg-emerald-100 text-emerald-700">סמן הכל</button>
                    <button onClick={() => setAll(i, false)} className="text-[10px] font-bold rounded px-2 py-0.5 bg-rose-100 text-rose-700">נקה הכל</button>
                  </div>
                  {catalog.map((g) => {
                    const cur = configured ? t.allowed_pages : allKeys;
                    const on = g.pages.filter((p) => cur.includes(p.key)).length;
                    return (
                      <div key={g.name} className="mb-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[11px] font-black text-slate-700">{g.name}</span>
                          <span className="text-[10px] text-slate-400">{on}/{g.pages.length}</span>
                          <button onClick={() => setGroup(i, g, on < g.pages.length)}
                            className="text-[10px] text-blue-600 font-bold">
                            {on < g.pages.length ? 'סמן הכל' : 'נקה'}
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          {g.pages.map((p) => {
                            const checked = cur.includes(p.key);
                            return (
                              <button key={p.key} onClick={() => togglePage(i, p.key)}
                                className={`flex items-center gap-1.5 text-[11px] rounded-lg px-1.5 py-1 border text-right ${checked ? 'bg-white border-blue-300 text-slate-800' : 'bg-slate-100 border-transparent text-slate-400'}`}>
                                <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}>
                                  {checked ? <Check className="w-2.5 h-2.5 text-white" /> : <X className="w-2.5 h-2.5 text-white" />}
                                </span>
                                <span className="truncate">{p.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 mt-2">
        <button onClick={addTier} className="text-[11px] font-bold rounded-lg px-2 py-1 border flex items-center gap-1 bg-white">
          <Plus className="w-3 h-3" /> תפקיד
        </button>
        <div className="flex-1" />
        <button onClick={onCancel} className="text-[11px] rounded-lg px-2 py-1 border bg-white">ביטול</button>
        <button onClick={save} disabled={saving}
          className="text-[11px] font-bold rounded-lg px-3 py-1 bg-blue-600 text-white flex items-center gap-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} שמור
        </button>
      </div>
    </div>
  );
}
