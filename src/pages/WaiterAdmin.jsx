import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Trash2, Save, Utensils, Sparkles, Settings, MessageSquareCode, AlertCircle, RefreshCw, X, Upload, FileText, Wine } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import toast from 'react-hot-toast';

const DEFAULT_CATEGORIES = [
  { id: 'salads',         name: 'סלטים',                       items: [] },
  { id: 'sharing_veg',    name: 'מנות חלוקה — ירקות מהגוספר',  items: [] },
  { id: 'sharing_meat',   name: 'מנות חלוקה — בשר',            items: [] },
  { id: 'mains_plate',    name: 'עיקריות בצלחת',                items: [] },
  { id: 'wine',           name: 'יין',                         items: [] },
  { id: 'cocktails',      name: 'קוקטיילים',                   items: [] },
  { id: 'beer',           name: 'בירה',                        items: [] },
  { id: 'chasers',        name: 'צ׳ייסרים',                   items: [] },
  { id: 'soft_drinks',    name: 'שתייה קלה',                   items: [] },
  { id: 'desserts',       name: 'קינוחים',                     items: [] },
];

const ALLERGEN_OPTIONS = ['גלוטן', 'אגוזים', 'לקטוז', 'ביצים', 'סויה', 'שומשום', 'סולפיטים'];

const CATEGORY_NAME_BY_ID = {
  salads:        'סלטים',
  sharing_veg:   'מנות חלוקה — ירקות מהגוספר',
  sharing_meat:  'מנות חלוקה — בשר',
  mains_plate:   'עיקריות בצלחת',
  wine:          'יין',
  cocktails:     'קוקטיילים',
  beer:          'בירה',
  chasers:       'צ׳ייסרים',
  soft_drinks:   'שתייה קלה',
  desserts:      'קינוחים',
  other:         'אחר',
};

