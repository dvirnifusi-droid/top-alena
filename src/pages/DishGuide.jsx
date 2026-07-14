// Dish Guide — every component of every dish. A cook mid-service who forgot
// what's on a plate searches the dish and sees its build. Big + searchable for
// kitchen use. Admin can import from text, edit, and turn it into a training.
import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { User } from '@/entities/User';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UtensilsCrossed, Search, Upload, Loader2, GraduationCap, Save, Plus, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';

// ALL-CAPS-ish line = a dish header; following lines = its components.
function parseGuide(text) {
  const dishes = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const isHeader = line.length < 46 && line === line.toUpperCase() && /[A-Za-z֐-׿]/.test(line);
    if (isHeader || !cur) { cur = { name: line, components: [] }; dishes.push(cur); }
    else cur.components.push(line.replace(/^\d+[.)]\s*/, ''));
  }
  return dishes.filter((d) => d.name && d.components.length);
}

export default function DishGuide() {
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getDishGuide({});
      const data = res?.data || res || {};
      setDishes(Array.isArray(data.dishes) ? data.dishes : []);
    } catch (e) { console.warn('load dishguide', e); }
    setLoading(false);
  };

  useEffect(() => {
    (async () => {
      try { const me = await User.me(); setIsAdmin(me?.role === 'admin' || me?.role === 'owner' || !!me?.managed_department); } catch { /* cook */ }
      load();
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dishes;
    return dishes.filter((d) => String(d.name).toLowerCase().includes(q) || (Array.isArray(d.components) && d.components.some((c) => String(c).toLowerCase().includes(q))));
  }, [dishes, search]);

  const patch = (id, field, val) => setDishes((prev) => prev.map((d) => (d.id === id ? { ...d, [field]: val } : d)));
  const patchComp = (id, i, val) => setDishes((prev) => prev.map((d) => (d.id === id ? { ...d, components: d.components.map((c, j) => (j === i ? val : c)) } : d)));
  const addComp = (id) => setDishes((prev) => prev.map((d) => (d.id === id ? { ...d, components: [...(d.components || []), ''] } : d)));
  const delComp = (id, i) => setDishes((prev) => prev.map((d) => (d.id === id ? { ...d, components: d.components.filter((_, j) => j !== i) } : d)));
  const addDish = () => setDishes((prev) => [...prev, { id: `new_${Date.now()}_${prev.length}`, name: '', category: '', components: [''] }]);
  const delDish = (id) => setDishes((prev) => prev.filter((d) => d.id !== id));

  const saveAll = async () => {
    setSaving(true);
    try { await base44.functions.saveDishGuide({ dishes: dishes.map((d, i) => ({ ...d, sort: i })) }); await load(); setEditMode(false); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    setSaving(false);
  };

  const runImport = async () => {
    const parsed = parseGuide(importText);
    if (!parsed.length) { setMsg('לא זוהו מנות — כל מנה בשורת כותרת ואז המרכיבים.'); return; }
    setSaving(true);
    try { await base44.functions.saveDishGuide({ dishes: parsed }); setShowImport(false); setImportText(''); await load(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    setSaving(false);
  };

  const buildTraining = async () => {
    if (!window.confirm('לבנות קורס הכשרה "מדריך מנות" מכל המנות? (יופיע ב"הכשרות")')) return;
    setSaving(true);
    try {
      const r = await base44.functions.buildTrainingFromDishGuide({});
      const d = r?.data || r || {};
      setMsg(d.lessons ? `✅ נבנה קורס הכשרה עם ${d.lessons} מנות — בעמוד "הכשרות".` : 'לא נבנתה הכשרה (אין מנות).');
      setTimeout(() => setMsg(''), 5000);
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    setSaving(false);
  };

  if (loading) return <div className="flex justify-center items-center h-64"><Loader2 className="w-8 h-8 animate-spin text-orange-600" /></div>;

  return (
    <div dir="rtl" className="p-4 sm:p-8 bg-gradient-to-br from-orange-50 to-amber-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        <PageHeader title="מדריך מנות" icon={UtensilsCrossed} action={isAdmin && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => setShowImport((v) => !v)}><Upload className="w-4 h-4 ml-1" /> ייבוא מטקסט</Button>
              <Button variant="outline" size="sm" onClick={buildTraining} disabled={saving || !dishes.length}><GraduationCap className="w-4 h-4 ml-1" /> בנה הכשרה</Button>
              {editMode
                ? <Button size="sm" onClick={saveAll} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-1" /> שמור</>}</Button>
                : <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>ערוך</Button>}
            </div>
          )} />

        {msg && <div className="mb-3 p-2 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">{msg}</div>}

        {/* Search — the cook's main tool */}
        <div className="relative mb-4">
          <Search className="w-5 h-5 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש מנה או מרכיב..." className="pr-11 h-12 text-lg" />
        </div>

        {showImport && isAdmin && (
          <Card className="mb-4 border-orange-200">
            <CardContent className="pt-4 space-y-2">
              <p className="text-xs text-gray-500">שם המנה בשורה, ואז המרכיבים שורה-שורה. שורת CAPS = מנה חדשה.</p>
              <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} placeholder={'CEVICHE\nDiced fish\nCantaloupe\nHarissa oil\n\nSASHIMI\nSliced fish\nSoy vinaigrette'} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowImport(false)}>ביטול</Button>
                <Button size="sm" onClick={runImport} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ייבא'}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {dishes.length === 0 ? (
          <Card><CardContent className="text-center py-12 text-gray-500">
            <UtensilsCrossed className="w-12 h-12 mx-auto text-orange-300 mb-3" />
            <p className="font-bold text-slate-700 mb-1">אין עדיין מדריך מנות</p>
            {isAdmin ? <p className="text-sm">"ייבוא מטקסט" והדבק את מדריך המנות שלך.</p> : <p className="text-sm">המנהל עדיין לא הגדיר מדריך מנות.</p>}
          </CardContent></Card>
        ) : editMode ? (
          <div className="space-y-3">
            {dishes.map((d) => (
              <Card key={d.id}><CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={d.name} onChange={(e) => patch(d.id, 'name', e.target.value)} placeholder="שם המנה" className="font-bold flex-1" />
                  <button onClick={() => delDish(d.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                {(d.components || []).map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={c} onChange={(e) => patchComp(d.id, i, e.target.value)} placeholder="מרכיב" className="text-sm" />
                    <button onClick={() => delComp(d.id, i)} className="text-red-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </div>
                ))}
                <button onClick={() => addComp(d.id)} className="text-xs text-orange-600 font-bold">+ מרכיב</button>
              </CardContent></Card>
            ))}
            <Button variant="outline" onClick={addDish} className="w-full border-dashed"><Plus className="w-4 h-4 ml-1" /> הוסף מנה</Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((d) => {
              const open = openId === d.id;
              return (
                <Card key={d.id} className={`transition-shadow ${open ? 'shadow-lg ring-1 ring-orange-200' : ''}`}>
                  <button onClick={() => setOpenId(open ? null : d.id)} className="w-full text-right p-4 flex items-center justify-between">
                    <span className="font-black text-lg text-[#7A3722]">{d.name}</span>
                    <span className="text-xs text-gray-400">{(d.components || []).length} מרכיבים {open ? '▲' : '▼'}</span>
                  </button>
                  {open && (
                    <CardContent className="pt-0 pb-4">
                      <ul className="space-y-1.5">
                        {(d.components || []).map((c, i) => (
                          <li key={i} className="flex items-start gap-2 text-slate-800">
                            <span className="text-orange-400 font-bold mt-0.5">{i + 1}.</span><span>{c}</span>
                          </li>
                        ))}
                      </ul>
                      {d.notes && <p className="mt-3 text-sm text-gray-500 border-t pt-2">{d.notes}</p>}
                    </CardContent>
                  )}
                </Card>
              );
            })}
            {filtered.length === 0 && <p className="text-center text-gray-400 py-8">אין מנה תואמת ל"{search}"</p>}
          </div>
        )}
      </div>
    </div>
  );
}
