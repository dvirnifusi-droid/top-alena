import React, { useState } from 'react';
import { handleVoiceCommand } from '@/components/voice/handleVoiceCommand';
import { parseIntent, COMMAND_GROUPS } from '@/components/voice/voiceIntents';
import PageGuard from '@/components/shared/PageGuard';

function VoiceTestInner() {
    const [text, setText] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);

    // Test TTS — verifies the device can actually speak Hebrew back.
    const testTTS = () => {
        try {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance('בדיקה. אם אתה שומע אותי, הקול עובד מצוין.');
            u.lang = 'he-IL';
            u.rate = 1.0;
            const voices = window.speechSynthesis.getVoices();
            const heVoice = voices.find(v => /he|iw/i.test(v.lang));
            if (heVoice) u.voice = heVoice;
            window.speechSynthesis.speak(u);
        } catch (e) {
            alert('TTS לא נתמך בדפדפן: ' + e?.message);
        }
    };

    const test = async (cmd) => {
        const input = cmd || text;
        if (!input.trim()) return;
        setLoading(true);
        setResult(null);
        try {
            let parsed = parseIntent(input);
            if (parsed.intent === 'unknown') {
                // Try LLM fallback
                const tok = localStorage.getItem('auth_token') || '';
                const r = await fetch('/api/fn/parseVoiceCommand', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                    body: JSON.stringify({ text: input }),
                });
                const data = await r.json();
                if (data?.intent && data.intent !== 'unknown') parsed = { ...data, raw: input };
            }
            let execResult = null;
            if (parsed.intent !== 'unknown') {
                execResult = await handleVoiceCommand(parsed);
            }
            const final = { input, parsed, execResult };
            setResult(final);
            setHistory(h => [final, ...h].slice(0, 20));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4" dir="rtl">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <h1 className="text-2xl font-black">🎤 בדיקת פקודות קוליות</h1>
                <button
                    onClick={testTTS}
                    className="bg-[#A04A2E] hover:bg-[#7A3722] text-white text-xs font-bold px-3 py-2 rounded-xl"
                >🔊 בדיקת קול (TTS)</button>
            </div>
            <p className="text-sm text-gray-600">
                כתוב פקודה או לחץ על אחת מהדוגמאות. בדיקה משתמשת באותו pipeline כמו דיבור — קודם regex, אם לא נמצא — LLM, ואז ביצוע.
            </p>

            {/* Text input */}
            <div className="flex gap-2 sticky top-0 bg-white py-2 z-10">
                <input
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && test()}
                    placeholder="הקלד פקודה לבדיקה..."
                    className="flex-1 text-sm border-2 border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-[#44512C]"
                />
                <button
                    onClick={() => test()}
                    disabled={loading || !text.trim()}
                    className="bg-[#44512C] hover:bg-[#44512C] disabled:bg-gray-300 text-white font-black px-5 py-2 rounded-xl text-sm"
                >{loading ? 'בודק...' : '▶ בדוק'}</button>
            </div>

            {/* Result */}
            {result && (
                <div className={`p-3 rounded-xl border-2 ${result.execResult?.ok ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50 border-amber-300'}`}>
                    <div className="text-xs text-gray-500 mb-1">תוצאה לאחרון:</div>
                    <div className="text-sm font-bold mb-2">🎙️ "{result.input}"</div>
                    <div className="text-xs space-y-1">
                        <div><strong>זוהתה כוונה:</strong> <code className="bg-white px-1 rounded">{result.parsed?.intent}</code></div>
                        {result.parsed?.intent !== 'unknown' && (
                            <div><strong>פרמטרים:</strong> <code className="bg-white px-1 rounded">{JSON.stringify(result.parsed, null, 0)}</code></div>
                        )}
                        {result.execResult && (
                            <div className={result.execResult.ok ? 'text-emerald-800' : 'text-amber-800'}>
                                <strong>תוצאת ביצוע:</strong> {result.execResult.message}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Command catalog */}
            {COMMAND_GROUPS.map(g => (
                <section key={g.title} className="bg-white border border-gray-200 rounded-2xl p-4">
                    <h2 className="font-black text-base mb-2">{g.title}</h2>
                    <div className="flex flex-wrap gap-1.5">
                        {g.cmds.map(c => (
                            <button
                                key={c}
                                onClick={() => { setText(c); test(c); }}
                                disabled={loading}
                                className="text-xs font-bold px-2.5 py-1 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-[#F4ECD8] disabled:opacity-40"
                            >{c}</button>
                        ))}
                    </div>
                </section>
            ))}

            {/* History */}
            {history.length > 0 && (
                <section className="bg-gray-50 border border-gray-200 rounded-2xl p-3">
                    <h2 className="text-xs font-bold text-gray-600 mb-2">🕒 היסטוריה (20 אחרונות)</h2>
                    <div className="space-y-1">
                        {history.map((h, i) => (
                            <div key={i} className="text-[11px] bg-white rounded p-1.5 border border-gray-100 flex items-center justify-between gap-2">
                                <span className="truncate">"{h.input}"</span>
                                <span className={`shrink-0 font-bold ${h.execResult?.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {h.parsed?.intent === 'unknown' ? '❓ לא מובן' : h.execResult?.ok ? '✅' : '⚠️'} {h.parsed?.intent}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

export default function VoiceTest() {
    return (
        <PageGuard pageName="VoiceTest" pageTitle="בדיקת פקודות קוליות">
            <VoiceTestInner />
        </PageGuard>
    );
}
