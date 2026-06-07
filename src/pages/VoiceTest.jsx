import React, { useState } from 'react';
import { handleVoiceCommand } from '@/components/voice/handleVoiceCommand';
import PageGuard from '@/components/shared/PageGuard';

// All commands grouped by category — exhaustive cheat sheet + click-to-test.
const COMMAND_GROUPS = [
    {
        title: '🪑 ניהול שולחנות',
        cmds: [
            'שולחן 11 פנוי',
            'שולחן 11 התפנה',
            'שולחן 11 קינוח',
            'שולחן 11 חשבון',
            'שולחן 11 סיום קרוב',
            'שולחן 11 יושב',
            'שולחן 11 התיישבו',
            'שולחן 11 הבריז',
            'שולחן 11 לא הגיע',
        ],
    },
    {
        title: '🚩 דגלים',
        cmds: [
            'שולחן 11 ירוק',
            'שולחן 11 VIP',
            'שולחן 11 אדום',
            'שולחן 11 בעיה',
            'שולחן 11 כתום',
            'שולחן 11 שחור',
            'שולחן 11 ללא דגל',
        ],
    },
    {
        title: '🚶 תור',
        cmds: [
            'תוסיף לתור 4 על שם שירה',
            'תוסיף לתור 2 חוץ על שם רן',
            'תוסיף לתור 4 פנים על שם רן',
            'תקרא לשירה',
            'שירה בא',
            'שירה הגיעה',
            'שירה עזב',
            'שירה נטוש',
        ],
    },
    {
        title: '🎯 הושבה',
        cmds: [
            'תושיב את שירה על 20',
            'תושיב את ניב על 200 ו-201',
            'תקבל את הבא בתור על 30',
        ],
    },
    {
        title: '❓ שאלות (קוליות)',
        cmds: [
            'מי הבא בתור',
            'מי ההזמנה הבאה',
            'כמה אנשים בתור',
            'כמה מקומות פנויים',
            'מי על שולחן 11',
        ],
    },
    {
        title: '📩 תקשורת',
        cmds: ['תשלח לשירה אישור'],
    },
];

