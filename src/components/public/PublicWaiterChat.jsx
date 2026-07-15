import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { invokePublic } from '@/lib/publicFetch';
import { useTenantBranding } from '@/hooks/useTenantBranding';

// Floating AI concierge bubble for /PublicReservation.
// Backed by the guestInquiry public function (apps/api/src/functions/load.ts).
//
// Sits bottom-left so it doesn't fight the bottom sticky CTA strip (which
// is right-aligned-but-full-width above the safe area). When open the panel
// is a bottom sheet on mobile and a side card on desktop.
//
// Intent-based shortcuts: when the LLM tags an answer with intent=reservation
// we surface a "גלול לטופס" button; intent=event surfaces "מילוי טופס אירוע".

const SESSION_KEY = 'alena_chat_history_v1';

const SUGGESTED_OPENERS = [
  'יש מקום הערב לשניים?',
  'מה רץ אצלכם הערב?',
  'יש משהו צמחוני?',
  'איך מארגנים יום הולדת?',
];

export default function PublicWaiterChat() {
  const branding = useTenantBranding();
  const brandName = branding?.name || 'המסעדה';
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => [{
    role: 'assistant',
    content: `שלום! אני המלצר הוירטואלי של ${brandName} 🌿 אפשר לשאול אותי על הזמנות, תפריט, אירועים, חניה — כל מה שבא לכם.`,
  }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Restore session conversation on mount (within tab lifetime).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
    } catch {}
    // Pulse the bubble badge after 15s so first-time visitors notice it.
    const t = setTimeout(() => setShowBadge(true), 15000);
    return () => clearTimeout(t);
  }, []);

  // Persist conversation.
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages.slice(-40))); } catch {}
  }, [messages]);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Focus input on open.
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput('');
    const next = [...messages, { role: 'user', content: message }];
    setMessages(next);
    setSending(true);
    try {
      const res = await invokePublic('guestInquiry', {
        message,
        history: next.slice(-10).map(m => ({ role: m.role, content: m.content })),
      });
      const reply = res?.reply || 'הבנתי. רגע אחד...';
      const intent = res?.intent || 'general';
      setMessages(prev => [...prev, { role: 'assistant', content: reply, intent }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'משהו פה לא מגיב כרגע. נסו שוב עוד רגע, או פנו ישירות לצוות המסעדה.',
        intent: 'general',
      }]);
    } finally {
      setSending(false);
    }
  };

  const handleIntent = (intent) => {
    if (intent === 'reservation') {
      const el = document.getElementById('booking');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setOpen(false);
      }
    } else if (intent === 'event') {
      window.location.href = '/EventsInquiry';
    }
  };

  return (
    <div dir="rtl">
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setShowBadge(false); }}
          aria-label="פתח צ׳אט עם המלצר"
          className="fixed z-[55] right-3 md:right-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
          style={{
            // Mobile: sit above the bottom sticky CTA strip. Desktop: bottom-right corner.
            bottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
            background: 'linear-gradient(135deg, #44512C 0%, #1F1B17 100%)',
            color: '#F4ECD8',
            width: 60,
            height: 60,
            boxShadow: '0 14px 30px -8px rgba(31,27,23,0.55), 0 4px 10px -2px rgba(31,27,23,0.25)',
            border: '2px solid #D9BD83',
            // On mobile we'd hit the sticky CTA — push it up
          }}
        >
          <MessageCircle className="w-7 h-7" strokeWidth={2.2} />
          {showBadge && (
            <span
              className="absolute -top-1 -left-1 rounded-full text-[10px] font-black px-1.5 py-0.5 animate-pulse"
              style={{ background: '#A04A2E', color: '#F4ECD8' }}
            >
              שאלה?
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] md:inset-auto md:bottom-6 md:right-6 md:w-[400px]"
          style={{ animation: 'chatRise 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <style>{`@keyframes chatRise { from { opacity:0; transform: translateY(20px) } to { opacity:1; transform: translateY(0) } }`}</style>
          <div
            className="flex flex-col rounded-t-3xl md:rounded-3xl overflow-hidden"
            style={{
              background: '#FFFEFB',
              border: '1px solid rgba(184,149,86,0.45)',
              boxShadow: '0 30px 60px -20px rgba(31,27,23,0.55), 0 10px 24px -8px rgba(31,27,23,0.30)',
              height: 'min(70vh, 600px)',
              fontFamily: 'Heebo, system-ui, sans-serif',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #44512C 0%, #1F1B17 100%)', color: '#F4ECD8' }}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(217,189,131,0.20)', border: '1px solid #D9BD83' }}>
                  <svg viewBox="0 0 64 64" className="w-5 h-5" aria-hidden="true">
                    <path d="M6 38 Q20 22 32 28 Q44 34 58 22" fill="none" stroke="#D9BD83" strokeWidth="2.4" strokeLinecap="round" />
                    <ellipse cx="24" cy="27" rx="5" ry="2.8" transform="rotate(-10 24 27)" fill="#7A8A48" />
                    <ellipse cx="38" cy="29" rx="5" ry="2.8" transform="rotate(14 38 29)" fill="#7A8A48" />
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-sm leading-tight">{`מלצר ${brandName}`}</div>
                  <div className="text-[11px] flex items-center gap-1" style={{ color: '#D9BD83' }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#7A8A48' }}></span>
                    מקוון · עונה תוך שניות
                  </div>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="סגור"
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ background: '#FAF5E8' }}>
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed"
                    style={m.role === 'user'
                      ? { background: '#A04A2E', color: '#F4ECD8', borderBottomRightRadius: 4 }
                      : { background: '#FFFEFB', color: '#1F1B17', border: '1px solid rgba(184,149,86,0.30)', borderBottomLeftRadius: 4 }}
                  >
                    <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                    {m.role === 'assistant' && (m.intent === 'reservation' || m.intent === 'event') && (
                      <button
                        onClick={() => handleIntent(m.intent)}
                        className="mt-2 inline-block text-xs font-bold rounded-lg px-3 py-1.5 transition-colors"
                        style={{ background: '#44512C', color: '#F4ECD8' }}
                      >
                        {m.intent === 'reservation' ? '↓ גלילה לטופס ההזמנה' : '→ טופס אירוע פרטי'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="rounded-2xl px-3.5 py-2.5 text-sm" style={{ background: '#FFFEFB', border: '1px solid rgba(184,149,86,0.30)', borderBottomLeftRadius: 4 }}>
                    <span className="inline-flex gap-1" aria-label="כותב">
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#B89556', animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#B89556', animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#B89556', animationDelay: '300ms' }}></span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Suggested openers — only when conversation is fresh */}
            {messages.length <= 1 && !sending && (
              <div className="flex-shrink-0 px-3 pb-2 flex flex-wrap gap-1.5" style={{ background: '#FAF5E8', borderTop: '1px solid rgba(184,149,86,0.20)' }}>
                {SUGGESTED_OPENERS.map(q => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="text-[12px] rounded-full px-2.5 py-1 transition-colors"
                    style={{ background: '#FFFEFB', color: '#44512C', border: '1px solid rgba(68,81,44,0.30)' }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <form
              onSubmit={(e) => { e.preventDefault(); send(); }}
              className="flex-shrink-0 flex items-center gap-2 px-3 py-3"
              style={{ background: '#FFFEFB', borderTop: '1px solid rgba(184,149,86,0.30)' }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="שאל אותי על המסעדה..."
                disabled={sending}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background: '#FAF5E8', border: '1px solid rgba(184,149,86,0.35)', color: '#1F1B17' }}
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="שלח"
                className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-transform disabled:opacity-40"
                style={{ background: input.trim() && !sending ? 'linear-gradient(to left, #A04A2E, #8B3D24)' : '#D9BD83', color: '#F4ECD8' }}
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
