import React, { useState, useEffect, useRef } from 'react';
import { invokePublic } from '@/lib/publicFetch';
import { Send, Sparkles, CheckCircle2, AlertCircle, CreditCard } from 'lucide-react';

function readUtmSource() {
  try { return new URLSearchParams(window.location.search).get('utm_source') || null; }
  catch { return null; }
}

export default function EventsInquiry() {
  const [utmSource] = useState(readUtmSource);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [leadId, setLeadId] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [paymentUrl, setPaymentUrl] = useState(null);
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
      });
      setMessages([...history, { role: 'assistant', content: res?.reply || '...' }]);
      if (res?.lead_id) setLeadId(res.lead_id);
      if (res?.booking_id) setBookingId(res.booking_id);
      if (res?.payment_url) setPaymentUrl(res.payment_url);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 flex flex-col" dir="rtl">
      <header className="bg-white/80 backdrop-blur border-b border-emerald-100 p-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-600 to-teal-600 rounded-full flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-emerald-900">עלינא — אירועים פרטיים</h1>
            <p className="text-xs text-emerald-700">צ׳אט בירור התאמה • 5 שאלות קצרות</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-white text-slate-800 rounded-bl-sm border border-emerald-100'
              }`}>{m.content}</div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-end">
              <div className="bg-white text-slate-500 rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm text-sm border border-emerald-100">כותבת…</div>
            </div>
          )}
        </div>

        {done && (
          <div className={`rounded-xl p-4 my-3 ${rejected ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-200'}`}>
            <div className="flex items-start gap-3">
              {rejected ? <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" /> : <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />}
              <div className="text-sm">
                {rejected
                  ? <span className="text-amber-900">תודה רבה! לפי מה שתיארתם, אנחנו ניצור איתכם קשר אם זה מתאים לפורמט שלנו.</span>
                  : <span className="text-emerald-900">הפרטים שלכם נשמרו — המנהל יחזור אליכם תוך כמה שעות עם הצעה מותאמת 🌿</span>}
              </div>
            </div>
          </div>
        )}

        {paymentUrl && !done && (
          <a href={paymentUrl} target="_blank" rel="noreferrer"
             className="block rounded-2xl p-4 my-3 bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg hover:shadow-xl transition">
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

        {!done && (
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
        )}
      </main>

      <footer className="text-center text-xs text-emerald-700/70 p-3">
        🔒 הפרטים שלכם נשמרים במערכת הניהול של עלינא בלבד.
      </footer>
    </div>
  );
}
