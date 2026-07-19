import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Plus, Trash2, Table2 } from 'lucide-react';

const ils = (n) => Math.round(Math.abs(Number(n || 0))).toLocaleString();
const signed = (n) => `${n < 0 ? '−' : ''}₪${ils(n)}`;

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

  const toggleSettled = async (row) => {
    setBusy(true);
    try {
      await base44.functions.updateCashFlowRow({ id: row.id, settled: !row.settled });
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  const removeRow = async (row) => {
    setBusy(true);
    try {
      await base44.functions.updateCashFlowRow({ id: row.id, delete: true });
      await load();
    } catch { /* ignore */ }
    setBusy(false);
  };

  if (denied) return null;

  const rows = (data?.rows || []).filter((r) =>
    filter === 'all' ? true : filter === 'unsettled' ? !r.settled : r.settled);
  const line = data?.credit_line || 0;
  const today = data?.today;

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
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : !rows.length ? (
          <p className="text-sm text-slate-500 text-center py-6">אין תנועות בטווח</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-xs min-w-[720px]">
              <thead className="bg-slate-100 text-slate-600 sticky top-0">
                <tr>
                  <th className="p-2 text-right">תאריך</th>
                  <th className="p-2 text-right">קטגוריה</th>
                  <th className="p-2 text-right">שם</th>
                  <th className="p-2 text-left">חובה</th>
                  <th className="p-2 text-left">זכות</th>
                  <th className="p-2 text-left">יתרה</th>
                  <th className="p-2 text-center">סטטוס</th>
                  <th className="p-2 text-center">מקור</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isToday = r.date === today;
                  const prevDate = i > 0 ? rows[i - 1].date : null;
                  // A visible line where history stops and the forecast begins —
                  // the single most important boundary on this table.
                  const crossesToday = prevDate && prevDate < today && r.date >= today;
                  return (
                    <React.Fragment key={r.id}>
                      {crossesToday && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <div className="flex items-center gap-2 my-1">
                              <div className="h-px bg-blue-400 flex-1" />
                              <span className="text-[10px] text-blue-600 font-bold whitespace-nowrap">
                                ↑ נפרע · מכאן צפי ↓
                              </span>
                              <div className="h-px bg-blue-400 flex-1" />
                            </div>
                          </td>
                        </tr>
                      )}
                      <tr className={`border-b ${
                        r.settled ? 'bg-emerald-50/50' : 'bg-amber-50/40'
                      } ${isToday ? 'ring-1 ring-blue-300' : ''}`}>
                        <td className="p-2 whitespace-nowrap font-mono text-[11px]">{r.date}</td>
                        <td className="p-2 whitespace-nowrap text-slate-500">{r.category}</td>
                        <td className="p-2 max-w-[220px] truncate" title={r.note || r.name}>{r.name}</td>
                        <td className="p-2 text-left tabular-nums text-red-700 font-medium">
                          {r.out ? ils(r.out) : ''}
                        </td>
                        <td className="p-2 text-left tabular-nums text-emerald-700 font-medium">
                          {r.in ? ils(r.in) : ''}
                        </td>
                        <td className={`p-2 text-left tabular-nums font-bold ${
                          r.balance < -line ? 'text-red-700' : r.balance < 0 ? 'text-amber-700' : 'text-slate-700'
                        }`}>{signed(r.balance)}</td>
                        <td className="p-2 text-center whitespace-nowrap">
                          {r.editable ? (
                            <button onClick={() => toggleSettled(r)} disabled={busy}
                              className={`rounded-full px-2 py-0.5 text-[10px] ${
                                r.settled ? 'bg-emerald-600 text-white' : 'bg-amber-200 text-amber-900'}`}>
                              {r.settled ? 'נפרע' : 'טרם נפרע'}
                            </button>
                          ) : (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${
                              r.settled ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                              {r.settled ? 'נפרע' : 'טרם נפרע'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center text-[10px] text-slate-400">{SOURCE_HE[r.source]}</td>
                        <td className="p-2 text-center">
                          {r.editable && (
                            <button onClick={() => removeRow(r)} disabled={busy}>
                              <Trash2 className="w-3.5 h-3.5 text-red-400 hover:text-red-600" />
                            </button>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data?.anchor && (
          <p className="text-[11px] text-slate-400">
            היתרה מעוגנת ל-{data.anchor.date} ({signed(data.anchor.balance)}) — היתרה האחרונה שהבנק הדפיס.
            שורות לפניה מחושבות אחורה, אחריה קדימה.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
