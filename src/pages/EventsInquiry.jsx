import React, { useState, useEffect, useRef } from 'react';
import { invokePublic } from '@/lib/publicFetch';
import { Send, CheckCircle2, CreditCard } from 'lucide-react';
import LanguagePicker from '@/components/shared/LanguagePicker';
import { useI18n, LANG_NAMES_FOR_LLM } from '@/lib/i18n';
import { initMetaPixel, trackCustom } from '@/lib/metaPixel';

// Dana's portrait — realistic photo generated via Imagen 4 and committed
// under public/images. WebP loads first (23 KB), PNG is the fallback
// (~360 KB, served only by browsers that don't speak WebP — practically
// none in 2026 but a safe net regardless).
const DANA_AVATAR = '/images/dana.webp';
const DANA_AVATAR_FALLBACK = '/images/dana.png';

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
  const [thanksToken, setThanksToken] = useState(null);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const leadTrackedRef = useRef(false);

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
      if (res?.thanks_token) setThanksToken(res.thanks_token);
      if (res?.complete) { setDone(true); setRejected(!!res.rejected); }
    } catch (e) {
      setError(e?.message || 'בעיה זמנית');
      setMessages((m) => [...m, { role: 'assistant', content: 'מצטערת, יש בעיה זמנית. נסו שוב בעוד רגע 🙏' }]);
    } finally { setSending(false); }
  };

  useEffect(() => { initMetaPixel(); sendTurn(''); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    // Fire the Meta "Lead" conversion ONLY for a REAL, qualified lead — i.e. the
    // chat reached completion AND wasn't rejected (spam / not-a-fit) AND a lead
    // was actually saved. Not on the preliminary lead_id created early in the
    // conversation, and not on a plain page visit. This is the event a campaign
    // should optimize for.
    if (done && !rejected && leadId && !leadTrackedRef.current) {
      leadTrackedRef.current = true;
      // The Lead conversion now fires on /EventInquiryThanks, where the customer
      // actually lands. Firing it here as well would count every lead twice.
      // This custom event keeps the funnel step visible in Meta without
      // polluting the Lead number the campaign optimises on.
      trackCustom('EventChatCompleted');
    }
  }, [done, rejected, leadId]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // Send the customer to the summary page once the bot has closed the
  // conversation. The short delay lets them read Dana's last message first.
  useEffect(() => {
    if (!done || rejected || !thanksToken || paymentUrl) return;
    const t = setTimeout(() => {
      window.location.assign(`/EventInquiryThanks?token=${encodeURIComponent(thanksToken)}`);
    }, 2500);
    return () => clearTimeout(t);
  }, [done, rejected, thanksToken, paymentUrl]);

  const send = () => {
    const text = input.trim();
    if (!text || sending || done) return;
    setInput('');
    sendTurn(text);
  };
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const isRtl = lang === 'he';
  // WhatsApp-style mobile layout:
  //   - 100dvh keeps the chat exactly the visible viewport (vh on iOS Safari
  //     is the visual+toolbar height which jumps when the keyboard opens —
  //     dvh updates as the keyboard slides in so the input stays glued just
  //     above the keys).
  //   - The wrapper is the scroll container itself (overflow-hidden); only
  //     the messages list scrolls. Without this iOS scrolls the WHOLE PAGE
  //     when the keyboard appears and pushes the header off screen.
  //   - safe-area-inset-bottom pads the input above the home-indicator on
  //     iPhones without notches still benefit from the env() fallback.
  return (
    <div
      className="bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 flex flex-col overflow-hidden"
      style={{ height: '100dvh' }}
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <header className="bg-white/85 backdrop-blur border-b border-emerald-100 p-4 flex-shrink-0">
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

      <main className="flex-1 min-h-0 max-w-2xl w-full mx-auto px-3 pt-3 pb-2 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-2 -mx-1 px-1">
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
            {thanksToken && (
              <a href={`/EventInquiryThanks?token=${encodeURIComponent(thanksToken)}`}
                 className="mt-3 block text-center bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
                לצפייה בסיכום הפנייה →
              </a>
            )}
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

        {error && <div className="rounded-xl p-3 my-2 bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}

        {/* Input bar — sticky to the bottom of the flex column so it sits
            exactly on top of the iOS keyboard. flex-shrink-0 keeps it from
            collapsing when the message list grows. */}
        <div
          className="bg-white border border-emerald-200 rounded-2xl p-2 flex items-end gap-2 shadow-sm flex-shrink-0"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
            placeholder="הקלידו את התשובה ולחצו שלח…" disabled={sending} rows={1}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
            style={{ minHeight: '36px', maxHeight: '120px', fontSize: '16px' /* prevents iOS auto-zoom on focus */ }} />
          <button onClick={send} disabled={!input.trim() || sending}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl px-4 py-2 flex items-center gap-1 text-sm font-medium">
            שלח <Send className="w-4 h-4" />
          </button>
        </div>
      </main>
    </div>
  );
}