function VoiceTestInner() {
    const [text, setText] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState([]);

    const test = async (cmd) => {
        const input = cmd || text;
        if (!input.trim()) return;
        setLoading(true);
        setResult(null);
        try {
            // Import dynamically so parseIntent runs the same path as live voice
            const { default: VoiceControl } = await import('@/components/voice/VoiceControl');
            // Actually — easier path: simulate the same flow as if speech recognized this text
            // First try regex via the same parser
            const parsedFromRegex = await parseInClient(input);
            let parsed = parsedFromRegex;
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
            <h1 className="text-2xl font-black">🎤 בדיקת פקודות קוליות</h1>
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
                    className="flex-1 text-sm border-2 border-gray-300 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500"
                />
                <button
                    onClick={() => test()}
                    disabled={loading || !text.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-black px-5 py-2 rounded-xl text-sm"
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
                                className="text-xs font-bold px-2.5 py-1 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-40"
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

// Inline copy of parseIntent so we don't need to expose it from VoiceControl.
// Keep in sync with src/components/voice/VoiceControl.jsx
const HEB_NUMBERS = {
    'אפס': 0, 'אחד': 1, 'אחת': 1, 'שניים': 2, 'שתיים': 2, 'שני': 2, 'שלוש': 3, 'שלושה': 3,
    'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7,
    'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10,
    'עשרים': 20, 'שלושים': 30, 'ארבעים': 40, 'חמישים': 50, 'שישים': 60, 'שבעים': 70,
    'שמונים': 80, 'תשעים': 90, 'מאה': 100, 'מאתיים': 200,
};
function cleanForMatch(text) {
    return String(text || '').replace(/[?!.,،؟]/g, '').replace(/\s+/g, ' ').trim();
}
function normalizeHebrewNumbers(text) {
    let out = text;
    const entries = Object.entries(HEB_NUMBERS).sort((a, b) => b[0].length - a[0].length);
    for (const [word, digit] of entries) {
        out = out.replace(new RegExp(`(^|\\s)${word}(\\s|$)`, 'g'), `$1${digit}$2`);
    }
    return out;
}
const MATCHERS = [
    { re: /(מי|מיהו|מיהי)\s+(הבא|הבאה)\s+(בתור|לתור)/, intent: 'q_next_in_queue' },
    { re: /^(מי|מיהו|מיהי)\s+הבא/, intent: 'q_next_in_queue' },
    { re: /(מי|מיהי)\s+ההזמנה\s+הבאה/, intent: 'q_next_reservation' },
    { re: /ההזמנה\s+הבאה/, intent: 'q_next_reservation' },
    { re: /כמה\s+(אנשים|חבורות|לקוחות)?\s*(יש)?\s*בתור/, intent: 'q_queue_count' },
    { re: /^בתור\s+(יש)?/, intent: 'q_queue_count' },
    { re: /כמה\s+(מקומות|שולחנות)\s+פנויים/, intent: 'q_free_tables' },
    { re: /(מי|מיהו)\s+(על|יושב\s+על|נמצא\s+על)\s+שולחן\s+(\d+)/, intent: 'q_who_on_table', extract: m => ({ table: m[3] }) },
    { re: /^תושיב(י)?\s+את\s+(.+?)\s+על\s+(?:שולחן\s+)?(\d+)\s+ו(?:על\s+)?(\d+)/, intent: 'seat_reservation_multi', extract: m => ({ name: m[2].trim(), tables: [m[3], m[4]] }) },
    { re: /^תושיב(י)?\s+את\s+(.+?)\s+על\s+(?:שולחן\s+)?(\d+)/, intent: 'seat_reservation', extract: m => ({ name: m[2].trim(), table: m[3] }) },
    { re: /^תקבל(י)?\s+את\s+הבא\s+(?:בתור\s+)?על\s+(?:שולחן\s+)?(\d+)/, intent: 'seat_next_queue', extract: m => ({ table: m[2] }) },
    { re: /^תוסיף(י)?\s+לתור\s+(\d+)\s+(חוץ|פנים)\s+על\s+שם\s+(.+)$/, intent: 'queue_add', extract: m => ({ party_size: Number(m[2]), pref: m[3] === 'חוץ' ? 'outside' : 'inside', name: m[4].trim() }) },
    { re: /^תוסיף(י)?\s+לתור\s+(\d+)\s+על\s+שם\s+(.+)$/, intent: 'queue_add', extract: m => ({ party_size: Number(m[2]), pref: 'no_preference', name: m[3].trim() }) },
    { re: /^תקרא(י)?\s+ל(.+)$/, intent: 'queue_call', extract: m => ({ name: m[2].trim() }) },
    { re: /^(.+?)\s+(בא|הגיע|הגיעה)$/, intent: 'queue_arrived', extract: m => ({ name: m[1].trim() }) },
    { re: /^(.+?)\s+(עזב|עזבה|נטוש|נטושה)$/, intent: 'queue_abandoned', extract: m => ({ name: m[1].trim() }) },
    { re: /שולחן\s+(\d+)\s+(פנוי|התפנה|פנויה)/, intent: 'table_free', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(קינוח|חשבון|סיום|סיום\s+קרוב)/, intent: 'table_finishing', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(יושב|יושבים|התיישבו|התיישב)/, intent: 'table_seated', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(הבריז|הבריזו|לא\s+הגיע|לא\s+הגיעו)/, intent: 'table_no_show', extract: m => ({ table: m[1] }) },
    { re: /שולחן\s+(\d+)\s+(ירוק|VIP|וי\s*איי\s*פי)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'green' }) },
    { re: /שולחן\s+(\d+)\s+(אדום|בעיה)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'red' }) },
    { re: /שולחן\s+(\d+)\s+כתום/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'orange' }) },
    { re: /שולחן\s+(\d+)\s+שחור/, intent: 'table_flag', extract: m => ({ table: m[1], flag: 'black' }) },
    { re: /שולחן\s+(\d+)\s+(ללא\s+דגל|בלי\s+דגל|נקה\s+דגל)/, intent: 'table_flag', extract: m => ({ table: m[1], flag: '' }) },
    { re: /^תשלח(י)?\s+ל(.+?)\s+אישור/, intent: 'resend_confirmation', extract: m => ({ name: m[2].trim() }) },
];
async function parseInClient(text) {
    const clean = normalizeHebrewNumbers(cleanForMatch(text));
    for (const m of MATCHERS) {
        const match = clean.match(m.re);
        if (match) {
            const extracted = m.extract ? m.extract(match) : {};
            return { intent: m.intent, raw: clean, ...extracted };
        }
    }
    return { intent: 'unknown', raw: clean };
}

export default function VoiceTest() {
    return (
        <PageGuard pageName="VoiceTest" pageTitle="בדיקת פקודות קוליות">
            <VoiceTestInner />
        </PageGuard>
    );
}
