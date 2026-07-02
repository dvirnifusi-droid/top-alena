import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Trash2, Save, Utensils, Sparkles, Settings, MessageSquareCode, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import toast from 'react-hot-toast';
import { OFFICIAL_EVENT_GROUP_MENU } from '@/data/eventGroupMenu';

const blankMenu = () => ({ id: `m_${Date.now()}`, name: '', description: '', price_per_person_ils: 0, min_guests: 10, max_guests: 60, dishes: [] });
const blankUpsell = () => ({ id: `u_${Date.now()}`, name: '', price_ils: 0, unit: 'per_event' });

const DEFAULT_KIT = {
  menus: [],
  upsells: [],
  terms: { cancellation_days: 14, headcount_deadline_days: 3 },
  system_prompt: '',
  payment_mode: 'stub',
  deposit_pct: 20,
  max_discount_pct: 5,
  short_notice_allowed: true,
  max_advance_months: 6,
};

export default function EventsSalesKit() {
  const [kit, setKit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await base44.functions.getEventSalesKit({});
      // base44Client wraps as { data, status }.
      setKit(res?.data?.kit || res?.kit || { ...DEFAULT_KIT });
    } catch (e) {
      console.error('getEventSalesKit failed', e);
      setLoadError(e?.message || String(e));
      // Initialize with empty kit so the editor still renders and user can save (creates the row)
      setKit({ ...DEFAULT_KIT });
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await base44.functions.saveEventSalesKit({ kit });
      setKit(res?.data?.kit || res?.kit || kit);
      toast.success('נשמר ✓');
    } catch (e) { toast.error('שמירה נכשלה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>;
  }
  if (!kit) {
    return (
      <div className="p-6" dir="rtl">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          טעינת ה-Sales Kit נכשלה.{loadError ? ` שגיאה: ${loadError}` : ''}
          <Button onClick={load} className="mt-3">נסה שוב</Button>
        </div>
      </div>
    );
  }

  const menus = Array.isArray(kit.menus) ? kit.menus : [];
  const upsells = Array.isArray(kit.upsells) ? kit.upsells : [];

  const updateMenu = (idx, patch) => setKit({ ...kit, menus: menus.map((m, i) => i === idx ? { ...m, ...patch } : m) });
  const addMenu = () => setKit({ ...kit, menus: [...menus, blankMenu()] });
  const removeMenu = (idx) => setKit({ ...kit, menus: menus.filter((_, i) => i !== idx) });
  const loadOfficialGroupMenu = () => {
    if (menus.length > 0 && !confirm('להחליף את כל החבילות הקיימות בתפריט הקבוצות הרשמי?')) return;
    setKit({ ...kit, menus: [{ ...OFFICIAL_EVENT_GROUP_MENU }] });
    toast.success('התפריט הרשמי נטען — לחץ "שמור" לסיום');
  };
  const updateUpsell = (idx, patch) => setKit({ ...kit, upsells: upsells.map((u, i) => i === idx ? { ...u, ...patch } : u) });
  const addUpsell = () => setKit({ ...kit, upsells: [...upsells, blankUpsell()] });
  const removeUpsell = (idx) => setKit({ ...kit, upsells: upsells.filter((_, i) => i !== idx) });

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      {loadError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 flex items-center justify-between gap-2">
          <span>⚠️ טעינת ה-kit הקיים נכשלה — מציג עורך ריק. שמירה תיצור שורה חדשה. שגיאה: {loadError}</span>
          <Button size="sm" variant="outline" onClick={load}>טען מחדש</Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Utensils className="w-6 h-6 text-emerald-600" /> Sales Kit לאירועים</h1>
          <p className="text-sm text-muted-foreground">תפריטים, אפסיילים, תנאים ופרומפט הסוכן. השינויים נכנסים מיידית.</p>
        </div>
        <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
          {saving ? <><Loader2 className="w-4 h-4 ml-1 animate-spin" /> שומר…</> : <><Save className="w-4 h-4 ml-1" /> שמור</>}
        </Button>
      </div>

      <Tabs defaultValue="menus" className="w-full">
        <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 md:grid md:grid-cols-4">
          <TabsTrigger value="menus" className="px-3 py-2 whitespace-nowrap flex-shrink-0"><Utensils className="w-4 h-4 ml-1" /> תפריטים</TabsTrigger>
          <TabsTrigger value="upsells" className="px-3 py-2 whitespace-nowrap flex-shrink-0"><Sparkles className="w-4 h-4 ml-1" /> אפסיילים</TabsTrigger>
          <TabsTrigger value="settings" className="px-3 py-2 whitespace-nowrap flex-shrink-0"><Settings className="w-4 h-4 ml-1" /> תנאים</TabsTrigger>
          <TabsTrigger value="prompt" className="px-3 py-2 whitespace-nowrap flex-shrink-0"><MessageSquareCode className="w-4 h-4 ml-1" /> פרומפט</TabsTrigger>
        </TabsList>

        <TabsContent value="menus" className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-2">
            <div className="text-sm text-amber-900">
              📋 <b>תפריט קבוצות רשמי</b> — ₪195 לסועד, 6 קטגוריות בחירה, שדרוגי בשר, חבילות שתייה
            </div>
            <Button variant="outline" size="sm" onClick={loadOfficialGroupMenu} className="border-amber-400 text-amber-900">
              <RotateCcw className="w-3 h-3 ml-1" />
              טען תפריט רשמי
            </Button>
          </div>

          {menus.length === 0 && <p className="text-sm text-muted-foreground">אין חבילות. הוסיפו את הראשונה.</p>}
          {menus.map((m, idx) => (
            <MenuCard
              key={m.id || idx}
              menu={m}
              onChange={(patch) => updateMenu(idx, patch)}
              onRemove={() => removeMenu(idx)}
            />
          ))}
          <Button variant="outline" onClick={addMenu}><Plus className="w-4 h-4 ml-1" /> הוסף חבילה</Button>
        </TabsContent>

        <TabsContent value="upsells" className="space-y-3">
          {upsells.length === 0 && <p className="text-sm text-muted-foreground">אין אפסיילים.</p>}
          {upsells.map((u, idx) => (
            <Card key={u.id || idx}>
              <CardContent className="p-4 grid md:grid-cols-4 gap-2 items-end">
                <div><Label>שם</Label><Input value={u.name || ''} onChange={(e) => updateUpsell(idx, { name: e.target.value })} placeholder="בר פתוח / DJ..." /></div>
                <div><Label>מחיר (₪)</Label><Input type="number" value={u.price_ils || 0} onChange={(e) => updateUpsell(idx, { price_ils: parseInt(e.target.value) || 0 })} /></div>
                <div><Label>חישוב</Label>
                  <select value={u.unit || 'per_event'} onChange={(e) => updateUpsell(idx, { unit: e.target.value })} className="w-full border rounded-md p-2 text-sm">
                    <option value="per_event">לאירוע</option>
                    <option value="per_person">לסועד</option>
                  </select>
                </div>
                <Button variant="outline" size="sm" onClick={() => removeUpsell(idx)} className="text-red-600"><Trash2 className="w-3 h-3 ml-1" /> מחק</Button>
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" onClick={addUpsell}><Plus className="w-4 h-4 ml-1" /> הוסף אפסייל</Button>
        </TabsContent>

        <TabsContent value="settings" className="space-y-3">
          <Card><CardContent className="p-4 grid md:grid-cols-2 gap-3">
            <div><Label>אחוז פיקדון</Label><Input type="number" value={kit.deposit_pct || 0} onChange={(e) => setKit({ ...kit, deposit_pct: parseInt(e.target.value) || 0 })} /></div>
            <div><Label>תקרת הנחה אוטונומית (%)</Label><Input type="number" value={kit.max_discount_pct || 0} onChange={(e) => setKit({ ...kit, max_discount_pct: parseInt(e.target.value) || 0 })} /></div>
            <div><Label>אישור אירוע same-day/next-day</Label>
              <select value={kit.short_notice_allowed ? 'yes' : 'no'} onChange={(e) => setKit({ ...kit, short_notice_allowed: e.target.value === 'yes' })} className="w-full border rounded-md p-2 text-sm">
                <option value="yes">כן — מותר</option><option value="no">לא — דורש מנהל</option>
              </select>
            </div>
            <div><Label>מקסימום חודשים מראש</Label><Input type="number" value={kit.max_advance_months || 6} onChange={(e) => setKit({ ...kit, max_advance_months: parseInt(e.target.value) || 6 })} /></div>
            <div><Label>מצב תשלום</Label>
              <select value={kit.payment_mode || 'stub'} onChange={(e) => setKit({ ...kit, payment_mode: e.target.value })} className="w-full border rounded-md p-2 text-sm">
                <option value="stub">Stub (סימולציה — לבדיקות)</option>
                <option value="stripe">Stripe (תשלום אמיתי) — דורש PK+SK</option>
              </select>
              <p className="text-xs text-amber-700 mt-1">{kit.payment_mode === 'stripe' ? '⚠️ נדרשים STRIPE_PUBLISHABLE_KEY + STRIPE_SECRET_KEY ב-env' : 'במצב stub, "אני שילם" מאשר את ההזמנה בלי לחייב באמת.'}</p>
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4 space-y-2">
            <Label>תנאים נוספים (JSON או טקסט חופשי)</Label>
            <Textarea rows={6} value={typeof kit.terms === 'string' ? kit.terms : JSON.stringify(kit.terms || {}, null, 2)} onChange={(e) => { try { setKit({ ...kit, terms: JSON.parse(e.target.value) }); } catch { setKit({ ...kit, terms: e.target.value }); } }} placeholder='{"cancellation_days":14,"headcount_deadline_days":3}' />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="prompt">
          <Card><CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <Label>System Prompt</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!window.confirm('לאפס את הפרומפט לתבנית ברירת המחדל של המערכת (עם שם המסעדה שלך)? השינויים הידניים שלך יימחקו.')) return;
                  try {
                    const res = await base44.functions.resetKitPrompt({ kind: 'events' });
                    const data = res?.data || res;
                    if (data?.template) setKit({ ...kit, system_prompt: data.template });
                  } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
                }}
              >
                🔄 אפס לפי הפרופיל שלי
              </Button>
            </div>
            <Textarea rows={24} value={kit.system_prompt || ''} onChange={(e) => setKit({ ...kit, system_prompt: e.target.value })} className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">
              השינוי נכנס לתוקף ב-turn הבא של כל שיחה. **הערה:** בזמן ריצה, כל &quot;עלינא&quot; שנשאר בטקסט יוחלף אוטומטית בשם המסעדה שלך + פרופיל העסק יזרם בראש הפרומפט.
            </p>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MenuCard({ menu, onChange, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const m = menu || {};
  const isStructured = Array.isArray(m.categories) && m.categories.length > 0;
  const includes = Array.isArray(m.includes) ? m.includes : [];
  const meatUpgrades = Array.isArray(m.meat_upgrades) ? m.meat_upgrades : [];
  const drinkPackages = Array.isArray(m.drink_packages) ? m.drink_packages : [];

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-2">
          <div><Label>שם חבילה</Label><Input value={m.name || ''} onChange={(e) => onChange({ name: e.target.value })} placeholder="תפריט אירוח קבוצות" /></div>
          <div><Label>מחיר לסועד (₪)</Label><Input type="number" value={m.price_per_person_ils || 0} onChange={(e) => onChange({ price_per_person_ils: parseInt(e.target.value) || 0 })} /></div>
          <div><Label>מינ׳ אורחים</Label><Input type="number" value={m.min_guests || 0} onChange={(e) => onChange({ min_guests: parseInt(e.target.value) || 0 })} /></div>
          <div><Label>מקס׳ אורחים</Label><Input type="number" value={m.max_guests || 0} onChange={(e) => onChange({ max_guests: parseInt(e.target.value) || 0 })} /></div>
          {isStructured && (
            <>
              <div><Label>הנחת ילדים (%)</Label><Input type="number" value={m.kids_discount_pct || 0} onChange={(e) => onChange({ kids_discount_pct: parseInt(e.target.value) || 0 })} /></div>
              <div><Label>גיל מקס׳ ילדים</Label><Input type="number" value={m.kids_age_max || 12} onChange={(e) => onChange({ kids_age_max: parseInt(e.target.value) || 12 })} /></div>
            </>
          )}
        </div>

        {isStructured && (
          <div className="border-2 border-emerald-200 rounded-lg p-3 bg-emerald-50/40">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-2 text-sm font-bold text-emerald-900 w-full text-right"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              📋 מבנה התפריט המפורט ({m.categories?.length || 0} קטגוריות + {meatUpgrades.length} שדרוגי בשר + {drinkPackages.length} חבילות שתייה)
            </button>
            {expanded && (
              <div className="mt-3 space-y-3 text-sm">
                {includes.length > 0 && (
                  <div>
                    <div className="font-bold text-emerald-800 mb-1">✓ כלול במחיר:</div>
                    <ul className="list-disc pr-5 space-y-0.5 text-gray-700">
                      {includes.map((it, i) => <li key={i}>{it}</li>)}
                    </ul>
                  </div>
                )}
                {(m.categories || []).map((cat, ci) => (
                  <div key={ci} className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="font-bold text-gray-800 text-xs">
                      {cat.label}
                      {cat.pick === 'fixed' ? <span className="text-gray-500 font-normal"> · קבוע</span> : <span className="text-amber-700 font-normal"> · יש לבחור {cat.pick}</span>}
                      {cat.note && <span className="text-gray-500 font-normal"> · {cat.note}</span>}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {(cat.items || []).join(' · ')}
                    </div>
                    {cat.extra_cost_per_person_ils > 0 && (
                      <div className="text-[10px] text-amber-700 mt-1">+ ₪{cat.extra_cost_per_person_ils} לסועד עבור: {cat.extra_cost_label || 'תוספת'}</div>
                    )}
                  </div>
                ))}
                {meatUpgrades.length > 0 && (
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="font-bold text-gray-800 text-xs mb-1">🥩 שדרוגי בשר (תוספת לסועד)</div>
                    {meatUpgrades.map((u, i) => (
                      <div key={i} className="text-xs text-gray-700">{u.name} — <b>+₪{u.surcharge_per_person_ils}</b></div>
                    ))}
                  </div>
                )}
                {drinkPackages.length > 0 && (
                  <div className="bg-white rounded-lg p-2 border border-gray-100">
                    <div className="font-bold text-gray-800 text-xs mb-1">🥂 חבילות שתייה (בחירה אחת)</div>
                    {drinkPackages.map((d, i) => (
                      <div key={i} className="text-xs text-gray-700">{d.name} — <b>₪{d.price_per_person_ils} לסועד</b></div>
                    ))}
                    {m.alcohol_bottles_discount_pct > 0 && (
                      <div className="text-[11px] text-gray-500 mt-1">* {m.alcohol_bottles_note || `בקבוקי אלכוהול — ${m.alcohol_bottles_discount_pct}% הנחה`}</div>
                    )}
                  </div>
                )}
                <div className="text-[11px] text-gray-500 italic">
                  עריכה ידנית של פריטים: לחץ "טען תפריט רשמי" אחרי שתעדכן את <code>src/data/eventGroupMenu.js</code> ב-repo.
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <Label>{isStructured ? 'תיאור חופשי (אופציונלי)' : 'תיאור / מנות כלולות (טקסט חופשי)'}</Label>
          <Textarea rows={isStructured ? 2 : 4} value={m.description || ''} onChange={(e) => onChange({ description: e.target.value })} placeholder="הערות, פרטים נוספים..." />
        </div>

        <Button variant="outline" size="sm" onClick={onRemove} className="text-red-600">
          <Trash2 className="w-3 h-3 ml-1" /> מחק חבילה
        </Button>
      </CardContent>
    </Card>
  );
}
