// Visual side-by-side preview of 3 color-alignment strategies.
// Owner picks one → I apply that across the app.
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Users, Megaphone, Trophy, GraduationCap, Package, CalendarHeart, QrCode, Settings, Plus } from 'lucide-react';

// ─── Option A — Full unified (emerald/amber/red/gray only) ──────────
const SIDEBAR_A = [
    { label: 'לוח בקרה', color: 'emerald', icon: Sparkles },
    { label: 'כלי AI', color: 'emerald', icon: Sparkles },
    { label: 'תור והזמנות', color: 'amber', icon: QrCode },
    { label: 'עובדים וסידור', color: 'emerald', icon: Users },
    { label: 'גיוס והכשרה', color: 'emerald', icon: GraduationCap },
    { label: 'אירועים פרטיים', color: 'amber', icon: CalendarHeart },
    { label: 'משלוחים', color: 'amber', icon: Package },
    { label: 'שיווק ולקוחות', color: 'emerald', icon: Megaphone },
    { label: 'גמיפיקציה וסטוריז', color: 'amber', icon: Trophy },
    { label: 'הגדרות', color: 'slate', icon: Settings },
];

// ─── Option B — Targeted (Hubs emerald, details keep colors) ─────────
const SIDEBAR_B = [
    { label: 'לוח בקרה', color: 'emerald', icon: Sparkles },
    { label: 'כלי AI', color: 'emerald', icon: Sparkles },
    { label: 'תור והזמנות', color: 'emerald', icon: QrCode },
    { label: 'עובדים וסידור', color: 'emerald', icon: Users },
    { label: 'גיוס והכשרה', color: 'emerald', icon: GraduationCap },
    { label: 'אירועים פרטיים', color: 'emerald', icon: CalendarHeart },
    { label: 'משלוחים', color: 'emerald', icon: Package },
    { label: 'שיווק ולקוחות', color: 'emerald', icon: Megaphone },
    { label: 'גמיפיקציה וסטוריז', color: 'emerald', icon: Trophy },
    { label: 'הגדרות', color: 'slate', icon: Settings },
];

// ─── Option C — Current (12 colors) ──────────────────────────────────
const SIDEBAR_C = [
    { label: 'לוח בקרה', color: 'slate', icon: Sparkles },
    { label: 'כלי AI', color: 'violet', icon: Sparkles },
    { label: 'תור והזמנות', color: 'cyan', icon: QrCode },
    { label: 'עובדים וסידור', color: 'blue', icon: Users },
    { label: 'גיוס והכשרה', color: 'indigo', icon: GraduationCap },
    { label: 'אירועים פרטיים', color: 'indigo', icon: CalendarHeart },
    { label: 'משלוחים', color: 'amber', icon: Package },
    { label: 'שיווק ולקוחות', color: 'pink', icon: Megaphone },
    { label: 'גמיפיקציה וסטוריז', color: 'rose', icon: Trophy },
    { label: 'הגדרות', color: 'slate', icon: Settings },
];