const blankItem = () => ({ id: `i_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, name: '', description: '', price_ils: 0, allergens: [], notes: '' });

function MenuUploader({ menu, setMenu }) {
  const [uploading, setUploading] = React.useState(null); // 'food' | 'drinks' | null
  const [lastResult, setLastResult] = React.useState(null);

  const handleUpload = async (kind, file) => {
    if (!file) return;
    setUploading(kind);
    setLastResult(null);
    try {
      // 1) Upload the file (PDF or image) to get a stable URL
      const upRes = await base44.integrations.Core.UploadFile({ file });
      const url = upRes?.data?.file_url || upRes?.file_url || upRes?.url || upRes?.data?.url;
      if (!url) throw new Error('העלאה הצליחה אבל לא חזר URL');

      // 2) Send the URL to Gemini for extraction
      const exRes = await base44.functions.extractWaiterMenuFromFile({ url, kind });
      const items = exRes?.data?.items || exRes?.items || [];
      if (items.length === 0) {
        toast.error('לא נמצאו פריטים בקובץ. תוכל למלא ידנית או לנסות קובץ אחר.');
        return;
      }

      // 3) Merge into menu.categories — group by category_id, append items to existing or
      // create category if missing.
      const existingCats = Array.isArray(menu?.categories) ? [...menu.categories] : [];
      const catByKey = new Map(existingCats.map((c) => [c.id || c.name, c]));
      let added = 0;
      for (const it of items) {
        const catId = it.category_id || 'other';
        const catName = CATEGORY_NAME_BY_ID[catId] || it.category_id || 'אחר';
        let cat = catByKey.get(catId);
        if (!cat) {
          cat = { id: catId, name: catName, items: [] };
          existingCats.push(cat);
          catByKey.set(catId, cat);
        }
        cat.items = [
          ...(cat.items || []),
          {
            id: `i_${Date.now()}_${Math.random().toString(36).slice(2, 5)}_${added}`,
            name: String(it.name || '').slice(0, 200),
            description: String(it.description || '').slice(0, 600),
            price_ils: typeof it.price_ils === 'number' ? Math.round(it.price_ils) : 0,
            allergens: Array.isArray(it.allergens) ? it.allergens.filter((a) => ALLERGEN_OPTIONS.includes(a)) : [],
            notes: String(it.notes || '').slice(0, 200),
          },
        ];
        added++;
      }
      setMenu({ ...menu, categories: existingCats });
      setLastResult({ kind, added });
      toast.success(`✓ נוספו ${added} פריטים מהקובץ — אל תשכח לשמור!`);
    } catch (e) {
      toast.error('שגיאה: ' + (e?.message || ''));
    } finally {
      setUploading(null);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
      <CardContent className="p-4 space-y-3">
        <div>
          <div className="font-bold flex items-center gap-2 text-amber-900"><Upload className="w-4 h-4" /> העלאת תפריט מקובץ</div>
          <p className="text-xs text-amber-800 mt-1">
            תעלה PDF (או תמונה) של תפריט אוכל ו/או תפריט שתייה — Gemini יקרא את הקובץ, יסווג לקטגוריות, ויוסיף את הפריטים לרשימה למטה. אחר כך תוכל לערוך / להוסיף הערות / לתקן מחירים.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className={`flex flex-col items-center justify-center gap-2 bg-white border-2 border-dashed border-amber-300 hover:border-amber-500 hover:bg-amber-50 rounded-xl p-4 cursor-pointer transition ${uploading === 'food' ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading === 'food' ? <Loader2 className="w-6 h-6 animate-spin text-amber-700" /> : <FileText className="w-6 h-6 text-amber-700" />}
            <span className="font-bold text-sm">תפריט אוכל</span>
            <span className="text-xs text-amber-700">{uploading === 'food' ? 'קורא וממיין…' : 'PDF / תמונה'}</span>
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => handleUpload('food', e.target.files?.[0])} />
          </label>
          <label className={`flex flex-col items-center justify-center gap-2 bg-white border-2 border-dashed border-amber-300 hover:border-amber-500 hover:bg-amber-50 rounded-xl p-4 cursor-pointer transition ${uploading === 'drinks' ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading === 'drinks' ? <Loader2 className="w-6 h-6 animate-spin text-amber-700" /> : <Wine className="w-6 h-6 text-amber-700" />}
            <span className="font-bold text-sm">תפריט שתייה</span>
            <span className="text-xs text-amber-700">{uploading === 'drinks' ? 'קורא וממיין…' : 'PDF / תמונה'}</span>
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => handleUpload('drinks', e.target.files?.[0])} />
          </label>
        </div>
        {lastResult && (
          <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
            ✓ {lastResult.kind === 'food' ? 'תפריט האוכל' : 'תפריט השתייה'} נטען בהצלחה — נוספו {lastResult.added} פריטים. <strong>לחץ "שמור"</strong> למעלה לאישור.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MENU_TIERS = [
  { id: 'evening',  label: '🌙 ערב',                    hint: 'התפריט הראשי של עלינא — סטייל burger-bar, מנות שיתוף.' },
  { id: 'lunch',    label: '☀️ עסקיות צהריים',           hint: 'תפריט יום צהריים — בדרך כלל מנה + תוספת במחיר משולב.' },
  { id: 'delivery', label: '🛵 משלוחים וטייק אווי',      hint: 'תפריט למשלוח וטייק אווי — בלי מנות שלא טסות טוב.' },
];

// Normalize the legacy single-menu shape ({categories:[...]}) to the new tier map.
function normalizeMenus(rawMenu) {
  if (!rawMenu || typeof rawMenu !== 'object') return { evening: { categories: [] }, lunch: { categories: [] }, delivery: { categories: [] } };
  if (Array.isArray(rawMenu.categories)) {
    return { evening: rawMenu, lunch: { categories: [] }, delivery: { categories: [] } };
  }
  return {
    evening:  rawMenu.evening  || { categories: [] },
    lunch:    rawMenu.lunch    || { categories: [] },
    delivery: rawMenu.delivery || { categories: [] },
  };
}

function MenuTab({ menu: rawMenu, setMenu: setRawMenu }) {
  const [activeTier, setActiveTier] = React.useState('evening');
  const menus = normalizeMenus(rawMenu);
  const menu = menus[activeTier] || { categories: [] };
  const setMenu = (next) => setRawMenu({ ...menus, [activeTier]: next });
  const categories = Array.isArray(menu?.categories) ? menu.categories : [];
  const updateCat = (idx, patch) => setMenu({ ...menu, categories: categories.map((c, i) => i === idx ? { ...c, ...patch } : c) });
  const addCat = () => setMenu({ ...menu, categories: [...categories, { id: `cat_${Date.now()}`, name: 'קטגוריה חדשה', items: [] }] });
  const removeCat = (idx) => { if (window.confirm('למחוק את כל הקטגוריה?')) setMenu({ ...menu, categories: categories.filter((_, i) => i !== idx) }); };
  const addItem = (idx) => updateCat(idx, { items: [...(categories[idx].items || []), blankItem()] });
  const updateItem = (catIdx, itemIdx, patch) => {
    const items = (categories[catIdx].items || []).map((it, i) => i === itemIdx ? { ...it, ...patch } : it);
    updateCat(catIdx, { items });
  };
  const removeItem = (catIdx, itemIdx) => updateCat(catIdx, { items: (categories[catIdx].items || []).filter((_, i) => i !== itemIdx) });
  const toggleAllergen = (catIdx, itemIdx, allergen) => {
    const it = categories[catIdx].items[itemIdx];
    const has = (it.allergens || []).includes(allergen);
    updateItem(catIdx, itemIdx, { allergens: has ? it.allergens.filter((a) => a !== allergen) : [...(it.allergens || []), allergen] });
  };
  const seedDefaults = () => {
    if (categories.length > 0 && !window.confirm('להוסיף את הקטגוריות המומלצות לסעיפים הקיימים?')) return;
    const have = new Set(categories.map((c) => c.id));
    const toAdd = DEFAULT_CATEGORIES.filter((c) => !have.has(c.id));
    setMenu({ ...menu, categories: [...categories, ...toAdd] });
  };

  const activeTierMeta = MENU_TIERS.find((t) => t.id === activeTier) || MENU_TIERS[0];
  const itemCount = categories.reduce((s, c) => s + (c.items?.length || 0), 0);

  return (
    <div className="space-y-3">
      {/* Menu-tier selector */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-1 flex-wrap">
          {MENU_TIERS.map((t) => {
            const count = (menus[t.id]?.categories || []).reduce((s, c) => s + (c.items?.length || 0), 0);
            const active = t.id === activeTier;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTier(t.id)}
                className={`px-3 py-2 rounded-lg border-2 text-sm font-bold transition ${
                  active
                    ? 'bg-amber-600 text-white border-amber-700 shadow'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-amber-400'
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`mr-2 text-xs ${active ? 'bg-white/20' : 'bg-slate-100'} px-1.5 py-0.5 rounded-full`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-slate-600">{activeTierMeta.hint} — כרגע {itemCount} פריטים בתפריט הזה.</p>
      </div>

      <MenuUploader menu={menu} setMenu={setMenu} />
      {categories.length === 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-amber-900 mb-3">או — התחל ממבנה ריק של עלינא (סלטים / חלוקה — ירק / חלוקה — בשר / עיקריות בצלחת / אלכוהול / קינוחים) ותוסיף ידנית.</p>
            <Button variant="outline" onClick={seedDefaults}><Plus className="w-4 h-4 ml-1" /> טען מבנה ריק</Button>
          </CardContent>
        </Card>
      )}
      {categories.map((cat, cIdx) => (
        <Card key={cat.id || cIdx}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <Input value={cat.name || ''} onChange={(e) => updateCat(cIdx, { name: e.target.value })}
                     className="text-base font-bold border-0 px-0 focus:ring-0" />
              <Button variant="ghost" size="sm" onClick={() => removeCat(cIdx)} className="text-red-600">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {(cat.items || []).map((it, iIdx) => (
              <div key={it.id || iIdx} className="border rounded-lg p-3 bg-slate-50">
                <div className="grid md:grid-cols-3 gap-2 mb-2">
                  <Input value={it.name || ''} onChange={(e) => updateItem(cIdx, iIdx, { name: e.target.value })} placeholder="שם המנה" />
                  <Input type="number" value={it.price_ils || 0} onChange={(e) => updateItem(cIdx, iIdx, { price_ils: parseInt(e.target.value) || 0 })} placeholder="מחיר ₪" />
                  <Button variant="outline" size="sm" onClick={() => removeItem(cIdx, iIdx)} className="text-red-600 justify-self-start">
                    <Trash2 className="w-3 h-3 ml-1" /> מחק
                  </Button>
                </div>
                <Textarea value={it.description || ''} onChange={(e) => updateItem(cIdx, iIdx, { description: e.target.value })}
                          placeholder="רכיבים, אופן הגשה, גודל מנה…" rows={2} className="mb-2 text-sm" />
                <div className="flex flex-wrap gap-1 mb-1">
                  <span className="text-xs text-slate-500">אלרגנים:</span>
                  {ALLERGEN_OPTIONS.map((a) => {
                    const has = (it.allergens || []).includes(a);
                    return (
                      <button key={a} onClick={() => toggleAllergen(cIdx, iIdx, a)}
                              className={`text-xs px-2 py-0.5 rounded-full border ${has ? 'bg-red-100 border-red-300 text-red-800' : 'bg-white border-slate-300 text-slate-500'}`}>
                        {a}
                      </button>
                    );
                  })}
                </div>
                <Input value={it.notes || ''} onChange={(e) => updateItem(cIdx, iIdx, { notes: e.target.value })}
                       placeholder='הערות שירותיות: "פיקנטית", "מנה גדולה לחלוקה", "סיגנייצ׳ר"' className="text-xs" />
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => addItem(cIdx)}><Plus className="w-3 h-3 ml-1" /> הוסף מנה</Button>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" onClick={addCat}><Plus className="w-4 h-4 ml-1" /> הוסף קטגוריה</Button>
    </div>
  );
}

function SpecialsTab({ specials, setSpecials }) {
  const list = Array.isArray(specials) ? specials : [];
  const add = () => setSpecials([...list, { id: `sp_${Date.now()}`, name: '', description: '', price_ils: 0 }]);
  const update = (idx, patch) => setSpecials(list.map((s, i) => i === idx ? { ...s, ...patch } : s));
  const remove = (idx) => setSpecials(list.filter((_, i) => i !== idx));
  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-600 mb-2">📅 ספיישלים של היום — עדכן בכל בוקר. הסוכן יציע אותם בעדיפות.</div>
      {list.length === 0 && <p className="text-sm text-muted-foreground">אין ספיישלים היום.</p>}
      {list.map((s, idx) => (
        <Card key={s.id || idx}>
          <CardContent className="p-3 grid md:grid-cols-3 gap-2 items-start">
            <Input value={s.name || ''} onChange={(e) => update(idx, { name: e.target.value })} placeholder="שם הספיישל" />
            <Input value={s.description || ''} onChange={(e) => update(idx, { description: e.target.value })} placeholder="תיאור קצר" />
            <div className="flex gap-2">
              <Input type="number" value={s.price_ils || 0} onChange={(e) => update(idx, { price_ils: parseInt(e.target.value) || 0 })} placeholder="₪" />
              <Button variant="outline" size="sm" onClick={() => remove(idx)} className="text-red-600"><Trash2 className="w-3 h-3" /></Button>
            </div>
          </CardContent>
        </Card>
      ))}
      <Button variant="outline" onClick={add}><Plus className="w-4 h-4 ml-1" /> הוסף ספיישל</Button>
    </div>
  );
}

function OutOfStockTab({ outOfStock, setOutOfStock, menu }) {
  const list = Array.isArray(outOfStock) ? outOfStock : [];
  const remove = (name) => setOutOfStock(list.filter((x) => x !== name));
  const add = (name) => { if (name && !list.includes(name)) setOutOfStock([...list, name]); };
  const allItems = (menu?.categories || []).flatMap((c) => (c.items || []).map((it) => ({ name: it.name, cat: c.name }))).filter((x) => x.name);

  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600">⛔ פריטים שאזלו היום — הסוכן לא ימליץ עליהם.</div>
      {list.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">חסר היום:</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {list.map((name) => (
              <Badge key={name} className="bg-red-100 text-red-800 hover:bg-red-200 cursor-pointer" onClick={() => remove(name)}>
                {name} <X className="w-3 h-3 inline mr-1" />
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">סמן פריטים שאזלו (לחץ פעמיים על הפריט):</CardTitle></CardHeader>
        <CardContent>
          {allItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">אין פריטים בתפריט עדיין — הוסף קודם בטאב "תפריט".</p>
          ) : (
            <div className="space-y-1">
              {allItems.map((it, i) => {
                const isOut = list.includes(it.name);
                return (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm">
                    <span className={isOut ? 'line-through text-slate-400' : ''}>{it.name} <span className="text-xs text-slate-500">({it.cat})</span></span>
                    <Button size="sm" variant={isOut ? 'outline' : 'ghost'} onClick={() => isOut ? remove(it.name) : add(it.name)}>
                      {isOut ? 'החזר' : 'סמן כחסר'}
                    </Button>
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

function GeneralInfoTab({ info, setInfo }) {
  const upd = (patch) => setInfo({ ...(info || {}), ...patch });
  const faq = Array.isArray(info?.faq) ? info.faq : [];
  const setFaq = (newFaq) => upd({ faq: newFaq });
  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 space-y-2">
        <div><Label>🍽 כשרות</Label>
          <Textarea value={info?.kashrut || ''} onChange={(e) => upd({ kashrut: e.target.value })}
                    placeholder='לדוגמה: "בשרי, לא כשר. לא מגישים מנות חלביות. אין בעיה לבקש מנות צמחוניות."' rows={3} />
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          <div><Label>📶 WiFi (שם רשת + סיסמה)</Label>
            <Input value={info?.wifi || ''} onChange={(e) => upd({ wifi: e.target.value })} placeholder="Alena_Guest / 12345678" />
          </div>
          <div><Label>🅿️ חניה</Label>
            <Input value={info?.parking || ''} onChange={(e) => upd({ parking: e.target.value })} placeholder="חניון ציבורי במרחק 50 מ׳" />
          </div>
          <div><Label>🕒 שעות פעילות</Label>
            <Input value={info?.hours || ''} onChange={(e) => upd({ hours: e.target.value })} placeholder="א-ה 18-23, ו 12-15+19-24, ש 19-24" />
          </div>
          <div><Label>📍 כתובת</Label>
            <Input value={info?.address || ''} onChange={(e) => upd({ address: e.target.value })} placeholder="רחוב X, ראשון לציון" />
          </div>
        </div>
      </CardContent></Card>

      <Card><CardHeader className="pb-2"><CardTitle className="text-sm">❓ שאלות נפוצות</CardTitle>
        <CardDescription>שאלות שלקוחות שואלים הרבה — הסוכן ידע לענות מתוך כאן.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {faq.map((q, i) => (
          <div key={i} className="grid md:grid-cols-[1fr_2fr_auto] gap-2 items-start">
            <Input value={q.q || ''} onChange={(e) => setFaq(faq.map((f, j) => j === i ? { ...f, q: e.target.value } : f))} placeholder="השאלה" />
            <Textarea value={q.a || ''} onChange={(e) => setFaq(faq.map((f, j) => j === i ? { ...f, a: e.target.value } : f))} placeholder="התשובה" rows={2} />
            <Button variant="outline" size="sm" onClick={() => setFaq(faq.filter((_, j) => j !== i))} className="text-red-600"><Trash2 className="w-3 h-3" /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setFaq([...faq, { q: '', a: '' }])}><Plus className="w-3 h-3 ml-1" /> הוסף שאלה</Button>
      </CardContent></Card>
    </div>
  );
}

export default function WaiterAdmin() {
  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await base44.functions.getWaiterKit({});
      setKit(res?.data?.kit || res?.kit || null);
    } catch (e) { setLoadError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.saveWaiterKit({ kit });
      setKit(res?.data?.kit || res?.kit || kit);
      toast.success('נשמר ✓');
    } catch (e) { toast.error('שמירה נכשלה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center min-h-[40vh] items-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  if (loadError || !kit) {
    return (
      <div className="p-6" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">
          טעינת הגדרות נכשלה: {loadError || 'kit ריק'}
          <Button onClick={load} size="sm" className="mr-2">נסה שוב</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Utensils className="w-6 h-6 text-amber-600" /> ניהול ראש המלצרים הדיגיטלי</h1>
          <p className="text-sm text-muted-foreground">תפריט, ספיישלים, חסר היום, מידע כללי ופרומפט. שינויים נכנסים מיידית לסוכן.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="w-4 h-4 ml-1" /></Button>
          <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
            {saving ? <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> שומר…</> : <><Save className="w-4 h-4 ml-1" /> שמור</>}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="menu" className="w-full">
        <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 md:grid md:grid-cols-5">
          <TabsTrigger value="menu" className="px-3 py-2 whitespace-nowrap flex-shrink-0"><Utensils className="w-4 h-4 ml-1" /> תפריט</TabsTrigger>
          <TabsTrigger value="specials" className="px-3 py-2 whitespace-nowrap flex-shrink-0"><Sparkles className="w-4 h-4 ml-1" /> ספיישלים</TabsTrigger>
          <TabsTrigger value="out" className="px-3 py-2 whitespace-nowrap flex-shrink-0"><AlertCircle className="w-4 h-4 ml-1" /> חסר היום</TabsTrigger>
          <TabsTrigger value="info" className="px-3 py-2 whitespace-nowrap flex-shrink-0"><Settings className="w-4 h-4 ml-1" /> מידע כללי</TabsTrigger>
          <TabsTrigger value="prompt" className="px-3 py-2 whitespace-nowrap flex-shrink-0"><MessageSquareCode className="w-4 h-4 ml-1" /> פרומפט</TabsTrigger>
        </TabsList>

        <TabsContent value="menu"><MenuTab menu={kit.menu || { categories: [] }} setMenu={(m) => setKit({ ...kit, menu: m })} /></TabsContent>
        <TabsContent value="specials"><SpecialsTab specials={kit.daily_specials || []} setSpecials={(s) => setKit({ ...kit, daily_specials: s })} /></TabsContent>
        <TabsContent value="out"><OutOfStockTab outOfStock={kit.out_of_stock || []} setOutOfStock={(o) => setKit({ ...kit, out_of_stock: o })} menu={kit.menu || { categories: [] }} /></TabsContent>
        <TabsContent value="info"><GeneralInfoTab info={kit.general_info || {}} setInfo={(i) => setKit({ ...kit, general_info: i })} /></TabsContent>
        <TabsContent value="prompt">
          <Card><CardContent className="p-4 space-y-2">
            <Label>System Prompt — איך הסוכן מדבר, מוכר, ומסיים את השיחה</Label>
            <Textarea rows={24} value={kit.system_prompt || ''} onChange={(e) => setKit({ ...kit, system_prompt: e.target.value })} className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">השינוי נכנס לתוקף ב-turn הבא של כל שיחה חדשה.</p>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
