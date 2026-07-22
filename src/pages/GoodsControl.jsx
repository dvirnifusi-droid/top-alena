// R6 — Goods-receiving control for the network commissary: rate / note / report
// issues (with credit tracking + photo) / thank suppliers, per invoice or per
// product ("תפוא אדמה נהדר ב-27.6 → תמיד תביא כזה"). A supplier-quality log.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Truck, Send, Camera } from 'lucide-react';
import PageGuard from '../components/shared/PageGuard';

const cur = (n) => `₪${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 })}`;
const KIND = {
  rating: ['👍 מעולה', 'bg-emerald-100 text-emerald-700'],
  note: ['📝 הערה', 'bg-slate-100 text-slate-700'],
  issue: ['⚠️ תקלה', 'bg-red-100 text-red-700'],
  thanks: ['🙏 תודה', 'bg-sky-100 text-sky-700'],
};

function GoodsControlInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [kind, setKind] = useState('rating');
  const [supplier, setSupplier] = useState('');
  const [product, setProduct] = useState('');
  const [rdate, setRdate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [creditExpected, setCreditExpected] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [phone, setPhone] = useState('');

  const load = async () => {
    setLoading(true);
    try { const r = await base44.functions.listGoodsFeedback({ days: 90 }); setData(r?.data || r); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const uploadPhoto = async (file) => {
    if (!file) return;
    setUploading(true);
    try { const up = await base44.integrations.Core.UploadFile({ file }); const d = up?.data || up; setPhotoUrl(d?.file_url || d?.url || ''); }
    catch { setMsg({ ok: false, text: 'העלאת תמונה נכשלה' }); }
    setUploading(false);
  };

  const save = async () => {
    if (!supplier.trim()) { setMsg({ ok: false, text: 'בחר ספק' }); return; }
    setBusy(true); setMsg(null);
    try {
      await base44.functions.saveGoodsFeedback({
        kind, supplier_name: supplier.trim(), product_name: product.trim() || null, received_date: rdate,
        note: note.trim() || null, rating: kind === 'rating' ? 5 : null,
        credit_expected: kind === 'issue' && creditExpected, credit_amount: creditExpected && creditAmount ? Number(creditAmount) : null,
        photo_url: photoUrl || null,
      });
      setMsg({ ok: true, text: '✅ נשמר ליומן' });
      setProduct(''); setNote(''); setCreditExpected(false); setCreditAmount(''); setPhotoUrl('');
      await load();
    } catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(false);
  };

  const markCredited = async (id) => {
    try { await base44.functions.setGoodsFeedbackCredit({ id, credit_status: 'credited' }); await load(); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
  };

  const sendToSupplier = async (fb) => {
    if (!phone.trim()) { setMsg({ ok: false, text: 'הזן טלפון ספק למעלה כדי לשלוח' }); return; }
    const message = fb.kind === 'thanks'
      ? `תודה על סחורה מעולה!${fb.product_name ? ` (${fb.product_name})` : ''} ${fb.note || ''}`.trim()
      : `שלום, הערה לגבי הסחורה${fb.product_name ? ` (${fb.product_name})` : ''} מתאריך ${fb.received_date || ''}: ${fb.note || ''}`.trim();
    setBusy(true);
    try { const r = await base44.functions.sendSupplierMessage({ phone: phone.trim(), message }); const d = r?.data || r; setMsg(d?.ok ? { ok: true, text: '📤 נשלח לספק' } : { ok: false, text: d?.error || 'לא נשלח' }); }
    catch (e) { setMsg({ ok: false, text: e?.message || 'שגיאה' }); }
    setBusy(false);
  };

  const feedback = data?.feedback || [];
  const suppliers = data?.suppliers || [];

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-white p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <h1 className="text-2xl font-black flex items-center gap-2"><Truck className="w-6 h-6 text-amber-400" /> בקרת קבלת סחורה</h1>
        {msg && <div className={`text-sm rounded px-3 py-2 ${msg.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>{msg.text}</div>}

        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="bg-slate-900 rounded-lg p-3"><div className="text-xs text-slate-400">זיכויים פתוחים</div><div className="text-2xl font-bold text-amber-300">{data?.open_credits || 0}</div></div>
          <div className="bg-slate-900 rounded-lg p-3"><div className="text-xs text-slate-400">סכום זיכויים ממתין</div><div className="text-2xl font-bold text-amber-300">{cur(data?.open_credit_amount)}</div></div>
        </div>

        <div className="bg-slate-900 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(KIND).map(([k, [label]]) => (
              <button key={k} onClick={() => setKind(k)} className={`text-sm rounded-lg px-3 py-1.5 ${kind === k ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{label}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input list="sups" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="ספק" className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white" />
            <datalist id="sups">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
            <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="מוצר (אופציונלי — למשל תפוא אדמה)" className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">תאריך קבלה:</label>
            <input type="date" value={rdate} onChange={(e) => setRdate(e.target.value)} dir="ltr" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white" />
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'rating' ? 'למשל: תפוא אדמה מעולה — תמיד תביא כזה' : 'הערה / פירוט התקלה'} rows={2} className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white" />
          {kind === 'issue' && (
            <div className="space-y-2 rounded-lg bg-red-950/30 border border-red-900/40 p-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={creditExpected} onChange={(e) => setCreditExpected(e.target.checked)} /> מגיע זיכוי</label>
              {creditExpected && <input type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="סכום זיכוי ₪" dir="ltr" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm w-32 text-white" />}
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-300 cursor-pointer bg-slate-800 hover:bg-slate-700 rounded px-3 py-1.5 flex items-center gap-1"><Camera className="w-4 h-4" /> {uploading ? 'מעלה…' : 'צרף תמונה'}<input type="file" accept="image/*" className="hidden" onChange={(e) => uploadPhoto(e.target.files?.[0])} /></label>
                {photoUrl && <img src={photoUrl} alt="" className="h-10 rounded" />}
              </div>
            </div>
          )}
          <button onClick={save} disabled={busy} className="bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2 font-bold text-sm disabled:opacity-50">שמור ליומן</button>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400">📞 טלפון ספק (לשליחת הודעה):</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0500000000" dir="ltr" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-white" />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-bold text-slate-300">יומן ספקים ({feedback.length})</div>
          {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-500" /></div>
            : feedback.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">אין רשומות עדיין. הוסף דירוג/תקלה/תודה למעלה.</p>
              : feedback.map((fb) => (
                <div key={fb.id} className="bg-slate-900 rounded-lg p-3 flex items-start gap-3">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${KIND[fb.kind]?.[1] || 'bg-slate-100 text-slate-700'}`}>{KIND[fb.kind]?.[0] || fb.kind}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{fb.supplier_name}{fb.product_name ? <span className="text-slate-400 font-normal"> · {fb.product_name}</span> : ''}</div>
                    <div className="text-xs text-slate-400">{fb.received_date}{fb.note ? ` · ${fb.note}` : ''}</div>
                    {fb.credit_status === 'pending' && <div className="text-xs text-amber-400 mt-0.5">💰 זיכוי ממתין{fb.credit_amount ? ` · ${cur(fb.credit_amount)}` : ''} · <button onClick={() => markCredited(fb.id)} className="underline hover:text-amber-200">סמן זוכה</button></div>}
                    {fb.credit_status === 'credited' && <div className="text-xs text-emerald-400 mt-0.5">✅ זוכה</div>}
                    {fb.photo_url && <img src={fb.photo_url} alt="" className="h-16 rounded mt-1" />}
                  </div>
                  {(fb.kind === 'issue' || fb.kind === 'thanks') && <button onClick={() => sendToSupplier(fb)} disabled={busy} className="text-[11px] bg-slate-800 hover:bg-slate-700 rounded px-2 py-1 whitespace-nowrap flex items-center gap-1 shrink-0"><Send className="w-3 h-3" /> לספק</button>}
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

export default function GoodsControl() {
  return (
    <PageGuard pageName="GoodsControl" pageTitle="בקרת סחורה">
      <GoodsControlInner />
    </PageGuard>
  );
}
