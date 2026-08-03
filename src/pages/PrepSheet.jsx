// Prep Sheet — per-tenant mise-en-place, grouped by dish, with multiple named
// lists (בוקר/ערב/תחנה...) and a per-day archive.
// Flow: the manager builds a list (item + how much you HAVE + how much to PREP)
// and flags which items need making ("לסמן"). Cooks work the list: mark "בוצע"
// when done — stamping WHO + WHEN + an optional photo. "יום חדש" snapshots the
// list into the archive (history) and clears it for the next day. A summary at
// the top shows overall status; search + "רק שנשאר" narrow a long list.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { User } from '@/entities/User';
import { UploadFile } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import TimePicker from '@/components/shared/TimePicker';
import PageHeader from '@/components/shared/PageHeader';
import { ChefHat, Plus, Trash2, Save, RotateCcw, Upload, Loader2, Check, Camera, Search, History, Pencil, X, Printer, Share2, StickyNote, Bell, ChevronDown } from 'lucide-react';

const fmtWhen = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};
const fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return ''; }
};

export default function PrepSheet() {
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [me, setMe] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [search, setSearch] = useState('');
  const [onlyRemaining, setOnlyRemaining] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState({}); // accordion — category → collapsed?
  const toggleCat = (cat) => setCollapsedCats((p) => ({ ...p, [cat]: !p[cat] }));
  const [showArchive, setShowArchive] = useState(false);
  const [archive, setArchive] = useState([]);
  const [openSnap, setOpenSnap] = useState(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderTime, setReminderTime] = useState('15:00');
  const [showReminderCfg, setShowReminderCfg] = useState(false);
  const [savingReminder, setSavingReminder] = useState(false);

  // Records the last time the cook touched a field, so the live poll never
  // clobbers a value that's mid-typing / just-toggled.
  const lastInteractionRef = useRef(0);
  const markInteraction = () => { lastInteractionRef.current = Date.now(); };

  const loadItems = async (listId) => {
    setLoading(true);
    try {
      const res = await base44.functions.getPrepItems(listId ? { list_id: listId } : {});
      const data = res?.data || res || {};
      setItems(Array.isArray(data.items) ? data.items.map((it, i) => ({ ...it, sort: it.sort ?? i })) : []);
    } catch (e) { console.warn('load prep', e); }
    setLoading(false);
  };

  // Silent live refresh — no spinner, skips when a local edit is in flight, and
  // only re-renders when something actually changed (fingerprint). This is what
  // lets a second cook / the kitchen manager see marks appear on their own.
  const prepFp = (arr) => (arr || []).map((x) => `${x.id}|${x.have}|${x.prep}|${x.to_prep}|${x.done}|${x.done_by}|${x.photo_url}|${x.note}|${x.name}|${x.category}`).join('§');
  const refreshItemsSilent = async (listId) => {
    if (!listId) return;
    try {
      const res = await base44.functions.getPrepItems({ list_id: listId });
      const data = res?.data || res || {};
      const next = Array.isArray(data.items) ? data.items.map((it, i) => ({ ...it, sort: it.sort ?? i })) : [];
      setItems((prev) => {
        if (Date.now() - lastInteractionRef.current < 6000) return prev; // don't clobber a fresh local edit
        return prepFp(prev) === prepFp(next) ? prev : next;
      });
    } catch { /* ignore poll errors */ }
  };

  const loadLists = async (preferId) => {
    try {
      const res = await base44.functions.getPrepLists({});
      const data = res?.data || res || {};
      const ls = Array.isArray(data.lists) ? data.lists : [];
      setLists(ls);
      const pick = (preferId && ls.some((l) => l.id === preferId)) ? preferId
        : (activeList && ls.some((l) => l.id === activeList)) ? activeList
        : (ls[0]?.id || null);
      setActiveList(pick);
      return pick;
    } catch (e) { console.warn('load lists', e); return null; }
  };

  useEffect(() => {
    (async () => {
      try { const u = await User.me(); setMe(u); setIsAdmin(u?.role === 'admin' || u?.role === 'owner' || !!u?.managed_department); } catch { /* staff */ }
      try { const s = await base44.functions.getAppSettings({}); const d = s?.data || s || {}; setReminderOn(!!d.prep_reminder_enabled); setReminderTime(d.prep_reminder_time || '15:00'); } catch { /* defaults */ }
      const pick = await loadLists();
      await loadItems(pick);
    })();
  }, []);

  // Live sync — every 12s (and the moment the page regains focus) pull the
  // latest marks so cooks + the kitchen manager all see the same picture. Paused
  // while editing the product list or right after a local change.
  useEffect(() => {
    if (!activeList) return;
    const tick = () => {
      if (document.hidden || editMode) return;
      if (Date.now() - lastInteractionRef.current < 6000) return;
      refreshItemsSilent(activeList);
    };
    const interval = setInterval(tick, 12000);
    const onVisible = () => { if (!document.hidden && !editMode && Date.now() - lastInteractionRef.current > 3000) refreshItemsSilent(activeList); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeList, editMode]);

  const saveReminder = async () => {
    setSavingReminder(true);
    try { await base44.functions.setAppSettings({ prep_reminder_enabled: reminderOn, prep_reminder_time: reminderTime }); setShowReminderCfg(false); }
    catch (e) { console.warn('save reminder', e); }
    setSavingReminder(false);
  };

  const switchList = async (id) => {
    if (id === activeList) return;
    setEditMode(false); setShowImport(false); setShowArchive(false);
    setActiveList(id);
    await loadItems(id);
  };

  const activeName = useMemo(() => lists.find((l) => l.id === activeList)?.name || '', [lists, activeList]);
  // Per-category batch multiplier ("מתכון כפול"): base "להכין" qty × multiplier,
  // stored on the list (shared with the cook). scaleQty parses "10 ק\"ג" → 20.
  const catMultipliers = useMemo(() => lists.find((l) => l.id === activeList)?.category_multipliers || {}, [lists, activeList]);
  const setCatMult = async (cat, mult) => {
    const m = Number(mult);
    if (!Number.isFinite(m) || m <= 0) return;
    setLists((prev) => prev.map((l) => (l.id === activeList ? { ...l, category_multipliers: { ...(l.category_multipliers || {}), [cat]: m } } : l)));
    try { await base44.functions.setPrepCategoryMultiplier({ list_id: activeList, category: cat, multiplier: m }); }
    catch { loadLists(activeList); }
  };
  const scaleQty = (baseStr, mult) => {
    const s = String(baseStr || '').trim();
    if (!s || !mult || Number(mult) === 1) return null;
    const mm = s.match(/^([\d.]+)\s*(.*)$/);
    if (!mm) return null;
    const n = parseFloat(mm[1]);
    if (!Number.isFinite(n)) return null;
    return `${Math.round(n * Number(mult) * 100) / 100}${mm[2] ? ' ' + mm[2] : ''}`;
  };

  // search + "only remaining" filter, then group by dish/category.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter((it) => {
      if (onlyRemaining && !(it.to_prep && !it.done)) return false;
      if (q && !String(it.name || '').toLowerCase().includes(q)) return false;
      return true;
    });
    const m = new Map();
    for (const it of filtered) { const c = it.category || 'כללי'; if (!m.has(c)) m.set(c, []); m.get(c).push(it); }
    return [...m.entries()];
  }, [items, search, onlyRemaining]);

  const summary = useMemo(() => {
    const total = items.length;
    const toPrep = items.filter((i) => i.to_prep).length;
    const doneToPrep = items.filter((i) => i.to_prep && i.done).length;
    const remaining = items.filter((i) => i.to_prep && !i.done);
    return { total, toPrep, doneToPrep, remaining };
  }, [items]);

  const patch = (id, field, val) => { markInteraction(); setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: val } : it))); };

  const saveOne = async (it) => {
    try {
      await base44.functions.updatePrepItem({ id: it.id, have: it.have, prep: it.prep, to_prep: it.to_prep, done: it.done, photo_url: it.photo_url, note: it.note });
    } catch (e) { console.warn('save prep row', e); }
  };

  // Print (kitchen wall) + share (WhatsApp / native share) the active list.
  const doPrint = () => { try { window.print(); } catch (e) { console.warn('print', e); } };
  const buildShareText = () => {
    const lines = [`🍳 דף הכנות — ${activeName}`, ''];
    for (const [cat, rows] of groups) {
      lines.push(`▪ ${cat}`);
      for (const it of rows) {
        const status = it.done ? '✅' : (it.to_prep ? '⬜' : '');
        lines.push(`  • ${it.name}${it.prep ? ` — ${it.prep}` : ''}${status ? ` ${status}` : ''}${it.note ? `  (${it.note})` : ''}`);
      }
      lines.push('');
    }
    return lines.join('\n').trim();
  };
  const doShare = async () => {
    const text = buildShareText();
    try { if (navigator.share) { await navigator.share({ title: `דף הכנות — ${activeName}`, text }); return; } } catch { /* cancelled / unsupported */ }
    try { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); } catch (e) { console.warn('share', e); }
  };

  const toggle = (it, field) => {
    markInteraction();
    const nv = !it[field];
    let next = { ...it, [field]: nv };
    if (field === 'done') {
      next = nv
        ? { ...next, done_by: me?.full_name || me?.email || 'עובד', done_at: new Date().toISOString() }
        : { ...next, done_by: null, done_at: null };
    }
    setItems((prev) => prev.map((x) => (x.id === it.id ? next : x)));
    if (!editMode) saveOne(next);
  };

  const attachPhoto = async (it, file) => {
    if (!file) return;
    setUploadingId(it.id);
    try {
      const { file_url } = await UploadFile({ file });
      const next = { ...it, photo_url: file_url };
      setItems((prev) => prev.map((x) => (x.id === it.id ? next : x)));
      await saveOne(next);
    } catch (e) { console.warn('prep photo', e); }
    setUploadingId(null);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      await base44.functions.savePrepItems({ list_id: activeList, items: items.map((it, i) => ({ ...it, sort: i })) });
      await loadItems(activeList);
      setEditMode(false);
    } catch (e) { console.warn('save all', e); }
    setSaving(false);
  };

  const addRow = () => setItems((prev) => [...prev, { id: `new_${Date.now()}_${prev.length}`, name: '', category: 'הכנות', unit: '', target: '', have: '', prep: '', to_prep: false, done: false, note: '', sort: prev.length }]);
  const delRow = (id) => setItems((prev) => prev.filter((it) => it.id !== id));

  const resetCounts = async () => {
    if (!window.confirm(`"${activeName}" — לסגור את היום? הרשימה תישמר בהיסטוריה והסימונים יתאפסו (המוצרים נשארים).`)) return;
    try { await base44.functions.resetPrepCounts({ list_id: activeList }); await loadItems(activeList); } catch (e) { console.warn('reset', e); }
  };

  // ── lists management (admin) ──
  const addList = async () => {
    const name = window.prompt('שם הרשימה החדשה (למשל: הכנות בוקר):', '');
    if (!name || !name.trim()) return;
    try { const res = await base44.functions.savePrepList({ name: name.trim() }); const id = res?.data?.id || res?.id; await loadLists(id); await loadItems(id); }
    catch (e) { console.warn('add list', e); }
  };
  const renameList = async () => {
    const name = window.prompt('שם חדש לרשימה:', activeName);
    if (!name || !name.trim()) return;
    try { await base44.functions.savePrepList({ id: activeList, name: name.trim() }); await loadLists(activeList); }
    catch (e) { console.warn('rename list', e); }
  };
  const deleteList = async () => {
    if (lists.length <= 1) { window.alert('חייבת להישאר לפחות רשימה אחת.'); return; }
    if (!window.confirm(`למחוק את הרשימה "${activeName}" וכל הפריטים שבה?`)) return;
    try { await base44.functions.deletePrepList({ id: activeList }); const pick = await loadLists(); await loadItems(pick); }
    catch (e) { console.warn('delete list', e); }
  };

  const openArchive = async () => {
    setShowArchive(true); setOpenSnap(null);
    try { const res = await base44.functions.getPrepArchive({ list_id: activeList }); const data = res?.data || res || {}; setArchive(Array.isArray(data.archive) ? data.archive : []); }
    catch (e) { console.warn('archive', e); setArchive([]); }
  };

  // Import: dish headers group items; a line with "*" is an item under the
  // current dish. Title / legend / note lines are skipped. If no "*" at all,
  // every line is a flat item (optionally "name — qty").
  const runImport = async () => {
    const lines = importText.split('\n').map((l) => l.trim()).filter(Boolean);
    const isJunk = (l) => /^(מפתח|key\b|prep for tomorrow|הכנות לבוקר|רכיבים משותפים|have\s*=|prep\s*=|✓\s*=)/i.test(l);
    const clean = lines.filter((l) => !isJunk(l));
    const hasStars = clean.some((l) => l.includes('*'));
    const parsed = [];
    let cat = 'הכנות';
    for (const line of clean) {
      if (hasStars) {
        const isItem = line.includes('*');
        const name = line.replace(/\*/g, '').replace(/\s{2,}/g, ' ').trim();
        if (!name) continue;
        if (isItem) parsed.push({ name, category: cat, have: '', prep: '', to_prep: false, done: false, sort: parsed.length });
        else cat = name;
      } else {
        const m = line.match(/^(.+?)[\s:–-]+(\d[\d.,]*\s*.*)$/);
        if (m) parsed.push({ name: m[1].trim(), target: m[2].trim(), category: cat, have: '', prep: '', to_prep: false, done: false, sort: parsed.length });
        else parsed.push({ name: line, category: cat, have: '', prep: '', to_prep: false, done: false, sort: parsed.length });
      }
    }
    if (!parsed.length) return;
    setSaving(true);
    try { await base44.functions.savePrepItems({ list_id: activeList, items: parsed }); setShowImport(false); setImportText(''); await loadItems(activeList); }
    catch (e) { console.warn('import', e); }
    setSaving(false);
  };

  const pct = summary.toPrep ? Math.round((summary.doneToPrep / summary.toPrep) * 100) : 0;

  return (
    <div dir="rtl" className="p-4 sm:p-8 bg-gradient-to-br from-orange-50 to-amber-50 min-h-screen">
      {/* Print: show only the list, drop chrome. Inline (ships in JS, not the CSS bundle). */}
      <style>{`@media print { .no-print { display: none !important; } body { background: #fff !important; } .prep-card { break-inside: avoid; } }`}</style>
      <div className="max-w-4xl mx-auto">
        <PageHeader title="דף הכנות" icon={ChefHat} action={(
          <div className="flex items-center gap-2 flex-wrap no-print">
            <Button variant="outline" size="sm" onClick={doShare} title="שתף בוואטסאפ"><Share2 className="w-4 h-4 ml-1" /> שתף</Button>
            <Button variant="outline" size="sm" onClick={doPrint} title="הדפס לתלייה במטבח"><Printer className="w-4 h-4 ml-1" /> הדפס</Button>
            <Button variant="outline" size="sm" onClick={openArchive}><History className="w-4 h-4 ml-1" /> היסטוריה</Button>
            {isAdmin && <Button variant="outline" size="sm" onClick={() => setShowReminderCfg((v) => !v)} className={reminderOn ? 'border-orange-400 text-orange-700' : ''}><Bell className="w-4 h-4 ml-1" /> תזכורת</Button>}
            {isAdmin && <Button variant="outline" size="sm" onClick={resetCounts}><RotateCcw className="w-4 h-4 ml-1" /> יום חדש</Button>}
            {isAdmin && <Button variant="outline" size="sm" onClick={() => setShowImport((v) => !v)}><Upload className="w-4 h-4 ml-1" /> ייבוא</Button>}
            {isAdmin && (editMode
              ? <Button size="sm" onClick={saveAll} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 ml-1" /> שמור</>}</Button>
              : <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>ערוך מוצרים</Button>)}
          </div>
        )} />

        {/* Daily reminder config (admin) */}
        {showReminderCfg && isAdmin && (
          <Card className="mb-4 border-orange-200 no-print">
            <CardContent className="py-3 flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={reminderOn} onChange={(e) => setReminderOn(e.target.checked)} className="w-4 h-4 accent-orange-600" />
                שלח תזכורת יומית (וואטסאפ/פוש למנהלים) על הכנות שסומנו ולא בוצעו
              </label>
              <div className="flex items-center gap-1 text-sm text-gray-600">בשעה
                <TimePicker value={reminderTime} onChange={(v) => setReminderTime(v)} />
              </div>
              <Button size="sm" onClick={saveReminder} disabled={savingReminder} className="bg-orange-600 hover:bg-orange-700 text-white">{savingReminder ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שמור'}</Button>
              <span className="text-xs text-gray-400">התזכורת נשלחת פעם ביום, רק אם נשארו הכנות פתוחות.</span>
            </CardContent>
          </Card>
        )}

        {/* List tabs */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap no-print">
          {lists.map((l) => (
            <button key={l.id} onClick={() => switchList(l.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${l.id === activeList ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-gray-200 text-slate-600 hover:border-orange-300'}`}>
              {l.name}
            </button>
          ))}
          {isAdmin && (
            <>
              <button onClick={addList} title="רשימה חדשה" className="px-2.5 py-1.5 rounded-full text-sm border border-dashed border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-600"><Plus className="w-4 h-4" /></button>
              {activeList && <button onClick={renameList} title="שנה שם" className="text-gray-400 hover:text-orange-600 p-1"><Pencil className="w-4 h-4" /></button>}
              {activeList && lists.length > 1 && <button onClick={deleteList} title="מחק רשימה" className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>}
            </>
          )}
        </div>

        {/* Archive (history) */}
        {showArchive && (
          <Card className="mb-4 border-orange-200">
            <CardHeader className="flex flex-row items-center justify-between py-3">
              <CardTitle className="text-base flex items-center gap-2"><History className="w-4 h-4" /> היסטוריית ימים — {activeName}</CardTitle>
              <button onClick={() => setShowArchive(false)} className="text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
            </CardHeader>
            <CardContent className="space-y-2">
              {archive.length === 0 ? <p className="text-sm text-gray-500 py-4 text-center">עדיין אין ימים שמורים. הם נשמרים כשלוחצים "יום חדש".</p> : archive.map((a) => (
                <div key={a.id} className="border rounded-lg overflow-hidden">
                  <button onClick={() => setOpenSnap(openSnap === a.id ? null : a.id)} className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-sm">
                    <span className="font-semibold text-slate-700">{fmtDate(a.archived_at)} · {fmtWhen(a.archived_at).split(' ').pop()}</span>
                    <span className="text-xs text-gray-500">{a.done_count}/{a.item_count} בוצעו</span>
                  </button>
                  {openSnap === a.id && (
                    <div className="p-2 space-y-1">
                      {(Array.isArray(a.snapshot) ? a.snapshot : []).map((s, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-xs border-b last:border-0 py-1">
                          <span className={`w-4 h-4 rounded-full inline-flex items-center justify-center flex-shrink-0 ${s.done ? 'bg-green-500 text-white' : 'bg-gray-200'}`}>{s.done && <Check className="w-3 h-3" />}</span>
                          <span className="flex-1 text-slate-700">{s.name}{s.prep ? ` · ${s.prep}` : ''}</span>
                          {s.done_by && <span className="text-gray-500">{s.done_by} · {fmtWhen(s.done_at)}</span>}
                          {s.photo_url && <a href={s.photo_url} target="_blank" rel="noreferrer"><img src={s.photo_url} alt="" className="w-6 h-6 rounded object-cover" /></a>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Summary */}
        {items.length > 0 && (
          <Card className="mb-4 border-orange-200/70">
            <CardContent className="py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-4 text-sm">
                  <div><span className="text-2xl font-black text-slate-800">{summary.total}</span> <span className="text-gray-500">פריטים</span></div>
                  <div><span className="text-2xl font-black text-orange-600">{summary.toPrep}</span> <span className="text-gray-500">להכנה</span></div>
                  <div><span className="text-2xl font-black text-green-600">{summary.doneToPrep}</span> <span className="text-gray-500">בוצעו</span></div>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden"><div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} /></div>
                  <div className="text-xs text-gray-500 mt-1 text-left">{pct}% מההכנות הושלמו</div>
                </div>
              </div>
              {summary.remaining.length > 0 && (
                <div className="mt-2 text-xs text-gray-600"><span className="font-semibold text-orange-700">נותרו להכנה:</span> {summary.remaining.map((r) => r.name).join(' · ')}</div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Search + filter */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 mb-3 flex-wrap no-print">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש מוצר…" className="h-9 pr-8" />
            </div>
            <Button variant={onlyRemaining ? 'default' : 'outline'} size="sm" onClick={() => setOnlyRemaining((v) => !v)} className={onlyRemaining ? 'bg-orange-600 hover:bg-orange-700 text-white' : ''}>רק שנשאר להכין</Button>
          </div>
        )}

        {showImport && isAdmin && (
          <Card className="mb-4 border-orange-200">
            <CardHeader><CardTitle className="text-base">ייבוא רשימת הכנות — {activeName}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-gray-500">כותרת מנה בשורה נפרדת, ולפני כל פריט הכנה סמן <code>*</code>. הפריטים יקובצו תחת המנה. (שורות מפתח/הסבר יידלגו אוטומטית.)</p>
              <Textarea value={importText} onChange={(e) => setImportText(e.target.value)} rows={8} placeholder={'FOCACCIA (פוקאצ׳ה)\n* Bake focaccia (אפיית פוקאצ׳ה)\n* Seasonal jam (ריבה עונתית)\n\nSPICY PLATE (צלחת חריפים)\n* Zhug (סחוג)\n* Fried chili (צ׳ילי מטוגן)'} />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowImport(false)}>ביטול</Button>
                <Button size="sm" onClick={runImport} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'ייבא'}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-40"><Loader2 className="w-8 h-8 animate-spin text-orange-600" /></div>
        ) : items.length === 0 ? (
          <Card><CardContent className="text-center py-12 text-gray-500">
            <ChefHat className="w-12 h-12 mx-auto text-orange-300 mb-3" />
            <p className="font-bold text-slate-700 mb-1">אין עדיין רשימת הכנות ב"{activeName}"</p>
            {isAdmin ? <p className="text-sm">לחץ "ייבוא" והדבק את רשימת ההכנות, או "ערוך מוצרים" כדי להוסיף ידנית.</p> : <p className="text-sm">המנהל עדיין לא הגדיר רשימת הכנות.</p>}
          </CardContent></Card>
        ) : (
          <div className="space-y-5">
            {groups.map(([cat, rows]) => (
              <Card key={cat} className="overflow-hidden prep-card">
                <CardHeader className="bg-gradient-to-l from-orange-100 to-amber-50 py-2.5 cursor-pointer select-none" onClick={() => toggleCat(cat)}>
                  <CardTitle className="text-base text-[#7A3722] flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <ChevronDown className={`w-4 h-4 transition-transform ${collapsedCats[cat] ? '-rotate-90' : ''}`} />
                      {cat}
                    </span>
                    {(() => { const tp = rows.filter((r) => r.to_prep).length; const dn = rows.filter((r) => r.to_prep && r.done).length; return tp > 0 ? <span className="text-xs font-bold bg-white/70 rounded-full px-2 py-0.5 text-orange-700">{dn}/{tp} הוכנו</span> : <span className="text-xs text-gray-400 font-normal">{rows.length} פריטים</span>; })()}
                  </CardTitle>
                </CardHeader>
                {!collapsedCats[cat] && (
                <CardContent className="p-0">
                  {/* Recipe multiplier for this product — scales every item's base qty */}
                  <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50/60 border-b flex-wrap">
                    <span className="text-xs font-bold text-gray-500">כפולת מתכון:</span>
                    {[0.5, 1, 1.5, 2, 3].map((mm) => (
                      <button key={mm} onClick={() => setCatMult(cat, mm)}
                        className={`px-2.5 h-7 rounded-full text-xs font-bold border transition-colors ${Number(catMultipliers[cat] || 1) === mm ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'}`}>×{mm}</button>
                    ))}
                    <input type="number" min="0" step="0.25" value={catMultipliers[cat] || 1} onChange={(e) => setCatMult(cat, e.target.value)} className="w-16 h-7 text-xs text-center border border-gray-300 rounded-full" title="כפולה חופשית" />
                    {Number(catMultipliers[cat] || 1) !== 1 && <span className="text-[11px] text-orange-700 font-bold mr-auto">×{catMultipliers[cat]} — הכמויות למטה כבר מחושבות</span>}
                  </div>
                  {/* Card-per-item layout — wraps to fit any width, so a kitchen
                      phone/tablet never has to scroll sideways. */}
                  <div className="divide-y">
                    {rows.map((it) => (
                      <div key={it.id} className={`p-3 ${it.done ? 'bg-green-50/50' : it.to_prep ? 'bg-orange-50/40' : ''}`}>
                        <div className="flex items-start justify-between gap-3">
                          {/* name + note */}
                          <div className="min-w-0 flex-1">
                            {editMode ? (
                              <div className="space-y-1">
                                <Input value={it.name} onChange={(e) => patch(it.id, 'name', e.target.value)} className="h-8 text-sm" placeholder="שם מוצר" />
                                <Input value={it.note || ''} onChange={(e) => patch(it.id, 'note', e.target.value)} className="h-7 text-xs text-gray-500" placeholder="הערה / הוראת הכנה (אופציונלי)" />
                              </div>
                            ) : (
                              <>
                                <span className={`font-medium break-words ${it.done ? 'line-through text-gray-400' : 'text-slate-800'}`}>{it.name}</span>
                                {it.note && <div className="text-xs text-gray-500 mt-0.5 flex items-start gap-1"><StickyNote className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-500" /><span className="break-words">{it.note}</span></div>}
                                {it.done && it.done_by && <div className="text-[10px] leading-tight text-gray-500 mt-0.5">✓ {it.done_by}{it.done_at ? ` · ${fmtWhen(it.done_at)}` : ''}</div>}
                              </>
                            )}
                          </div>
                          {/* to_prep + done toggles */}
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => toggle(it, 'to_prep')} title="סמן שצריך להכין"
                              className={`w-8 h-8 rounded border-2 inline-flex items-center justify-center transition-colors ${it.to_prep ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 hover:border-orange-400'}`}>{it.to_prep ? <Check className="w-4 h-4" /> : <span className="text-[9px] font-bold text-gray-400">לסמן</span>}</button>
                            <button onClick={() => toggle(it, 'done')} title="בוצע"
                              className={`w-8 h-8 rounded border-2 inline-flex items-center justify-center transition-colors ${it.done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-400'}`}>{it.done ? <Check className="w-4 h-4" /> : <span className="text-[9px] font-bold text-gray-400">בוצע</span>}</button>
                            {editMode && <button onClick={() => delRow(it.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 className="w-4 h-4" /></button>}
                          </div>
                        </div>
                        {/* have / prep / photo — wraps */}
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <label className="flex items-center gap-1 text-xs text-gray-500">יש
                            <Input value={it.have || ''} onChange={(e) => patch(it.id, 'have', e.target.value)} onBlur={() => !editMode && saveOne(items.find((x) => x.id === it.id))} className="h-8 w-16 text-sm text-center" placeholder="—" />
                          </label>
                          <label className="flex items-center gap-1 text-xs text-gray-500">{Number(catMultipliers[cat] || 1) !== 1 ? 'בסיס' : 'להכין'}
                            <Input value={it.prep || ''} onChange={(e) => patch(it.id, 'prep', e.target.value)} onBlur={() => !editMode && saveOne(items.find((x) => x.id === it.id))} className="h-8 w-16 text-sm text-center font-semibold text-orange-700" placeholder="—" />
                          </label>
                          {scaleQty(it.prep, catMultipliers[cat]) && (
                            <span className="text-sm font-black text-orange-700 whitespace-nowrap" title="כמות מחושבת לפי הכפולה">→ {scaleQty(it.prep, catMultipliers[cat])}</span>
                          )}
                          <div className="flex items-center gap-1 mr-auto">
                            {it.photo_url && <a href={it.photo_url} target="_blank" rel="noreferrer"><img src={it.photo_url} alt="" className="w-8 h-8 rounded object-cover border border-gray-200" /></a>}
                            <label className="cursor-pointer text-gray-400 hover:text-orange-600" title="צרף תמונה">
                              {uploadingId === it.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; attachPhoto(it, f); }} />
                            </label>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
                )}
              </Card>
            ))}
            {editMode && <Button variant="outline" onClick={addRow} className="w-full border-dashed"><Plus className="w-4 h-4 ml-1" /> הוסף מוצר</Button>}
          </div>
        )}
      </div>
    </div>
  );
}
