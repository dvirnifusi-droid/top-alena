import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import { handleVoiceCommand as globalHandler } from './handleVoiceCommand';

// === Hebrew number normalization =============================================
// People say numbers in many ways: "מאה ועשרים", "120", "שולחן מאה". We map
// the common forms to digits so '#100' parses identically whether spoken as
// numeral or word.
const HEB_NUMBERS = {
    'אפס': 0, 'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שני': 2, 'שלוש': 3, 'שלושה': 3,
    'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7,
    'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10,
    'אחד עשרה': 11, 'אחת עשרה': 11, 'שתים עשרה': 12, 'שלוש עשרה': 13, 'ארבע עשרה': 14,
    'חמש עשרה': 15, 'שש עשרה': 16, 'שבע עשרה': 17, 'שמונה עשרה': 18, 'תשע עשרה': 19,
    'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50, 'שישים': 60, 'שבעים': 70,
    'שמונים': 80, 'תשעים': 90, 'מאה': 100, 'מאתיים': 200, 'שלוש מאות': 300,
};

function normalizeHebrewNumbers(text) {
    let out = text;
    // Word numbers → digits (longest first so 'אחד עשרה' isn't broken into '1 10')
    const entries = Object.entries(HEB_NUMBERS).sort((a, b) => b[0].length - a[0].length);
    for (const [word, digit] of entries) {
        out = out.replace(new RegExp(`(^|\\s)${word}(\\s|$)`, 'g'), `$1${digit}$2`);
    }
    // 'מאה ועשרים' → '120' (compound numbers)
    out = out.replace(/(\d+)\s+ו(\d+)/g, (_, a, b) => String(Number(a) + Number(b)));
    return out;
}

// Strip punctuation that Web Speech API adds, collapse all whitespace, trim.
// The matchers don't care about '?', ',', '.' — but the regex anchors do.
function cleanForMatch(text) {
    return String(text || '')
        .replace(/[?!.,،؟]/g, '') // common punctuation including Arabic question mark
        .replace(/\s+/g, ' ')
        .trim();
}

// === Intent matchers — order matters (most specific first) ===================
// Each returns { intent, ...params } or null.
const MATCHERS = [
    // Q&A — read out info. Patterns are lenient: no ^ anchor where unneeded, allow synonyms.
    { re: /(מי|מיהו|מיהי)\s+(הבא|הבאה)\s+(בתור|לתור)/, intent: 'q_next_in_queue' },
    { re: /^(מי|מיהו|מיהי)\s+הבא/, intent: 'q_next_in_queue' },
    { re: /(מי|מיהי)\s+ההזמנה\s+הבאה/, intent: 'q_next_reservation' },
    { re: /ההזמנה\s+הבאה/, intent: 'q_next_reservation' },
    { re: /כמה\s+(אנשים|חבורות|לקוחות)?\s*(יש)?\s*בתור/, intent: 'q_queue_count' },
    { re: /^בתור\s+(יש)?/, intent: 'q_queue_count' },
    { re: /כמה\s+(מקומות|שולחנות)\s+פנויים/, intent: 'q_free_tables' },
    { re: /(מי|מיהו)\s+(על|יושב\s+על|נמצא\s+על)\s+שולחן\s+(\d+)/, intent: 'q_who_on_table', extract: m => ({ table: m[3] }) },

    // Seat assignment
    { re: /^תושיב(י)?\s+את\s+(.+?)\s+על\s+(?:שולחן\s+)?(\d+)\s+ו(?:על\s+)?(\d+)/,
        intent: 'seat_reservation_multi', extract: m => ({ name: m[2].trim(), tables: [m[3], m[4]] }) },
    { re: /^תושיב(י)?\s+את\s+(.+?)\s+על\s+(?:שולחן\s+)?(\d+)/,
        intent: 'seat_reservation', extract: m => ({ name: m[2].trim(), table: m[3] }) },
    { re: /^תקבל(י)?\s+את\s+הבא\s+(?:בתור\s+)?על\s+(?:שולחן\s+)?(\d+)/,
        intent: 'seat_next_queue', extract: m => ({ table: m[2] }) },

    // Queue add
    { re: /^תוסיף(י)?\s+לתור\s+(\d+)\s+(חוץ|פנים)\s+על\s+שם\s+(.+)$/,
        intent: 'queue_add', extract: m => ({ party_size: Number(m[2]), pref: m[3] === 'חוץ' ? 'outside' : 'inside', name: m[4].trim() }) },
    { re: /^תוסיף(י)?\s+לתור\s+(\d+)\s+על\s+שם\s+(.+)$/,
        intent: 'queue_add', extract: m => ({ party_size: Number(m[2]), pref: 'no_preference', name: m[3].trim() }) },

    // Queue interactions
    { re: /^תקרא(י)?\s+ל(.+)$/, intent: 'queue_call', extract: m => ({ name: m[2].trim() }) },
    { re: /^(.+?)\s+(בא|הגיע|הגיעה)$/, intent: 'queue_arrived', extract: m => ({ name: m[1].trim() }) },
    { re: /^(.+?)\s+(עזב|עזבה|נטוש|נטושה)$/, intent: 'queue_abandoned', extract: m => ({ name: m[1].trim() }) },

    // Table status
    { re: /שולחן\s+(\d+)\s+(פנוי|התפנה|פנויה)/, intent: 'table_free', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(קינוח|חשבון|סיום|סיום\s+קרוב)/, intent: 'table_finishing', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(יושב|יושבים|התיישבו|התיישב)/, intent: 'table_seated', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(הבריז|הבריזו|לא\s+הגיע|לא\s+הגיעו)/, intent: 'table_no_show', extract: m => ({ table: m[1] }) },

    // Flags
    { re: /שולחן\s+(\d+)\s+(ירוק|VIP|וי\s*איי\s*פי)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'green' }) },
    { re: /שולחן\s+(\d+)\s+(אדום|בעיה)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'red' }) },
    { re: /שולחן\s+(\d+)\s+כתום/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'orange' }) },
    { re: /שולחן\s+(\d+)\s+שחור/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'black' }) },
    { re: /שולחן\s+(\d+)\s+(ללא\s+דגל|בלי\s+דגל|נקה\s+דגל)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: '' }) },

    // Communication
    { re: /^תשלח(י)?\s+ל(.+?)\s+אישור/, intent: 'resend_confirmation', extract: m => ({ name: m[2].trim() }) },
];

