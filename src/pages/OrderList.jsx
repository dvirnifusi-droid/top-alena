// Order List — works like the Prep List, but for ORDERING. Staff tap items from
// a general catalog to mark "צריך להזמין" (needs ordering); a live dedicated view
// aggregates only the flagged items = the order to place. Reuses the PrepItem
// backend (to_prep = needed, done = ordered) via the order-list fns.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { User } from '@/entities/all';
import PageGuard from '../components/shared/PageGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Trash2, ListChecks, ShoppingCart, Search, Check, Copy, Upload, Pencil } from 'lucide-react';

const W = { terracotta: '#A04A2E', olive: '#44512C', brass: '#B89556', cream: '#FAF5E8', creamCard: '#F4ECD8', border: '#E8D9B5', charcoal: '#1F1B17', muted: '#7A6F5D' };

function OrderListInner() {
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState('mark'); // 'mark' | 'live'
  const [search, setSearch] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState([]); // catalog editor rows
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [saving, setSaving] = useState(false);
  const lastInteractionRef = useRef(0);

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
      const res = await base44.functions.getPrepItems(listId ? { list_id: listId } : {});
      const data = res?.data || res || {};
      setItems(Array.isArray(data.items) ? data.items.map((it, i) => ({ ...it, sort: it.sort ?? i })) : []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fp = (arr) => (arr || []).map(x => `${x.id}|${x.to_prep}|${x.done}|${x.note}|${x.name}|${x.category}`).join('§');
  const refreshSilent = async (listId) => {
    if (!listId) return;
    try {
      const res = await base44.functions.getPrepItems({ list_id: listId });
      const next = ((res?.data || res || {}).items || []).map((it, i) => ({ ...it, sort: it.sort ?? i }));
      setItems(prev => (Date.now() - lastInteractionRef.current < 6000) ? prev : (fp(prev) === fp(next) ? prev : next));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    (async () => {
      try { const u = await User.me(); setIsAdmin(u?.role === 'admin' || u?.role === 'owner' || !!u?.managed_department); } catch { /* staff */ }
      const pick = await loadLists();
      await loadItems(pick);
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

  const needed = useMemo(() => items.filter(i => i.to_prep && !i.done), [items]);

  const groupsFor = (arr) => {
    const q = search.trim().toLowerCase();
    const f = arr.filter(it => !q || (it.name || '').toLowerCase().includes(q));
    const m = new Map();
    f.forEach(it => { const c = (it.category || '').trim() || 'כללי'; if (!m.has(c)) m.set(c, []); m.get(c).push(it); });
    return [...m.entries()];
  };

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
    const txt = groupsFor(needed).map(([c, arr]) => `*${c}*\n${arr.map(it => `• ${it.name}${it.note ? ` — ${it.note}` : ''}`).join('\n')}`).join('\n\n');
    const full = `🛒 רשימת הזמנה — ${lists.find(l => l.id === activeList)?.name || ''}\n\n${txt}`;
    try { navigator.clipboard.writeText(full); alert('הרשימה הועתקה ✓ אפשר להדביק בוואטסאפ'); } catch { /* noop */ }
  };

  const activeName = lists.find(l => l.id === activeList)?.name || '';

  return (
    <div dir="rtl" className="p-4 md:p-6 min-h-screen" style={{ background: 'linear-gradient(180deg,#FBF7EE 0%,#F4ECD8 100%)' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700&display=swap');.ol-serif{font-family:'Frank Ruhl Libre',Georgia,serif;}`}</style>
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="ol-serif text-2xl font-bold flex items-center gap-2" style={{ color: W.terracotta }}>
            <ShoppingCart className="w-6 h-6" /> רשימת הזמנה
          </h1>
          {isAdmin && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={addList}><Plus className="w-4 h-4 ml-1" />רשימה</Button>
              {activeList && !editMode && <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="w-4 h-4 ml-1" />ערוך קטלוג</Button>}
            </div>
          )}
        </div>

        {/* List tabs */}
        {lists.length > 0 && (
          <div className="flex gap-2 flex-wrap">
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
                  <Input value={r.category || ''} onChange={e => setDraft(d => d.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} placeholder="קטגוריה" className="w-32" />
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

            {loading ? (
              <div className="text-center py-12"><Loader2 className="w-7 h-7 animate-spin mx-auto" style={{ color: W.brass }} /></div>
            ) : view === 'mark' ? (
              /* ── Mark view — full catalog, tap to flag ── */
              <div className="space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2" style={{ color: W.muted }} />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש מוצר..." className="pr-9" />
                </div>
                {items.length === 0 ? (
                  <p className="text-center text-sm py-8" style={{ color: W.muted }}>הקטלוג ריק. {isAdmin ? 'לחץ "ערוך קטלוג" כדי להוסיף מוצרים.' : 'המנהל עדיין לא הוסיף מוצרים.'}</p>
                ) : groupsFor(items).map(([cat, arr]) => (
                  <div key={cat} className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: W.border, background: '#FFFDF8' }}>
                    <div className="px-3 py-2 font-bold text-sm" style={{ background: W.creamCard, color: W.terracotta }}>{cat}</div>
                    <div className="divide-y" style={{ borderColor: W.border }}>
                      {arr.map(it => (
                        <button key={it.id} onClick={() => toggleNeeded(it)} className="w-full flex items-center gap-3 px-3 py-2.5 text-right transition hover:bg-black/[.02]">
                          <span className="w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition"
                            style={it.to_prep ? { background: W.terracotta, borderColor: W.terracotta } : { borderColor: '#cbb98f' }}>
                            {it.to_prep && <Check className="w-4 h-4 text-white" />}
                          </span>
                          <span className="flex-1 text-sm font-medium" style={{ color: it.to_prep ? W.terracotta : W.charcoal }}>{it.name}</span>
                        </button>
                      ))}
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
                    <div className="px-3 py-2 font-bold text-sm" style={{ background: W.creamCard, color: W.terracotta }}>{cat} · {arr.length}</div>
                    <div className="divide-y" style={{ borderColor: W.border }}>
                      {arr.map(it => (
                        <div key={it.id} className="flex items-center gap-2 px-3 py-2.5">
                          <span className="flex-1 text-sm font-semibold" style={{ color: W.charcoal }}>{it.name}</span>
                          <Input value={it.note || ''} onChange={e => setNote(it, e.target.value)} onBlur={() => commitNote(it)} placeholder="כמות" className="w-20 h-8 text-sm" />
                          <button onClick={() => toggleOrdered(it)} title="סמן כהוזמן" className="text-xs font-bold rounded-lg px-2.5 py-1.5 border transition" style={{ borderColor: W.olive, color: W.olive }}>הוזמן ✓</button>
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
