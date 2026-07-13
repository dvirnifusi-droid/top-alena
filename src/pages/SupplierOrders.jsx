// Supplier ordering hub. Per supplier: a par/current stock list (to_order =
// par - current, computed) + a delivery/order schedule that drives the
// WhatsApp+push reminders (runSupplierOrderAlerts cron) so orders aren't missed.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2, Pencil, Truck, Bell, Check, X, Upload, ChevronDown, PackageCheck } from 'lucide-react';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// Parse a pasted inventory table (tab/comma separated). Detects a header row and
// maps columns by keyword: name, type/category, price, current stock, par
// ("should be"). Falls back to "product per line" when there's no header.
function parseInventoryText(text) {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/\t|,/).map((c) => c.replace(/^"|"$/g, '').trim()));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.toLowerCase());
  const find = (re) => header.findIndex((h) => re.test(h));
  const nameCol = find(/שם|מותג|משקה|מוצר|product|name|item/);
  const catCol = find(/סוג|קטגור|type|category/);
  const priceCol = find(/מחיר|price|עלות|cost/);
  const curCol = find(/מלאי קיים|קיים|current|במלאי|stock/);
  const parCol = find(/שצריך|יעד|par|אמור|נדרש|מבוקש/);
  const hasHeader = [nameCol, catCol, priceCol, curCol, parCol].some((i) => i >= 0);
  const pCol = nameCol >= 0 ? nameCol : 0;
  const at = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
  return (hasHeader ? rows.slice(1) : rows)
    .map((r) => ({ product: at(r, pCol), category: at(r, catCol), price: at(r, priceCol), current: at(r, curCol), par: at(r, parCol), unit: '' }))
    .filter((it) => it.product);
}