function parseIntent(text) {
    const clean = normalizeHebrewNumbers(cleanForMatch(text));
    // Log so we can debug WHY a command didn't match.
    try { console.log('[voice] parsing:', JSON.stringify(text), '→', JSON.stringify(clean)); } catch {}
    for (const m of MATCHERS) {
        const match = clean.match(m.re);
        if (match) {
            const extracted = m.extract ? m.extract(match) : {};
            return { intent: m.intent, raw: clean, ...extracted };
        }
    }
    return { intent: 'unknown', raw: clean };
}

// === Speech synthesis — speaks the reply back via the device's TTS ============
function speak(text) {
    try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'he-IL';
        u.rate = 1.05;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
    } catch { /* TTS unavailable; visual feedback only */ }
}

// === The main component ======================================================
export default function VoiceControl({
    onCommand,         // async ({intent, ...params}) => {ok, message}. Falls back to globalHandler when omitted.
    enabled = true,
}) {
    const handler = onCommand || globalHandler;
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [lastResult, setLastResult] = useState(null); // { ok, message, intent }
    const [error, setError] = useState(null);
    const recRef = useRef(null);

    // Check browser support once
    const SpeechRecognition =
        typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    const supported = !!SpeechRecognition;

    // Stable refs so we can read the latest transcript inside async callbacks.
    const transcriptRef = useRef('');
    const userStoppedRef = useRef(false);

    const start = () => {
        if (!supported) { setError('הדפדפן לא תומך בזיהוי קולי'); return; }
        setError(null);
        setTranscript('');
        setLastResult(null);
        transcriptRef.current = '';
        userStoppedRef.current = false;

        const rec = new SpeechRecognition();
        rec.lang = 'he-IL';
        // continuous=true means we keep listening across pauses — the USER decides when to stop (second click).
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        recRef.current = rec;

        rec.onstart = () => setListening(true);
        rec.onresult = (e) => {
            // Build full transcript across all final + interim results in this session.
            let final = '';
            let interim = '';
            for (let i = 0; i < e.results.length; i++) {
                const piece = e.results[i][0].transcript;
                if (e.results[i].isFinal) final += piece;
                else interim += piece;
            }
            const full = (final + ' ' + interim).trim();
            transcriptRef.current = full;
            setTranscript(full);
        };
        rec.onerror = (e) => {
            setError('שגיאה בזיהוי: ' + e.error);
            setListening(false);
        };
        rec.onend = () => {
            setListening(false);
            // Only execute the command if the user explicitly stopped (second click).
            // If onend fires for other reasons (timeout, network), we skip execution
            // so we don't run a partial/half-thought command by accident.
            if (userStoppedRef.current && transcriptRef.current.trim()) {
                handleFinalTranscript(transcriptRef.current.trim());
            }
        };
        try {
            rec.start();
        } catch (e) {
            setError('לא ניתן להתחיל הקלטה: ' + (e?.message || ''));
        }
    };

    const stop = () => {
        // Mark that THE USER chose to stop — onend will then run the handler.
        userStoppedRef.current = true;
        if (recRef.current) {
            try { recRef.current.stop(); } catch {}
        }
    };

    const toggle = () => {
        if (listening) stop();
        else start();
    };

    const handleFinalTranscript = async (txt) => {
        let parsed = parseIntent(txt);
        // LLM fallback when regex fails. Costs ~₪0.01 only when regex misses.
        if (parsed.intent === 'unknown') {
            try {
                const tok = localStorage.getItem('auth_token') || '';
                const r = await fetch('/api/fn/parseVoiceCommand', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                    body: JSON.stringify({ text: txt }),
                });
                const data = await r.json();
                if (data?.intent && data.intent !== 'unknown') parsed = { ...data, raw: txt };
            } catch (e) {
                console.warn('[voice] LLM fallback failed', e);
            }
        }
        if (parsed.intent === 'unknown') {
            const msg = `לא הבנתי: "${parsed.raw || txt}". נסה לנסח אחרת.`;
            setLastResult({ ok: false, message: msg });
            speak('לא הבנתי, נסה לנסח אחרת');
            return;
        }
        try {
            const result = await handler(parsed);
            setLastResult({ ok: !!result?.ok, message: result?.message || 'בוצע ✓', intent: parsed.intent });
            if (result?.message) speak(result.message);
        } catch (e) {
            const msg = 'שגיאה: ' + (e?.message || 'נסה שוב');
            setLastResult({ ok: false, message: msg });
            speak(msg);
        }
    };

    if (!enabled) return null;

    return (
        <>
            {/* Floating mic button — click to start, click again to stop and execute. */}
            <button
                onClick={toggle}
                disabled={!supported}
                title={supported ? (listening ? 'לחץ שוב לסיום' : 'לחץ להתחלת הקלטה') : 'הדפדפן לא תומך'}
                className={`fixed bottom-4 left-4 z-[55] w-16 h-16 rounded-full shadow-2xl flex items-center justify-center text-2xl transition-all
                    ${listening
                        ? 'bg-gradient-to-br from-red-500 to-red-700 text-white scale-110 ring-4 ring-red-300 animate-pulse'
                        : 'bg-gradient-to-br from-blue-500 to-blue-700 text-white hover:scale-110 hover:from-blue-600 hover:to-blue-800'}
                    ${!supported ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
                {listening ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
            </button>

            {/* Tiny "click again to stop" hint while recording */}
            {listening && (
                <div className="fixed bottom-24 left-4 z-[55] text-[10px] font-bold text-red-700 bg-white px-2 py-1 rounded-full shadow border border-red-300 animate-pulse">
                    🔴 מקליט · לחץ שוב לסיום
                </div>
            )}

            {/* Live transcript + result panel */}
            {(transcript || lastResult || error) && (
                <div className="fixed bottom-20 left-4 z-[55] max-w-sm bg-white border-2 border-blue-300 rounded-2xl shadow-2xl p-3" dir="rtl">
                    {transcript && (
                        <div className="text-sm font-bold text-gray-900 mb-1">
                            🎙️ "{transcript}"
                        </div>
                    )}
                    {lastResult && (
                        <div className={`text-xs ${lastResult.ok ? 'text-emerald-700' : 'text-amber-700'} font-bold flex items-center justify-between gap-2`}>
                            <span>{lastResult.ok ? '✅' : '⚠️'} {lastResult.message}</span>
                            <button onClick={() => setLastResult(null)} className="text-gray-400 hover:text-gray-700">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                    {error && (
                        <div className="text-xs text-red-700 font-bold">{error}</div>
                    )}
                </div>
            )}
        </>
    );
}
