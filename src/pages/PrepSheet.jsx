// Prep Sheet — per-tenant mise-en-place list, grouped by dish.
// Flow: the manager builds the list (item + how much you HAVE + how much to
// PREP) and flags which items need making ("לסמן להכין"). Cooks then work the
// list: mark "בוצע" when done — which stamps WHO did it, WHEN, and lets them
// attach a photo as proof. A summary at the top shows overall status.
import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { User } from '@/entities/User';
import { UploadFile } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChefHat, Plus, Trash2, Save, RotateCcw, Upload, Loader2, Check, Camera } from 'lucide-react';

// ISO timestamp → short "DD/MM HH:mm" in Hebrew locale (null-safe).
const fmtWhen = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
};

export default function PrepSheet() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getPrepItems({});
      const data = res?.data || res || {};
      setItems(Array.isArray(data.items) ? data.items.map((it, i) => ({ ...it, sort: it.sort ?? i })) : []);
    } catch (e) { console.warn('load prep', e); }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      try { const u = await User.me(); setMe(u); setIsAdmin(u?.role === 'admin' || u?.role === 'owner' || !!u?.managed_department); } catch { /* staff */ }
      load();
    })();
  }, []);

  // Group by dish/category (preserve first-seen order).
  const groups = useMemo(() => {
    const m = new Map();
    for (const it of items) { const c = it.category || 'כללי'; if (!m.has(c)) m.set(c, []); m.get(c).push(it); }
    return [...m.entries()];
  }, [items]);

  // List-wide status summary.
  const summary = useMemo(() => {
    const total = items.length;
    const toPrep = items.filter((i) => i.to_prep).length;
    const doneToPrep = items.filter((i) => i.to_prep && i.done).length;
    const doneAll = items.filter((i) => i.done).length;
    const remaining = items.filter((i) => i.to_prep && !i.done);
    return { total, toPrep, doneToPrep, doneAll, remaining };
  }, [items]);

  const patch = (id, field, val) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: val } : it)));

  // Cook autosave — one row, no full rewrite. Sends the full row so who/when is
  // stamped server-side on 'done' and to_prep/photo are preserved.
  const saveOne = async (it) => {
    try {
      await base44.functions.updatePrepItem({ id: it.id, have: it.have, prep: it.prep, to_prep: it.to_prep, done: it.done, photo_url: it.photo_url });
    } catch (e) { console.warn('save prep row', e); }
  };

  // Toggle a boolean field (to_prep / done) with optimistic who/when stamping.
  const toggle = (it, field) => {
    const nv = !it[field];
    let next = { ...it, [field]: nv };
    if (field === 'done') {
      next = nv
        ? { ...next, done_by: me?.full_name || me?.email || 'עובד', done_at: new Date().toISOString() }
        : { ...next, done_by: null, done_at: null };
    }
    setItems((prev) => prev.map((x) => (x.id === it.id ? next : x)));
    if (!editMode) saveOne(next);
  };

  const attachPhoto = async (it, file) => {
    if (!file) return;
    setUploadingId(it.id);
    try {
      const { file_url } = await UploadFile({ file });
      const next = { ...it, photo_url: file_url };
      setItems((prev) => prev.map((x) => (x.id === it.id ? next : x)));
      await saveOne(next);
    } catch (e) { console.warn('prep photo', e); }
    setUploadingId(null);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await base44.functions.savePrepItems({ items: items.map((it, i) => ({ ...it, sort: i })) });
      await load();
      setEditMode(false);
    } catch (e) { console.warn('save all', e); }
    setSaving(false);
  };

  const addRow = () => setItems((prev) => [...prev, { id: `new_${Date.now()}_${prev.length}`, name: '', category: 'הכנות', unit: '', target: '', have: '', prep: '', to_prep: false, done: false, sort: prev.length }]);
  const delRow = (id) => setItems((prev) => prev.filter((it) => it.id !== id));

  const resetCounts = async () => {
    if (!window.confirm('לאפס את הרשימה (יש/להכין/סימונים/בוצע/תמונות) ולהתחיל יום הכנות חדש?')) return;
    try { await base44.functions.resetPrepCounts({}); await load(); } catch (e) { console.warn('reset', e); }
  };

  // Import: dish headers group items; a line with "*" is an item under the
  // current dish. Title / legend / note lines are skipped. If the text has no
  // "*" at all, every line is treated as a flat item (optionally "name — qty").
  const runImport = async () => {
    const lines = importText.split('\n').map((l) => l.trim()).filter(Boolean);
    const isJunk = (l) => /^(מפתח|key\b|prep for tomorrow|הכנות לבוקר|רכיבים משותפים|have\s*=|prep\s*=|✓\s*=)/i.test(l);
    const clean = lines.filter((l) => !isJunk(l));
    const hasStars = clean.some((l) => l.includes('*'));
    const parsed = [];
    let cat = 'הכנות';
    for (const line of clean) {
      if (hasStars) {
        const isItem = line.includes('*');
        const name = line.replace(/\*/g, '').replace(/\s{2,}/g, ' ').trim();
        if (!name) continue;
        if (isItem) parsed.push({ name, category: cat, have: '', prep: '', to_prep: false, done: false, sort: parsed.length });
        else cat = name; // header line → the dish these items belong to
      } else {
        const m = line.match(/^(.+?)[\s:–-]+(\d[\d.,]*\s*.*)$/);
        if (m) parsed.push({ name: m[1].trim(), target: m[2].trim(), category: cat, have: '', prep: '', to_prep: false, done: false, sort: parsed.length });
        else parsed.push({ name: line, category: cat, have: '', prep: '', to_prep: false, done: false, sort: parsed.length });
      }
    }
    if (!parsed.length) return;
    setSaving(true);
    try { await base44.functions.savePrepItems({ items: parsed }); setShowImport(false); setImportText(''); await load(); }
    catch (e) { console.warn('import', e); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-orange-600" /></div>;

  const pct = summary.toPrep ? Math.round((summary.doneToPrep / summary.toPrep) * 100) : 0;

  return (
    <div dir="rtl" className="p-4 sm:p-8 bg-gradient-to-br from-orange-50 to-amber-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h1 className="text-2xl md:text-3xl font-black text-[#A04A2E] flex items-center gap-2"><ChefHat className="w-7 h-7" /> דף הכנות</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && <Button variant="outline" size="sm" onClick={resetCounts}><RotateCcw className="w-4 h-4 ml-1" /> יום חדש</Button>}
            {isAdmin && <Button variant="outline" size="sm" onClick={() => setShowImport((v) => !v)}><Upload className="w-4 h-4 ml-1" /> ייבוא מטקסט</Button>}
            {isAdmin && (editMode
              ? <Button size="sm" onClick={saveAll} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-1" /> שמור</>}</Button>
              : <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>ערוך מוצרים</Button>)}
          </div>
        </div>

        {/* Summary — overall status of the list */}
        {items.length > 0 && (
          <Card className="mb-4 border-orange-200/70">
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-4 text-sm">
                  <div><span className="text-2xl font-black text-slate-800">{summary.total}</span> <span className="text-gray-500">פריטים</span></div>
                  <div><span className="text-2xl font-black text-orange-600">{summary.toPrep}</span> <span className="text-gray-500">להכנה</span></div>
                  <div><span className="text-2xl font-black text-green-600">{summary.doneToPrep}</span> <span className="text-gray-500">בוצעו</span></div>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
                    <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-left">{pct}% מההכנות הושלמו</div>
                </div>
              </div>
              {summary.remaining.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  <span className="font-semibold text-orange-700">נותרו להכנה:</span> {summary.remaining.map((r) => r.name).join(' · ')}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {showImport && isAdmin && (
          <Card className="mb-4 border-orange-200">
            <CardHeader><CardTitle className="text-base">ייבוא רשימת הכנות</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-gray-500">כותרת מנה בשורה נפרדת, ולפני כל פריט הכנה סמן <code>*</code>. הפריטים יקובצו תחת המנה. (שורות מפתח/הסבר יידלגו אוטומטית.)</p>
              <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} placeholder={'FOCACCIA (פוקאצ׳ה)\n* Bake focaccia (אפיית פוקאצ׳ה)\n* Seasonal jam (ריבה עונתית)\n\nSPICY PLATE (צלחת חריפים)\n* Zhug (סחוג)\n* Fried chili (צ׳ילי מטוגן)'} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowImport(false)}>ביטול</Button>
                <Button size="sm" onClick={runImport} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ייבא'}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {items.length === 0 ? (
          <Card><CardContent className="text-center py-12 text-gray-500">
            <ChefHat className="w-12 h-12 mx-auto text-orange-300 mb-3" />
            <p className="font-bold text-slate-700 mb-1">אין עדיין רשימת הכנות</p>
            {isAdmin ? <p className="text-sm">לחץ "ייבוא מטקסט" והדבק את רשימת ההכנות שלך.</p> : <p className="text-sm">המנהל עדיין לא הגדיר רשימת הכנות.</p>}
          </CardContent></Card>
        ) : (
          <div className="space-y-5">
            {groups.map(([cat, rows]) => (
              <Card key={cat} className="overflow-hidden">
                <CardHeader className="bg-gradient-to-l from-orange-100 to-amber-50 py-2.5"><CardTitle className="text-base text-[#7A3722]">{cat}</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-gray-500 border-b bg-gray-50/60">
                        <th className="text-right p-2 font-semibold">מוצר</th>
                        <th className="text-center p-2 font-semibold w-20">יש</th>
                        <th className="text-center p-2 font-semibold w-20">להכין</th>
                        <th className="text-center p-2 font-semibold w-14">לסמן</th>
                        <th className="text-center p-2 font-semibold w-28">בוצע</th>
                        {editMode && <th className="w-8"></th>}
                      </tr></thead>
                      <tbody>
                        {rows.map((it) => (
                          <tr key={it.id} className={`border-b last:border-0 align-top ${it.done ? 'bg-green-50/50' : it.to_prep ? 'bg-orange-50/40' : ''}`}>
                            <td className="p-2">
                              {editMode
                                ? <Input value={it.name} onChange={(e) => patch(it.id, 'name', e.target.value)} className="h-8 text-sm" placeholder="שם מוצר" />
                                : <span className={`font-medium ${it.done ? 'line-through text-gray-400' : 'text-slate-800'}`}>{it.name}</span>}
                            </td>
                            {/* יש — how much is on hand */}
                            <td className="p-2 text-center">
                              <Input value={it.have || ''} onChange={(e) => patch(it.id, 'have', e.target.value)} onBlur={() => !editMode && saveOne(items.find((x) => x.id === it.id))} className="h-8 text-sm text-center" placeholder="—" />
                            </td>
                            {/* להכין — how much to make */}
                            <td className="p-2 text-center">
                              <Input value={it.prep || ''} onChange={(e) => patch(it.id, 'prep', e.target.value)} onBlur={() => !editMode && saveOne(items.find((x) => x.id === it.id))} className="h-8 text-sm text-center font-semibold text-orange-700" placeholder="—" />
                            </td>
                            {/* לסמן להכין — flag it needs making */}
                            <td className="p-2 text-center">
                              <button
                                onClick={() => toggle(it, 'to_prep')}
                                title="סמן שצריך להכין"
                                className={`w-7 h-7 rounded border-2 inline-flex items-center justify-center transition-colors ${it.to_prep ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 hover:border-orange-400'}`}
                              >{it.to_prep && <Check className="w-4 h-4" />}</button>
                            </td>
                            {/* בוצע — toggle + who/when + photo proof */}
                            <td className="p-2">
                              <div className="flex flex-col items-center gap-1">
                                <button
                                  onClick={() => toggle(it, 'done')}
                                  className={`w-7 h-7 rounded border-2 inline-flex items-center justify-center transition-colors ${it.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}
                                >{it.done && <Check className="w-4 h-4" />}</button>
                                {it.done && it.done_by && (
                                  <span className="text-[10px] leading-tight text-gray-500 text-center">{it.done_by}{it.done_at ? ` · ${fmtWhen(it.done_at)}` : ''}</span>
                                )}
                                <div className="flex items-center gap-1">
                                  {it.photo_url && (
                                    <a href={it.photo_url} target="_blank" rel="noreferrer">
                                      <img src={it.photo_url} alt="" className="w-8 h-8 rounded object-cover border border-gray-200" />
                                    </a>
                                  )}
                                  <label className="cursor-pointer text-gray-400 hover:text-orange-600" title="צרף תמונה">
                                    {uploadingId === it.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; attachPhoto(it, f); }} />
                                  </label>
                                </div>
                              </div>
                            </td>
                            {editMode && <td className="p-1"><button onClick={() => delRow(it.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
            {editMode && <Button variant="outline" onClick={addRow} className="w-full border-dashed"><Plus className="w-4 h-4 ml-1" /> הוסף מוצר</Button>}
          </div>
        )}
      </div>
    </div>
  );
}
