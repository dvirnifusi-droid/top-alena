import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useTenantBranding } from '@/hooks/useTenantBranding';

// Public page: customer signs the digital event contract.
// URL: /EventContractSign?token=xxx  (also reachable via /r/contract/xxx redirect)
export default function EventContractSign() {
  const branding = useTenantBranding();
  const brandName = branding?.name || 'המסעדה';
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
        const res = await base44.asServiceRole.functions.getPublicEventContract({ token });
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
      const res = await base44.asServiceRole.functions.signEventContract({
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

  // Group dishes by category (the editor stores {category, name})
  // A special {category: '__meta', meta: { categories: [...] }} entry may
  // carry per-category overrides — strip it before grouping dishes.
  const rawArr = Array.isArray(contract.menu_snapshot) ? contract.menu_snapshot : [];
  const metaEntry = rawArr.find((v) => v && typeof v === 'object' && v.category === '__meta');
  const rawDishes = rawArr.filter((v) => !(v && typeof v === 'object' && v.category === '__meta'));
  const overrides = (metaEntry?.meta?.categories || []).reduce((acc, c) => { acc[c.key] = c; return acc; }, {});
  const dishesByCat = {};
  for (const d of rawDishes) {
    const cat = (typeof d === 'object' && d?.category) ? d.category : 'custom';
    const name = typeof d === 'string' ? d : (d.name || d.label || '');
    if (!name) continue;
    (dishesByCat[cat] = dishesByCat[cat] || []).push(name);
  }
  const CAT_LABELS = {
    openers: 'פתיחות 🥖', sharing: 'חלוקה 🍢', mains: 'עיקריות בשר 🥩',
    closers: 'סיומות ☕', drinks: 'שתייה 🍺', custom: 'נוספים ✨',
  };
  const labelFor = (k) => overrides[k]?.label || CAT_LABELS[k] || k;
  const selectionRuleFor = (k) => {
    const o = overrides[k];
    if (!o) return null;
    if (o.min_select != null && o.max_select != null) {
      return o.min_select === o.max_select
        ? `יש לבחור ${o.min_select} מנות`
        : `יש לבחור ${o.min_select}–${o.max_select} מנות`;
    }
    if (o.min_select != null) return `יש לבחור לפחות ${o.min_select} מנות`;
    if (o.max_select != null) return `אפשר עד ${o.max_select} מנות`;
    return null;
  };
  const orderedCats = ['openers', 'sharing', 'mains', 'closers', 'drinks', 'custom'].filter(k => dishesByCat[k]);

  const upsells = Array.isArray(contract.upsells_snapshot) ? contract.upsells_snapshot : [];

  // Robust terms rendering — array of strings/{text}, raw string, or legacy object
  const terms = (() => {
    const v = contract.terms_snapshot;
    if (Array.isArray(v)) return v.map(t => typeof t === 'string' ? t : (t.text || t.label || '')).filter(Boolean);
    if (typeof v === 'string') return v.split('\n').filter(Boolean);
    if (v && typeof v === 'object') {
      const out = [];
      if (v.cancellation_days) out.push(`ביטול אירוע חייב להתבצע עד ${v.cancellation_days} ימים לפני המועד; אחרת המקדמה לא חוזרת.`);
      if (v.headcount_deadline_days) out.push(`עדכון כמות סופית של סועדים עד ${v.headcount_deadline_days} ימים לפני האירוע.`);
      return out;
    }
    return [];
  })();

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-amber-50 to-[#F4ECD8] py-6 px-3">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-6 space-y-6">

        {/* HEADER */}
        <div className="text-center border-b pb-4">
          <div className="text-3xl">{`🔥 ${brandName} אירועים 🔥`}</div>
          <div className="text-sm text-gray-500 mt-1">חוזה אירוע · {contract.contract_number || ''}</div>
          <div className="text-xs text-gray-400 mt-1">אוכל · אלכוהול · אווירה · אנשים</div>
        </div>

        {signed && (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 text-center space-y-1">
            <div className="text-4xl">✅</div>
            <div className="text-lg font-bold text-green-800">החוזה נחתם</div>
            <div className="text-xs text-green-700">המסמך המלא — לצפייה והדפסה</div>
            <button
              onClick={() => window.print()}
              className="mt-2 inline-flex items-center gap-1 bg-white border border-green-300 hover:bg-green-100 text-green-800 text-xs font-bold px-3 py-1.5 rounded-lg"
            >
              🖨 הדפס / שמור PDF
            </button>
          </div>
        )}
        {(() => {
          // Both signed and unsigned views show the full contract (event, menu, prices, terms).
          // The difference: unsigned shows the SIGN BLOCK at the bottom; signed shows the captured
          // SIGNATURES block. Previously the signed view rendered only signatures — owner couldn't
          // see what was actually signed.
          return (
          <>
            {/* CLIENT DETAILS — split per official contract */}
            <div className="bg-[#F4ECD8] rounded-xl p-4 space-y-2 text-sm">
              <div className="font-bold text-blue-900 text-base mb-2">פרטי המזמין</div>
              <Row k="👤 שם מלא" v={contract.customer_name} />
              <Row k="📞 טלפון" v={contract.customer_phone} />
              {contract.customer_email && <Row k="📧 אימייל" v={contract.customer_email} />}
              {contract.customer_address && <Row k="🏠 כתובת" v={contract.customer_address} />}
              {contract.customer_id_or_taxno && <Row k="🆔 ת.ז. / ח.פ." v={contract.customer_id_or_taxno} />}
              {contract.company_or_event_label && <Row k="🏢 שם חברה" v={contract.company_or_event_label} />}
            </div>

            <div className="space-y-2 text-sm">
              <div className="font-bold text-gray-800 text-base">פרטי האירוע</div>
              {contract.event_type && <Row k="🎉 סוג האירוע" v={contract.event_type} />}
              <Row k="📍 מיקום" v={contract.event_location} />
              <Row k="📅 תאריך" v={contract.event_date} />
              {(contract.event_start_time || contract.event_end_time) && (
                <Row k="🕐 שעת הגעה" v={`${contract.event_start_time || ''}${contract.event_end_time ? ' - ' + contract.event_end_time : ''}`} />
              )}
              <Row k="👥 כמות סועדים מחויב" v={contract.guest_count} />
              {contract.kids_count > 0 && <Row k="🧒 ילדים (עד גיל 12)" v={contract.kids_count} />}
              <Row k="🍽️ חבילה" v={contract.package_label} />
            </div>

            {/* MENU — grouped by category */}
            {orderedCats.length > 0 && (
              <div className="bg-amber-50 rounded-xl p-4 space-y-3 text-sm">
                <div className="font-bold text-amber-900">🍴 תפריט האירוע</div>
                {orderedCats.map(cat => {
                  const rule = selectionRuleFor(cat);
                  return (
                    <div key={cat}>
                      <div className="font-bold text-amber-800 text-xs uppercase mb-1">{labelFor(cat)}</div>
                      {rule && <div className="text-[11px] text-amber-700 mb-1">📋 {rule}</div>}
                      {dishesByCat[cat].map((n, i) => (
                        <div key={i} className="text-gray-800 mr-2">• {n}</div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* UPSELLS */}
            {upsells.length > 0 && (
              <div className="bg-[#F4ECD8] rounded-xl p-4 space-y-1 text-sm">
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
              {contract.tip_ils ? <Row k="טיפ למלצרים" v={`${contract.tip_ils} ₪`} /> : null}
              <div className="border-t my-2"></div>
              <Row k="סה״כ אירוע" v={`${contract.subtotal_ils || 0} ₪`} bold />
              <Row k="מקדמה" v={`${contract.deposit_ils || 0} ₪`} />
              <Row k="יתרה לתשלום" v={`${contract.balance_ils || 0} ₪`} bold />
            </div>

            {/* NOTES */}
            {contract.notes && (
              <div className="bg-[#FAF5E8] rounded-xl p-3 text-sm">
                <div className="font-bold mb-1">📝 הערות</div>
                <div className="whitespace-pre-wrap text-gray-700">{contract.notes}</div>
              </div>
            )}

            {/* TERMS — render section headers (lines starting with "## ") as bold subtitles */}
            {terms.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700">
                <div className="font-bold mb-3 text-gray-800 text-base">📜 תנאי ההסכם</div>
                {(() => {
                  // Group consecutive bullets under each "## " section header
                  const sections = [];
                  let current = null;
                  for (const raw of terms.filter(Boolean)) {
                    const t = typeof raw === 'string' ? raw : (raw.text || '');
                    if (!t) continue;
                    if (t.startsWith('## ')) {
                      if (current) sections.push(current);
                      current = { title: t.slice(3).trim(), items: [] };
                    } else {
                      if (!current) current = { title: '', items: [] };
                      current.items.push(t);
                    }
                  }
                  if (current) sections.push(current);
                  return sections.map((sec, i) => (
                    <div key={i} className="mb-3 last:mb-0">
                      {sec.title && <div className="font-bold text-gray-900 mb-1">{sec.title}</div>}
                      {sec.items.length > 0 && (
                        <ul className="space-y-1 list-disc pr-5 text-gray-700">
                          {sec.items.map((it, j) => <li key={j}>{it}</li>)}
                        </ul>
                      )}
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* SIGN BLOCK (only when not yet signed) */}
            {!signed && (
              <div className="border-2 border-dashed border-amber-400 rounded-xl p-4 space-y-3 bg-white">
                <div className="font-bold text-gray-800">✍️ אישור וחתימה</div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  אני החתום מטה מאשר כי קראתי את הסכם ההתקשרות, הבנתי את תנאיו, ואני מסכים לכל התנאים המפורטים בו ובנספחי ההזמנה המצורפים אליו.
                  ידוע לי כי טופס בחירת התפריט המצורף מהווה חלק בלתי נפרד מהסכם זה ומסומן כנספח א׳.
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
            )}

            {/* SIGNATURES (only after signing) */}
            {signed && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="border rounded-xl p-3 bg-white">
                  <div className="text-xs font-bold text-gray-600 mb-1">חתימת המזמין</div>
                  <div className="text-sm text-gray-800 mb-2">{contract.customer_name || ''}</div>
                  {contract.signature_data_url && (
                    <img src={contract.signature_data_url} alt="customer signature" className="max-h-24 mx-auto" />
                  )}
                  {contract.signed_at && (
                    <div className="text-[10px] text-gray-400 text-center mt-2">
                      {new Date(contract.signed_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  )}
                </div>
                <div className="border rounded-xl p-3 bg-white">
                  <div className="text-xs font-bold text-gray-600 mb-1">{`חתימת נציג ${brandName}`}</div>
                  {contract.rep_signed_at ? (
                    <>
                      <div className="text-sm text-gray-800 mb-2">{contract.rep_name || ''}</div>
                      {contract.rep_signature_data_url && (
                        <img src={contract.rep_signature_data_url} alt="rep signature" className="max-h-24 mx-auto" />
                      )}
                      <div className="text-[10px] text-gray-400 text-center mt-2">
                        {new Date(contract.rep_signed_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-amber-600 text-center py-6">{`⏳ ממתין לחתימת נציג ${brandName}`}</div>
                  )}
                </div>
              </div>
            )}
          </>
          );
        })()}

        <div className="text-center text-xs text-gray-400 pt-2 border-t">
          {`❤️ ${brandName} אירועים — היתר שלנו לעשות לכם אירוע שמח 🍻🔥`}
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
