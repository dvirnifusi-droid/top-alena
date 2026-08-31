// Order List — works like the Prep List, but for ORDERING. Staff tap items from
// a general catalog to mark "צריך להזמין" (needs ordering); a live dedicated view
// aggregates only the flagged items = the order to place. Reuses the PrepItem
// backend (to_prep = needed, done = ordered) via the order-list fns.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { User } from '@/entities/all';
import PageGuard from '../components/shared/PageGuard';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Trash2, ListChecks, ShoppingCart, Search, Check, Copy, Upload, Pencil } from 'lucide-react';
import AiScannerButton from '@/components/scanner/AiScannerButton';
import SupplierSplitPanel from '@/components/orders/SupplierSplitPanel';

const W = { terracotta: '#A04A2E', olive: '#44512C', brass: '#B89556', cream: '#FAF5E8', creamCard: '#F4ECD8', border: '#E8D9B5', charcoal: '#1F1B17', muted: '#7A6F5D' };

// Virtual "all lists" tab — the backend returns every item across lists when no
// list_id is sent, so this just aggregates them into one categorized view.
const ALL_ID = '__all__';

// Per-supplier ₪ order minimum, editable inline in the supplier group header.
// Self-contained state so background list refreshes never steal focus mid-typing.
function SupplierMinCell({ name, currentMin, orderTotal, onSave }) {
  const [val, setVal] = useState(currentMin == null ? '' : String(currentMin));
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setVal(currentMin == null ? '' : String(currentMin)); }, [currentMin, focused]);
  const commit = async () => {
    setFocused(false);
    const v = val.trim() === '' ? null : Number(val);
    const cur = currentMin == null ? null : Number(currentMin);
    if (v === cur) return;
    setSaving(true); await onSave(v); setSaving(false);
  };
  const min = currentMin == null ? null : Number(currentMin);
  const below = min != null && orderTotal < min;
  const met = min != null && min > 0 && orderTotal >= min;
  return (
    <span className="flex items-center gap-1 text-[11px]" title="מינימום הזמנה לספק (₪)">
      <span style={{ color: W.muted }}>מינ׳ ₪</span>
      <input value={val} onChange={e => setVal(e.target.value)} onFocus={() => setFocused(true)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} type="number" inputMode="decimal" placeholder="—"
        className="w-14 h-6 rounded border px-1 text-center text-xs" style={{ borderColor: W.border, background: '#fff' }} onClick={e => e.stopPropagation()} />
      {saving ? <Loader2 className="w-3 h-3 animate-spin" style={{ color: W.brass }} />
        : below ? <span className="font-semibold text-red-600 whitespace-nowrap">חסר ₪{Math.round(min - orderTotal).toLocaleString()}</span>
        : met ? <span className="font-semibold whitespace-nowrap" style={{ color: W.olive }}>✓ עומד</span> : null}
    </span>
  );
}

