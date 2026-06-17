import React, { useState, useEffect, useRef } from 'react';
import { invokePublic } from '@/lib/publicFetch';
import { Send, CheckCircle2, CreditCard } from 'lucide-react';
import LanguagePicker from '@/components/shared/LanguagePicker';
import { useI18n, LANG_NAMES_FOR_LLM } from '@/lib/i18n';

// Inline SVG avatar for Dana — a friendly, restaurant-warm portrait that
// makes the chat feel like a person not a bot. Embedded as a data: URL so
// it loads instantly with the page (no extra request, no broken external
// link). The art is intentionally stylised, not a real photo, so guests
// don't expect a specific person on the other end.
const DANA_AVATAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F4ECD8"/>
      <stop offset="100%" stop-color="#D9BD83"/>
    </linearGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5B3924"/>
      <stop offset="100%" stop-color="#3D2412"/>
    </linearGradient>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#bg)"/>
  <!-- hair back -->
  <path d="M14 46c0-19 12-30 26-30s26 11 26 30c0 6-3 12-7 14V38c0-12-9-20-19-20s-19 8-19 20v22c-4-2-7-8-7-14z" fill="url(#hair)"/>
  <!-- face -->
  <ellipse cx="40" cy="44" rx="17" ry="20" fill="#F5D4B0"/>
  <!-- soft cheeks -->
  <circle cx="29" cy="50" r="3" fill="#F5B5A3" opacity="0.55"/>
  <circle cx="51" cy="50" r="3" fill="#F5B5A3" opacity="0.55"/>
  <!-- eyes -->
  <ellipse cx="32" cy="43" rx="2" ry="2.5" fill="#3D2412"/>
  <ellipse cx="48" cy="43" rx="2" ry="2.5" fill="#3D2412"/>
  <circle cx="32.6" cy="42.4" r="0.7" fill="#fff"/>
  <circle cx="48.6" cy="42.4" r="0.7" fill="#fff"/>
  <!-- brows -->
  <path d="M28 39c2-1.5 5-1.5 7 0" stroke="#3D2412" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <path d="M45 39c2-1.5 5-1.5 7 0" stroke="#3D2412" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <!-- smile -->
  <path d="M34 54c2.5 3 9.5 3 12 0" stroke="#A04A2E" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- earring hints -->
  <circle cx="22" cy="46" r="1.4" fill="#B89556"/>
  <circle cx="58" cy="46" r="1.4" fill="#B89556"/>
  <!-- olive leaf on shoulder, brand callback -->
  <path d="M58 64c-3 1-6 0-7-3 2-1 5 0 7 3z" fill="#44512C"/>
</svg>`;
const DANA_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(DANA_AVATAR_SVG)}`;

function readUtmSource() {
  try { return new URLSearchParams(window.location.search).get('utm_source') || null; }
  catch { return null; }
}

