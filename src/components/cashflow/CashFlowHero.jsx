import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

const ils = (n) => `₪${Math.abs(Math.round(Number(n || 0))).toLocaleString()}`;

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

function heDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${d} ב${HE_MONTHS[m - 1]}`;
}

function daysFromNow(iso) {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  const now = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((t - now) / 86400000);
}

function inWords(iso) {
  const d = daysFromNow(iso);
  if (d === null) return '';
  if (d <= 0) return 'היום';
  if (d === 1) return 'מחר';
  if (d < 14) return `בעוד ${d} ימים`;
  if (d < 60) return `בעוד כ-${Math.round(d / 7)} שבועות`;
  return `בעוד כ-${Math.round(d / 30)} חודשים`;
}

// The whole cash flow in three sentences: how much is left, until when, and what
// to do about it. Everything else on the page is detail behind this.
export default function CashFlowHero() {
  const [f, setF] = useState(null);
  const [bank, setBank] = useState(null);
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await base44.functions.getCapitalForecast({ days: 90 });
        setF((r?.data ?? r) || null);
        // Real history, so the headline can say what usually happens rather than
        // only what the model extrapolates.
        try {
          const b = await base44.functions.getBankSummary({ months: 6 });
          setBank((b?.data ?? b) || null);
        } catch { /* optional */ }
        try {
          const a = await base44.functions.getCashflowActions({ days: 90 });
          setActions(((a?.data ?? a) || {}).actions || []);
        } catch { /* the headline matters more than the advice */ }
      } catch (e) {
        if (/forbidden|unauthorized|401|403/i.test(String(e?.message))) setDenied(true);
      }
      setLoading(false);
    })();
  }, []);

  if (denied) return null;

  if (loading) {
    return (
      <div dir="rtl" className="rounded-2xl border bg-white p-8 mb-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    );
  }

  if (!f?.has_data) {
    return (
      <div dir="rtl" className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 mb-6 text-center">
        <div className="text-4xl mb-2">🏦</div>
        <p className="text-lg font-bold text-slate-800">עדיין אין לי את התמונה</p>
        <p className="text-sm text-slate-500 mt-1">
          העלה את ייצוא העו"ש מהבנק בכרטיס שמתחת, והכל ייבנה מעצמו.
        </p>
      </div>
    );
  }

  const balance = f.opening?.balance ?? 0;
  const line = f.credit_line || 0;
  // Headroom, not balance. "You have ₪16,000 left before the bank stops paying"
  // is a fact an owner can act on; "-34,002" is one they have to translate.
  const headroom = line > 0 ? line + balance : balance;
  const breach = f.first_beyond_credit;
  const tight = headroom < line * 0.35;

  // The real monthly trend, from FULL months only. A month counts as full when
  // the statement covers all of it — NOT when it has many transactions. Alena's
  // export starts on 20 April and ends on 16 July: both months are busy but
  // truncated, and averaging them in would report a swing that never happened.
  const full = (bank?.months || []).filter((m) => {
    if (!bank?.from || !bank?.to) return false;
    const [y, mo] = m.month.split('-').map(Number);
    const first = `${m.month}-01`;
    const last = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    return first >= bank.from && last <= bank.to;
  });
  const monthly = full.length
    ? Math.round(full.reduce((t, m) => t + m.net, 0) / full.length)
    : null;

  // At most three, and never the housekeeping ones — someone who is lost needs
  // the lever, not the audit trail.
  const SKIP = new Set(['scan_invoices', 'stale_invoices']);
  const top = actions.filter((a) => !SKIP.has(a.key)).slice(0, 3);

  return (
    <div dir="rtl" className="mb-6 space-y-3">
      {/* 1 — how much is left */}
      <div className={`rounded-2xl border-2 p-5 ${
        headroom <= 0 ? 'bg-red-50 border-red-300'
          : tight ? 'bg-amber-50 border-amber-300'
          : 'bg-emerald-50 border-emerald-300'}`}>
        <p className="text-sm text-slate-600">כמה כסף נשאר לי לפני שהבנק עוצר תשלומים</p>
        <p className={`text-4xl font-black mt-1 tabular-nums ${
          headroom <= 0 ? 'text-red-700' : tight ? 'text-amber-700' : 'text-emerald-700'}`}>
          {headroom <= 0 ? `חריגה של ${ils(headroom)}` : ils(headroom)}
        </p>
        <p className="text-xs text-slate-500 mt-1.5">
          בחשבון {balance < 0 ? `מינוס ${ils(balance)}` : ils(balance)}
          {line > 0 && <> · מסגרת אשראי {ils(line)}</>}
          {f.opening?.date && <> · נכון ל-{heDate(f.opening.date)}</>}
        </p>
      </div>

      {/* 2 — the trend, which is the thing that actually decides the outcome.
             NOT a hard breach date: the forecast spreads supplier payments as an
             even daily drip, so it always produces a confident-looking first
             breach a day or two out. The real account oscillates — it drains
             through the week and the card clearing refills it. Stating the drip's
             date as fact would be alarmism, and the first time it did not happen
             the owner would stop believing the whole page. */}
      <div className="rounded-2xl border-2 border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-600">לאן זה הולך</p>
        {monthly !== null ? (
          <>
            <p className={`text-2xl font-bold mt-1 ${monthly < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {monthly < 0 ? `יורד ${ils(monthly)} בחודש` : `עולה ${ils(monthly)} בחודש`}
            </p>
            <p className="text-sm text-slate-600 mt-1">
              {monthly < 0
                ? 'זו המגמה בפועל לפי החודשים המלאים בעו"ש — לא תחזית. בקצב הזה המסגרת נגמרת, השאלה היא רק מתי.'
                : 'לפי החודשים המלאים בעו"ש.'}
            </p>
          </>
        ) : (
          <p className="text-2xl font-bold text-slate-700 mt-1">אין עדיין מספיק היסטוריה</p>
        )}

        <div className="mt-3 pt-3 border-t text-xs text-slate-500 space-y-1">
          {breach && (
            <p>
              ⚠ אם לא ישתנה כלום, הצפי מגיע לגבול המסגרת סביב {heDate(breach)} —
              אבל הוא פורס תשלומי ספקים באופן אחיד, כך שהתאריך מוקדם ממה שקורה בפועל.
            </p>
          )}
          {full.length > 0 && (
            <p>📊 ממוצע של {full.length} חודשים מלאים ({full.map((m) => m.month).join(', ')}).</p>
          )}
        </div>
      </div>

      {/* 3 — what to do */}
      {top.length > 0 && (
        <div className="rounded-2xl border-2 border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600 mb-2">מה לעשות</p>
          <ol className="space-y-2.5">
            {top.map((a, i) => (
              <li key={a.key} className="flex gap-3">
                <span className="w-6 h-6 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-snug">{a.title}</p>
                  {a.impact > 0 && (
                    <p className="text-xs text-emerald-700 font-medium mt-0.5">
                      שווה {a.impact_label}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center">
        כל המספרים מחושבים מחדש בכל פתיחה — אין מה לעדכן ידנית. הפירוט המלא מתחת.
      </p>
    </div>
  );
}
