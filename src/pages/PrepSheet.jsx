// Prep Sheet — per-tenant mise-en-place / par-level list.
// Cook view: for each product sees the TARGET, fills what they HAVE, the sheet
// shows how much to PREP (target − have), and checks ✓. Admin can edit the
// product template (name / target / unit / category), import from text, and
// reset the daily counts.
import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { User } from '@/entities/User';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChefHat, Plus, Trash2, Save, RotateCcw, Upload, Loader2, Check } from 'lucide-react';

// Leading number out of a "20 ליטר" / "8" string → 20 / 8 (null if none).
const numOf = (s) => { const m = String(s ?? '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };

export default function PrepSheet() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
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
      try { const me = await User.me(); setIsAdmin(me?.role === 'admin' || me?.role === 'owner' || !!me?.managed_department); } catch { /* staff */ }
      load();
    })();
  }, []);

  // Group by category (preserve first-seen order).
  const groups = useMemo(() => {
    const m = new Map();
    for (const it of items) { const c = it.category || 'כללי'; if (!m.has(c)) m.set(c, []); m.get(c).push(it); }
    return [...m.entries()];
  }, [items]);

  const patch = (id, field, val) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: val } : it)));

  // Cook autosave (have / done) — single-row, no full rewrite.
  const saveOne = async (it) => {
    try { await base44.functions.updatePrepItem({ id: it.id, have: it.have, to_prep: it.to_prep, done: it.done }); } catch (e) { console.warn('save prep row', e); }
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

  const addRow = () => setItems((prev) => [...prev, { id: `new_${Date.now()}_${prev.length}`, name: '', category: 'כללי', unit: '', target: '', have: '', done: false, sort: prev.length }]);
  const delRow = (id) => setItems((prev) => prev.filter((it) => it.id !== id));

  const resetCounts = async () => {
    if (!window.confirm('לאפס את הספירה היומית (יש/✓) לכל המוצרים?')) return;
    try { await base44.functions.resetPrepCounts({}); await load(); } catch (e) { console.warn('reset', e); }
  };

  // Import: each line "product 20 ליטר" → { name, target } (number+unit = target).
  const runImport = async () => {
    const parsed = importText.split('\n').map((l) => l.trim()).filter(Boolean).map((line, i) => {
      const m = line.match(/^(.+?)[\s:–-]+(\d[\d.,]*\s*.*)$/);
      if (m) return { name: m[1].trim(), target: m[2].trim(), category: 'הכנות', have: '', done: false, sort: i };
      return { name: line, target: '', category: 'הכנות', have: '', done: false, sort: i };
    }).filter((it) => it.name);
    if (!parsed.length) return;
    setSaving(true);
    try { await base44.functions.savePrepItems({ items: parsed }); setShowImport(false); setImportText(''); await load(); }
    catch (e) { console.warn('import', e); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-orange-600" /></div>;

  return (
    <div dir="rtl" className="p-4 sm:p-8 bg-gradient-to-br from-orange-50 to-amber-50 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
          <h1 className="text-2xl md:text-3xl font-black text-[#A04A2E] flex items-center gap-2"><ChefHat className="w-7 h-7" /> דף הכנות</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && <Button variant="outline" size="sm" onClick={resetCounts}><RotateCcw className="w-4 h-4 ml-1" /> אפס ספירה</Button>}
            {isAdmin && <Button variant="outline" size="sm" onClick={() => setShowImport((v) => !v)}><Upload className="w-4 h-4 ml-1" /> ייבוא מטקסט</Button>}
            {isAdmin && (editMode
              ? <Button size="sm" onClick={saveAll} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-1" /> שמור</>}</Button>
              : <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>ערוך מוצרים</Button>)}
          </div>
        </div>

        {showImport && isAdmin && (
          <Card className="mb-4 border-orange-200">
            <CardHeader><CardTitle className="text-base">ייבוא רשימת הכנות</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-gray-500">שורה לכל מוצר — שם ואז כמות יעד. למשל: <code>טחינה לבנה 12 ליטר</code></p>
              <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} placeholder={'משוויה 20 ליטר\nבצל מקורמל 8 ליטר\nשום קונפי 8 ליטר'} />
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
                        <th className="text-center p-2 font-semibold w-24">כמות</th>
                        <th className="text-center p-2 font-semibold w-20">להכין</th>
                        <th className="text-center p-2 font-semibold w-20">בוצע ✓</th>
                        {editMode && <th className="w-8"></th>}
                      </tr></thead>
                      <tbody>
                        {rows.map((it) => (
                          <tr key={it.id} className={`border-b last:border-0 ${it.done ? 'bg-green-50/50' : it.to_prep ? 'bg-orange-50/50' : ''}`}>
                            <td className="p-2">
                              {editMode
                                ? <Input value={it.name} onChange={(e) => patch(it.id, 'name', e.target.value)} className="h-8 text-sm" placeholder="שם מוצר" />
                                : <span className={`font-medium ${it.done ? 'line-through text-gray-400' : 'text-slate-800'}`}>{it.name}</span>}
                            </td>
                            <td className="p-2 text-center">
                              {editMode
                                ? <Input value={it.target || ''} onChange={(e) => patch(it.id, 'target', e.target.value)} className="h-8 text-sm text-center" placeholder="20 ליטר" />
                                : <span className="text-gray-600 whitespace-nowrap">{it.target || '—'}</span>}
                            </td>
                            {/* להכין — the cook marks which items need making */}
                            <td className="p-2 text-center">
                              <button
                                onClick={() => { const nv = !it.to_prep; patch(it.id, 'to_prep', nv); if (!editMode) saveOne({ ...it, to_prep: nv }); }}
                                className={`w-7 h-7 rounded border-2 inline-flex items-center justify-center transition-colors ${it.to_prep ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 hover:border-orange-400'}`}
                              >{it.to_prep && <Check className="w-4 h-4" />}</button>
                            </td>
                            {/* בוצע */}
                            <td className="p-2 text-center">
                              <button
                                onClick={() => { const nv = !it.done; patch(it.id, 'done', nv); if (!editMode) saveOne({ ...it, done: nv }); }}
                                className={`w-7 h-7 rounded border-2 inline-flex items-center justify-center transition-colors ${it.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}
                              >{it.done && <Check className="w-4 h-4" />}</button>
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
