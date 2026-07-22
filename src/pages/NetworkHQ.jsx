// Network HQ — the "layer above the restaurants" for a chain. Group tenants
// (branches) into a Chain and see a network-wide view + per-branch KPIs.
// Platform-owner only (rendered inside PlatformLayout). D.1 of Apollo-for-chains.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Plus, Trash2, Network, RefreshCw, Send, Pencil, Factory, ChevronDown, Save } from 'lucide-react';

const ils = (n) => `₪${(Number(n) || 0).toLocaleString('he-IL')}`;
const ils2 = (n) => `₪${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;

// The commissary (בית הכנות) — a NETWORK-level operation inside the chain HQ.
// The owner manages the catalog + sees every branch's order + production + cost.
function ChainCommissary({ chainId }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  const [tab, setTab] = useState('production'); // production | catalog | order
  const [markups, setMarkups] = useState({}); // item_key -> markup draft
  const [orderBranch, setOrderBranch] = useState('');
  const [qtys, setQtys] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await base44.functions.getChainCommissary({ chain_id: chainId, order_date: date });
      const d = r?.data || r; setData(d);
      const m = {}; (d?.catalog || []).forEach((c) => { m[c.item_key] = c.markup_pct ?? ''; }); setMarkups(m);
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setLoading(false);
  };
  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, date]);

  const saveMarkup = async (item_key) => {
    setBusy(true);
    try { await base44.functions.setChainCommissaryItemPricing({ chain_id: chainId, item_key, markup_pct: markups[item_key] === '' ? null : markups[item_key] }); await load(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(false);
  };
  const markDone = async (item_key, done) => {
    // optimistic
    setData((d) => d ? { ...d, distribution: { ...d.distribution, production: d.distribution.production.map((p) => p.item_key === item_key ? { ...p, done, done_by: done ? 'אתה' : null, done_at: done ? new Date().toISOString() : null } : p) } } : d);
    try { await base44.functions.markCommissaryProduction({ chain_id: chainId, order_date: date, item_key, done }); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); load(); }
  };
  const resetProduction = async () => {
    if (!window.confirm('לאפס את כל הסימונים ליום זה? (ייצור חדש)')) return;
    setBusy(true);
    try { await base44.functions.resetCommissaryProduction({ chain_id: chainId, order_date: date }); await load(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(false);
  };
  const submitOrder = async () => {
    if (!orderBranch) { setMsg({ ok: false, text: 'בחר סניף' }); return; }
    const lines = (data?.catalog || []).filter((c) => Number(qtys[c.item_key]) > 0).map((c) => ({ item_key: c.item_key, qty: Number(qtys[c.item_key]) }));
    if (!lines.length) { setMsg({ ok: false, text: 'הזן כמות לפחות לפריט אחד' }); return; }
    setBusy(true); setMsg(null);
    try { await base44.functions.saveChainCommissaryOrder({ chain_id: chainId, branch_slug: orderBranch, order_date: date, lines }); setMsg({ ok: true, text: '✅ ההזמנה נשמרה' }); setQtys({}); await load(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(false);
  };

  const dist = data?.distribution;
  const cat = data?.catalog || [];
  return (
    <div className="mt-4 rounded-xl border border-indigo-800/50 bg-indigo-950/20">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between p-3 text-right">
        <span className="flex items-center gap-2 font-bold text-indigo-300"><Factory className="w-4 h-4" /> בית הכנות (רשת)</span>
        <ChevronDown className={`w-4 h-4 text-indigo-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="p-3 pt-0 space-y-3">
          {msg && <div className={`text-xs rounded px-2 py-1 ${msg.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>{msg.text}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white" dir="ltr" />
            {[['production', '🏭 מה להכין + חשבוניות'], ['catalog', '📋 קטלוג ותמחור'], ['order', '➕ הזמנה לסניף']].map(([v, l]) => (
              <button key={v} onClick={() => setTab(v)} className={`text-xs rounded px-2 py-1 ${tab === v ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{l}</button>
            ))}
            <button onClick={load} disabled={loading} className="text-slate-400 hover:text-white mr-auto"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>

          {loading ? <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div> : !cat.length ? (
            <p className="text-xs text-slate-500 text-center py-3">אין קטלוג. פרסם קטלוג מבית ההכנות (מסך "🏭 בית הכנות" → "פרסם לרשת").</p>
          ) : tab === 'production' ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                <div className="bg-slate-800 rounded p-2"><div className="text-[11px] text-slate-400">פריטים להכנה</div><div className="text-lg font-bold text-white">{dist?.totals?.item_count || 0}</div></div>
                <div className="bg-slate-800 rounded p-2"><div className="text-[11px] text-slate-400">עלות ייצור</div><div className="text-lg font-bold text-amber-300">{ils2(dist?.totals?.cost)}</div></div>
                <div className="bg-slate-800 rounded p-2"><div className="text-[11px] text-slate-400">מכירה פנימית</div><div className="text-lg font-bold text-indigo-300">{ils2(dist?.totals?.revenue)}</div></div>
                <div className="bg-slate-800 rounded p-2"><div className="text-[11px] text-slate-400">רווח</div><div className="text-lg font-bold text-emerald-300">{ils2(dist?.totals?.margin)}</div></div>
              </div>
              {!dist?.production?.length ? <p className="text-xs text-slate-500 text-center py-3">אין הזמנות בתאריך זה. הזן ב"➕ הזמנה לסניף".</p> : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-400">רשימת הכנות · בוצע <b className="text-emerald-400">{dist.totals?.done_count || 0}</b>/{dist.production.length}</div>
                    <button onClick={resetProduction} disabled={busy} className="text-[11px] text-slate-500 hover:text-red-400">אפס יום ↺</button>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${dist.production.length ? Math.round(((dist.totals?.done_count || 0) / dist.production.length) * 100) : 0}%` }} /></div>
                  {Object.entries(dist.production.reduce((g, p) => { const d = p.department || 'ללא מחלקה'; (g[d] = g[d] || []).push(p); return g; }, {})).map(([dept, rows]) => (
                    <div key={dept} className="mt-2">
                      <div className="text-[11px] font-bold text-indigo-300 mb-1">{dept}</div>
                      <div className="space-y-1">
                        {rows.map((p) => (
                          <label key={p.item_key} className={`flex items-start gap-2 rounded p-1.5 cursor-pointer ${p.done ? 'bg-emerald-950/30' : 'bg-slate-800/50 hover:bg-slate-800'}`}>
                            <input type="checkbox" checked={!!p.done} onChange={(e) => markDone(p.item_key, e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-500" />
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm ${p.done ? 'line-through text-slate-500' : 'text-white'}`}><span className="font-bold text-indigo-300">{p.total_qty} {p.unit}</span> · {p.name}</div>
                              <div className="text-[11px] text-slate-500">{p.per_branch.map((b) => `${b.branch}: ${b.qty}`).join(' · ')}{p.done && p.done_by ? ` · ✓ ${p.done_by}` : ''}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
              {dist?.invoices?.length > 0 && (
                <div className="border-t border-slate-800 pt-2">
                  <div className="text-xs font-bold text-slate-400 mb-1">חשבונית פנימית לכל סניף</div>
                  {dist.invoices.map((inv) => (
                    <div key={inv.branch_slug} className="flex items-center justify-between text-xs py-1"><span className="text-white">{inv.branch_name} <span className="text-slate-500">· {inv.lines} פריטים</span></span><span className="text-indigo-300 font-bold">{ils2(inv.total_ils)} <span className="text-emerald-400/70 font-normal">(רווח {ils2(inv.margin_ils)})</span></span></div>
                  ))}
                </div>
              )}
            </>
          ) : tab === 'catalog' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-slate-300"><thead><tr className="text-slate-500 text-right"><th className="p-1.5">פריט</th><th className="p-1.5">מחלקה</th><th className="p-1.5 text-left">קוסט</th><th className="p-1.5 text-center">רווח %</th><th className="p-1.5 text-left">מחיר פנימי</th><th className="p-1.5 text-left">מרווח</th><th></th></tr></thead>
                <tbody>{cat.map((c) => (
                  <tr key={c.item_key} className="border-t border-slate-800"><td className="p-1.5 font-medium text-white">{c.name}<span className="text-slate-500"> /{c.unit}</span></td><td className="p-1.5 text-slate-400">{c.department || '—'}</td><td className="p-1.5 text-left text-slate-400 whitespace-nowrap">{ils2(c.cost_per_unit)}</td>
                    <td className="p-1.5"><input type="number" dir="ltr" value={markups[c.item_key] ?? ''} onChange={(e) => setMarkups((s) => ({ ...s, [c.item_key]: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded w-14 px-1 py-0.5 text-center text-white" /></td>
                    <td className="p-1.5 text-left font-bold text-indigo-300 whitespace-nowrap">{ils2(c.internal_price)}</td><td className={`p-1.5 text-left whitespace-nowrap ${c.margin >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{ils2(c.margin)}</td>
                    <td className="p-1.5"><button onClick={() => saveMarkup(c.item_key)} disabled={busy} className="text-indigo-400 hover:text-indigo-200"><Save className="w-3.5 h-3.5" /></button></td></tr>
                ))}</tbody></table>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">הזמנה עבור:</span>
                <select value={orderBranch} onChange={(e) => setOrderBranch(e.target.value)} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white">
                  <option value="">בחר סניף…</option>
                  {(data?.members || []).map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
                </select>
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-slate-800 rounded">
                <table className="w-full text-xs text-slate-300"><thead className="sticky top-0 bg-slate-900"><tr className="text-slate-500 text-right"><th className="p-1.5">פריט</th><th className="p-1.5">מחלקה</th><th className="p-1.5 text-left">מחיר</th><th className="p-1.5 text-center">כמות</th></tr></thead>
                  <tbody>{cat.filter((c) => c.active).map((c) => (
                    <tr key={c.item_key} className="border-t border-slate-800"><td className="p-1.5 text-white">{c.name}</td><td className="p-1.5 text-slate-400">{c.department || '—'}</td><td className="p-1.5 text-left whitespace-nowrap">{ils2(c.internal_price)}</td>
                      <td className="p-1.5"><input type="number" dir="ltr" placeholder="0" value={qtys[c.item_key] ?? ''} onChange={(e) => setQtys((s) => ({ ...s, [c.item_key]: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded w-14 px-1 py-0.5 text-center text-white" /></td></tr>
                  ))}</tbody></table>
              </div>
              <button onClick={submitOrder} disabled={busy || !orderBranch} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"><Send className="w-4 h-4 inline ml-1" /> שמור הזמנה לסניף</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const TASK_ROLES = [
  ['', 'כל התפקידים'], ['owner', 'בעלים'], ['manager', 'מנהל'], ['chef', 'שף / מטבח'],
  ['marketing', 'שיווק'], ['bar', 'בר'], ['service', 'שירות'],
];
const roleLabel = (r) => (TASK_ROLES.find(([v]) => v === r)?.[1]) || r;

function NetworkTasks({ chainId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [role, setRole] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await base44.functions.listNetworkTasks({ chain_id: chainId }); setTasks((r?.data || r)?.tasks || []); }
    catch { setTasks([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [chainId]);

  const create = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { await base44.functions.createNetworkTask({ chain_id: chainId, title: title.trim(), detail: detail.trim(), role, due_date: dueDate }); setTitle(''); setDetail(''); setRole(''); setDueDate(''); load(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };
  const toggle = async (taskId, slug, done) => {
    try { await base44.functions.setNetworkTaskBranch({ task_id: taskId, slug, done }); load(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
  };
  const del = async (id) => {
    if (!window.confirm('למחוק את המשימה?')) return;
    try { await base44.functions.deleteNetworkTask({ id }); load(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
  };
  const notify = async (id) => {
    if (!window.confirm('לשלוח את המשימה בוואטסאפ לבעלי הסניפים?')) return;
    try {
      const r = await base44.functions.notifyBranchesOfTask({ task_id: id });
      const d = r?.data || r;
      alert(`נשלח ל-${d?.sent || 0} סניפים${d?.skipped ? ` (${d.skipped} דולגו — ללא טלפון/הסניף הראשי)` : ''}`);
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
  };

  const fmtDue = (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }); } catch { return ''; } };

  return (
    <div className="mt-4 pt-4 border-t border-slate-800">
      <div className="text-sm font-bold text-white mb-2">🎯 משימות רשתיות</div>
      <div className="flex flex-col gap-2 mb-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת משימה (למשל: מבצע מונדיאל)" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
        <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="פרטים (אופציונלי)" className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
        <div className="flex gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value)} title="למי מיועדת" className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white">
            {TASK_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} title="תאריך יעד" className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-white" />
          <button onClick={create} disabled={busy || !title.trim()} className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg px-3 py-2 text-sm disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'שגר לסניפים'}</button>
        </div>
      </div>
      {loading ? <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div> : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const done = (t.branches || []).filter((b) => b.done).length;
            const overdue = t.due_date && done < (t.branches || []).length && new Date(t.due_date) < new Date(new Date().toDateString());
            return (
              <div key={t.id} className="bg-slate-800/60 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-white text-sm">{t.title} <span className="text-xs text-slate-400">· {done}/{(t.branches || []).length} סניפים</span></div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => notify(t.id)} title="שלח בוואטסאפ לסניפים" className="text-emerald-400 hover:text-emerald-300"><Send className="w-3.5 h-3.5" /></button>
                    <button onClick={() => del(t.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {t.role && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">👤 {roleLabel(t.role)}</span>}
                  {t.due_date && <span className={`text-[10px] px-1.5 py-0.5 rounded ${overdue ? 'bg-red-500/20 text-red-300' : 'bg-slate-700 text-slate-300'}`}>📅 {fmtDue(t.due_date)}{overdue ? ' · באיחור' : ''}</span>}
                </div>
                {t.detail && <div className="text-xs text-slate-400 mt-0.5">{t.detail}</div>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(t.branches || []).map((b) => (
                    <button key={b.slug} onClick={() => toggle(t.id, b.slug, !b.done)} title={b.note || ''}
                      className={`text-xs px-2 py-1 rounded-full border ${b.done ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                      {b.done ? '✓ ' : ''}{b.name}{b.note ? ' 💬' : ''}
                    </button>
                  ))}
                  {(t.branches || []).length === 0 && <span className="text-xs text-slate-500">אין סניפים ברשת</span>}
                </div>
                {/* Notes the branches left */}
                {(t.branches || []).some((b) => b.note) && (
                  <div className="mt-2 space-y-0.5">
                    {(t.branches || []).filter((b) => b.note).map((b) => (
                      <div key={b.slug} className="text-[11px] text-slate-400">💬 <b className="text-slate-300">{b.name}:</b> {b.note}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {tasks.length === 0 && <div className="text-xs text-slate-500 text-center py-2">אין משימות רשתיות עדיין.</div>}
        </div>
      )}
    </div>
  );
}

function OwnerAssign({ chain, onChanged }) {
  const [email, setEmail] = useState(chain.owner_email || '');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await base44.functions.setChainOwner({ chain_id: chain.id, owner_email: email.trim() }); onChanged && onChanged(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setSaving(false); }
  };
  return (
    <div className="flex items-center gap-2 mb-3 text-xs">
      <span className="text-slate-500 whitespace-nowrap">בעל הרשת (אימייל כניסה):</span>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="owner@example.com"
        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-white" dir="ltr" />
      <button onClick={save} disabled={saving || email.trim() === (chain.owner_email || '')}
        className="bg-slate-700 hover:bg-slate-600 text-white rounded-lg px-2.5 py-1 disabled:opacity-40">
        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'שמור'}
      </button>
    </div>
  );
}

function ChainCard({ chain, available, onChanged, isSuper }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addSlug, setAddSlug] = useState('');
  const [busy, setBusy] = useState(false);

  const loadMetrics = async () => {
    setLoading(true);
    try { const r = await base44.functions.getChainMetrics({ chain_id: chain.id }); setMetrics(r?.data || r || {}); }
    catch { setMetrics(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadMetrics(); }, [chain.id, (chain.members || []).length]);

  const memberSlugs = new Set((chain.members || []).map((m) => m.slug));
  const addable = (available || []).filter((a) => !memberSlugs.has(a.slug));

  const addBranch = async () => {
    if (!addSlug) return;
    setBusy(true);
    try {
      const a = addable.find((x) => x.slug === addSlug);
      await base44.functions.addBranchToChain({ chain_id: chain.id, slug: addSlug, name: a?.name || addSlug });
      setAddSlug(''); onChanged && onChanged();
    } catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };
  const removeBranch = async (slug) => {
    setBusy(true);
    try { await base44.functions.removeBranchFromChain({ chain_id: chain.id, slug }); onChanged && onChanged(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setBusy(false); }
  };

  const t = metrics?.totals;
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-white flex items-center gap-2"><Network className="w-5 h-5 text-amber-400" /> {chain.name}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{(chain.members || []).length} סניפים</span>
          {isSuper && (
            <>
              <button title="שנה שם" onClick={async () => {
                const name = window.prompt('שם חדש לרשת:', chain.name); if (!name || !name.trim()) return;
                try { await base44.functions.renameChain({ chain_id: chain.id, name: name.trim() }); onChanged && onChanged(); }
                catch (e) { alert('שגיאה: ' + (e?.message || '')); }
              }} className="text-slate-400 hover:text-white"><Pencil className="w-4 h-4" /></button>
              <button title="מחק רשת" onClick={async () => {
                if (!window.confirm(`למחוק את הרשת "${chain.name}" על כל הסניפים והמשימות שלה? פעולה בלתי הפיכה.`)) return;
                try { await base44.functions.deleteChain({ chain_id: chain.id }); onChanged && onChanged(); }
                catch (e) { alert('שגיאה: ' + (e?.message || '')); }
              }} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
            </>
          )}
        </div>
      </div>
      {isSuper && <OwnerAssign chain={chain} onChanged={onChanged} />}

      {t && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">הכנסת היום (רשת)</div><div className="text-xl font-bold text-emerald-400">{ils(t.revenue_today)}</div></div>
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">הזמנות היום</div><div className="text-xl font-bold text-white">{t.reservations_today}</div></div>
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">במשמרת עכשיו</div><div className="text-xl font-bold text-white">{t.active_shifts}</div></div>
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">תקלות פתוחות</div><div className={`text-xl font-bold ${t.open_incidents > 0 ? 'text-red-400' : 'text-white'}`}>{t.open_incidents}</div></div>
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">עובדים פעילים</div><div className="text-xl font-bold text-white">{t.employees}</div></div>
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">חוזי אירועים</div><div className="text-xl font-bold text-white">{ils(t.contract_revenue)}</div></div>
          <div className="bg-slate-800 rounded-lg p-2"><div className="text-[11px] text-slate-400">חשבוניות לא שולמו</div><div className="text-xl font-bold text-amber-400">{t.unpaid_invoices}</div></div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-slate-300 whitespace-nowrap">
            <thead><tr className="text-slate-500 text-right text-xs"><th className="p-2">סניף</th><th className="p-2">הכנסת היום</th><th className="p-2">הזמנות היום</th><th className="p-2">במשמרת</th><th className="p-2">תקלות</th><th className="p-2">עובדים</th><th className="p-2">חוב חשבוניות</th><th></th></tr></thead>
            <tbody>
              {(metrics?.per_branch || []).map((b) => (
                <tr key={b.slug} className="border-t border-slate-800">
                  <td className="p-2 font-medium text-white">{b.name}{b.error && <span className="text-[10px] text-red-400"> · לא זמין</span>}</td>
                  <td className="p-2 text-emerald-400">{ils(b.revenue_today)}</td>
                  <td className="p-2">{b.reservations_today}</td>
                  <td className="p-2">{b.active_shifts}</td>
                  <td className={`p-2 ${b.open_incidents > 0 ? 'text-red-400' : ''}`}>{b.open_incidents}</td>
                  <td className="p-2">{b.employees}</td>
                  <td className="p-2">{b.unpaid_invoices}</td>
                  <td className="p-2">{isSuper && <button onClick={() => removeBranch(b.slug)} disabled={busy} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>}</td>
                </tr>
              ))}
              {(metrics?.per_branch || []).length === 0 && <tr><td colSpan={8} className="p-3 text-center text-slate-500 text-xs">אין סניפים ברשת עדיין — הוסף למטה.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {isSuper && (
        <div className="flex items-center gap-2 mt-3">
          <select value={addSlug} onChange={(e) => setAddSlug(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white">
            <option value="">הוסף סניף…</option>
            {addable.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}
          </select>
          <button onClick={addBranch} disabled={busy || !addSlug} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg px-3 py-1.5 text-sm disabled:opacity-50"><Plus className="w-4 h-4 inline" /> הוסף</button>
        </div>
      )}

      <ChainCommissary chainId={chain.id} />
      <NetworkTasks chainId={chain.id} />
    </div>
  );
}

export default function NetworkHQ() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await base44.functions.listChains({}); setData(r?.data || r || {}); }
    catch { setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const createChain = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try { await base44.functions.createChain({ name: newName.trim() }); setNewName(''); load(); }
    catch (e) { alert('שגיאה: ' + (e?.message || '')); }
    finally { setCreating(false); }
  };

  const isSuper = data?.is_super !== false; // undefined (loading) treated as super; backend still enforces

  return (
    <div dir="rtl" className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-white flex items-center gap-2"><Network className="w-6 h-6 text-amber-400" /> מטה רשתות</h1>
        <button onClick={load} className="text-slate-400 hover:text-white"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <p className="text-sm text-slate-400">
        {isSuper
          ? 'קבץ סניפים לרשת אחת וראה תמונת-על של כל הסניפים במקום אחד.'
          : 'הרשת שלך — תמונת-על של כל הסניפים, ומשימות רשתיות שאתה מנהל.'}
      </p>

      {isSuper && (
        <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-700 rounded-xl p-3">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="שם רשת חדשה" className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
          <button onClick={createChain} disabled={creating || !newName.trim()} className="bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg px-4 py-2 text-sm disabled:opacity-50">{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'צור רשת'}</button>
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
      ) : (
        <div className="space-y-4">
          {(data?.chains || []).map((c) => <ChainCard key={c.id} chain={c} available={data.available} onChanged={load} isSuper={isSuper} />)}
          {(data?.chains || []).length === 0 && (
            <div className="text-center text-slate-500 py-10">
              {isSuper ? 'אין רשתות עדיין. צור אחת למעלה.' : 'עדיין לא שויכה אליך רשת. פנה למנהל הפלטפורמה.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
