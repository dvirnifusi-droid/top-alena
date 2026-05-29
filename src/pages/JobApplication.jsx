import React, { useState, useEffect, useRef } from 'react';
import { invokePublic } from '@/lib/publicFetch';

export default function JobApplication() {
  const [messages, setMessages] = useState([]); // {role:'assistant'|'user', content}
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const scrollRef = useRef(null);

  // Kick off the greeting from the agent when the page opens.
  useEffect(() => { sendTurn(''); /* eslint-disable-line */ }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const sendTurn = async (text) => {
    setSending(true);
    const history = text ? [...messages, { role: 'user', content: text }] : messages;
    if (text) setMessages(history);
    try {
      const res = await invokePublic('chatJobApplication', { history, message: text });
      setMessages([...history, { role: 'assistant', content: res?.reply || '...' }]);
      if (res?.complete) setDone(true);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'מצטער, יש בעיה זמנית. נסה/י שוב בעוד רגע.' }]);
    } finally {
      setSending(false);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || sending || done) return;
    setInput('');
    sendTurn(text);
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }}
    >
      <div className="text-center pt-7 pb-3 text-white">
        <div className="text-4xl mb-1">🌿</div>
        <h1 className="text-xl font-black tracking-wide">מסעדת עלינא — גיוס</h1>
        <p className="text-xs text-slate-300 mt-0.5">העוזר הדיגיטלי לראיון ראשוני</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 pb-3 space-y-3 max-w-md w-full mx-auto">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow ${
                m.role === 'user' ? 'bg-white text-slate-800' : 'bg-emerald-600 text-white'
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-end">
            <div className="bg-emerald-600/90 rounded-2xl px-4 py-3 shadow">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {!done ? (
        <div className="p-3 bg-slate-800/60 backdrop-blur border-t border-white/10">
          <div className="flex gap-2 max-w-md mx-auto">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              disabled={sending}
              placeholder="כתוב/י הודעה…"
              autoFocus
              className="flex-1 rounded-2xl border-0 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold transition"
            >
              שלח
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5 text-center text-emerald-300 text-sm font-bold">
          ✓ הראיון הסתיים. תודה על הזמן! 🌿
        </div>
      )}
    </div>
  );
}
