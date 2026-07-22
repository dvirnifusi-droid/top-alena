import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ChefHat, RefreshCw, Save, Plus, Factory, TrendingUp, Percent } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import PageHeader, { PageShell } from '@/components/shared/PageHeader';

const cur = (n) => `₪${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function CommissaryInner() {
  const [catalog, setCatalog] = useState([]);
  const [defaultMarkup, setDefaultMarkup] = useState(30);
  const [markupDraft, setMarkupDraft] = useState('30');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [deptTab, setDeptTab] = useState('all'); // 'all' | '__none__' | <department name>
  const [departments, setDepartments] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [addIng, setAddIng] = useState('');
  // Local edits keyed by ref_id → { markup_pct, price_override, active }
  const [edits, setEdits] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getCommissaryCatalog();
      const data = res?.data || res;
      setCatalog(Array.isArray(data?.catalog) ? data.catalog : []);
      setDepartments(Array.isArray(data?.departments) ? data.departments : []);
      const dm = Number(data?.default_markup_pct);
      setDefaultMarkup(Number.isFinite(dm) ? dm : 30);
      setMarkupDraft(String(Number.isFinite(dm) ? dm : 30));
      setEdits({});
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'שגיאה בטעינה' });
    }
    setLoading(false);
  }, []);

  const loadIngredients = useCallback(async () => {
    try {
      const res = await base44.functions.listCommissaryIngredients();
      const data = res?.data || res;
      setIngredients(Array.isArray(data?.ingredients) ? data.ingredients : []);
    } catch { /* pay/role gate — leave empty */ }
  }, []);

  useEffect(() => { load(); loadIngredients(); }, [load, loadIngredients]);

  const rowVal = (r, key) => {
    const e = edits[r.ref_id];
    if (e && e[key] !== undefined) return e[key];
    if (key === 'markup_pct') return r.markup_pct ?? '';
    if (key === 'price_override') return r.price_override ?? '';
    if (key === 'active') return r.active;
    if (key === 'department') return r.department ?? '';
    return '';
  };
  const patchRow = (refId, key, val) =>
    setEdits((s) => ({ ...s, [refId]: { ...(s[refId] || {}), [key]: val } }));

  // Live preview of internal price as the owner types markup/override.
  const previewPrice = (r) => {
    const ov = Number(rowVal(r, 'price_override'));
    if (Number.isFinite(ov) && ov > 0) return ov;
    const m = Number(rowVal(r, 'markup_pct'));
    const markup = Number.isFinite(m) ? m : defaultMarkup;
    return Math.round(r.cost_per_unit * (1 + markup / 100) * 100) / 100;
  };

  const saveAll = async () => {
    setSaving(true); setMsg(null);
    let saved = 0;
    try {
      // Persist the default markup if it changed.
      const dm = Number(markupDraft);
      if (Number.isFinite(dm) && dm !== defaultMarkup) {
        await base44.functions.setCommissaryConfig({ default_markup_pct: dm });
      }
      for (const [refId, e] of Object.entries(edits)) {
        const row = catalog.find((c) => c.ref_id === refId);
        if (!row) continue;
        const payload = row.source === 'prep' ? { recipe_id: refId } : { ingredient_id: refId };
        payload.markup_pct = e.markup_pct === '' ? null : e.markup_pct;
        payload.price_override = e.price_override === '' ? null : e.price_override;
        payload.active = e.active === undefined ? row.active : e.active;
        if (e.department !== undefined) payload.department = e.department;
        await base44.functions.setCommissaryItem(payload);
        saved++;
      }
      setMsg({ ok: true, text: `נשמר · ${saved} פריטים עודכנו` });
      await load();
    } catch (e) {
      setMsg({ ok: false, text: e?.message || 'שגיאה בשמירה' });
    }
    setSaving(false);
  };

  const addSoldAsIs = async () => {
    if (!addIng) return;
    setSaving(true);
    try {
      await base44.functions.setCommissaryItem({ ingredient_id: addIng, active: true });
      setAddIng('');
      await load();
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה בהוספה' }); }
    setSaving(false);
  };

  const removeItem = async (r) => {
    if (!r.item_id) return; // an unpriced prep has no row to remove
    setSaving(true);
    try { await base44.functions.removeCommissaryItem({ item_id: r.item_id }); await load(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setSaving(false);
  };

  const dirty = Object.keys(edits).length > 0 || String(defaultMarkup) !== markupDraft;
  const shown = catalog.filter((r) =>
    deptTab === 'all' ? true : deptTab === '__none__' ? !r.department : r.department === deptTab);
  const activeCount = catalog.filter((r) => r.active).length;
  const noCost = catalog.filter((r) => !r.has_cost).length;
  const margins = catalog.filter((r) => r.has_cost && r.margin_pct != null).map((r) => r.margin_pct);
  const avgMargin = margins.length ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10 : null;
  const ingInCatalog = new Set(catalog.filter((r) => r.source === 'raw').map((r) => r.ref_id));

  return (
    <PageShell>
      <PageHeader
        title="🏭 בית הכנות (רשת)"
        subtitle="קטלוג ההכנות — כמה עולה לנו להכין, וכמה אנחנו מתמחרים למסעדות הרשת"
        icon={Factory}
        action={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        }
      />
      <div className="space-y-4" dir="rtl">
        {msg && (
          <div className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {msg.text}
          </div>
        )}

        {/* Summary + default markup */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-slate-50"><CardContent className="p-4">
            <div className="text-xs text-slate-500 flex items-center gap-1"><ChefHat className="w-3 h-3" /> פריטים בקטלוג</div>
            <div className="text-2xl font-bold mt-1">{activeCount}<span className="text-sm text-slate-400"> / {catalog.length}</span></div>
          </CardContent></Card>
          <Card className="bg-indigo-50 border-indigo-200"><CardContent className="p-4">
            <div className="text-xs text-slate-500 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> מרווח ממוצע</div>
            <div className="text-2xl font-bold mt-1 text-indigo-700">{avgMargin != null ? `${avgMargin}%` : '—'}</div>
          </CardContent></Card>
          <Card className="bg-amber-50 border-amber-200"><CardContent className="p-4">
            <div className="text-xs text-slate-500 flex items-center gap-1"><Percent className="w-3 h-3" /> מרווח ברירת מחדל</div>
            <div className="flex items-center gap-1 mt-1">
              <Input type="number" dir="ltr" className="h-9 w-20 text-lg font-bold" value={markupDraft}
                onChange={(e) => setMarkupDraft(e.target.value)} />
              <span className="text-lg font-bold text-amber-700">%</span>
            </div>
          </CardContent></Card>
          <Card className={noCost ? 'bg-red-50 border-red-200' : 'bg-slate-50'}><CardContent className="p-4">
            <div className="text-xs text-slate-500">ללא עלות (חסר מתכון/מחיר)</div>
            <div className={`text-2xl font-bold mt-1 ${noCost ? 'text-red-600' : ''}`}>{noCost}</div>
          </CardContent></Card>
        </div>

        {/* Add a sold-as-is ingredient */}
        <Card>
          <CardContent className="p-3 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">הוסף מוצר שנמכר כמו שהוא (ירקות / בשר, בלי הכנה):</span>
            <Select value={addIng} onValueChange={setAddIng}>
              <SelectTrigger className="h-9 w-64"><SelectValue placeholder="בחר חומר גלם…" /></SelectTrigger>
              <SelectContent>
                {ingredients.filter((i) => !ingInCatalog.has(i.id)).map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}{i.price_per_unit ? ` · ${cur(i.price_per_unit)}/${i.unit || 'kg'}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={addSoldAsIs} disabled={!addIng || saving}>
              <Plus className="w-4 h-4 ml-1" /> הוסף לקטלוג
            </Button>
          </CardContent>
        </Card>

        {/* Catalog */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">קטלוג בית ההכנות — לפי מחלקה</CardTitle>
              <div className="flex gap-1 flex-wrap">
                <Button size="sm" variant={deptTab === 'all' ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setDeptTab('all')}>הכל ({catalog.length})</Button>
                {departments.map((d) => {
                  const n = catalog.filter((r) => r.department === d).length;
                  return <Button key={d} size="sm" variant={deptTab === d ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setDeptTab(d)}>{d} ({n})</Button>;
                })}
                {catalog.some((r) => !r.department) && (
                  <Button size="sm" variant={deptTab === '__none__' ? 'default' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setDeptTab('__none__')}>
                    לא משויך ({catalog.filter((r) => !r.department).length})
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
            ) : shown.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">אין פריטים. הכנות מגיעות אוטומטית ממתכונים (kind=PREP); מוצרים גולמיים מוסיפים למעלה.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="p-2 text-right">פריט</th>
                      <th className="p-2 text-right">סוג</th>
                      <th className="p-2 text-right">מחלקה</th>
                      <th className="p-2 text-left">קוסט ליח'</th>
                      <th className="p-2 text-center">מרווח %</th>
                      <th className="p-2 text-center">מחיר ידני</th>
                      <th className="p-2 text-left">מחיר פנימי</th>
                      <th className="p-2 text-left">מרווח</th>
                      <th className="p-2 text-center">פעיל</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {shown.map((r) => {
                      const price = previewPrice(r);
                      const marginIls = Math.round((price - r.cost_per_unit) * 100) / 100;
                      return (
                        <tr key={`${r.source}:${r.ref_id}`} className="hover:bg-slate-50">
                          <td className="p-2 font-medium">{r.name}<span className="text-xs text-slate-400"> /{r.unit}</span></td>
                          <td className="p-2">
                            <Badge variant="outline" className={r.source === 'prep' ? 'text-emerald-700 border-emerald-200' : 'text-amber-700 border-amber-200'}>
                              {r.source === 'prep' ? 'הכנה' : 'גלם'}
                            </Badge>
                          </td>
                          <td className="p-2">
                            <Select value={rowVal(r, 'department') || '__none__'}
                              onValueChange={(v) => patchRow(r.ref_id, 'department', v === '__none__' ? '' : v)}>
                              <SelectTrigger className="h-8 w-36"><SelectValue placeholder="מחלקה" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— ללא —</SelectItem>
                                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2 text-left whitespace-nowrap">
                            {r.has_cost ? cur(r.cost_per_unit) : <span className="text-red-500 text-xs">חסר</span>}
                          </td>
                          <td className="p-2">
                            <Input type="number" dir="ltr" className="h-8 w-16 mx-auto text-center" placeholder={String(defaultMarkup)}
                              value={rowVal(r, 'markup_pct')} onChange={(e) => patchRow(r.ref_id, 'markup_pct', e.target.value)} />
                          </td>
                          <td className="p-2">
                            <Input type="number" dir="ltr" className="h-8 w-20 mx-auto text-center" placeholder="—"
                              value={rowVal(r, 'price_override')} onChange={(e) => patchRow(r.ref_id, 'price_override', e.target.value)} />
                          </td>
                          <td className="p-2 text-left font-bold whitespace-nowrap text-indigo-700">{cur(price)}</td>
                          <td className={`p-2 text-left whitespace-nowrap text-xs ${marginIls >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {cur(marginIls)}{r.cost_per_unit > 0 ? ` · ${Math.round((marginIls / price) * 1000) / 10 || 0}%` : ''}
                          </td>
                          <td className="p-2 text-center">
                            <input type="checkbox" checked={!!rowVal(r, 'active')} onChange={(e) => patchRow(r.ref_id, 'active', e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                          </td>
                          <td className="p-2 text-center">
                            {r.item_id && <button onClick={() => removeItem(r)} className="text-xs text-slate-400 hover:text-red-500" title="הסר מהקטלוג">✕</button>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={saveAll} disabled={saving || loading || !dirty} className="bg-indigo-600 hover:bg-indigo-700">
            {saving ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
            שמור שינויים
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

export default function Commissary() {
  return (
    <PageGuard pageName="Commissary" pageTitle="בית הכנות">
      <CommissaryInner />
    </PageGuard>
  );
}
