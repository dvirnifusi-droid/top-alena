import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';

// Public page: customer signs the digital event contract.
// URL: /EventContractSign?token=xxx  (also reachable via /r/contract/xxx redirect)
export default function EventContractSign() {
  const [search] = useSearchParams();
  const token = search.get('token') || '';
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signed, setSigned] = useState(false);

  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasStrokesRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setError('קישור לא תקין');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await base44.functions.getPublicEventContract({ token });
        const data = res?.data || res;
        if (!data?.ok) throw new Error(data?.message || 'לא נמצא');
        setContract(data.contract);
        setSignerName(data.contract?.customer_name || '');
        if (data.contract?.status === 'signed') setSigned(true);
      } catch (e) {
        setError(e?.message || 'שגיאה בטעינת החוזה');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // Canvas drawing — supports mouse and touch
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111827';

    const pos = (e) => {
      const r = c.getBoundingClientRect();
      const t = e.touches?.[0];
      const x = (t ? t.clientX : e.clientX) - r.left;
      const y = (t ? t.clientY : e.clientY) - r.top;
      return { x: x * (c.width / r.width), y: y * (c.height / r.height) };
    };

    const start = (e) => {
      e.preventDefault();
      drawing.current = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e) => {
      if (!drawing.current) return;
      e.preventDefault();
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      hasStrokesRef.current = true;
    };
    const end = () => { drawing.current = false; };

    c.addEventListener('mousedown', start);
    c.addEventListener('mousemove', move);
    c.addEventListener('mouseup', end);
    c.addEventListener('mouseleave', end);
    c.addEventListener('touchstart', start, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', end);

    return () => {
      c.removeEventListener('mousedown', start);
      c.removeEventListener('mousemove', move);
      c.removeEventListener('mouseup', end);
      c.removeEventListener('mouseleave', end);
      c.removeEventListener('touchstart', start);
      c.removeEventListener('touchmove', move);
      c.removeEventListener('touchend', end);
    };
  }, [signed, loading]);

  const clearSig = () => {
    const c = canvasRef.current; if (!c) return;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    hasStrokesRef.current = false;
  };

  const submit = async () => {
    if (!signerName.trim()) { alert('יש להזין שם מלא'); return; }
    if (!hasStrokesRef.current) { alert('יש לחתום בריבוע למטה'); return; }
    setSubmitting(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const res = await base44.functions.signEventContract({
        token, customer_name: signerName.trim(), signature_data_url: dataUrl,
      });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.message || 'שגיאה');
      setSigned(true);
    } catch (e) {
      alert('שגיאה בשליחת החתימה: ' + (e?.message || e));
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="p-8 text-center" dir="rtl">טוען חוזה...</div>;
  if (error) return <div className="p-8 text-center text-red-700" dir="rtl">⚠️ {error}</div>;
  if (!contract) return null;

  const dishes = Array.isArray(contract.menu_snapshot) ? contract.menu_snapshot : [];
  const upsells = Array.isArray(contract.upsells_snapshot) ? contract.upsells_snapshot : [];
  const terms = Array.isArray(contract.terms_snapshot)
    ? contract.terms_snapshot
    : (typeof contract.terms_snapshot === 'string' ? contract.terms_snapshot.split('\n') : []);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-amber-50 to-rose-50 py-6 px-3">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-6 space-y-6">

        {/* HEADER */}
        <div className="text-center border-b pb-4">
          <div className="text-3xl">🔥 עלינא אירועים 🔥</div>
          <div className="text-sm text-gray-500 mt-1">חוזה אירוע · {contract.contract_number || ''}</div>
          <div className="text-xs text-gray-400 mt-1">אוכל · אלכוהול · אווירה · אנשים</div>
        </div>

        {signed ? (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6 text-center space-y-2">
            <div className="text-5xl">✅</div>
            <div className="text-xl font-bold text-green-800">החוזה נחתם!</div>
            <div className="text-sm text-green-700">תודה רבה. נשמח לראותך באירוע.</div>
            {contract.signature_data_url && (
              <img src={contract.signature_data_url} alt="signature" className="mx-auto mt-3 max-h-24" />
            )}
          </div>
        ) : (
          <>
            {/* CLIENT DETAILS */}
            <div className="space-y-2 text-sm">
              <div className="font-bold text-gray-800 text-base">פרטי האירוע</div>
              <Row k="👤 שם הלקוח" v={contract.customer_name} />
              <Row k="📞 טלפון" v={contract.customer_phone} />
              {contract.company_or_event_label && <Row k="🏢 חברה / אירוע" v={contract.company_or_event_label} />}
              <Row k="📍 מיקום" v={contract.event_location} />
              <Row k="📅 תאריך" v={contract.event_date} />
              {(contract.event_start_time || contract.event_end_time) && (
                <Row k="🕐 שעות" v={`${contract.event_start_time || ''}${contract.event_end_time ? ' - ' + contract.event_end_time : ''}`} />
              )}
              <Row k="👥 כמות סועדים" v={contract.guest_count} />
              <Row k="🍽️ חבילה" v={contract.package_label} />
            </div>

            {/* MENU */}
            {dishes.length > 0 && (
              <div className="bg-amber-50 rounded-xl p-4 space-y-1 text-sm">
                <div className="font-bold text-amber-900 mb-2">🍴 תפריט האירוע</div>
                {dishes.map((d, i) => (
                  <div key={i} className="text-gray-800">• {typeof d === 'string' ? d : (d.name || d.label)}</div>
                ))}
              </div>
            )}

            {/* UPSELLS */}
            {upsells.length > 0 && (
              <div className="bg-rose-50 rounded-xl p-4 space-y-1 text-sm">
                <div className="font-bold text-rose-900 mb-2">✨ תוספות</div>
                {upsells.map((u, i) => (
                  <div key={i} className="text-gray-800 flex justify-between">
                    <span>• {typeof u === 'string' ? u : (u.name || u.label)}</span>
                    {typeof u === 'object' && u.price && <span className="text-gray-500">{u.price}₪</span>}
                  </div>
                ))}
              </div>
            )}

            {/* PRICE */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm space-y-1">
              <div className="font-bold text-emerald-900 mb-2">💰 סיכום מחיר</div>
              <Row k="מחיר לסועד" v={contract.price_per_guest_ils ? `${contract.price_per_guest_ils} ₪` : '—'} />
              <Row k="כמות סועדים" v={contract.guest_count} />
              <Row k="תוספות" v={`${contract.upsells_total_ils || 0} ₪`} />
              <div className="border-t my-2"></div>
              <Row k="סה״כ אירוע" v={`${contract.subtotal_ils || 0} ₪`} bold />
              <Row k="מקדמה" v={`${contract.deposit_ils || 0} ₪`} />
              <Row k="יתרה לתשלום" v={`${contract.balance_ils || 0} ₪`} bold />
            </div>

            {/* NOTES */}
            {contract.notes && (
              <div className="bg-yellow-50 rounded-xl p-3 text-sm">
                <div className="font-bold mb-1">📝 הערות</div>
                <div className="whitespace-pre-wrap text-gray-700">{contract.notes}</div>
              </div>
            )}

            {/* TERMS */}
            {terms.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700">
                <div className="font-bold mb-2 text-gray-800">📜 תנאים</div>
                <ul className="space-y-1 list-disc pr-5">
                  {terms.filter(Boolean).map((t, i) => (
                    <li key={i}>{typeof t === 'string' ? t : (t.text || JSON.stringify(t))}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* SIGN BLOCK */}
            <div className="border-2 border-dashed border-amber-400 rounded-xl p-4 space-y-3 bg-white">
              <div className="font-bold text-gray-800">✍️ אישור וחתימה</div>
              <p className="text-xs text-gray-600">
                בחתימתי להלן אני מאשר/ת את כל פרטי האירוע, התפריט, המחיר והתנאים שלעיל.
              </p>
              <input
                type="text"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="שם מלא של החותם/ת"
                className="w-full border rounded-lg px-3 py-2 text-base"
              />
              <div>
                <div className="text-xs text-gray-500 mb-1">חתימה (סמן/י באצבע או בעכבר)</div>
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={240}
                  className="w-full h-40 border-2 border-amber-300 rounded-lg bg-white touch-none"
                />
                <button
                  onClick={clearSig}
                  className="mt-1 text-xs text-gray-500 underline"
                  type="button"
                >נקה</button>
              </div>
              <button
                onClick={submit}
                disabled={submitting}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-lg transition-colors"
              >
                {submitting ? 'שולח...' : '✅ אני חותם/ת ומאשר/ת'}
              </button>
              <p className="text-[10px] text-gray-400 text-center">חתימה דיגיטלית מקבילה לחתימה בכתב יד</p>
            </div>
          </>
        )}

        <div className="text-center text-xs text-gray-400 pt-2 border-t">
          ❤️ עלינא אירועים — היתר שלנו לעשות לכם אירוע שמח 🍻🔥
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, bold }) {
  if (v === null || v === undefined || v === '') return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{k}</span>
      <span className={bold ? 'font-bold text-gray-900' : 'text-gray-800'}>{v}</span>
    </div>
  );
}
