import React, { useState, useEffect, useRef } from 'react';
import { invokePublic } from '@/lib/publicFetch';
import { Send, Sparkles, CheckCircle2, AlertCircle, Utensils } from 'lucide-react';
import LanguagePicker from '@/components/shared/LanguagePicker';
import { useI18n, LANG_NAMES_FOR_LLM } from '@/lib/i18n';
import { useTenantBranding } from '@/hooks/useTenantBranding';

// Progressive "thinking" indicator. The first 3s feel snappy with "מקליד…",
// past 3s we rotate reassuring messages so 13s doesn't feel like a stall.
function ThinkingBubble() {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, []);
  const messages = [
    'מקליד…',
    'חושב על ההמלצה המושלמת בשבילכם…',
    'בודק את התפריט וההתאמות…',
    'מתאים את הארוחה לטעם שלכם…',
    'עוד רגע — אני סוגר את הפרטים האחרונים…',
  ];
  const msg = elapsed < 3 ? messages[0]
    : elapsed < 6 ? messages[1]
    : elapsed < 10 ? messages[2]
    : elapsed < 14 ? messages[3]
    : messages[4];
  return (
    <div className="flex justify-end">
      <div className="bg-white text-slate-600 rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm text-sm border border-amber-100 flex items-center gap-2">
        <span className="flex gap-0.5">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
        <span>{msg}</span>
      </div>
    </div>
  );
}

function readTableHint() {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('t') || p.get('table') || null;
  } catch { return null; }
}