// Next occurrence of weekday `dow` (0=Sun) at HH:mm, strictly after `from`.
function nextDeadline(dow, hhmm, from = new Date()) {
  if (dow == null || dow < 0) return null;
  const [h, m] = String(hhmm || '12:00').split(':').map(Number);
  const d = new Date(from);
  d.setHours(h || 12, m || 0, 0, 0);
  let add = (dow - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= from.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

function statusFor(s, now = new Date()) {
  const deadline = nextDeadline(s.order_by_day, s.order_by_time, now);
  const alertDays = Array.isArray(s.alert_days) ? s.alert_days : [];
  const orderedRecently = s.last_ordered_at && (Date.now() - new Date(s.last_ordered_at).getTime()) < 2 * 24 * 60 * 60 * 1000;
  const isAlertToday = alertDays.includes(now.getDay());
  const hoursTo = deadline ? (deadline.getTime() - now.getTime()) / 3600000 : null;
  let level = 'ok';
  if (orderedRecently) level = 'done';
  else if (isAlertToday) level = 'due';
  else if (hoursTo != null && hoursTo <= 30) level = 'soon';
  return { deadline, level, hoursTo, isAlertToday, orderedRecently };
}

const LEVEL = {
  done: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: '✓ הוזמן', border: 'border-emerald-200' },
  due:  { dot: 'bg-rose-500 animate-pulse', text: 'text-rose-700', label: '🔴 להזמין היום', border: 'border-rose-300' },
  soon: { dot: 'bg-[#B89556]', text: 'text-[#7A5A2E]', label: '🟠 מתקרב', border: 'border-[#D9BD83]' },
  ok:   { dot: 'bg-slate-300', text: 'text-slate-500', label: '🟢 תקין', border: 'border-[#E8D9B5]' },
};

const SEED = [
  { name: 'טמפו', category: 'משקאות', delivery_day: 2, order_by_day: 0, order_by_time: '14:00', alert_days: [6], alert_time: '20:00' },
  { name: 'קוקה קולה — משקאות', category: 'משקאות', delivery_day: 2, order_by_day: 0, order_by_time: '12:00', alert_days: [6], alert_time: '20:00' },
  { name: 'קוקה קולה — אלכוהול', category: 'אלכוהול', delivery_day: 4, order_by_day: 2, order_by_time: '12:00', alert_days: [0, 1], alert_time: '10:00' },
];

function fmtCountdown(deadline, now = new Date()) {
  if (!deadline) return '';
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return 'עבר הדדליין';
  const h = Math.floor(ms / 3600000);
  if (h < 24) return `בעוד ${h} שעות`;
  return `בעוד ${Math.floor(h / 24)} ימים`;
}

export default function SupplierOrders() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [editing, setEditing] = useState(null); // schedule dialog
  const [importFor, setImportFor] = useState(null); // {id, mode:'text'|'sheet'}
  const [now, setNow] = useState(new Date());
  const lastInteraction = useRef(0);

  const load = async () => {
    try {
      const res = await base44.functions.getSupplierOrders({});
      setSuppliers((res?.data || res)?.suppliers || []);
    } catch (e) { console.warn('load suppliers', e); }
    setLoading(false);
  };
  useEffect(() => { load(); const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);

  const seed = async () => {
    for (const s of SEED) { try { await base44.functions.saveSupplierOrder(s); } catch { /* ignore */ } }
    await load();
  };
  const remove = async (id) => {
    if (!window.confirm('למחוק את הספק וכל הרשימה שלו?')) return;
    try { await base44.functions.deleteSupplierOrder({ id }); await load(); } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
  };
  const markOrdered = async (id) => {
    try { await base44.functions.markSupplierOrdered({ id }); await load(); } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#FAF5E8] to-[#F4ECD8] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#44512C] flex items-center justify-center shadow-sm shrink-0"><Truck className="w-6 h-6 text-[#F4ECD8]" /></div>
            <div>
              <h1 className="text-2xl md:text-3xl font-black text-[#1F1B17] leading-tight">הזמנות ספקים</h1>
              <p className="text-sm text-[#7A6F5D]">רשימה לכל ספק · מתי להזמין · התראות שלא תפספס</p>
            </div>
          </div>
          <Button onClick={() => setEditing({})} className="bg-[#A04A2E] hover:bg-[#8B3D24] text-white"><Plus className="w-4 h-4 ml-1" /> ספק חדש</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-[#A04A2E]" /></div>
        ) : suppliers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E8D9B5] p-8 text-center shadow-sm">
            <Truck className="w-12 h-12 mx-auto text-[#D9BD83] mb-3" />
            <h3 className="text-xl font-bold text-[#1F1B17] mb-1">אין ספקים עדיין</h3>
            <p className="text-[#7A6F5D] mb-4">הוסף ספק, קבע מתי אספקה/דדליין הזמנה, ובנה את רשימת המוצרים.</p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button onClick={() => setEditing({})} className="bg-[#A04A2E] hover:bg-[#8B3D24] text-white"><Plus className="w-4 h-4 ml-1" /> ספק חדש</Button>
              <Button variant="outline" onClick={seed} className="border-[#D9BD83] text-[#7A5A2E]">✨ הוסף את 3 הספקים שלי (טמפו / קוקה)</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {suppliers.map((s) => {
              const st = statusFor(s, now);
              const cfg = LEVEL[st.level];
              const items = Array.isArray(s.items) ? s.items : [];
              const toOrderCount = items.filter((it) => {
                const p = Number(it.par), c = Number(it.current);
                return Number.isFinite(p) && Number.isFinite(c) ? p - c > 0 : false;
              }).length;
              const open = openId === s.id;
              return (
                <Card key={s.id} className={`bg-white rounded-2xl border ${cfg.border} shadow-sm overflow-hidden`}>
                  <CardContent className="p-0">
                    <div className="p-4 flex items-center gap-3 flex-wrap">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                      <button onClick={() => setOpenId(open ? null : s.id)} className="flex-1 min-w-0 text-right">
                        <div className="font-black text-[#1F1B17] flex items-center gap-2">{s.name}
                          {s.category && <span className="text-[10px] font-bold text-[#7A5A2E] bg-[#F4ECD8] rounded-full px-2 py-0.5">{s.category}</span>}
                        </div>
                        <div className="text-xs text-[#7A6F5D] mt-0.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap">
                          {s.delivery_day != null && <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> אספקה: יום {DAY_NAMES[s.delivery_day]}</span>}
                          {s.order_by_day != null && <span className="flex items-center gap-1"><Bell className="w-3 h-3" /> דדליין: יום {DAY_NAMES[s.order_by_day]} {s.order_by_time}</span>}
                          <span className={`font-bold ${cfg.text}`}>{cfg.label}{st.deadline && st.level !== 'done' ? ` · ${fmtCountdown(st.deadline, now)}` : ''}</span>
                        </div>
                      </button>
                      {toOrderCount > 0 && <span className="text-xs font-bold text-white bg-[#A04A2E] rounded-full px-2 py-1 shrink-0">{toOrderCount} להזמין</span>}
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => markOrdered(s.id)} title="סמן שהוזמן" className="p-2 rounded-lg text-emerald-600 hover:bg-emerald-50"><PackageCheck className="w-4 h-4" /></button>
                        <button onClick={() => setEditing(s)} title="ערוך לו״ז" className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => remove(s.id)} title="מחק" className="p-2 rounded-lg text-red-400 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                        <button onClick={() => setOpenId(open ? null : s.id)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} /></button>
                      </div>
                    </div>
                    {open && <ItemsEditor supplier={s} onSaved={load} onImport={(mode) => setImportFor({ id: s.id, mode, sheet_url: s.sheet_url })} lastInteraction={lastInteraction} />}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {editing && <ScheduleDialog supplier={editing} onClose={() => setEditing(null)} onSaved={load} />}
      {importFor && <ImportDialog target={importFor} onClose={() => setImportFor(null)} onSaved={load} />}
    </div>
  );
}

// ─────────── Items editor (par / current → to-order) ───────────
function ItemsEditor({ supplier, onSaved, onImport }) {
  const [items, setItems] = useState(() => (Array.isArray(supplier.items) ? supplier.items.map((x) => ({ ...x })) : []));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setItems(Array.isArray(supplier.items) ? supplier.items.map((x) => ({ ...x })) : []); setDirty(false); }, [supplier.id]);
  const patch = (i, k, v) => { setItems((p) => p.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setDirty(true); };
  const add = (category = '') => { setItems((p) => [...p, { product: '', category, price: '', par: '', current: '', unit: '' }]); setDirty(true); };
  const del = (i) => { setItems((p) => p.filter((_, j) => j !== i)); setDirty(true); };
  const save = async () => {
    setSaving(true);
    try { await base44.functions.saveSupplierOrderItems({ id: supplier.id, items }); setDirty(false); if (onSaved) await onSaved(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    setSaving(false);
  };
  // to-order = par - current (his convention): positive = order that many;
  // zero/negative = enough / surplus. null when a number is missing.
  const diffOf = (it) => { const p = Number(it.par), c = Number(it.current); return Number.isFinite(p) && Number.isFinite(c) ? p - c : null; };
  const groups = useMemo(() => {
    const m = new Map();
    items.forEach((it, i) => { const c = (it.category || '').trim() || 'כללי'; if (!m.has(c)) m.set(c, []); m.get(c).push({ it, i }); });
    return [...m.entries()];
  }, [items]);
  const totalToOrder = items.filter((it) => (diffOf(it) ?? 0) > 0).length;
  const GRID = 'grid grid-cols-[1fr_50px_42px_42px_46px_22px] gap-1';
  return (
    <div className="border-t border-[#E8D9B5] bg-[#FAF5E8]/40 p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => onImport('text')} className="border-[#D9BD83] text-[#7A5A2E] h-8"><Upload className="w-3.5 h-3.5 ml-1" /> הדבק טבלה</Button>
          <Button size="sm" variant="outline" onClick={() => onImport('sheet')} className="border-[#D9BD83] text-[#7A5A2E] h-8">📊 גוגל שיטס</Button>
          {totalToOrder > 0 && <span className="text-xs font-bold text-white bg-[#A04A2E] rounded-full px-2 py-1 self-center">{totalToOrder} להזמין</span>}
        </div>
        <Button size="sm" onClick={save} disabled={!dirty || saving} className={dirty ? 'bg-emerald-600 hover:bg-emerald-700 text-white h-8' : 'bg-slate-200 text-slate-400 h-8'}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : dirty ? '💾 שמור' : 'נשמר ✓'}</Button>
      </div>
      {items.length === 0 ? (
        <p className="text-center text-sm text-slate-500 py-4">אין מוצרים. הדבק טבלה, ייבא מגוגל שיטס, או הוסף ידנית.</p>
      ) : (
        <div className="space-y-2.5">
          {groups.map(([cat, rows]) => {
            const need = rows.filter(({ it }) => (diffOf(it) ?? 0) > 0).length;
            return (
              <div key={cat} className="rounded-lg border border-[#E8D9B5] bg-white overflow-hidden">
                <div className="flex items-center justify-between px-2 py-1.5 bg-[#F4ECD8] text-xs font-bold text-[#7A5A2E]">
                  <span className="flex items-center gap-2">{cat}{need > 0 && <span className="text-[#A04A2E]">· {need} להזמין</span>}</span>
                  <button onClick={() => add(cat === 'כללי' ? '' : cat)} title="הוסף לקטגוריה" className="text-[#7A5A2E] hover:text-[#A04A2E]"><Plus className="w-4 h-4" /></button>
                </div>
                <div className={`${GRID} px-2 py-1 text-[10px] font-bold text-slate-400 border-b`}>
                  <span>מוצר</span><span className="text-center">מחיר</span><span className="text-center">יעד</span><span className="text-center">יש</span><span className="text-center">להזמין</span><span></span>
                </div>
                {rows.map(({ it, i }) => {
                  const d = diffOf(it);
                  return (
                    <div key={i} className={`${GRID} px-2 py-1 items-center border-b last:border-0 ${d != null && d > 0 ? 'bg-[#F4ECD8]/40' : ''}`}>
                      <Input value={it.product} onChange={(e) => patch(i, 'product', e.target.value)} placeholder="שם מוצר" className="h-7 text-xs px-1.5" />
                      <Input value={it.price ?? ''} onChange={(e) => patch(i, 'price', e.target.value)} inputMode="decimal" placeholder="₪" className="h-7 text-xs text-center px-1" />
                      <Input value={it.par ?? ''} onChange={(e) => patch(i, 'par', e.target.value)} inputMode="numeric" className="h-7 text-xs text-center px-1" />
                      <Input value={it.current ?? ''} onChange={(e) => patch(i, 'current', e.target.value)} inputMode="numeric" className="h-7 text-xs text-center px-1" />
                      <div className={`text-center text-xs font-black ${d == null ? 'text-slate-300' : d > 0 ? 'text-[#A04A2E]' : 'text-slate-400'}`}>{d == null ? '—' : d}</div>
                      <button onClick={() => del(i)} className="text-red-300 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      <button onClick={() => add('')} className="w-full mt-2 text-xs font-bold text-[#7A5A2E] border border-dashed border-[#D9BD83] rounded-lg py-1.5 hover:bg-[#F4ECD8]"><Plus className="w-3.5 h-3.5 inline ml-1" /> הוסף מוצר</button>
    </div>
  );
}

// ─────────── Schedule dialog ───────────
function ScheduleDialog({ supplier, onClose, onSaved }) {
  const [f, setF] = useState({
    id: supplier.id, name: supplier.name || '', category: supplier.category || '',
    delivery_day: supplier.delivery_day ?? '', order_by_day: supplier.order_by_day ?? '',
    order_by_time: supplier.order_by_time || '12:00', alert_time: supplier.alert_time || '10:00',
    alert_days: Array.isArray(supplier.alert_days) ? supplier.alert_days : [],
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleDay = (d) => setF((p) => ({ ...p, alert_days: p.alert_days.includes(d) ? p.alert_days.filter((x) => x !== d) : [...p.alert_days, d] }));
  const save = async () => {
    if (!f.name.trim()) { alert('שם ספק חובה'); return; }
    setSaving(true);
    try {
      await base44.functions.saveSupplierOrder({
        ...f,
        delivery_day: f.delivery_day === '' ? null : Number(f.delivery_day),
        order_by_day: f.order_by_day === '' ? null : Number(f.order_by_day),
      });
      if (onSaved) await onSaved(); onClose();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    setSaving(false);
  };
  const DaySelect = ({ value, onChange }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-sm border border-slate-300 rounded-lg py-2 px-2 bg-white">
      <option value="">—</option>
      {DAY_NAMES.map((d, i) => <option key={i} value={i}>יום {d}</option>)}
    </select>
  );
  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-6 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="font-black text-lg text-[#1F1B17]">{supplier.id ? 'עריכת ספק' : 'ספק חדש'}</h3><button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button></div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-600">שם ספק<Input value={f.name} onChange={(e) => set('name', e.target.value)} className="mt-0.5" placeholder="טמפו" /></label>
          <label className="text-xs text-slate-600">קטגוריה<Input value={f.category} onChange={(e) => set('category', e.target.value)} className="mt-0.5" placeholder="משקאות" /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-600">יום אספקה<div className="mt-0.5"><DaySelect value={f.delivery_day} onChange={(v) => set('delivery_day', v)} /></div></label>
          <div className="grid grid-cols-2 gap-1">
            <label className="text-xs text-slate-600">דדליין — יום<div className="mt-0.5"><DaySelect value={f.order_by_day} onChange={(v) => set('order_by_day', v)} /></div></label>
            <label className="text-xs text-slate-600">שעה<Input value={f.order_by_time} onChange={(e) => set('order_by_time', e.target.value)} className="mt-0.5" placeholder="12:00" /></label>
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-600 mb-1">ימי התראה (וואטסאפ + פוש)</p>
          <div className="flex flex-wrap gap-1">
            {DAY_NAMES.map((d, i) => (
              <button key={i} onClick={() => toggleDay(i)} className={`text-xs font-bold px-2.5 py-1 rounded-full border ${f.alert_days.includes(i) ? 'bg-[#A04A2E] border-[#A04A2E] text-white' : 'bg-white border-[#E8D9B5] text-[#7A6F5D]'}`}>{d}</button>
            ))}
          </div>
          <label className="text-xs text-slate-600 flex items-center gap-2 mt-2">שעת התראה <Input value={f.alert_time} onChange={(e) => set('alert_time', e.target.value)} className="w-20 h-8" placeholder="10:00" /></label>
        </div>
        <Button onClick={save} disabled={saving} className="w-full bg-[#A04A2E] hover:bg-[#8B3D24] text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור ספק'}</Button>
      </div>
    </div>
  );
}

// ─────────── Import dialog (text / sheet) ───────────
function ImportDialog({ target, onClose, onSaved }) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState(target.sheet_url || '');
  const [busy, setBusy] = useState(false);
  const runText = async () => {
    const items = parseInventoryText(text);
    if (!items.length) return;
    setBusy(true);
    try { await base44.functions.saveSupplierOrderItems({ id: target.id, items }); if (onSaved) await onSaved(); onClose(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    setBusy(false);
  };
  const runSheet = async () => {
    setBusy(true);
    try { const res = await base44.functions.importSupplierSheet({ id: target.id, sheet_url: url }); if (onSaved) await onSaved(); onClose(); alert(`יובאו ${(res?.data || res)?.count ?? 0} מוצרים ✅`); }
    catch (e) { alert('שגיאה: ' + (e?.data?.message || e?.message || '')); }
    setBusy(false);
  };
  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md my-6 p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between"><h3 className="font-black text-lg text-[#1F1B17]">{target.mode === 'sheet' ? 'ייבוא מגוגל שיטס' : 'ייבוא מטקסט'}</h3><button onClick={onClose}><X className="w-5 h-5 text-slate-400" /></button></div>
        {target.mode === 'sheet' ? (
          <>
            <p className="text-xs text-slate-500">שתף את הגיליון כ"כל מי שיש לו הקישור: צפייה", והדבק כאן את הקישור.</p>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/..." dir="ltr" />
            <Button onClick={runSheet} disabled={busy || !url.trim()} className="w-full bg-[#A04A2E] hover:bg-[#8B3D24] text-white">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ייבא מהגיליון'}</Button>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-500">הדבק את הטבלה מהגיליון (כולל שורת הכותרות) — המערכת מזהה לבד את העמודות: <b>שם/סוג/מחיר/מלאי קיים/מלאי שצריך</b>. או שורה לכל מוצר.</p>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} dir="rtl" placeholder={'סוג המשקה\tשם המותג\tמחיר\tמלאי קיים\tמלאי שצריך\nיין אדום\tרזרב מרלו\t27.74\t13\t4\nאלכוהול\tאבסולוט\t81.12\t9\t2'} />
            <Button onClick={runText} disabled={busy || !text.trim()} className="w-full bg-[#A04A2E] hover:bg-[#8B3D24] text-white">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ייבא רשימה'}</Button>
          </>
        )}
      </div>
    </div>
  );
}
