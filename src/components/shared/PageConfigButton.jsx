// App Builder — the per-page ⚙️ that lets the OWNER customize THIS page:
// rename its title, override labels, and hide sections. Employees never see the
// button; they just see the result. Default is always the built-in value.
//
// Usage on any page:
//   <PageConfigButton page="Dashboard" defaultTitle="לוח בקרה"
//      labels={[{ key: 'greeting', label: 'כותרת ברוכים הבאים', default: '...' }]}
//      sections={[{ key: 'insights', label: 'תובנות' }]} />
import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useAppConfig } from '@/hooks/useAppConfig';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings2, Loader2, RotateCcw } from 'lucide-react';

export default function PageConfigButton({ page, defaultTitle = '', labels = [], sections = [] }) {
  const { user } = useAuth();
  const isOwner = ['owner', 'admin'].includes(user?.role);
  const { pageConfig, refresh } = useAppConfig();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [labelVals, setLabelVals] = useState({});
  const [hiddenSecs, setHiddenSecs] = useState([]);
  const [saving, setSaving] = useState(false);

  if (!isOwner) return null;

  const openDialog = () => {
    const pc = pageConfig?.[page] || {};
    setTitle(pc.title || '');
    const lv = {}; labels.forEach((l) => { lv[l.key] = pc.labels?.[l.key] ?? ''; });
    setLabelVals(lv);
    setHiddenSecs(Array.isArray(pc.hidden_sections) ? pc.hidden_sections : []);
    setOpen(true);
  };
  const save = async () => {
    setSaving(true);
    try {
      const labelsOut = {};
      labels.forEach((l) => { const v = (labelVals[l.key] || '').trim(); if (v) labelsOut[l.key] = v; });
      await base44.functions.setPageConfig({ page, title: title.trim() || null, labels: labelsOut, hidden_sections: hiddenSecs });
      await refresh();
      setOpen(false);
    } catch (e) { /* keep dialog open on error */ }
    setSaving(false);
  };
  const resetAll = async () => {
    setSaving(true);
    try { await base44.functions.setPageConfig({ page, title: null, labels: {}, hidden_sections: [] }); await refresh(); setOpen(false); }
    catch { /* */ }
    setSaving(false);
  };
  const toggleSec = (key) => setHiddenSecs((p) => (p.includes(key) ? p.filter((s) => s !== key) : [...p, key]));

  return (
    <>
      <button onClick={openDialog} title="התאמת הדף (בעלים)" className="inline-flex items-center justify-center w-8 h-8 rounded-full text-slate-400 hover:text-[#44512C] hover:bg-slate-100 transition-colors">
        <Settings2 className="w-4 h-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings2 className="w-5 h-5 text-[#44512C]" /> התאמת הדף</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <label className="block text-sm">
              <span className="text-slate-600 text-xs">כותרת הדף</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} className="mt-0.5" />
              <span className="text-[11px] text-slate-400">ריק = הכותרת המקורית ({defaultTitle})</span>
            </label>
            {labels.map((l) => (
              <label key={l.key} className="block text-sm">
                <span className="text-slate-600 text-xs">{l.label}</span>
                <Input value={labelVals[l.key] ?? ''} onChange={(e) => setLabelVals((p) => ({ ...p, [l.key]: e.target.value }))} placeholder={l.default || ''} className="mt-0.5" />
              </label>
            ))}
            {sections.length > 0 && (
              <div>
                <div className="text-slate-600 text-xs mb-1">סקציות בדף (בטל סימון כדי להסתיר)</div>
                <div className="space-y-1">
                  {sections.map((s) => (
                    <label key={s.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={!hiddenSecs.includes(s.key)} onChange={() => toggleSec(s.key)} />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={resetAll} disabled={saving} className="text-slate-500 gap-1"><RotateCcw className="w-3.5 h-3.5" /> אפס לברירת מחדל</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
              <Button onClick={save} disabled={saving} className="bg-[#44512C] hover:bg-[#3a4525] gap-1">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} שמור</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
