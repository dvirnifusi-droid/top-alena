import React, { useState, useEffect, useMemo } from 'react';
import { Customer } from '@/entities/Customer';
import { Loader2 } from 'lucide-react';

/**
 * Allergies and seating preferences on a Customer, editable.
 *
 * Customer.tags existed as a column with no UI anywhere and nothing writing to
 * it, so it was empty for every tenant. Shared between the seating-page guest
 * panel (where the hostess learns these things) and /CustomerDetails (where you
 * go to look someone up) so the two can't drift.
 */

// One tap beats typing Hebrew on a phone mid-service — which is the reason a
// field like this stays empty forever.
export const TAG_SUGGESTIONS = [
    'אלרגיה לבוטנים', 'אלרגיה לגלוטן', 'אלרגיה לחלב', 'אלרגיה לדגים',
    'צמחוני', 'טבעוני', 'כשר',
    'ליד החלון', 'שולחן שקט', 'נגיש', 'כיסא תינוק', 'לא ליד מזגן',
];

// The column is Json: it comes back as an array, a JSON string, or (from
// hand-edited rows) a comma-separated string. Normalise all three.
export function parseTags(raw) {
    if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
    if (typeof raw === 'string' && raw.trim()) {
        try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map(String) : [raw]; }
        catch { return raw.split(',').map(s => s.trim()).filter(Boolean); }
    }
    return [];
}

export default function CustomerTagsEditor({ customer, label = 'אלרגיות והעדפות', onSaved }) {
    const tags = useMemo(() => parseTags(customer?.tags), [customer]);

    const [editing, setEditing] = useState(false);
    const [input, setInput] = useState('');
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState(tags);
    const [dirty, setDirty] = useState(false);

    // A background refresh can replace the customer row underneath us — re-sync
    // only while there's nothing unsaved, so a half-finished edit isn't wiped.
    useEffect(() => { if (!dirty) setDraft(tags); }, [tags, dirty]);

    if (!customer) return null;

    const addTag = (raw) => {
        const v = String(raw || '').trim();
        if (!v) return;
        setDraft(prev => (prev.includes(v) ? prev : [...prev, v]));
        setInput('');
        setDirty(true);
    };

    const save = async () => {
        setSaving(true);
        try {
            await Customer.update(customer.id, { tags: draft });
            setDirty(false);
            onSaved?.(draft);
        } catch (e) {
            console.error('save customer tags failed', e);
            alert('שגיאה בשמירת התוויות');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <button
                    onClick={() => setEditing(v => !v)}
                    className="text-[11px] font-semibold text-[#A04A2E] hover:underline"
                >{editing ? 'סיום' : '✏️ ערוך'}</button>
                <label className="text-[10px] text-slate-500">{label}</label>
            </div>

            <div className="flex flex-wrap gap-1.5">
                {draft.length === 0 && !editing && (
                    <span className="text-[11px] text-slate-400">אין תוויות</span>
                )}
                {draft.map(t => (
                    <span key={t} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 inline-flex items-center gap-1">
                        {t}
                        {editing && (
                            <button
                                onClick={() => { setDraft(prev => prev.filter(x => x !== t)); setDirty(true); }}
                                className="text-slate-400 hover:text-rose-600"
                                title="הסר"
                            >✕</button>
                        )}
                    </span>
                ))}
            </div>

            {editing && (
                <div className="mt-2 space-y-1.5">
                    <div className="flex gap-1.5">
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(input); } }}
                            placeholder="תווית חדשה…"
                            className="flex-1 h-9 px-2 rounded-lg border border-gray-200 text-[13px] bg-white focus:outline-none focus:border-[#A04A2E]"
                        />
                        <button
                            onClick={() => addTag(input)}
                            disabled={!input.trim()}
                            className="h-9 px-3 rounded-lg bg-[#44512C] text-white text-[13px] font-bold disabled:opacity-40"
                        >הוסף</button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {TAG_SUGGESTIONS.filter(s => !draft.includes(s)).map(s => (
                            <button
                                key={s}
                                onClick={() => addTag(s)}
                                className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >+ {s}</button>
                        ))}
                    </div>
                    {dirty && (
                        <button
                            onClick={save}
                            disabled={saving}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-[#44512C] text-white disabled:opacity-50 inline-flex items-center gap-1"
                        >
                            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                            שמור תוויות
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