function OrderListInner() {
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState('mark'); // 'mark' | 'live'
  const [search, setSearch] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [groupBy, setGroupBy] = useState(() => { try { return localStorage.getItem('ol_groupby') || 'category'; } catch { return 'category'; } });
  const setGroup = (g) => { setGroupBy(g); try { localStorage.setItem('ol_groupby', g); } catch { /* noop */ } };
  const [draft, setDraft] = useState([]); // catalog editor rows
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]); // Supplier rows (for per-supplier order minimums)
  const lastInteractionRef = useRef(0);

  // Match items' free-text supplier_name to a Supplier row the same way the backend does.
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const supMap = useMemo(() => { const m = new Map(); suppliers.forEach(s => m.set(norm(s.company_name), s)); return m; }, [suppliers]);
  const supMinOf = (name) => { const s = supMap.get(norm(name)); const v = s?.min_order_amount; return v == null ? null : Number(v); };
  const loadSuppliers = async () => { try { const su = await base44.functions.listOrderSuppliers({}); setSuppliers((su?.data || su || {}).suppliers || []); } catch { /* ignore */ } };
  // Upsert a supplier's ₪ order minimum — create the Supplier row on the fly if it
  // doesn't exist yet (imported lists have supplier names but no Supplier rows).
  const saveSupplierMin = async (name, amount) => {
    const existing = supMap.get(norm(name));
    const amt = (amount == null || amount === '') ? '' : amount;
    try {
      if (existing?.id) await base44.functions.setSupplierOrderMinimum({ id: existing.id, min_order_amount: amt, min_order_units: existing.min_order_units ?? '' });
      else if (String(name).trim()) await base44.functions.addOrderSupplier({ company_name: name, min_order_amount: amt });
      await loadSuppliers();
    } catch { /* ignore */ }
  };

  const loadLists = async (preferId) => {
    try {
      const res = await base44.functions.getOrderLists({});
      const ls = (res?.data || res || {}).lists || [];
      setLists(ls);
      const pick = (preferId && ls.some(l => l.id === preferId)) ? preferId
        : (activeList && ls.some(l => l.id === activeList)) ? activeList : (ls[0]?.id || null);
      setActiveList(pick);
      return pick;
    } catch { return null; }
  };

  const loadItems = async (listId) => {
    setLoading(true);
    try {
      const res = await base44.functions.getPrepItems((listId && listId !== ALL_ID) ? { list_id: listId } : {});
      const data = res?.data || res || {};
      setItems(Array.isArray(data.items) ? data.items.map((it, i) => ({ ...it, sort: it.sort ?? i })) : []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fp = (arr) => (arr || []).map(x => `${x.id}|${x.to_prep}|${x.done}|${x.note}|${x.target}|${x.have}|${x.name}|${x.category}|${x.expected_arrival}|${x.ordered_pending}|${x.last_ordered_at}`).join('§');
  const refreshSilent = async (listId) => {
    if (!listId) return;
    try {
      const res = await base44.functions.getPrepItems(listId === ALL_ID ? {} : { list_id: listId });
      const next = ((res?.data || res || {}).items || []).map((it, i) => ({ ...it, sort: it.sort ?? i }));
      setItems(prev => (Date.now() - lastInteractionRef.current < 6000) ? prev : (fp(prev) === fp(next) ? prev : next));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      try { const u = await User.me(); setIsAdmin(u?.role === 'admin' || u?.role === 'owner' || !!u?.managed_department); } catch { /* staff */ }
      const pick = await loadLists();
      await loadItems(pick);
      loadSuppliers();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeList) return;
    const tick = () => { if (document.hidden || editMode) return; if (Date.now() - lastInteractionRef.current < 6000) return; refreshSilent(activeList); };
    const iv = setInterval(tick, 10000);
    const onVis = () => { if (!document.hidden && !editMode && Date.now() - lastInteractionRef.current > 3000) refreshSilent(activeList); };
    document.addEventListener('visibilitychange', onVis); window.addEventListener('focus', onVis);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList, editMode]);

  const patchItem = (id, changes) => setItems(prev => prev.map(it => it.id === id ? { ...it, ...changes } : it));

  // Flag / unflag an item as needed-to-order. Un-flag also clears "ordered".
  const toggleNeeded = async (it) => {
    lastInteractionRef.current = Date.now();
    const nextNeeded = !it.to_prep;
    patchItem(it.id, { to_prep: nextNeeded, ...(nextNeeded ? {} : { done: false }) });
    try { await base44.functions.updatePrepItem({ id: it.id, to_prep: nextNeeded, ...(nextNeeded ? {} : { done: false }) }); } catch { /* ignore */ }
  };
  // Mark a needed item as ordered (removes it from the live order list).
  const toggleOrdered = async (it) => {
    lastInteractionRef.current = Date.now();
    const nextDone = !it.done;
    patchItem(it.id, { done: nextDone });
    try { await base44.functions.updatePrepItem({ id: it.id, done: nextDone }); } catch { /* ignore */ }
  };
  const setNote = (it, note) => { lastInteractionRef.current = Date.now(); patchItem(it.id, { note }); };
  const commitNote = async (it) => { try { await base44.functions.updatePrepItem({ id: it.id, note: it.note || '' }); } catch { /* ignore */ } };

  // Quantitative model: target=par ("should be in stock"), have=current.
  // to-order = par - current (auto). An item flows to the order list when
  // to-order > 0 OR it was manually flagged.
  const numOr = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const toOrderOf = (it) => { const p = numOr(it.target); if (p == null) return null; const h = numOr(it.have) ?? 0; const d = p - h; return d > 0 ? Math.round(d * 100) / 100 : 0; };
  const neededOf = (it) => (toOrderOf(it) || 0) > 0 || !!it.to_prep;
  const qtyOf = (it) => (it.note && String(it.note).trim()) ? String(it.note).trim() : (toOrderOf(it) ? String(toOrderOf(it)) : '');
  const needed = useMemo(() => items.filter(it => neededOf(it) && !it.done), [items]);

  const activeListObj = useMemo(() => lists.find(l => l.id === activeList) || null, [lists, activeList]);
  const parLocked = activeListObj ? activeListObj.par_locked !== false : true;
  const toggleLock = async () => {
    if (!activeList) return;
    const next = !parLocked;
    setLists(ls => ls.map(l => l.id === activeList ? { ...l, par_locked: next } : l));
    try { await base44.functions.setOrderListLock({ id: activeList, par_locked: next }); } catch { /* ignore */ }
  };
  const setPar = (it, v) => { lastInteractionRef.current = Date.now(); patchItem(it.id, { target: v }); };
  const commitPar = async (it) => { try { await base44.functions.updatePrepItem({ id: it.id, target: it.target ?? '' }); } catch { /* ignore */ } };
  const setPrice = (it, v) => { lastInteractionRef.current = Date.now(); patchItem(it.id, { price: v }); };
  const commitPrice = async (it) => { try { await base44.functions.updatePrepItem({ id: it.id, price: it.price ?? '' }); } catch { /* ignore */ } };
  const setCur = (it, v) => { lastInteractionRef.current = Date.now(); patchItem(it.id, { have: v }); };
  const commitCur = async (it) => { try { await base44.functions.updatePrepItem({ id: it.id, have: it.have ?? '' }); } catch { /* ignore */ } };
  // Arrival is per SUPPLIER ORDER, not per product — one delivery date for the
  // whole supplier group. Writes expected_arrival to every item of that supplier.
  const setGroupArrival = async (supplierName, arr, v) => {
    lastInteractionRef.current = Date.now();
    const ids = new Set(arr.map(x => x.id));
    setItems(prev => prev.map(it => ids.has(it.id) ? { ...it, expected_arrival: v } : it));
    try { await base44.functions.setSupplierArrival({ list_id: activeList !== ALL_ID ? activeList : undefined, supplier_name: supplierName, expected_arrival: v }); } catch { /* ignore */ }
  };

  const groupsFor = (arr) => {
    const q = search.trim().toLowerCase();
    const f = arr.filter(it => !q || (it.name || '').toLowerCase().includes(q));
    const m = new Map();
    const keyOf = groupBy === 'supplier'
      ? (it) => (it.supplier_name || '').trim() || 'ללא ספק'
      : (it) => (it.category || '').trim() || 'כללי';
    f.forEach(it => { const c = keyOf(it); if (!m.has(c)) m.set(c, []); m.get(c).push(it); });
    // When grouping by supplier, sort suppliers alphabetically and put "ללא ספק" last.
    const entries = [...m.entries()];
    if (groupBy === 'supplier') entries.sort((a, b) => (a[0] === 'ללא ספק') - (b[0] === 'ללא ספק') || a[0].localeCompare(b[0], 'he'));
    return entries;
  };
  // Sum of (to-order qty × unit price) for a group — the estimated order cost for that supplier.
  const groupOrderTotal = (arr) => arr.reduce((s, it) => { const q = toOrderOf(it) || 0; const p = numOr(it.price) || 0; return s + q * p; }, 0);

  // ── Admin: catalog editor ──
  const openEdit = () => { setDraft(items.map(it => ({ ...it }))); setEditMode(true); setShowImport(false); };
  const addDraftRow = (category = '') => setDraft(d => [...d, { id: `new_${Date.now()}_${d.length}`, name: '', category, to_prep: false, done: false }]);
  const saveCatalog = async () => {
    setSaving(true);
    try {
      const clean = draft.filter(r => (r.name || '').trim()).map((r, i) => ({ ...r, name: r.name.trim(), category: (r.category || '').trim(), sort: i }));
      await base44.functions.savePrepItems({ list_id: activeList, items: clean });
      setEditMode(false);
      await loadItems(activeList);
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    setSaving(false);
  };
  const runImport = () => {
    const lines = importText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows = []; let cat = '';
    lines.forEach((l, i) => {
      const header = l.match(/^#+\s*(.+)$/) || l.match(/^[-=]{2,}\s*(.+?)\s*[-=]{2,}$/) || (l.endsWith(':') ? [l, l.slice(0, -1)] : null);
      if (header) { cat = header[1].trim(); return; }
      const parts = l.split(/\t|,/).map(s => s.trim());
      rows.push({ id: `imp_${Date.now()}_${i}`, name: parts[0], category: (parts[1] || cat || '').trim(), to_prep: false, done: false });
    });
    setDraft(d => [...d, ...rows]); setImportText(''); setShowImport(false);
  };

  const addList = async () => {
    const name = prompt('שם רשימת ההזמנה (למשל: בר / מטבח / משקאות):');
    if (!name?.trim()) return;
    const res = await base44.functions.saveOrderList({ name: name.trim() });
    const id = (res?.data || res || {}).id;
    await loadLists(id); await loadItems(id);
  };
  const removeList = async () => {
    if (!activeList || !window.confirm('למחוק את רשימת ההזמנה הזו וכל הפריטים בה?')) return;
    await base44.functions.deleteOrderList({ id: activeList });
    const pick = await loadLists(); await loadItems(pick);
  };

  const copyOrder = () => {
    const txt = groupsFor(needed).map(([c, arr]) => `*${c}*\n${arr.map(it => { const q = qtyOf(it); return `• ${it.name}${q ? ` — ${q}` : ''}`; }).join('\n')}`).join('\n\n');
    const full = `🛒 רשימת הזמנה — ${lists.find(l => l.id === activeList)?.name || ''}\n\n${txt}`;
    try { navigator.clipboard.writeText(full); alert('הרשימה הועתקה ✓ אפשר להדביק בוואטסאפ'); } catch { /* noop */ }
  };

  const activeName = activeList === ALL_ID ? 'הכל' : (lists.find(l => l.id === activeList)?.name || '');

  return (
    <div dir="rtl" className="p-4 md:p-6 min-h-screen bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&display=swap');.ol-serif{font-family:'Frank Ruhl Libre',Georgia,serif;}`}</style>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <PageHeader
          title="רשימת הזמנה"
          icon={ShoppingCart}
          action={isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addList}><Plus className="w-4 h-4 ml-1" />רשימה</Button>
              <AiScannerButton target="order_list" onImported={async (s) => { const id = await loadLists(s?.list_id); await loadItems(id); }} />
              <SupplierSplitPanel listId={activeList && activeList !== ALL_ID ? activeList : null} />
              {activeList && activeList !== ALL_ID && !editMode && <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="w-4 h-4 ml-1" />ערוך קטלוג</Button>}
            </div>
          )}
        />

        {/* List tabs */}
        {lists.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {lists.length > 1 && (
              <button onClick={() => { setActiveList(ALL_ID); setEditMode(false); loadItems(ALL_ID); }}
                className="px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition"
                style={activeList === ALL_ID ? { background: W.olive, color: '#fff', borderColor: W.olive } : { background: '#fff', color: W.muted, borderColor: W.border }}>
                🗂 הכל
              </button>
            )}
            {lists.map(l => (
              <button key={l.id} onClick={() => { setActiveList(l.id); setEditMode(false); loadItems(l.id); }}
                className="px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition"
                style={activeList === l.id ? { background: W.olive, color: '#fff', borderColor: W.olive } : { background: '#fff', color: W.muted, borderColor: W.border }}>
                {l.name}
              </button>
            ))}
          </div>
        )}

        {lists.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border-2" style={{ borderColor: W.border, background: '#FFFDF8' }}>
            <ShoppingCart className="w-12 h-12 mx-auto mb-3" style={{ color: W.brass }} />
            <p className="font-bold" style={{ color: W.charcoal }}>אין עדיין רשימות הזמנה</p>
            <p className="text-sm mb-4" style={{ color: W.muted }}>צור רשימה (בר / מטבח / משקאות), בנה קטלוג פריטים, והצוות יסמן מה חסר.</p>
            {isAdmin && <Button onClick={addList} style={{ background: W.terracotta, color: '#fff' }}><Plus className="w-4 h-4 ml-1" />צור רשימה ראשונה</Button>}
          </div>
        ) : editMode ? (
          /* ── Catalog editor (admin) ── */
          <div className="rounded-2xl border-2 p-4 space-y-3" style={{ borderColor: W.border, background: '#FFFDF8' }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold" style={{ color: W.charcoal }}>עריכת קטלוג — {activeName}</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowImport(s => !s)}><Upload className="w-4 h-4 ml-1" />ייבוא</Button>
                <Button size="sm" variant="outline" className="text-red-600 border-red-300" onClick={removeList}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
            {showImport && (
              <div className="rounded-xl p-3 space-y-2" style={{ background: W.cream, border: `1px solid ${W.border}` }}>
                <p className="text-xs" style={{ color: W.muted }}>שורה לכל מוצר. כותרת קטגוריה: שורה שמסתיימת ב-":" או שמתחילה ב-#. אפשר גם "שם, קטגוריה".</p>
                <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={7} dir="rtl" className="w-full rounded-lg border p-2 text-sm" style={{ borderColor: W.border }} placeholder={'יין אדום:\nרזרב מרלו\nקברנה סוביניון\n\nבירה:\nגולדסטאר חבית'} />
                <Button size="sm" onClick={runImport} disabled={!importText.trim()} style={{ background: W.olive, color: '#fff' }}>הוסף לקטלוג</Button>
              </div>
            )}
            <div className="space-y-2 max-h-[55vh] overflow-y-auto">
              {draft.map((r, i) => (
                <div key={r.id} className="flex gap-2 items-center">
                  <Input value={r.name} onChange={e => setDraft(d => d.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="שם מוצר" className="flex-1" />
                  <Input value={r.category || ''} onChange={e => setDraft(d => d.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} placeholder="קטגוריה" className="w-28" />
                  <Input type="number" value={r.target ?? ''} onChange={e => setDraft(d => d.map((x, j) => j === i ? { ...x, target: e.target.value } : x))} placeholder="יעד" className="w-16" title="כמה צריך במלאי" />
                  <button onClick={() => setDraft(d => d.filter((_, j) => j !== i))} className="text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => addDraftRow()}><Plus className="w-4 h-4 ml-1" />שורה</Button>
              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>ביטול</Button>
              <Button size="sm" onClick={saveCatalog} disabled={saving} style={{ background: W.terracotta, color: '#fff' }}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור קטלוג'}</Button>
            </div>
          </div>
        ) : (
          <>
            {/* Mark ↔ Live toggle */}
            <div className="flex rounded-xl overflow-hidden border-2" style={{ borderColor: W.border }}>
              <button onClick={() => setView('mark')} className="flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 transition"
                style={view === 'mark' ? { background: W.olive, color: '#fff' } : { background: '#fff', color: W.muted }}>
                <ListChecks className="w-4 h-4" /> סימון חוסרים
              </button>
              <button onClick={() => setView('live')} className="flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 transition"
                style={view === 'live' ? { background: W.terracotta, color: '#fff' } : { background: '#fff', color: W.muted }}>
                <ShoppingCart className="w-4 h-4" /> רשימת הזמנה
                {needed.length > 0 && <span className="text-xs rounded-full px-1.5 py-0.5" style={{ background: view === 'live' ? '#fff' : W.terracotta, color: view === 'live' ? W.terracotta : '#fff' }}>{needed.length}</span>}
              </button>
            </div>

            {/* Group-by: קטגוריה ↔ ספק */}
            <div className="flex items-center gap-2 text-xs" style={{ color: W.muted }}>
              <span className="font-semibold">קיבוץ:</span>
              <button onClick={() => setGroup('category')} className="px-2.5 py-1 rounded-full border font-semibold transition"
                style={groupBy === 'category' ? { background: W.olive, color: '#fff', borderColor: W.olive } : { background: '#fff', borderColor: W.border, color: W.muted }}>📦 קטגוריה</button>
              <button onClick={() => setGroup('supplier')} className="px-2.5 py-1 rounded-full border font-semibold transition"
                style={groupBy === 'supplier' ? { background: W.olive, color: '#fff', borderColor: W.olive } : { background: '#fff', borderColor: W.border, color: W.muted }}>🏷 ספק</button>
            </div>

            {loading ? (
              <div className="text-center py-12"><Loader2 className="w-7 h-7 animate-spin mx-auto" style={{ color: W.brass }} /></div>
            ) : view === 'mark' ? (
              /* ── Mark view — full catalog, tap to flag ── */
              <div className="space-y-4">
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: W.muted }} />
                    <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מוצר..." className="pr-9" />
                  </div>
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={toggleLock} title="נעילת עמודת היעד (כמה צריך במלאי)"
                      className="shrink-0" style={parLocked ? {} : { borderColor: W.terracotta, color: W.terracotta }}>
                      {parLocked ? '🔒 יעד נעול' : '🔓 יעד פתוח'}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] -mt-2" style={{ color: W.muted }}>הזן <b>יעד</b> (כמה צריך במלאי) ו<b>יש</b> (כמה יש בפועל) — המערכת תחשב לבד כמה להזמין ותעביר לרשימת ההזמנה.</p>
                {items.length === 0 ? (
                  <p className="text-center text-sm py-8" style={{ color: W.muted }}>הקטלוג ריק. {isAdmin ? 'לחץ "ערוך קטלוג" כדי להוסיף מוצרים.' : 'המנהל עדיין לא הוסיף מוצרים.'}</p>
                ) : groupsFor(items).map(([cat, arr]) => (
                  <div key={cat} className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: W.border, background: '#FFFDF8' }}>
                    <div className="px-3 py-2 text-sm flex items-center justify-between gap-2 flex-wrap" style={{ background: W.creamCard, color: W.terracotta }}>
                      <span className="font-bold">{cat} <span className="font-normal opacity-60">· {arr.length}</span></span>
                      {groupBy === 'supplier' && (
                        <div className="flex items-center gap-3 flex-wrap">
                          {groupOrderTotal(arr) > 0 && <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: W.olive }}>הזמנה ≈ ₪{Math.round(groupOrderTotal(arr)).toLocaleString()}</span>}
                          {isAdmin && cat !== 'ללא ספק' && <SupplierMinCell name={cat} currentMin={supMinOf(cat)} orderTotal={groupOrderTotal(arr)} onSave={(v) => saveSupplierMin(cat, v)} />}
                          {isAdmin && cat !== 'ללא ספק' && (
                            <label className="flex items-center gap-1 text-[11px] font-normal" style={{ color: W.muted }} title="תאריך הגעת ההזמנה מהספק (לכל ההזמנה)">
                              🚚 הגעה
                              <input type="date" value={arr.find(x => x.expected_arrival)?.expected_arrival || ''} onClick={e => e.stopPropagation()}
                                onChange={e => setGroupArrival(cat, arr, e.target.value)}
                                className="h-6 rounded border px-1 text-xs" style={{ borderColor: W.border, background: '#fff' }} />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="divide-y" style={{ borderColor: W.border }}>
                      {arr.map(it => {
                        const to = toOrderOf(it); const need = neededOf(it);
                        return (
                        <div key={it.id} className="px-3 py-2.5 space-y-2" style={need ? { background: '#FCF6EE' } : {}}>
                          <div className="flex items-center gap-2">
                            <button onClick={() => toggleNeeded(it)} title="הוסף ידנית לרשימה"
                              className="w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition"
                              style={it.to_prep ? { background: W.terracotta, borderColor: W.terracotta } : { borderColor: '#cbb98f' }}>
                              {it.to_prep && <Check className="w-4 h-4 text-white" />}
                            </button>
                            <span className="flex-1 text-sm font-medium" style={{ color: need ? W.terracotta : W.charcoal }}>{it.name}{groupBy === 'supplier' && it.category ? <span className="mr-1 text-[10px] font-normal" style={{ color: W.muted }}>· {it.category}</span> : (groupBy === 'category' && it.supplier_name ? <span className="mr-1 text-[10px] font-normal" style={{ color: W.muted }}>· {it.supplier_name}</span> : null)}</span>
                            {it.ordered_pending
                              ? <span className="text-[10px] font-bold rounded-full px-2 py-0.5 shrink-0" style={{ background: '#E8F0E0', color: W.olive }}>🚚 הוזמן{it.last_ordered_qty ? ` ×${it.last_ordered_qty}` : ''}{it.expected_arrival ? ` · מגיע ${it.expected_arrival}` : ''}</span>
                              : (to > 0 && <span className="text-xs font-bold rounded-full px-2 py-0.5 shrink-0" style={{ background: W.terracotta, color: '#fff' }}>להזמין {to}</span>)}
                          </div>
                          <div className="flex items-center gap-3 pr-8">
                            <label className="flex items-center gap-1 text-[11px]" style={{ color: W.muted }}>
                              יעד
                              <input type="number" inputMode="decimal" value={it.target ?? ''} disabled={parLocked}
                                onChange={e => setPar(it, e.target.value)} onBlur={() => commitPar(it)}
                                className="w-14 h-7 rounded-md border px-1 text-center text-sm disabled:bg-gray-100 disabled:text-gray-400" style={{ borderColor: W.border }} />
                              {parLocked && <span className="opacity-40 text-[10px]">🔒</span>}
                            </label>
                            <label className="flex items-center gap-1 text-[11px]" style={{ color: W.muted }}>
                              יש
                              <input type="number" inputMode="decimal" value={it.have ?? ''}
                                onChange={e => setCur(it, e.target.value)} onBlur={() => commitCur(it)}
                                className="w-14 h-7 rounded-md border px-1 text-center text-sm" style={{ borderColor: W.border, background: '#fff' }} />
                            </label>
                            <label className="flex items-center gap-1 text-[11px]" style={{ color: W.muted }} title="מחיר ליחידה — לחישוב סה״כ ומינימום הזמנה לספק">
                              ₪
                              <input type="number" inputMode="decimal" value={it.price ?? ''}
                                onChange={e => setPrice(it, e.target.value)} onBlur={() => commitPrice(it)}
                                placeholder="מחיר" className="w-16 h-7 rounded-md border px-1 text-center text-sm" style={{ borderColor: W.border, background: '#fff' }} />
                            </label>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Live order list — only flagged items ── */
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold" style={{ color: W.muted }}>{needed.length} פריטים להזמנה</p>
                  {needed.length > 0 && <Button size="sm" variant="outline" onClick={copyOrder}><Copy className="w-4 h-4 ml-1" />העתק לוואטסאפ</Button>}
                </div>
                {needed.length === 0 ? (
                  <div className="text-center py-14 rounded-2xl border-2" style={{ borderColor: W.border, background: '#FFFDF8' }}>
                    <span className="text-4xl">✅</span>
                    <p className="font-bold mt-2" style={{ color: W.olive }}>אין חוסרים כרגע</p>
                    <p className="text-sm" style={{ color: W.muted }}>סמן פריטים בלשונית "סימון חוסרים" והם יופיעו כאן בזמן אמת.</p>
                  </div>
                ) : groupsFor(needed).map(([cat, arr]) => (
                  <div key={cat} className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: W.border, background: '#FFFDF8' }}>
                    <div className="px-3 py-2 text-sm flex items-center justify-between gap-2 flex-wrap" style={{ background: W.creamCard, color: W.terracotta }}>
                      <span className="font-bold">{cat} <span className="font-normal opacity-60">· {arr.length}</span></span>
                      {groupBy === 'supplier' && (
                        <div className="flex items-center gap-3 flex-wrap">
                          {groupOrderTotal(arr) > 0 && <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: W.olive }}>≈ ₪{Math.round(groupOrderTotal(arr)).toLocaleString()}</span>}
                          {isAdmin && cat !== 'ללא ספק' && <SupplierMinCell name={cat} currentMin={supMinOf(cat)} orderTotal={groupOrderTotal(arr)} onSave={(v) => saveSupplierMin(cat, v)} />}
                          {isAdmin && cat !== 'ללא ספק' && (
                            <label className="flex items-center gap-1 text-[11px] font-normal" style={{ color: W.muted }} title="תאריך הגעת ההזמנה מהספק (לכל ההזמנה)">
                              🚚 הגעה
                              <input type="date" value={arr.find(x => x.expected_arrival)?.expected_arrival || ''} onClick={e => e.stopPropagation()}
                                onChange={e => setGroupArrival(cat, arr, e.target.value)}
                                className="h-6 rounded border px-1 text-xs" style={{ borderColor: W.border, background: '#fff' }} />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="divide-y" style={{ borderColor: W.border }}>
                      {arr.map(it => (
                        <div key={it.id} className="flex items-center gap-2 px-3 py-2.5">
                          <span className="flex-1 text-sm font-semibold" style={{ color: W.charcoal }}>{it.name}{groupBy === 'supplier' && it.category ? <span className="mr-1 text-[10px] font-normal" style={{ color: W.muted }}>· {it.category}</span> : (groupBy === 'category' && it.supplier_name ? <span className="mr-1 text-[10px] font-normal" style={{ color: W.muted }}>· {it.supplier_name}</span> : null)}</span>
                          <label className="flex items-center gap-1 text-[11px]" style={{ color: W.muted }}>
                            כמות
                            <Input value={it.note || ''} onChange={e => setNote(it, e.target.value)} onBlur={() => commitNote(it)}
                              placeholder={toOrderOf(it) ? String(toOrderOf(it)) : '—'} className="w-16 h-8 text-sm text-center" />
                          </label>
                          <button onClick={() => toggleOrdered(it)} title="סמן כהוזמן" className="text-xs font-bold rounded-lg px-2.5 py-1.5 border transition shrink-0" style={{ borderColor: W.olive, color: W.olive }}>הוזמן ✓</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function OrderListPage() {
  return (
    <PageGuard pageName="OrderList" pageTitle="רשימת הזמנה">
      <OrderListInner />
    </PageGuard>
  );
}