function readOrCreateSessionId() {
  try {
    const key = 'waiter_session_id';
    let s = window.localStorage.getItem(key);
    if (!s) {
      s = 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem(key, s);
    }
    return s;
  } catch {
    return 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

export default function Waiter() {
  const [tableHint] = useState(readTableHint);
  const [sessionId] = useState(readOrCreateSessionId);
  const brandName = useTenantBranding()?.name || 'המסעדה';
  const [, lang] = useI18n();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [orderItems, setOrderItems] = useState([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const sendTurn = async (text) => {
    setSending(true);
    setError(null);
    const history = text ? [...messages, { role: 'user', content: text }] : messages;
    if (text) setMessages(history);
    try {
      const res = await invokePublic('chatWaiter', {
        session_id: sessionId, table_hint: tableHint, history, message: text,
        language: LANG_NAMES_FOR_LLM[lang] || 'Hebrew',
      });
      setMessages([...history, { role: 'assistant', content: res?.reply || '...' }]);
      if (Array.isArray(res?.recommended_items) && res.recommended_items.length) {
        setOrderItems(res.recommended_items);
      }
      if (typeof res?.total_ils === 'number') setOrderTotal(res.total_ils);
      if (res?.complete) setDone(true);
    } catch (e) {
      setError(e?.message || 'תקלה זמנית');
      setMessages((m) => [...m, { role: 'assistant', content: 'סליחה, יש בעיה זמנית. נסו שוב בעוד רגע.' }]);
    } finally { setSending(false); }
  };

  // Instant hardcoded welcome — no LLM round-trip — so the customer sees a friendly
  // message the second the page loads. Localized per UI language.
  useEffect(() => {
    const welcome = {
      he: `ברוכים הבאים ל${brandName} 🌿 אני המלצר הדיגיטלי שלכם. אעזור לכם לבנות ארוחה מושלמת — סלטים, מנות חלוקה בשריות, ירקות מהגוספר, אלכוהול ועוד. כדי להתחיל — כמה אתם הערב?`,
      en: `Welcome to ${brandName} 🌿 I'm your digital waiter. I'll help you build a perfect meal — salads, shareable mains, grilled vegetables, drinks and more. To start — how many of you are dining tonight?`,
      ru: `Добро пожаловать в ${brandName} 🌿 Я ваш цифровой официант. Помогу составить идеальный ужин — салаты, основные блюда для компании, овощи на гриле, напитки и многое другое. Для начала — сколько вас сегодня?`,
    };
    setMessages([{ role: 'assistant', content: welcome[lang] || welcome.he }]);
    /* eslint-disable-next-line */
  }, [lang]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    sendTurn(text);
  };
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  const isRtl = lang === 'he';
  const header = {
    he: { title: `${brandName} — ראש מלצרים`, sub: 'בנו את הארוחה לפי הטעם שלכם' },
    en: { title: `${brandName} — Digital Waiter`, sub: 'Build your meal your way' },
    ru: { title: `${brandName} — Цифровой официант`, sub: 'Соберите ужин по своему вкусу' },
  }[lang] || { title: `${brandName} — ראש מלצרים`, sub: 'בנו את הארוחה לפי הטעם שלכם' };
  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 flex flex-col" dir={isRtl ? 'rtl' : 'ltr'}>
      <header className="bg-white/90 backdrop-blur border-b border-amber-200 p-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-600 to-orange-600 rounded-full flex items-center justify-center">
            <Utensils className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-amber-900">{header.title}</h1>
            <p className="text-xs text-amber-700">{header.sub} {tableHint ? `· ${isRtl ? 'שולחן' : 'Table'} ${tableHint}` : ''}</p>
          </div>
          <LanguagePicker />
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto p-4 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pb-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm whitespace-pre-wrap leading-relaxed ${
                m.role === 'user'
                  ? 'bg-amber-600 text-white rounded-br-sm'
                  : 'bg-white text-slate-800 rounded-bl-sm border border-amber-100'
              }`}>{m.content}</div>
            </div>
          ))}
          {sending && <ThinkingBubble />}
        </div>

        {/* Running order summary — visible whenever there are recommended items */}
        {orderItems.length > 0 && (
          <div className="bg-white rounded-2xl border-2 border-amber-300 p-3 mb-3 shadow-md">
            <div className="text-xs font-bold text-amber-900 mb-2">📋 ההזמנה שלכם עד עכשיו:</div>
            <div className="space-y-0.5 text-sm">
              {orderItems.map((it, i) => (
                <div key={i} className="flex justify-between">
                  <span>{it.qty > 1 ? `${it.qty}× ` : ''}{it.name}</span>
                  <span className="text-slate-600 font-mono">₪{(it.price_ils || 0) * (it.qty || 1)}</span>
                </div>
              ))}
            </div>
            <div className="border-t mt-2 pt-2 flex justify-between font-bold text-amber-900">
              <span>סה"כ מוערך</span>
              <span>₪{orderTotal || orderItems.reduce((s, it) => s + (it.price_ils || 0) * (it.qty || 1), 0)}</span>
            </div>
          </div>
        )}

        {done && (
          <div className="rounded-xl p-4 my-3 bg-emerald-50 border border-emerald-200">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-emerald-900">מעולה — תעלו עם ההזמנה למלצר/ית כשהם יבואו אליכם. ייהנו! 🌿</span>
            </div>
          </div>
        )}

        {error && <div className="rounded-xl p-3 my-2 bg-red-50 border border-red-200 text-red-800 text-sm">{error}</div>}

        <div className="bg-white border border-amber-200 rounded-2xl p-2 flex items-end gap-2 shadow-sm">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
            placeholder="הקלידו והמלצר יענה…" disabled={sending} rows={1}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
            style={{ minHeight: '36px', maxHeight: '120px' }} />
          <button onClick={send} disabled={!input.trim() || sending}
            className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded-xl px-4 py-2 flex items-center gap-1 text-sm font-medium">
            שלח <Send className="w-4 h-4" />
          </button>
        </div>
      </main>

      <footer className="text-center text-xs text-amber-700/70 p-3">
        🔒 השיחה והפרטים שלכם נשמרים במערכת של {brandName} בלבד.
      </footer>
    </div>
  );
}
