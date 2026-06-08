import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import { handleVoiceCommand as globalHandler } from './handleVoiceCommand';
import { parseIntent } from './voiceIntents';

// === Hebrew number normalization =============================================
// People say numbers in many ways: "מאה ועשרים", "120", "שולחן מאה". We map
// the common forms to digits so '#100' parses identically whether spoken as
// numeral or word.
// === Speech synthesis — speaks the reply back via the device's TTS ============
// iOS Safari quirk: voices list is empty until 'voiceschanged' event fires.
// We pre-warm and pick the best Hebrew voice once, fall back to default lang.
let cachedHebrewVoice = null;
function pickHebrewVoice() {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    if (cachedHebrewVoice) return cachedHebrewVoice;
    const voices = window.speechSynthesis.getVoices();
    // Prefer Hebrew voices, then any voice
    cachedHebrewVoice =
        voices.find(v => /he/i.test(v.lang)) ||
        voices.find(v => /iw/i.test(v.lang)) || // older iOS code for Hebrew
        null;
    return cachedHebrewVoice;
}
// Warm voices list on load (iOS won't populate until this fires).
if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
        cachedHebrewVoice = null; // reset so we re-pick
        pickHebrewVoice();
    };
    // Also try once immediately (desktop browsers have voices ready)
    setTimeout(pickHebrewVoice, 500);
}

function speak(text) {
    try {
        if (!window.speechSynthesis) {
            console.warn('[voice] SpeechSynthesis not available');
            return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'he-IL';
        u.rate = 1.0;
        u.pitch = 1.0;
        u.volume = 1.0;
        const heVoice = pickHebrewVoice();
        if (heVoice) u.voice = heVoice;
        u.onerror = (e) => console.warn('[voice] TTS error:', e?.error);
        window.speechSynthesis.speak(u);
    } catch (e) {
        console.warn('[voice] speak failed:', e);
    }
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

    // Auto-start recording when launched via PWA shortcut ?voice=1
    useEffect(() => {
        if (!supported) return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('voice') === '1') {
            const t = setTimeout(() => {
                start();
                // Clean the URL so refresh doesn't re-trigger
                history.replaceState(null, '', window.location.pathname);
            }, 500);
            return () => clearTimeout(t);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [supported]);

    // Stable refs so we can read the latest transcript inside async callbacks.
    const transcriptRef = useRef('');
    const userStoppedRef = useRef(false);

    const start = () => {
        if (!supported) { setError('הדפדפן לא תומך בזיהוי קולי'); return; }
        // PRIME the speech synthesis with a silent utterance — iOS Safari blocks
        // TTS unless the audio context was activated by a user gesture. The user
        // pressing the mic button counts; this empty utterance unlocks the rest.
        try {
            if (window.speechSynthesis) {
                const prime = new SpeechSynthesisUtterance(' ');
                prime.volume = 0;
                window.speechSynthesis.speak(prime);
            }
        } catch { /* ignore */ }
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
        // LLM-FIRST strategy (owner's request): always ask the LLM to understand
        // meaning semantically, regardless of phrasing. Regex is used only as a
        // fast cache for the most-frequent exact phrasings (instant + free).
        let parsed = parseIntent(txt);
        const regexHit = parsed.intent !== 'unknown';
        // Always run LLM in parallel — even if regex matched, the LLM result is
        // preferred for non-trivial intents (more accurate name/time/etc.).
        let llmParsed = null;
        try {
            const tok = localStorage.getItem('auth_token') || '';
            const r = await fetch('/api/fn/parseVoiceCommand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                body: JSON.stringify({ text: txt }),
            });
            const data = await r.json();
            if (data?.intent && data.intent !== 'unknown') llmParsed = { ...data, raw: txt };
        } catch (e) {
            console.warn('[voice] LLM call failed', e);
        }
        // Decision: prefer LLM. Fall back to regex only if LLM failed entirely.
        if (llmParsed) parsed = llmParsed;
        else if (!regexHit) parsed = { intent: 'unknown', raw: txt };
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
                className={`fixed bottom-4 left-3 md:bottom-24 md:left-4 z-[55] w-11 h-11 md:w-16 md:h-16 rounded-full shadow-2xl flex items-center justify-center text-2xl transition-all
                    ${listening
                        ? 'bg-gradient-to-br from-red-500 to-red-700 text-white scale-110 ring-4 ring-red-300 animate-pulse'
                        : 'bg-gradient-to-br from-blue-500 to-blue-700 text-white hover:scale-110 hover:from-blue-600 hover:to-blue-800 opacity-80 hover:opacity-100'}
                    ${!supported ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
                {listening ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
            </button>

            {/* Tiny "click again to stop" hint while recording */}
            {listening && (
                <div className="fixed bottom-16 left-3 md:bottom-44 md:left-4 z-[55] text-[10px] font-bold text-red-700 bg-white px-2 py-1 rounded-full shadow border border-red-300 animate-pulse">
                    🔴 מקליט · לחץ שוב לסיום
                </div>
            )}

            {/* Live transcript + result panel */}
            {(transcript || lastResult || error) && (
                <div className="fixed bottom-16 left-3 right-3 md:bottom-40 md:left-4 md:right-auto z-[55] max-w-sm bg-white border-2 border-blue-300 rounded-2xl shadow-2xl p-3" dir="rtl">
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
