// C.1 — surfaces ingredient price changes derived from recent invoices, matched
// to the recipe tree. Approving one re-prices every affected dish's food cost.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, TrendingUp, ArrowLeft } from 'lucide-react';

export default function IngredientPriceUpdatesCard({ onApplied }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [applied, setApplied] = useState(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [map, setMap] = useState({});

  const load = async () => {
    setLoading(true);
    try { const r = await base44.functions.getIngredientPriceUpdates({}); setData(r?.data || r || {}); }
    catch { setData({ updates: [], unmatched: [] }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const apply = async (u) => {
    setBusyId(u.product_name);
    try {
      const r = await base44.functions.applyIngredientPriceUpdate({ ingredient_id: u.ingredient_id, price_per_unit: u.new_price, product_name: u.product_name });
      const dishes = (r?.data || r)?.affected_dishes || [];
      setApplied({ name: u.ingredient_name, dishes });
      setTimeout(() => setApplied(null), 7000);
      await load();
      onApplied && onApplied();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusyId(null); }
  };

  const applyUnmatched = async (it) => {
    const ingId = map[it.product_name];
    if (!ingId) return;
    setBusyId(it.product_name);
    try {
      await base44.functions.applyIngredientPriceUpdate({ ingredient_id: ingId, price_per_unit: it.unit_price, product_name: it.product_name });
      await load(); onApplied && onApplied();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusyId(null); }
  };

  // Approve a brand-new product → create it as a new raw material (חומר גלם).
  const createNew = async (it) => {
    setBusyId(it.product_name);
    try {
      await base44.functions.applyIngredientPriceUpdate({ product_name: it.product_name, unit: it.unit, price_per_unit: it.unit_price });
      await load(); onApplied && onApplied();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusyId(null); }
  };

  if (loading) return null;
  const updates = data?.updates || [];
  const unmatched = data?.unmatched || [];
  const ingredients = data?.ingredients || [];
  if (updates.length === 0 && unmatched.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="p-4 space-y-3">
        <div className="font-bold flex items-center gap-2 text-amber-900">
          <TrendingUp className="w-4 h-4" /> עדכוני מחיר מחשבוניות → עץ המוצר
          {updates.length > 0 && <span className="text-xs font-normal text-amber-700">({updates.length} שינויים)</span>}
        </div>

        {applied && (
          <div className="text-xs bg-emerald-50 border border-emerald-200 rounded p-2 text-emerald-800">
            ✅ עודכן מחיר {applied.name}.{applied.dishes.length > 0
              ? ` פוד-קוסט מעודכן: ${applied.dishes.slice(0, 4).map(d => `${d.name} ${d.food_cost_percent != null ? Math.round(d.food_cost_percent) + '%' : '—'}`).join(' · ')}`
              : ''}
          </div>
        )}

        {updates.length > 0 && (
          <div className="space-y-1.5">
            {updates.map((u) => {
              const up = (u.change_pct || 0) > 0;
              return (
                <div key={u.product_name} className="flex items-center gap-2 bg-white rounded-lg border p-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{u.ingredient_name}<span className="text-slate-400 text-xs"> ← {u.product_name}{u.supplier ? ` · ${u.supplier}` : ''}</span></div>
                    <div className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap">
                      {u.current_price != null
                        ? <span>₪{u.current_price} <ArrowLeft className="w-3 h-3 inline" /> <strong>₪{u.new_price}</strong></span>
                        : <span>מחיר חסר <ArrowLeft className="w-3 h-3 inline" /> <strong>₪{u.new_price}</strong></span>}
                      {u.change_pct != null && <span className={up ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>{up ? '▲' : '▼'}{Math.abs(u.change_pct)}%</span>}
                      {u.affected_count > 0 && <span className="text-slate-400">· {u.affected_count} מנות</span>}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => apply(u)} disabled={busyId === u.product_name} className="bg-amber-600 hover:bg-amber-700 flex-shrink-0">
                    {busyId === u.product_name ? <Loader2 className="w-4 h-4 animate-spin" /> : 'עדכן'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {unmatched.length > 0 && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5 space-y-2">
            <div className="text-sm font-bold text-indigo-900">🆕 מוצרים חדשים מחשבונית — אישור נדרש ({unmatched.length})</div>
            <div className="text-[11px] text-slate-500">מוצר חדש שלא זוהה: <b>צור מוצר</b> חדש (עם המחיר מהחשבונית) — <b>או</b> שייך למוצר קיים (אותו מוצר בשם אחר, וכך יזוהה אוטומטית בפעם הבאה).</div>
            <div className="space-y-1.5">
              {unmatched.map((it) => (
                <div key={it.product_name} className="flex items-center gap-2 bg-white rounded-lg border p-2 text-sm flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <div className="font-medium truncate">{it.product_name}</div>
                    <div className="text-xs text-slate-500">₪{it.unit_price}{it.unit ? ` / ${it.unit}` : ''}{it.supplier ? ` · ${it.supplier}` : ''}</div>
                  </div>
                  <Button size="sm" onClick={() => createNew(it)} disabled={busyId === it.product_name} className="bg-emerald-600 hover:bg-emerald-700 flex-shrink-0">
                    {busyId === it.product_name ? <Loader2 className="w-4 h-4 animate-spin" /> : '➕ צור מוצר'}
                  </Button>
                  <div className="flex items-center gap-1">
                    <select value={map[it.product_name] || ''} onChange={(e) => setMap((m) => ({ ...m, [it.product_name]: e.target.value }))}
                      className="h-9 rounded-md border border-input bg-background px-2 text-xs max-w-[130px]">
                      <option value="">שייך לקיים…</option>
                      {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <Button size="sm" variant="outline" disabled={!map[it.product_name] || busyId === it.product_name} onClick={() => applyUnmatched(it)} className="flex-shrink-0">שייך</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
