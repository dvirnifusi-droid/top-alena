import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Trash2, Table2, Pencil } from 'lucide-react';

const ils = (n) => Math.round(Math.abs(Number(n || 0))).toLocaleString();
const signed = (n) => `${n < 0 ? '−' : ''}₪${ils(n)}`;

const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const HE_MON = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];

function heDay(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `יום ${HE_DAYS[wd]} · ${d} ב${HE_MON[m - 1]}`;
}

const SOURCE_HE = {
  bank: 'בנק',
  invoice: 'חשבונית',
  pattern: 'צפי',
  manual: 'ידני',
};

// The cash-flow register: every movement, backwards and forwards, in one
// chronological table with a running balance — the view the owner kept a
// spreadsheet for, because no chart answers "what leaves on the 15th".
export default function CashRegister() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState('all');   // all | unsettled | settled
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);   // row id being edited
  const [edit, setEdit] = useState({});
  const [tagging, setTagging] = useState(null);   // bank row being named
  const [suppliers, setSuppliers] = useState([]);
  const [draft, setDraft] = useState({ date: '', name: '', out: '', in: '', category: '', note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.getCashFlowRegister({ days_back: 60, days_forward: 90 });
      setData((r?.data ?? r) || null);
    } catch (e) {
      if (/forbidden|unauthorized|401|403/i.test(String(e?.message))) setDenied(true);
    }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    base44.functions.listSupplierNames({})
      .then((r) => setSuppliers(((r?.data ?? r) || {}).suppliers || []))
      .catch(() => {});
  }, []);

  const add = async () => {
    if (!draft.date || !draft.name) return;
    setBusy(true);
    try {
      await base44.functions.addCashFlowRow({
        date: draft.date, name: draft.name, category: draft.category || 'אחר',
        out: Number(draft.out) || 0, in: Number(draft.in) || 0, note: draft.note || '',
      });
      setDraft({ date: '', name: '', out: '', in: '', category: '', note: '' });
      setAdding(false);
      await load();
    } catch { /* leave the form filled so nothing is retyped */ }
    setBusy(false);
  };

  // Manual rows live in their own table; derived rows are edited through an
  // override keyed by their original date+label, because the row itself is
  // rebuilt from scratch on every load.
  const isManual = (row) => row.source === 'manual';

  const toggleSettled = async (row) => {
    setBusy(true);
    try {
      if (isManual(row)) {
        await base44.functions.updateCashFlowRow({ id: row.id, settled: !row.settled });
      } else {
        await base44.functions.setCashFlowRowOverride({
          key: row.id, settled: !row.settled,
          date: row.date, name: row.name, out: row.out || '', in: row.in || '',
        });
      }
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  const openEdit = (row) => {
    setEditing(row.id);
    setEdit({ date: row.date, name: row.name, out: row.out || '', in: row.in || '' });
  };

  const saveEdit = async (row) => {
    setBusy(true);
    try {
      if (isManual(row)) {
        // Replace outright, so manual rows have exactly one write path.
        await base44.functions.updateCashFlowRow({ id: row.id, delete: true });
        await base44.functions.addCashFlowRow({
          date: edit.date, name: edit.name, category: row.category,
          out: Number(edit.out) || 0, in: Number(edit.in) || 0, settled: row.settled,
        });
      } else {
        await base44.functions.setCashFlowRowOverride({
          key: row.id, date: edit.date, name: edit.name,
          out: edit.out, in: edit.in, settled: row.settled,
        });
      }
      setEditing(null);
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  const tagRow = async (row, name) => {
    setBusy(true);
    try {
      await base44.functions.setBankTxCounterparty({ id: row.id, counterparty: name });
      setTagging(null);
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  const resetRow = async (row) => {
    setBusy(true);
    try {
      await base44.functions.setCashFlowRowOverride({ key: row.id, reset: true });
      setEditing(null);
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  const removeRow = async (row) => {
    setBusy(true);
    try {
      if (isManual(row)) {
        await base44.functions.updateCashFlowRow({ id: row.id, delete: true });
      } else {
        // Never destroy a derived row — hide it. The invoice or pattern behind
        // it still exists, and the owner can bring it back.
        await base44.functions.setCashFlowRowOverride({ key: row.id, hidden: true });
      }
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  if (denied) return null;

  const rows = (data?.rows || []).filter((r) =>
    filter === 'all' ? true : filter === 'unsettled' ? !r.settled : r.settled);
  const line = data?.credit_line || 0;
  const today = data?.today;

  // One block per day. The date stops repeating down the rows, and each day
  // carries its own net and closing balance — the two figures being hunted for
  // when someone scans a cash flow.
  const groups = [];
  for (const r of rows) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== r.date) {
      const prev = g;
      g = {
        date: r.date, rows: [], net: 0, endBalance: 0, settled: true,
        crossesToday: !!(prev && prev.date < today && r.date >= today),
      };
      groups.push(g);
    }
    g.rows.push(r);
    g.net += (r.in || 0) - (r.out || 0);
    g.endBalance = r.balance;
    if (!r.settled) g.settled = false;
  }

  return (
    <Card dir="rtl" className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2"><Table2 className="w-5 h-5 text-slate-600" /> התזרים — כל התנועות</span>
          {data && (
            <span className="text-xs font-normal text-slate-500">
              {data.totals.unsettled} טרם נפרעו · יוצא {signed(-data.totals.future_out)} · נכנס ₪{ils(data.totals.future_in)}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {[['all', 'הכל'], ['unsettled', 'טרם נפרע'], ['settled', 'נפרע']].map(([v, he]) => (
            <Button key={v} size="sm" variant={filter === v ? 'default' : 'outline'}
              className={`h-7 text-xs ${filter === v ? 'bg-slate-800 hover:bg-slate-900' : ''}`}
              onClick={() => setFilter(v)}>{he}</Button>
          ))}
          <Button size="sm" variant="outline" className="h-7 text-xs mr-auto"
            onClick={() => setAdding((a) => !a)}>
            <Plus className="w-3.5 h-3.5 ml-1" /> הוסף שורה
          </Button>
        </div>

        {adding && (
          <div className="rounded-lg border bg-slate-50 p-3 grid sm:grid-cols-6 gap-2 items-end">
            <div><label className="text-[11px] text-slate-500">תאריך</label>
              <Input type="date" className="h-8" value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="text-[11px] text-slate-500">שם</label>
              <Input className="h-8" placeholder="ארנונה" value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div><label className="text-[11px] text-slate-500">יוצא ₪</label>
              <Input className="h-8" type="number" dir="ltr" value={draft.out}
                onChange={(e) => setDraft({ ...draft, out: e.target.value })} /></div>
            <div><label className="text-[11px] text-slate-500">נכנס ₪</label>
              <Input className="h-8" type="number" dir="ltr" value={draft.in}
                onChange={(e) => setDraft({ ...draft, in: e.target.value })} /></div>
            <Button size="sm" className="h-8" onClick={add} disabled={busy || !draft.date || !draft.name}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'הוסף'}
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : !rows.length ? (
          <p className="text-sm text-slate-500 text-center py-8">אין תנועות בטווח</p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.date}>
                {g.crossesToday && (
                  <div className="flex items-center gap-2 mb-3 mt-1">
                    <div className="h-px bg-blue-400 flex-1" />
                    <span className="text-[11px] text-blue-700 font-bold whitespace-nowrap px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                      ↑ מה שהיה · מכאן צפי ↓
                    </span>
                    <div className="h-px bg-blue-400 flex-1" />
                  </div>
                )}

                {/* Day header: the date once, plus what the day did and where it
                    left the balance — the two numbers people actually scan for. */}
                <div className={`flex items-baseline justify-between gap-3 px-3 py-2 rounded-t-lg border-b-2 ${
                  g.settled ? 'bg-slate-100 border-slate-300' : 'bg-amber-50 border-amber-200'}`}>
                  <span className="text-sm font-bold text-slate-800">
                    {heDay(g.date)}
                    <span className="font-normal text-slate-400 text-xs mr-2">{g.date}</span>
                  </span>
                  <span className="flex items-baseline gap-3 text-xs whitespace-nowrap">
                    <span className={g.net >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                      {g.net >= 0 ? '+' : '−'}₪{ils(g.net)}
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${
                      g.endBalance < -line ? 'text-red-700' : g.endBalance < 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                      בסוף היום {signed(g.endBalance)}
                    </span>
                  </span>
                </div>

                <div className="divide-y border border-t-0 rounded-b-lg overflow-hidden">
                  {g.rows.map((r) => (
                    <div key={r.id}>
                      <div className={`group flex items-center gap-2 flex-wrap sm:flex-nowrap px-3 py-2.5 ${
                        r.settled ? 'bg-white' : 'bg-amber-50/40'}`}>
                        <span className={`w-1.5 h-8 rounded-full shrink-0 ${
                          r.settled ? 'bg-emerald-400' : 'bg-amber-400'}`} />

                        <div className="min-w-0 flex-1 basis-[45%] sm:basis-auto">
                          <p className="text-sm font-medium text-slate-800 truncate" title={r.note || r.name}>
                            {r.name}{r.edited ? <span className="text-blue-500 mr-1">✎</span> : null}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {r.category} · {SOURCE_HE[r.source]}
                            {r.taggable && (
                              <button className="text-blue-600 underline mr-2"
                                onClick={() => setTagging(tagging === r.id ? null : r.id)}>
                                למי זה הלך?
                              </button>
                            )}
                          </p>
                        </div>

                        <div className="text-left shrink-0">
                          <p className={`text-sm font-bold tabular-nums ${
                            r.out ? 'text-red-600' : 'text-emerald-700'}`}>
                            {r.out ? `−₪${ils(r.out)}` : `+₪${ils(r.in)}`}
                          </p>
                        </div>

                        <div className={`text-left shrink-0 rounded-md px-2 py-1 border ${
                          r.balance < -line ? 'bg-red-50 border-red-200'
                            : r.balance < 0 ? 'bg-amber-50 border-amber-200'
                            : 'bg-emerald-50 border-emerald-200'}`}>
                          <p className="text-[9px] text-slate-500 leading-none">בחשבון</p>
                          <p className={`text-sm font-bold tabular-nums leading-tight ${
                            r.balance < -line ? 'text-red-700'
                              : r.balance < 0 ? 'text-amber-800' : 'text-emerald-800'}`}>
                            {signed(r.balance)}
                          </p>
                          {/* Only once the account is actually into the frame.
                              On a positive balance "נשאר" would add the credit
                              line to money already there and read as more cash
                              than exists. */}
                          {line > 0 && r.balance < 0 && (
                            <p className="text-[9px] text-slate-400 leading-none whitespace-nowrap">
                              {r.balance < -line
                                ? `חריגה ${ils(r.balance + line)}`
                                : `נשאר ${ils(line + r.balance)}`}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {r.editable ? (
                            <button onClick={() => toggleSettled(r)} disabled={busy}
                              className={`rounded-full px-2 py-0.5 text-[10px] whitespace-nowrap ${
                                r.settled ? 'bg-emerald-600 text-white' : 'bg-amber-200 text-amber-900'}`}>
                              {r.settled ? 'נפרע' : 'טרם'}
                            </button>
                          ) : (
                            <span className="rounded-full px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 whitespace-nowrap">
                              נפרע
                            </span>
                          )}
                          {r.editable && (
                            <>
                              <button onClick={() => openEdit(r)} disabled={busy} title="ערוך"
                                className="p-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <Pencil className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
                              </button>
                              <button onClick={() => removeRow(r)} disabled={busy} title="הסתר"
                                className="p-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                <Trash2 className="w-3.5 h-3.5 text-red-300 hover:text-red-600" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {tagging === r.id && (
                        <div className="bg-blue-50 px-3 py-2.5 border-t">
                          <p className="text-[11px] text-slate-600 mb-1.5">
                            הבנק לא שולח שם לתשלום הזה. בחר ספק והשם יישמר על התנועה.
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            <select className="h-9 text-sm border rounded px-2 bg-white flex-1 min-w-[160px]"
                              defaultValue=""
                              onChange={(e) => { if (e.target.value) tagRow(r, e.target.value); }}>
                              <option value="">בחר ספק…</option>
                              {suppliers.map((sp) => (
                                <option key={sp.id} value={sp.name}>{sp.name}</option>
                              ))}
                            </select>
                            <Button size="sm" variant="ghost" className="h-9"
                              onClick={() => setTagging(null)}>ביטול</Button>
                          </div>
                        </div>
                      )}

                      {editing === r.id && (
                        <div className="bg-blue-50 px-3 py-3 border-t">
                          <div className="grid grid-cols-2 sm:flex sm:items-end gap-2">
                            <div className="col-span-2 sm:w-36">
                              <label className="text-[10px] text-slate-500">תאריך</label>
                              <Input type="date" className="h-9" value={edit.date}
                                onChange={(e) => setEdit({ ...edit, date: e.target.value })} />
                            </div>
                            <div className="col-span-2 sm:flex-1">
                              <label className="text-[10px] text-slate-500">שם</label>
                              <Input className="h-9" value={edit.name}
                                onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500">חובה</label>
                              <Input className="h-9" type="number" dir="ltr" value={edit.out}
                                onChange={(e) => setEdit({ ...edit, out: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-[10px] text-slate-500">זכות</label>
                              <Input className="h-9" type="number" dir="ltr" value={edit.in}
                                onChange={(e) => setEdit({ ...edit, in: e.target.value })} />
                            </div>
                            <div className="col-span-2 flex gap-2">
                              <Button size="sm" className="h-9 flex-1 sm:flex-none"
                                onClick={() => saveEdit(r)} disabled={busy}>שמור</Button>
                              <Button size="sm" variant="ghost" className="h-9"
                                onClick={() => setEditing(null)}>ביטול</Button>
                              {r.source !== 'manual' && (
                                <Button size="sm" variant="ghost" className="h-9 text-xs text-slate-500"
                                  onClick={() => resetRow(r)} disabled={busy}>החזר למקור</Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {data?.hidden?.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
            <p className="text-[11px] text-slate-500 mb-1">
              {data.hidden.length} שורות שהסתרת — עדיין קיימות בנתונים, לא נספרות בצפי
            </p>
            {data.hidden.map((h) => (
              <div key={h.key} className="flex items-center justify-between text-[11px] py-0.5">
                <span className="truncate text-slate-500">{h.date} · {h.name}</span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="tabular-nums">{h.out ? `−₪${ils(h.out)}` : `₪${ils(h.in)}`}</span>
                  <button className="text-blue-600 underline"
                    onClick={() => resetRow({ id: h.key })} disabled={busy}>החזר</button>
                </span>
              </div>
            ))}
          </div>
        )}

        {data?.anchor && (
          <p className="text-[11px] text-slate-400">
            היתרה מעוגנת ל-{data.anchor.date} ({signed(data.anchor.balance)}) — היתרה האחרונה שהבנק הדפיס.
            שורות לפניה מחושבות אחורה, אחריה קדימה. ✎ = שורה שערכת.
            סימון שורת צפי כנפרעה מוציאה אותה מהחישוב קדימה, כדי שהתשלום האמיתי לא ייספר פעמיים
            כשייכנס העו"ש הבא.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