export default function EventsInquiry() {
  const [utmSource] = useState(readUtmSource);
  const [t, lang] = useI18n();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [leadId, setLeadId] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [paymentUrl, setPaymentUrl] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const sendTurn = async (text) => {
    setSending(true);
    setError(null);
    const history = text ? [...messages, { role: 'user', content: text }] : messages;
    if (text) setMessages(history);
    try {
      const res = await invokePublic('chatEventsInquiry', {
        history, message: text, source: utmSource, lead_id: leadId, booking_id: bookingId,
        language: LANG_NAMES_FOR_LLM[lang] || 'Hebrew',
      });
      setMessages([...history, { role: 'assistant', content: res?.reply || '...' }]);
      if (res?.lead_id) setLeadId(res.lead_id);
      if (res?.booking_id) setBookingId(res.booking_id);
      if (res?.payment_url) setPaymentUrl(res.payment_url);
      setShowConfirm(!!res?.show_confirm_buttons);
      if (res?.complete) { setDone(true); setRejected(!!res.rejected); }
    } catch (e) {
      setError(e?.message || 'בעיה זמנית');
      setMessages((m) => [...m, { role: 'assistant', content: 'מצטערת, יש בעיה זמנית. נסו שוב בעוד רגע 🙏' }]);
    } finally { setSending(false); }
  };

  useEffect(() => { sendTurn(''); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = () => {
    const text = input.trim();
    if (!text || sending || done) return;
    setInput('');
    sendTurn(text);
  };
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const isRtl = lang === 'he';
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="bg-white/85 backdrop-blur border-b border-emerald-100 p-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* Dana's portrait — makes the page feel like a person, not a bot.
              The green dot in the corner reads as 'online now'. */}
          <div className="relative">
            <img
              src={DANA_AVATAR}
              alt="דנה"
              className="w-12 h-12 rounded-full ring-2 ring-emerald-300 shadow-sm object-cover bg-white"
            />
            <span className="absolute -bottom-0.5 -end-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-bold text-emerald-900 truncate">דנה · מנהלת אירועים</h1>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">פעילה</span>
            </div>
            <p className="text-[11px] text-emerald-700 truncate">{t('events_subtitle')}</p>
          </div>
          <LanguagePicker />
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex items-end gap-2 ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              {/* Show Dana's small avatar next to her bubbles for a person-feel */}
              {m.role !== 'user' && (
                <img src={DANA_AVATAR} alt="דנה" className="w-7 h-7 rounded-full shadow-sm bg-white shrink-0" />
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-white text-slate-800 rounded-bl-sm border border-emerald-100'
              }`}>{m.content}</div>
            </div>
          ))}
          {sending && (
            <div className="flex items-end gap-2 justify-end">
              <img src={DANA_AVATAR} alt="דנה" className="w-7 h-7 rounded-full shadow-sm bg-white shrink-0" />
              <div className="bg-white text-slate-500 rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm text-sm border border-emerald-100">דנה כותבת…</div>
            </div>
          )}
        </div>

        {done && !paymentUrl && (
          <div className="rounded-xl p-4 my-3 bg-emerald-50 border border-emerald-200">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-emerald-900">הפרטים שלכם נשמרו — המנהל יחזור אליכם תוך כמה שעות 🌿</span>
            </div>
          </div>
        )}

        {paymentUrl && (
          <a href={paymentUrl} target="_blank" rel="noreferrer"
             className="block rounded-2xl p-4 my-3 bg-gradient-to-br from-emerald-600 to-[#44512C] text-white shadow-lg hover:shadow-xl transition">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CreditCard className="w-6 h-6 flex-shrink-0" />
                <div>
                  <div className="font-bold">💳 לתשלום פיקדון</div>
                  <div className="text-xs text-emerald-100 mt-0.5">לאחר התשלום ההזמנה תאושר סופית ע״י המנהל</div>
                </div>
              </div>
              <div className="text-sm font-bold bg-white/20 rounded-lg px-3 py-1">פתח</div>
            </div>
          </a>
        )}

        {showConfirm && !done && (
          <div className="my-3 grid grid-cols-2 gap-2">
            <button
              onClick={() => { setShowConfirm(false); sendTurn('כן, אני מאשר את ההזמנה — סגור'); }}
              disabled={sending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-3 px-4 font-bold shadow-md transition disabled:opacity-50"
            >
              ✅ אני מאשר את ההזמנה
            </button>
            <button
              onClick={() => { setShowConfirm(false); sendTurn('אני לא בטוח/ה — אשמח לחלופה'); }}
              disabled={sending}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-2xl py-3 px-4 font-bold shadow-sm transition disabled:opacity-50"
            >
              💭 רגע, רוצה לבדוק
            </button>
          </div>
        )}

        {error && <div className="rounded-xl p-3 my-2 bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}

        <div className="bg-white border border-emerald-200 rounded-2xl p-2 flex items-end gap-2 shadow-sm">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
            placeholder="הקלידו את התשובה ולחצו שלח…" disabled={sending} rows={1}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
            style={{ minHeight: '36px', maxHeight: '120px' }} />
          <button onClick={send} disabled={!input.trim() || sending}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl px-4 py-2 flex items-center gap-1 text-sm font-medium">
            שלח <Send className="w-4 h-4" />
          </button>
        </div>
      </main>

      <footer className="text-center text-xs text-emerald-700/70 p-3">
        🔒 הפרטים שלכם נשמרים במערכת הניהול של עלינא בלבד.
      </footer>
    </div>
  );
}
