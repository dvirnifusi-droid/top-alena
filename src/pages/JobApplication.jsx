import React, { useState, useEffect, useRef } from 'react';
import { invokePublic } from '@/lib/publicFetch';
import LanguagePicker from '@/components/shared/LanguagePicker';
import { useI18n, LANG_NAMES_FOR_LLM } from '@/lib/i18n';

// Read ?utm_source=... from the URL so we tag the candidate with where they
// came from (Facebook / Instagram / QR / etc.).
function readUtmSource() {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('utm_source') || null;
  } catch { return null; }
}

// Stable per-browser lead id so an abandoned chat can be matched to the same
// candidate row even if the user closes the tab and reopens /apply later.
// Stored in localStorage; new id created on first visit and reused thereafter.
function getOrCreateLeadId() {
  try {
    let id = localStorage.getItem('apply_lead_id');
    if (!id) {
      id = 'lead_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('apply_lead_id', id);
    }
    return id;
  } catch { return 'lead_anon_' + Math.random().toString(36).slice(2, 12); }
}

export default function JobApplication() {
  const [utmSource] = useState(readUtmSource);
  const [leadId] = useState(getOrCreateLeadId);
  const [t, lang] = useI18n();
  const [messages, setMessages] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // After chat completes
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(null);
  const [rejected, setRejected] = useState(false);
  const [candidateId, setCandidateId] = useState(null);

  // Slot picker
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState(null); // { date, time, weekday_name }

  const scrollRef = useRef(null);

  // Start the conversation
  useEffect(() => { sendTurn(''); /* eslint-disable-line */ }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  // Once the chat finishes with a qualifying score, fetch slots
  useEffect(() => {
    if (done && !rejected && candidateId && score >= 80 && !slots.length && !booked) {
      setLoadingSlots(true);
      invokePublic('getAvailableInterviewSlots', { candidate_id: candidateId })
        .then((res) => setSlots(res?.slots || []))
        .catch(() => setSlots([]))
        .finally(() => setLoadingSlots(false));
    }
  }, [done, rejected, candidateId, score, slots.length, booked]);

  const sendTurn = async (text) => {
    setSending(true);
    const history = text ? [...messages, { role: 'user', content: text }] : messages;
    if (text) setMessages(history);
    try {
      const res = await invokePublic('chatJobApplication', {
        history, message: text, source: utmSource, lead_id: leadId,
        language: LANG_NAMES_FOR_LLM[lang] || 'Hebrew',
      });
      setMessages([...history, { role: 'assistant', content: res?.reply || '...' }]);
      if (res?.complete) {
        setDone(true);
        setRejected(!!res.rejected);
        setScore(typeof res.score === 'number' ? res.score : null);
        setCandidateId(res.candidate_id || null);
      }
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

  const bookSlot = async (slot) => {
    setBooking(true);
    try {
      await invokePublic('bookInterview', { candidate_id: candidateId, date: slot.date, time: slot.time });
      setBooked(slot);
    } catch (e) {
      // Slot might have been taken — refresh
      const res = await invokePublic('getAvailableInterviewSlots', { candidate_id: candidateId }).catch(() => null);
      setSlots(res?.slots || []);
      alert('המועד הזה נתפס. בחר מועד אחר.');
    } finally {
      setBooking(false);
    }
  };

  const fmtDate = (iso) => {
    try {
      const d = new Date(iso + 'T00:00');
      return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
    } catch { return iso; }
  };

  // ----- Post-chat states -----
  const showSlotPicker = done && !rejected && score >= 80 && !booked;
  const showSimpleEnd = done && (rejected || score < 80);

  const isRtl = lang === 'he';
  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }}
    >
      {/* Language picker — top-left when RTL, top-right when LTR */}
      <div className={`absolute top-3 ${isRtl ? 'left-3' : 'right-3'}`}>
        <LanguagePicker />
      </div>
      <div className="text-center pt-7 pb-3 text-white">
        <div className="text-4xl mb-1">🌿</div>
        <h1 className="text-xl font-black tracking-wide">{t('apply_title')}</h1>
        <p className="text-xs text-slate-300 mt-0.5">{t('apply_subtitle')}</p>
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

        {/* Slot picker (score >= 80) */}
        {showSlotPicker && (
          <div className="bg-white rounded-2xl p-4 shadow-lg mt-2">
            <p className="font-black text-slate-800 mb-1">🎯 התרשמנו ממך — בא לקבוע ראיון?</p>
            <p className="text-xs text-slate-500 mb-3">בחר/י מועד שמתאים לך:</p>
            {loadingSlots ? (
              <p className="text-slate-400 text-sm">טוען מועדים…</p>
            ) : slots.length === 0 ? (
              <p className="text-slate-500 text-sm">
                אין כרגע מועדים פנויים — המנהל יחזור אליך לתיאום אישי 🙏
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {slots.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => bookSlot(s)}
                    disabled={booking}
                    className="rounded-xl border-2 border-emerald-200 hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 transition p-2.5 text-right"
                  >
                    <p className="font-bold text-slate-800 text-sm">יום {s.weekday_name}</p>
                    <p className="text-xs text-slate-500">{fmtDate(s.date)} · {s.time}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Booked confirmation */}
        {booked && (
          <div className="bg-emerald-50 border-2 border-emerald-300 rounded-2xl p-5 text-center mt-2">
            <div className="text-4xl mb-2">📅</div>
            <p className="font-black text-emerald-800 text-base mb-1">הראיון נקבע!</p>
            <p className="text-emerald-700 text-sm">
              יום {booked.weekday_name} · {fmtDate(booked.date)} · {booked.time}
            </p>
            <p className="text-emerald-600 text-xs mt-3">נתראה במסעדה. בהצלחה! 🌿</p>
          </div>
        )}

        {/* Simple end (rejected or score < 80) */}
        {showSimpleEnd && (
          <div className="bg-slate-50 rounded-2xl p-4 text-center mt-2">
            <p className="text-slate-700 text-sm">
              {rejected ? '🙏 תודה על ההתעניינות' : '🙏 תודה רבה! נחזור אליך בקרוב'}
            </p>
          </div>
        )}
      </div>

      {!done && (
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
      )}
    </div>
  );
}
