import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChefHat, RefreshCw, TrendingUp, AlertTriangle, Edit3, Upload } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';

function RecipesInner() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('DISH');
  const [editPrice, setEditPrice] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSyncPrices = async () => {
    if (!window.confirm('סנכרן מחירי מכירה מטבלת התפריט (MenuItem) למתכונים? רק מנות שאין להן עדיין מחיר יעודכנו.')) return;
    setSyncing(true);
    try {
      const res = await base44.functions.syncMenuPricesToRecipes({});
      const data = res?.data || res;
      const missingSample = data.unmatched_recipes?.slice(0, 8).join('\n  • ') || '—';
      alert(`✅ סנכרון הסתיים\n${data.matched_count}/${data.total_recipes} מנות עודכנו\n${data.unmatched_recipes?.length || 0} ללא התאמה:\n  • ${missingSample}`);
      await load();
    } catch (e) {
      alert('שגיאה: ' + (e?.message || ''));
    } finally {
      setSyncing(false);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!window.confirm(`ייבא את "${file.name}"? פעולה זו תמחק את כל המתכונים והרכיבים הקיימים ותחליף בנתונים מהקובץ.`)) {
      event.target.value = '';
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await base44.functions.importRecipesFromJson(payload);
      const data = res?.data || res;
      alert(`✅ ייבוא הסתיים\n${data.ingredients} רכיבים · ${data.preps} הכנות · ${data.dishes} מנות · ${data.linked_ingredients} קישורים\n${data.unmatched_count > 0 ? `\nלא נמצאו: ${data.unmatched_count} רכיבים (דוגמאות: ${data.unmatched_sample?.slice(0, 5).join(', ') || ''})` : ''}`);
      await load();
    } catch (e) {
      alert('שגיאה בייבוא: ' + (e?.message || ''));
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.listRecipes({ kind: filter });
      const payload = res?.data || res;
      setRecipes(payload?.recipes || []);
    } catch (e) {
      console.error('[recipes] load failed', e);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const openDetail = async (id) => {
    setSelected(id);
    setDetail(null);
    try {
      const res = await base44.functions.getRecipe({ id });
      setDetail(res?.data || res);
    } catch (e) {
      console.error(e);
    }
  };

  const savePrice = async (id, val) => {
    const num = parseFloat(val);
    if (!Number.isFinite(num) || num < 0) { setEditPrice(null); return; }
    setSavingId(id);
    try {
      await base44.functions.updateRecipeSalePrice({ id, sale_price: num });
      await load();
      if (selected === id) await openDetail(id);
    } catch (e) {
      alert('שגיאה: ' + (e?.message || ''));
    } finally {
      setSavingId(null);
      setEditPrice(null);
    }
  };

  const dishesWithFc = recipes.filter(r => r.kind === 'DISH' && r.sale_price && r.total_cost);
  const avgFc = dishesWithFc.length
    ? dishesWithFc.reduce((s, r) => s + (r.food_cost_percent || 0), 0) / dishesWithFc.length
    : 0;
  const highFc = recipes.filter(r => r.food_cost_percent > 35);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-amber-600" /> מתכונים ופוד-קוסט
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filter === 'DISH' ? `${dishesWithFc.length} מנות עם מחיר · פוד-קוסט ממוצע ${avgFc.toFixed(1)}%` : `${recipes.length} הכנות בסיס`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleSyncPrices} disabled={syncing} className="border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4 ml-1" />}
            סנכרן מחירי תפריט
          </Button>
          <label className="inline-flex items-center gap-1 cursor-pointer border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-sm px-3 py-2 rounded-md">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            ייבא מ-JSON
            <input type="file" accept="application/json,.json" onChange={handleImport} disabled={importing} className="hidden" />
          </label>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
          </Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={filter === 'DISH' ? 'default' : 'outline'} onClick={() => setFilter('DISH')}>
          🍽 מנות
        </Button>
        <Button size="sm" variant={filter === 'PREP' ? 'default' : 'outline'} onClick={() => setFilter('PREP')}>
          🥣 הכנות
        </Button>
      </div>

      {highFc.length > 0 && filter === 'DISH' && (
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-3 flex items-start gap-2 text-sm text-red-900">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>{highFc.length} מנות עם פוד-קוסט מעל 35%</strong> — שקול להעלות מחיר או להחליף ספק.
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filter === 'DISH' ? 'רשימת מנות' : 'רשימת הכנות'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
          ) : recipes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              עוד אין נתונים. ייבא את ה-Excel בעמוד ההגדרות.
            </p>
          ) : (
            <div className="divide-y">
              {recipes.map(r => {
                const fc = r.food_cost_percent;
                const fcColor = !fc ? 'text-slate-400' : fc > 35 ? 'text-red-600' : fc > 28 ? 'text-amber-600' : 'text-emerald-600';
                return (
                  <div key={r.id}>
                    <button
                      onClick={() => openDetail(r.id === selected ? null : r.id)}
                      className={`w-full text-right p-3 hover:bg-slate-50 flex items-center gap-3 ${selected === r.id ? 'bg-amber-50' : ''}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{r.name}</div>
                        {r.category && <div className="text-xs text-slate-500">{r.category}</div>}
                      </div>
                      {r.kind === 'DISH' && (
                        <>
                          <Badge variant="outline" className="text-xs whitespace-nowrap">
                            ₪{r.total_cost?.toFixed(2) || '—'} עלות
                          </Badge>
                          {editPrice === r.id ? (
                            <Input
                              autoFocus
                              defaultValue={r.sale_price || ''}
                              onBlur={(e) => savePrice(r.id, e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') savePrice(r.id, e.target.value); if (e.key === 'Escape') setEditPrice(null); }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 w-20 text-sm"
                              type="number"
                              step="0.5"
                            />
                          ) : (
                            <Badge
                              onClick={(e) => { e.stopPropagation(); setEditPrice(r.id); }}
                              className="text-xs whitespace-nowrap cursor-pointer bg-white text-slate-700 border border-slate-300 hover:border-amber-400"
                            >
                              {savingId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                                <>₪{r.sale_price ? r.sale_price.toFixed(2) : '—'} מכירה <Edit3 className="w-3 h-3 inline mr-1" /></>
                              )}
                            </Badge>
                          )}
                          <Badge className={`text-xs whitespace-nowrap bg-white border ${fcColor}`}>
                            <TrendingUp className="w-3 h-3 inline ml-1" />
                            {fc ? fc.toFixed(1) + '%' : '—'}
                          </Badge>
                        </>
                      )}
                      {r.kind === 'PREP' && (
                        <Badge variant="outline" className="text-xs">
                          ₪{r.total_cost?.toFixed(2) || '—'} / {r.yield_unit || 'יח׳'}
                        </Badge>
                      )}
                    </button>
                    {selected === r.id && detail && (
                      <div className="p-3 bg-slate-50 border-t">
                        <div className="text-xs font-semibold text-slate-700 mb-2">פירוט רכיבים:</div>
                        <table className="w-full text-xs">
                          <thead className="text-slate-500">
                            <tr><th className="text-right pb-1">רכיב</th><th>כמות</th><th>יחידה</th><th>מחיר/יח׳</th><th>ספק</th></tr>
                          </thead>
                          <tbody>
                            {detail.ingredients.map((i, idx) => (
                              <tr key={idx} className="border-t">
                                <td className="py-1">{i.source === 'prep' ? '🥣 ' : ''}{i.name}</td>
                                <td className="text-center">{i.qty}</td>
                                <td className="text-center">{i.unit}</td>
                                <td className="text-center">{i.price_per_unit ? `₪${i.price_per_unit.toFixed(2)}` : '—'}</td>
                                <td className="text-center text-slate-500">{i.supplier_name || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function Recipes() {
  return (
    <PageGuard pageName="Recipes" pageTitle="מתכונים">
      <RecipesInner />
    </PageGuard>
  );
}
