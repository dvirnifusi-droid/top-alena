import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChefHat, RefreshCw, TrendingUp, AlertTriangle, Edit3, Upload, Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader from '@/components/shared/PageHeader';
import IngredientPriceUpdatesCard from '@/components/recipes/IngredientPriceUpdatesCard';
import DishProfitCard from '@/components/recipes/DishProfitCard';
import AiScannerButton from '@/components/scanner/AiScannerButton';
import { isMainAlena } from '@/lib/tenant';

function RecipesInner() {
  const isAlena = isMainAlena();
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('DISH');
  const [aiPrepsBusy, setAiPrepsBusy] = useState(false);
  const [aiPreps, setAiPreps] = useState(null);
  const [importingPreps, setImportingPreps] = useState(false);

  const suggestPreps = async () => {
    setAiPrepsBusy(true);
    try {
      const res = await base44.functions.suggestKitchenPreps({});
      const data = res?.data || res;
      const preps = (data?.preps || []).map(p => ({ ...p, selected: true }));
      setAiPreps(preps);
      setFilter('PREP');
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setAiPrepsBusy(false); }
  };

  const importAiPreps = async () => {
    if (!aiPreps) return;
    setImportingPreps(true);
    try {
      const { Recipe } = await import('@/entities/all');
      for (const p of aiPreps.filter(x => x.selected)) {
        await Recipe.create({
          name: p.name,
          kind: 'PREP',
          unit: p.unit || 'יח׳',
          notes: [p.notes, (p.ingredients || []).join(', ')].filter(Boolean).join('\n'),
        });
      }
      setAiPreps(null);
      load();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setImportingPreps(false); }
  };
  const [editPrice, setEditPrice] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Prices Dvir confirmed from the PDF menu (22.6 edition). Applied via the
  // 'הזן מחירי תפריט מה-PDF' button below.
  const MENU_PRICES = [
    { name_match: 'פרנה', price: 28 },
    { name_match: 'בטטה ברולה', price: 45 },
    { name_match: 'ציפס', price: 37 },
    { name_match: 'כרוב שרוף', price: 45 },
    { name_match: 'חצילים', price: 45 },
    { name_match: 'חצילוגי', price: 45 },
    { name_match: 'תפו', price: 37 },
    { name_match: 'תפוא קריספי', price: 37 },
    { name_match: 'לקט פטריות', price: 45 },
    { name_match: 'ברוסקטה', price: 50 },
    { name_match: 'ברוסקטה אסאדו', price: 50 },
    { name_match: 'סניה קבב', price: 58 },
    { name_match: 'עראיס', price: 61 },
    { name_match: 'עראיס אסאדו', price: 61 },
    { name_match: 'לחוח קבב', price: 54 },
    { name_match: 'סינטה', price: 71 },
    { name_match: 'קרפצ', price: 57 },
    { name_match: 'קרפצ׳יו', price: 57 },
    { name_match: 'לחוח מסאחן', price: 58 },
    { name_match: 'סיגר בשר', price: 51 },
    { name_match: 'סלט שוק', price: 51 },
    { name_match: 'סלט עלים', price: 58 },
    { name_match: 'סלט דודו', price: 56 },
    { name_match: 'המבורגר', price: 64 },
    { name_match: 'עלינאבורגר', price: 76 },
    { name_match: 'אנטריקוט', price: 134 },
    { name_match: 'נתח קצבים', price: 122 },
    { name_match: 'קבב', price: 64 },
    { name_match: 'פרגית', price: 69 },
    { name_match: 'פרגיות', price: 69 },
    { name_match: 'שוקולד', price: 43 },
    { name_match: 'רוטונדו', price: 43 },
    { name_match: 'פאי לימון', price: 43 },
  ];

  const handleApplyMenuPrices = async () => {
    if (!window.confirm(`להזין ${MENU_PRICES.length} מחירי מכירה מהתפריט (PDF 22.6) למנות?`)) return;
    setSyncing(true);
    try {
      const res = await base44.functions.bulkSetRecipeSalePrices({ prices: MENU_PRICES });
      const data = res?.data || res;
      const unmatchedSample = data.unmatched?.slice(0, 8).join('\n  • ') || '—';
      alert(`✅ עודכנו ${data.matched_count} מנות\n${data.unmatched?.length || 0} לא נמצאו:\n  • ${unmatchedSample}`);
      await load();
    } catch (e) {
      alert('שגיאה: ' + (e?.message || ''));
    } finally { setSyncing(false); }
  };

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
  // A network/commissary tenant is about the PRODUCT TREE (raw → prep → product),
  // not menu food-cost — open on the הכנות (preps) view.
  useEffect(() => {
    base44.functions.getMyPlatformInfo({})
      .then((r) => { const d = r?.data || r; if (d?.is_chain_commissary) setFilter('PREP'); })
      .catch(() => {});
  }, []);

  // keep:true → refresh in place instead of blanking the table. Nulling detail
  // after every field edit made the ingredient list you're typing in disappear
  // and rebuild, which read as the app freezing.
  const openDetail = async (id, opts = {}) => {
    setSelected(id);
    if (!opts.keep) setDetail(null);
    try {
      const res = await base44.functions.getRecipe({ id });
      setDetail(res?.data || res);
    } catch (e) {
      console.error(e);
    }
  };

  // Refresh the list WITHOUT the full-page loading state — an inline edit should
  // never blank the page it happened on.
  const refreshListQuiet = async () => {
    try {
      const res = await base44.functions.listRecipes({ kind: filter });
      setRecipes((res?.data || res)?.recipes || []);
    } catch { /* keep what's on screen */ }
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
      <PageHeader
        title="מתכונים ופוד-קוסט"
        subtitle={filter === 'DISH' ? `${dishesWithFc.length} מנות עם מחיר · פוד-קוסט ממוצע ${avgFc.toFixed(1)}%` : `${recipes.length} הכנות בסיס`}
        icon={ChefHat}
        action={
        <div className="flex gap-2">
          {isAlena && (
            <Button size="sm" variant="outline" onClick={handleApplyMenuPrices} disabled={syncing} className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900">
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4 ml-1" />}
              הזן מחירי תפריט מה-PDF
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleSyncPrices} disabled={syncing} className="border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4 ml-1" />}
            סנכרן מ-MenuItem
          </Button>
          <label className="inline-flex items-center gap-1 cursor-pointer border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-sm px-3 py-2 rounded-md">
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            ייבא מ-JSON
            <input type="file" accept="application/json,.json" onChange={handleImport} disabled={importing} className="hidden" />
          </label>
          <Button size="sm" variant="outline" onClick={suggestPreps} disabled={aiPrepsBusy} className="border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900">
            {aiPrepsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 ml-1" />}
            הצע הכנות לפי הפרופיל
          </Button>
          <AiScannerButton target="recipe" label="סרוק מתכון" onImported={load}
            className="border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-900" />
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ml-1 ${loading ? 'animate-spin' : ''}`} /> רענן
          </Button>
        </div>
        }
      />

      <IngredientPriceUpdatesCard onApplied={load} />
      <DishProfitCard />

      {aiPreps && filter === 'PREP' && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-1"><Sparkles className="w-4 h-4 text-amber-600" /> הצעות הכנה AI</h3>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAiPreps(null)}>ביטול</Button>
                <Button size="sm" onClick={importAiPreps} disabled={importingPreps}>
                  {importingPreps ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : null}
                  ייבא נבחרים ({aiPreps.filter(p => p.selected).length})
                </Button>
              </div>
            </div>
            {aiPreps.map((p, i) => (
              <label key={i} className="flex items-start gap-2 p-2 bg-white rounded border cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={p.selected}
                  onChange={(e) => {
                    const next = [...aiPreps];
                    next[i] = { ...p, selected: e.target.checked };
                    setAiPreps(next);
                  }}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="font-bold">{p.name} <span className="text-slate-500 font-normal text-xs">· {p.unit}</span></div>
                  <div className="text-xs text-slate-600">{(p.ingredients || []).join(', ')}</div>
                  {p.notes && <div className="text-xs text-slate-400 mt-0.5">{p.notes}</div>}
                </div>
              </label>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 items-center">
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
                      <RecipeIngredientEditor detail={detail} onChanged={() => { openDetail(r.id, { keep: true }); refreshListQuiet(); }} />
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

// Inline-editable ingredient table. Click any cell → input. Save on blur or Enter.
// Qty + unit live on RecipeIngredient (this specific recipe row). Name, supplier,
// price/unit, waste% live on Ingredient (ripples to every recipe using it).
function RecipeIngredientEditor({ detail, onChanged }) {
  const [adding, setAdding] = useState(false);
  const [newIng, setNewIng] = useState({ name: '', qty: '', unit: 'kg', kind: 'ingredient' });
  const [saving, setSaving] = useState(null); // ri_id we're saving
  // Existing PREP recipes, offered as autocomplete when adding a "הכנה" line.
  const [preps, setPreps] = useState([]);
  useEffect(() => {
    let alive = true;
    base44.functions.listRecipes({ kind: 'PREP' })
      .then(r => { const d = r?.data || r || {}; if (alive) setPreps(d.recipes || []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const saveIngredientField = async (ingredient_id, field, value) => {
    if (!ingredient_id) return;
    setSaving(ingredient_id);
    try {
      await base44.functions.updateIngredient({ id: ingredient_id, [field]: value });
      onChanged();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(null); }
  };
  const saveRiField = async (ri_id, field, value) => {
    if (!ri_id) return;
    setSaving(ri_id);
    try {
      await base44.functions.updateRecipeIngredient({ id: ri_id, [field]: value });
      onChanged();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(null); }
  };
  const removeRow = async (ri_id, name) => {
    if (!window.confirm(`למחוק את "${name}" מהמתכון?`)) return;
    setSaving(ri_id);
    try {
      await base44.functions.deleteRecipeIngredient({ id: ri_id });
      onChanged();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(null); }
  };
  const addRow = async () => {
    if (!newIng.name.trim() || !Number(newIng.qty)) { alert('שם וכמות נדרשים'); return; }
    setSaving('new');
    try {
      // A line can be a raw ingredient OR a nested PREP recipe. The UI only ever
      // sent ingredient_name, so a dish could never reference its prep — which is
      // exactly the line that was missing from סיגר בשר.
      await base44.functions.addRecipeIngredient({
        recipe_id: detail.recipe.id,
        ...(newIng.kind === 'prep'
          ? { prep_recipe_name: newIng.name.trim() }
          : { ingredient_name: newIng.name.trim() }),
        qty: Number(newIng.qty),
        unit: newIng.unit,
      });
      setNewIng({ name: '', qty: '', unit: 'kg', kind: 'ingredient' });
      setAdding(false);
      onChanged();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(null); }
  };

  return (
    <div className="p-3 bg-slate-50 border-t">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-slate-700">פירוט רכיבים — לחץ על כל שדה לעריכה:</div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={adding} className="h-7 px-2 text-xs">
          + הוסף רכיב
        </Button>
      </div>
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="text-right pb-1">רכיב</th>
            <th>כמות</th>
            <th>יחידה</th>
            <th>מחיר/יח׳</th>
            <th>ספק</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {detail.ingredients.map((i) => (
            <tr key={i.ri_id} className="border-t">
              <td className="py-1">
                {i.source === 'prep' ? <span className="text-slate-500">🥣 {i.name}</span> : (
                  <EditableCell value={i.name} onSave={(v) => saveIngredientField(i.ingredient_id, 'name', v)} />
                )}
              </td>
              <td className="text-center">
                <EditableCell value={i.qty} type="number" step="0.001" onSave={(v) => saveRiField(i.ri_id, 'qty', Number(v))} />
              </td>
              <td className="text-center">
                <SelectCell value={i.unit} options={['kg', 'unit', 'liter']} onSave={(v) => saveRiField(i.ri_id, 'unit', v)} />
              </td>
              <td className="text-center">
                {i.source === 'prep' ? '—' : (
                  <EditableCell
                    value={i.price_per_unit != null ? i.price_per_unit : ''}
                    type="number" step="0.01" prefix="₪"
                    onSave={(v) => saveIngredientField(i.ingredient_id, 'price_per_unit', Number(v))}
                  />
                )}
              </td>
              <td className="text-center text-slate-500">
                {i.source === 'prep' ? '—' : (
                  <EditableCell
                    value={i.supplier_name || ''} placeholder="—"
                    onSave={(v) => saveIngredientField(i.ingredient_id, 'supplier_name', v || null)}
                  />
                )}
              </td>
              <td>
                <button
                  onClick={() => removeRow(i.ri_id, i.name)}
                  disabled={saving === i.ri_id}
                  className="text-slate-400 hover:text-red-600 p-1"
                  title="מחק רכיב"
                >
                  {saving === i.ri_id ? <Loader2 className="w-3 h-3 animate-spin" /> : '🗑'}
                </button>
              </td>
            </tr>
          ))}
          {adding && (
            <tr className="border-t bg-amber-50">
              <td className="py-1">
                <div className="flex items-center gap-1">
                  <select
                    value={newIng.kind}
                    onChange={(e) => setNewIng(s => ({ ...s, kind: e.target.value }))}
                    className="text-[11px] border rounded h-6"
                    title="רכיב גלם או הכנה קיימת"
                  >
                    <option value="ingredient">רכיב</option>
                    <option value="prep">הכנה</option>
                  </select>
                  <Input autoFocus list="prep-options" value={newIng.name}
                    onChange={(e) => setNewIng(s => ({ ...s, name: e.target.value }))}
                    placeholder={newIng.kind === 'prep' ? 'שם ההכנה' : 'שם הרכיב'} className="h-6 text-xs" />
                  <datalist id="prep-options">
                    {(preps || []).map(pr => <option key={pr.id} value={pr.name} />)}
                  </datalist>
                </div>
              </td>
              <td className="text-center">
                <Input value={newIng.qty} type="number" step="0.001" onChange={(e) => setNewIng(s => ({ ...s, qty: e.target.value }))} className="h-6 text-xs w-16" />
              </td>
              <td className="text-center">
                <select value={newIng.unit} onChange={(e) => setNewIng(s => ({ ...s, unit: e.target.value }))} className="text-xs border rounded">
                  <option value="kg">kg</option><option value="unit">unit</option><option value="liter">liter</option>
                </select>
              </td>
              <td colSpan={2} className="text-center">
                <Button size="sm" onClick={addRow} disabled={saving === 'new'} className="h-6 px-2 text-xs">
                  {saving === 'new' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'הוסף'}
                </Button>
                <button onClick={() => { setAdding(false); setNewIng({ name: '', qty: '', unit: 'kg', kind: 'ingredient' }); }} className="mr-2 text-slate-500 text-xs">בטל</button>
              </td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Click → input → save on blur or Enter. Esc cancels.
function EditableCell({ value, onSave, type = 'text', step, prefix = '', placeholder }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  React.useEffect(() => setVal(value), [value]);
  if (editing) {
    return (
      <Input
        autoFocus
        type={type} step={step}
        defaultValue={val}
        onBlur={(e) => { onSave(e.target.value); setEditing(false); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onSave(e.target.value); setEditing(false); }
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-6 text-xs w-20"
        placeholder={placeholder}
      />
    );
  }
  const display = value === '' || value == null ? (placeholder || '—') : `${prefix}${value}`;
  return (
    <button onClick={() => setEditing(true)} className="hover:bg-amber-100 px-1 rounded">
      {display}
    </button>
  );
}

function SelectCell({ value, options, onSave }) {
  return (
    <select
      value={value || 'kg'}
      onChange={(e) => onSave(e.target.value)}
      className="text-xs border rounded px-1 bg-white"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function Recipes() {
  return (
    <PageGuard pageName="Recipes" pageTitle="מתכונים">
      <RecipesInner />
    </PageGuard>
  );
}
