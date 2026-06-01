import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Trash2, Save, Utensils, Sparkles, Settings, MessageSquareCode } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import toast from 'react-hot-toast';

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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="menus"><Utensils className="w-4 h-4 ml-1" /> תפריטים</TabsTrigger>
          <TabsTrigger value="upsells"><Sparkles className="w-4 h-4 ml-1" /> אפסיילים</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="w-4 h-4 ml-1" /> תנאים</TabsTrigger>
          <TabsTrigger value="prompt"><MessageSquareCode className="w-4 h-4 ml-1" /> פרומפט</TabsTrigger>
        </TabsList>

        <TabsContent value="menus" className="space-y-3">
          {menus.length === 0 && <p className="text-sm text-muted-foreground">אין חבילות. הוסיפו את הראשונה.</p>}
          {menus.map((m, idx) => (
            <Card key={m.id || idx}>
              <CardContent className="p-4 space-y-2">
                <div className="grid md:grid-cols-2 gap-2">
                  <div><Label>שם חבילה</Label><Input value={m.name || ''} onChange={(e) => updateMenu(idx, { name: e.target.value })} placeholder="תפריט בוקר ישראלי עשיר" /></div>
                  <div><Label>מחיר לסועד (₪)</Label><Input type="number" value={m.price_per_person_ils || 0} onChange={(e) => updateMenu(idx, { price_per_person_ils: parseInt(e.target.value) || 0 })} /></div>
                  <div><Label>מינ׳ אורחים</Label><Input type="number" value={m.min_guests || 0} onChange={(e) => updateMenu(idx, { min_guests: parseInt(e.target.value) || 0 })} /></div>
                  <div><Label>מקס׳ אורחים</Label><Input type="number" value={m.max_guests || 0} onChange={(e) => updateMenu(idx, { max_guests: parseInt(e.target.value) || 0 })} /></div>
                </div>
                <div><Label>תיאור / מנות כלולות (טקסט חופשי)</Label>
                  <Textarea rows={4} value={m.description || ''} onChange={(e) => updateMenu(idx, { description: e.target.value })} placeholder="פירוט המנות, מה כלול בחבילה, אופציות בחירה..." />
                </div>
                <Button variant="outline" size="sm" onClick={() => removeMenu(idx)} className="text-red-600"><Trash2 className="w-3 h-3 ml-1" /> מחק חבילה</Button>
              </CardContent>
            </Card>
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
            <Label>System Prompt</Label>
            <Textarea rows={24} value={kit.system_prompt || ''} onChange={(e) => setKit({ ...kit, system_prompt: e.target.value })} className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">השינוי נכנס לתוקף ב-turn הבא של כל שיחה.</p>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
