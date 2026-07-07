import React, { useState, useEffect, useMemo } from 'react';
import { MenuItem } from '@/entities/MenuItem';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Utensils, Plus, Edit, Trash2, Search, Loader2, RefreshCw, EyeOff, Eye } from 'lucide-react';

const emptyItem = { name: '', category: 'כללי', price: '', description: '', available: true };

function ItemForm({ item, categories, onSave, onCancel }) {
  const [f, setF] = useState(item ? { ...item, price: item.price ?? '' } : { ...emptyItem });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim()) { alert('חסר שם מנה'); return; }
    setSaving(true);
    try {
      const payload = {
        name: f.name.trim(),
        category: (f.category || 'כללי').trim() || 'כללי',
        price: parseFloat(f.price) || 0,
        description: f.description?.trim() || null,
        available: f.available !== false,
      };
      if (item?.id) await MenuItem.update(item.id, payload);
      else await MenuItem.create(payload);
      onSave();
    } catch (e) { alert('שגיאה בשמירה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div>
        <Label>שם המנה</Label>
        <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="למשל: אסאי בול" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>קטגוריה</Label>
          <Input list="cats" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="ראשונות / שתייה..." />
          <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </div>
        <div>
          <Label>מחיר (₪)</Label>
          <Input type="number" min="0" step="0.5" value={f.price} onChange={(e) => set('price', e.target.value)} placeholder="0" />
        </div>
      </div>
      <div>
        <Label>תיאור (לא חובה)</Label>
        <Input value={f.description || ''} onChange={(e) => set('description', e.target.value)} placeholder="רכיבים / הערות" />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input type="checkbox" checked={f.available !== false} onChange={(e) => set('available', e.target.checked)} className="accent-emerald-600 w-4 h-4" />
        זמין בתפריט
      </label>
      <div className="flex gap-2 pt-2">
        <Button onClick={submit} disabled={saving} className="flex-1">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}
        </Button>
        <Button variant="outline" onClick={onCancel} className="flex-1">ביטול</Button>
      </div>
    </div>
  );
}

export default function MenuManagement() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [dialog, setDialog] = useState(null); // { item } | { item: null } | null

  const load = async () => {
    setLoading(true);
    try { setItems(await MenuItem.list()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category || 'כללי'))].sort((a, b) => a.localeCompare(b, 'he')),
    [items],
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter((i) => (i.name || '').toLowerCase().includes(s) || (i.category || '').toLowerCase().includes(s)) : items;
  }, [items, q]);

  const byCategory = useMemo(() => {
    const m = {};
    for (const i of filtered) (m[i.category || 'כללי'] = m[i.category || 'כללי'] || []).push(i);
    return m;
  }, [filtered]);

  const del = async (i) => {
    if (!window.confirm(`למחוק את "${i.name}"?`)) return;
    try { await MenuItem.delete(i.id); load(); }
    catch (e) { alert('שגיאה במחיקה: ' + (e?.message || '')); }
  };

  const toggleAvail = async (i) => {
    try { await MenuItem.update(i.id, { available: i.available === false }); load(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Utensils className="w-6 h-6 text-[#A04A2E]" /> ניהול תפריט
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {loading ? '...' : `${items.length} מנות ב-${categories.length} קטגוריות`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
          </Button>
          <Button onClick={() => setDialog({ item: null })} className="bg-[#A04A2E] hover:bg-[#7A3722]">
            <Plus className="w-4 h-4 ml-1" /> מנה חדשה
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש מנה או קטגוריה..." className="pr-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-slate-500">
          <Utensils className="w-12 h-12 mx-auto text-slate-300 mb-2" />
          אין מנות עדיין. הוסף מנה, או שלח קישור/צילום תפריט בהטמעת הוואטסאפ.
        </CardContent></Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(byCategory).map(([cat, list]) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="font-bold text-slate-800">{cat}</h2>
                <Badge variant="outline" className="text-xs">{list.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {list.map((i) => (
                  <Card key={i.id} className={`${i.available === false ? 'opacity-60' : ''}`}>
                    <CardContent className="p-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          {i.name}
                          {i.available === false && <span className="text-[10px] text-slate-400">(לא זמין)</span>}
                        </div>
                        {i.description && <div className="text-xs text-slate-500 mt-0.5 truncate">{i.description}</div>}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {i.price > 0 && <span className="font-bold text-slate-700 text-sm whitespace-nowrap">₪{i.price}</span>}
                        <button onClick={() => toggleAvail(i)} title={i.available === false ? 'הפוך לזמין' : 'הסתר'} className="p-1.5 text-slate-400 hover:text-slate-700">
                          {i.available === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button onClick={() => setDialog({ item: i })} className="p-1.5 text-slate-400 hover:text-blue-600"><Edit className="w-4 h-4" /></button>
                        <button onClick={() => del(i)} className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>{dialog?.item ? 'עריכת מנה' : 'מנה חדשה'}</DialogTitle></DialogHeader>
          {dialog && (
            <ItemForm
              item={dialog.item}
              categories={categories}
              onSave={() => { setDialog(null); load(); }}
              onCancel={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
