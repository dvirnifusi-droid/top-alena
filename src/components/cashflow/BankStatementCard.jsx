import React, { useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, Landmark, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

const ils = (n) => `₪${Math.round(Number(n || 0)).toLocaleString()}`;
const HE_MONTH = (m) => {
  const [y, mo] = String(m).split('-');
  return `${['', 'ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'][Number(mo)]} ${y.slice(2)}`;
};

// Upload the bank's own export (any format, any bank) and let it build the
// historical cash flow — instead of the owner typing numbers in by hand.
export default function BankStatementCard() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);   // dry-run result awaiting confirmation
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [denied, setDenied] = useState(false);
  const fileRef = useRef(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const r = await base44.functions.getBankSummary({ months: 12 });
      setSummary((r?.data ?? r) || null);
    } catch (e) {
      if (/forbidden|unauthorized|401|403/i.test(String(e?.message))) setDenied(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const readAsBase64 = (file) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('לא ניתן לקרוא את הקובץ'));
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.readAsDataURL(file);
  });

  const onFile = async (file) => {
    if (!file) return;
    setBusy(true); setMsg(null); setPreview(null);
    try {
      const content_base64 = await readAsBase64(file);
      const r = await base44.functions.importBankStatement({
        content_base64, filename: file.name, dry_run: true,
      });
      const d = (r?.data ?? r) || {};
      if (!d.ok) setMsg({ ok: false, t: (d.warnings || []).join(' · ') || 'לא הצלחתי לקרוא את הקובץ' });
      else setPreview({ ...d, _file: file.name, _b64: content_base64 });
    } catch (e) { setMsg({ ok: false, t: e?.message || 'שגיאה בקריאת הקובץ' }); }
    setBusy(false);
  };

  const confirmImport = async () => {
    if (!preview) return;
    setBusy(true); setMsg(null);
    try {
      const r = await base44.functions.importBankStatement({
        content_base64: preview._b64, filename: preview._file, dry_run: false,
      });
      const d = (r?.data ?? r) || {};
      const extra = d.opening_set
        ? ` · יתרת פתיחה עודכנה ל-${ils(d.opening_set.balance)} (${d.opening_set.date})`
        : '';
      setMsg({ ok: true, t: `נקלטו ${d.imported} תנועות${d.duplicates ? `, ${d.duplicates} כבר היו במערכת` : ''}${extra}` });
      setPreview(null);
      loadSummary();
    } catch (e) { setMsg({ ok: false, t: e?.message || 'שגיאה בייבוא' }); }
    setBusy(false);
  };

  if (denied) return null;

  const income = (summary?.categories || []).filter((c) => c.total > 0);
  const expense = (summary?.categories || []).filter((c) => c.total < 0);

  return (
    <Card dir="rtl" className="mb-6 border-sky-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="w-5 h-5 text-sky-600" />
          עובר ושב — ייבוא מהבנק
          {summary?.has_data && (
            <span className="text-xs font-normal text-slate-500">
              {summary.from} → {summary.to} · {summary.transactions} תנועות
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {msg && (
          <div className={`text-sm flex items-start gap-1.5 rounded-lg px-3 py-2 ${
            msg.ok ? 'text-emerald-800 bg-emerald-50 border border-emerald-200'
                   : 'text-red-800 bg-red-50 border border-red-200'}`}>
            {msg.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                    : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{msg.t}</span>
          </div>
        )}

        {/* ── upload ── */}
        {!preview && (
          <div
            className="border-2 border-dashed border-sky-200 rounded-xl p-5 text-center bg-sky-50/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
          >
            <input ref={fileRef} type="file" className="hidden"
              accept=".xls,.xlsx,.csv,.txt,.htm,.html"
              onChange={(e) => onFile(e.target.files?.[0])} />
            <Upload className="w-7 h-7 mx-auto text-sky-500 mb-2" />
            <p className="text-sm font-medium">גרור לכאן את ייצוא העו"ש, או</p>
            <Button size="sm" variant="outline" className="mt-2" disabled={busy}
              onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
              בחר קובץ
            </Button>
            <p className="text-[11px] text-slate-500 mt-2">
              כל בנק, כל פורמט — Excel / CSV / דוח מהאתר. אני מזהה את העמודות לבד ומסווג כל תנועה.
              ייבוא חוזר של אותה תקופה לא ייצור כפילויות.
            </p>
            <p className="text-[11px] text-sky-700 mt-2 border-t pt-2">
              📧 <b>אוטומטי:</b> הגדר בבנק שליחת דוח תנועות למייל המחובר למערכת — הוא ייקלט לבד
              תוך 10 דקות, בלי להעלות כלום. גם קובץ שתעביר למייל הזה בעצמך יעבוד.
            </p>
          </div>
        )}

        {/* ── preview before committing ── */}
        {preview && (
          <div className="rounded-xl border border-sky-300 bg-sky-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm">
                <b>{preview.bank || 'בנק לא מזוהה'}</b>
                {preview.account ? <span className="text-slate-500"> · חשבון {preview.account}</span> : null}
                <div className="text-xs text-slate-600 mt-0.5">
                  {preview.from} → {preview.to} · {preview.total} תנועות
                  {preview.new !== preview.total && <> · <b>{preview.new} חדשות</b>, {preview.duplicates} קיימות</>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)} disabled={busy}>ביטול</Button>
                <Button size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={confirmImport}
                  disabled={busy || !preview.new}>
                  {busy ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : null}
                  {preview.new ? `ייבא ${preview.new} תנועות` : 'הכל כבר קיים'}
                </Button>
              </div>
            </div>

            {preview.closing_balance != null && (
              <p className="text-xs text-slate-700">
                יתרה בחשבון לפי הדוח: <b className={preview.closing_balance < 0 ? 'text-red-600' : 'text-emerald-700'}>
                  {ils(preview.closing_balance)}</b>
                {preview.credit_line ? <> · מסגרת אשראי {ils(preview.credit_line)}</> : null}
                <span className="text-slate-500"> — תיקבע אוטומטית כיתרת הפתיחה של התזרים</span>
              </p>
            )}

            <MonthTable months={preview.months} />
            <CatChips categories={preview.categories} />

            {(preview.warnings || []).map((w, i) => (
              <p key={i} className="text-xs text-amber-800">⚠ {w}</p>
            ))}
          </div>
        )}

        {/* ── what's already stored ── */}
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
        ) : summary?.has_data ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">מה שכבר במערכת</h4>
              <div className="flex items-center gap-3">
                {summary.latest_balance != null && (
                  <span className="text-xs text-slate-600">
                    יתרה אחרונה ({summary.latest_balance_date}):{' '}
                    <b className={summary.latest_balance < 0 ? 'text-red-600' : 'text-emerald-700'}>
                      {ils(summary.latest_balance)}</b>
                  </span>
                )}
                <button className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  onClick={loadSummary}><RefreshCw className="w-3 h-3" /> רענן</button>
              </div>
            </div>
            <MonthTable months={summary.months} />
            <div className="grid md:grid-cols-2 gap-3">
              <CatList title="נכנס" items={income} tone="in" />
              <CatList title="יוצא" items={expense} tone="out" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 text-center py-2">
            עדיין לא יובא עו"ש. העלה ייצוא של 3 חודשים ומעלה — משם ייבנה התזרים ההיסטורי והצפי.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MonthTable({ months }) {
  if (!months?.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="p-1.5 text-right">חודש</th>
            <th className="p-1.5 text-left">נכנס</th>
            <th className="p-1.5 text-left">יוצא</th>
            <th className="p-1.5 text-left">נטו</th>
            <th className="p-1.5 text-center">תנועות</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {months.map((m) => (
            <tr key={m.month}>
              <td className="p-1.5 font-medium">{HE_MONTH(m.month)}</td>
              <td className="p-1.5 text-left text-emerald-700 tabular-nums">{ils(m.in)}</td>
              <td className="p-1.5 text-left text-red-600 tabular-nums">{ils(m.out)}</td>
              <td className={`p-1.5 text-left font-bold tabular-nums ${m.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {m.net >= 0 ? '+' : ''}{ils(m.net)}
              </td>
              <td className="p-1.5 text-center text-slate-500">{m.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CatChips({ categories }) {
  if (!categories?.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.slice(0, 10).map((c) => (
        <span key={c.category}
          className={`text-[11px] rounded-full px-2 py-0.5 border ${
            c.total >= 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                         : 'bg-red-50 border-red-200 text-red-800'}`}>
          {c.label}: {ils(Math.abs(c.total))}
        </span>
      ))}
    </div>
  );
}

function CatList({ title, items, tone }) {
  if (!items?.length) return null;
  const total = items.reduce((n, c) => n + Math.abs(c.total), 0);
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between mb-2">
        <h5 className="text-xs font-semibold text-slate-600">{title}</h5>
        <span className={`text-sm font-bold ${tone === 'in' ? 'text-emerald-700' : 'text-red-600'}`}>{ils(total)}</span>
      </div>
      <div className="space-y-1">
        {items.map((c) => {
          const pct = total ? Math.round((Math.abs(c.total) / total) * 100) : 0;
          return (
            <div key={c.category} className="text-xs">
              <div className="flex justify-between">
                <span>{c.label} <span className="text-slate-400">({c.count})</span></span>
                <span className="tabular-nums font-medium">{ils(Math.abs(c.total))} · {pct}%</span>
              </div>
              <div className="h-1 bg-slate-100 rounded mt-0.5">
                <div className={`h-1 rounded ${tone === 'in' ? 'bg-emerald-400' : 'bg-red-400'}`}
                  style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