function MockSidebar({ items }) {
    const colorMap = {
        emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
        amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
        teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
        slate: { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
        violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
        cyan: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
        blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
        indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
        pink: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
        rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    };
    return (
        <div className="bg-white border rounded-xl overflow-hidden">
            {items.map((it, i) => {
                const c = colorMap[it.color] || colorMap.slate;
                return (
                    <div key={i} className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 ${c.bg}`}>
                        <it.icon className={`w-4 h-4 ${c.text}`} />
                        <span className={`text-xs font-bold ${c.text}`}>{it.label}</span>
                    </div>
                );
            })}
        </div>
    );
}

function MockHub({ accent }) {
    const map = {
        emerald: { icon: 'text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700', card: 'border-emerald-200 bg-emerald-50' },
        amber: { icon: 'text-amber-600', btn: 'bg-amber-600 hover:bg-amber-700', card: 'border-amber-200 bg-amber-50' },
        pink: { icon: 'text-pink-600', btn: 'bg-pink-600 hover:bg-pink-700', card: 'border-pink-200 bg-pink-50' },
        violet: { icon: 'text-violet-600', btn: 'bg-violet-600 hover:bg-violet-700', card: 'border-violet-200 bg-violet-50' },
    };
    const c = map[accent] || map.emerald;
    return (
        <Card>
            <CardContent className="p-3">
                <h3 className={`text-base font-bold flex items-center gap-2 mb-2`}>
                    <Megaphone className={`w-5 h-5 ${c.icon}`} />
                    שיווק ולקוחות
                </h3>
                <div className={`border rounded-lg p-2 text-xs mb-2 ${c.card}`}>
                    דוגמת כרטיס מלאי
                </div>
                <button className={`text-xs text-white px-3 py-1.5 rounded-lg font-bold ${c.btn}`}>
                    <Plus className="w-3 h-3 inline ml-1" />
                    פעולה
                </button>
            </CardContent>
        </Card>
    );
}

function OptionCard({ title, tagline, items, hubAccent, pros, cons, recommended }) {
    return (
        <div className={`border-2 rounded-2xl p-4 ${recommended ? 'border-emerald-400 bg-emerald-50/30' : 'border-gray-200 bg-white'}`}>
            <div className="flex items-baseline justify-between mb-1">
                <h2 className="text-xl font-bold">{title}</h2>
                {recommended && <span className="text-xs bg-emerald-500 text-white font-bold px-2 py-0.5 rounded-full">מומלץ</span>}
            </div>
            <p className="text-sm text-gray-600 mb-4">{tagline}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                    <div className="text-xs font-bold text-gray-500 mb-1">סיידבר</div>
                    <MockSidebar items={items} />
                </div>
                <div>
                    <div className="text-xs font-bold text-gray-500 mb-1">דוגמת Hub</div>
                    <MockHub accent={hubAccent} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-2">
                    <div className="font-bold text-emerald-800 mb-1">👍 יתרונות</div>
                    <ul className="text-emerald-900 space-y-0.5 list-disc pr-4">
                        {pros.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-2">
                    <div className="font-bold text-amber-800 mb-1">👎 חסרונות</div>
                    <ul className="text-amber-900 space-y-0.5 list-disc pr-4">
                        {cons.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default function ColorPreview() {
    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto" dir="rtl">
            <div className="mb-6">
                <h1 className="text-2xl font-bold">🎨 הדמיית עיצובים — בחר אופציה</h1>
                <p className="text-sm text-gray-600 mt-1">
                    3 גישות לאיחוד צבעים לפי הסגנון של <code className="bg-gray-100 px-1.5 rounded text-xs">/PublicReservation</code> (emerald · amber · gray).
                </p>
            </div>

            <div className="space-y-5">
                <OptionCard
                    title="A — איחוד מלא (4 צבעים)"
                    tagline="כל האפליקציה ב-emerald/amber/red/gray. הניווט בסיידבר על בסיס משני (אייקונים בלבד)."
                    items={SIDEBAR_A}
                    hubAccent="emerald"
                    pros={['מסעדה-feel אחיד', 'הכי דומה ל-PublicReservation', 'מינימלי וקריא']}
                    cons={['פחות בולטות בניווט', 'יותר הסתמכות על אייקונים', 'יותר עבודה ליישום']}
                />

                <OptionCard
                    title="B — איחוד מטרגט (Hubs ב-emerald)"
                    tagline="Hubs ו-headings ראשיים → emerald. דפי detail שומרים על צבעי קטגוריה. כפתורי action חוצי-אפליקציה → emerald."
                    items={SIDEBAR_B}
                    hubAccent="emerald"
                    pros={['מהיר ליישום (45 דק׳)', 'ניווט יציב', 'כפתורים אחידים']}
                    cons={['Hubs יראו דומים זה לזה', 'דפי detail עדיין מגוונים']}
                    recommended
                />

                <OptionCard
                    title="C — מצב נוכחי (12 צבעים)"
                    tagline="לא נוגעים. כל קטגוריה צבע משלה — מקסימום הבחנה."
                    items={SIDEBAR_C}
                    hubAccent="pink"
                    pros={['בולטות גבוהה', 'הניווט אינטואיטיבי', 'אפס עבודה']}
                    cons={['לא תואם /PublicReservation', 'מראה rainbow', 'פחות מסעדה-feel']}
                />
            </div>

            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
                <b className="text-blue-900">🎯 איך בוחרים:</b>
                <p className="text-blue-800 mt-1">
                    תגיד לי A / B / C ואני מתחיל. אם רוצה משהו ביניים — תיאר לי במילים ואני בונה גרסה רביעית.
                </p>
            </div>
        </div>
    );
}
