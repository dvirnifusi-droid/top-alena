import React, { useMemo, useState, useEffect } from 'react';

/**
 * Table picker grouped into ONE-OPEN-AT-A-TIME zone accordions.
 *
 * Replaces the native <select> + <optgroup> that listed all 57 tables at once:
 * on a phone that is an unreadable wall, and the hostess's real question is
 * "which section?" before "which table?". Unlike
 * components/dashboard/TablePicker.jsx (hardcoded to Alena's zone numbers, queue
 * only) this is driven entirely by the tenant's own `tables` array.
 */
export default function ZoneTablePicker({
    tables = [],
    value = '',                  // current table_number ('' = none)
    onChange,                    // (tableNumber|null) => void
    partySize = 0,               // marks ⭐ on tables that actually fit
    busyTableNumbers = [],       // shown as taken, not selectable
    excludeTableNumbers = [],    // dropped from the list entirely
    allowNone = true,            // offer "כללי / ללא שולחן"
    inline = false,              // skip the trigger button, always show the panel
}) {
    const [open, setOpen] = useState(inline);
    const [query, setQuery] = useState('');
    const [openZone, setOpenZone] = useState(null);

    const busy = useMemo(() => new Set(busyTableNumbers.map(String)), [busyTableNumbers]);
    const excluded = useMemo(() => new Set(excludeTableNumbers.map(String)), [excludeTableNumbers]);
    const size = Number(partySize) || 0;
    const fits = (t) => size > 0 && Number(t.min_capacity) <= size && Number(t.max_capacity) >= size;

    // area -> tables, natural-sorted by number
    const zones = useMemo(() => {
        const byArea = new Map();
        [...tables]
            .filter(t => !excluded.has(String(t.table_number)))
            .sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), 'he', { numeric: true }))
            .forEach(t => {
                const k = t.area || 'ללא אזור';
                if (!byArea.has(k)) byArea.set(k, []);
                byArea.get(k).push(t);
            });
        return [...byArea.entries()].map(([area, list]) => ({
            area,
            list,
            fitCount: list.filter(t => fits(t) && !busy.has(String(t.table_number))).length,
            freeCount: list.filter(t => !busy.has(String(t.table_number))).length,
        }));
    }, [tables, excluded, busy, size]);

    const selected = tables.find(t => String(t.table_number) === String(value));

    // Open the zone the current table lives in, so the panel lands where the eye
    // expects. With no selection, open the first zone that has a fitting table.
    useEffect(() => {
        if (!open) return;
        setOpenZone(prev => {
            if (prev) return prev;
            if (selected) return selected.area || 'ללא אזור';
            return (zones.find(z => z.fitCount > 0) || zones[0])?.area || null;
        });
    }, [open, selected, zones]);

    const q = query.trim();
    const matches = (t) => !q || String(t.table_number).toLowerCase().includes(q.toLowerCase());
    // A search hit anywhere overrides the accordion — you typed a number, you
    // want to see it, not to guess which section it's in.
    const searching = q.length > 0;

    const pick = (tableNumber) => {
        onChange?.(tableNumber);
        setQuery('');
        if (!inline) setOpen(false);
    };

    const panel = (
        <div className="mt-1.5 border rounded-xl bg-white overflow-hidden" dir="rtl">
            <div className="p-2 border-b bg-gray-50">
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="חפש מספר שולחן…"
                    inputMode="search"
                    className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#A04A2E]"
                />
            </div>

            <div className="max-h-[46vh] overflow-y-auto overscroll-contain">
                {allowNone && !searching && (
                    <button
                        type="button"
                        onClick={() => pick(null)}
                        className={`w-full text-right px-3 py-2.5 text-sm border-b transition-colors ${
                            !value ? 'bg-[#F4ECD8] font-semibold text-[#44512C]' : 'hover:bg-gray-50 text-gray-600'
                        }`}
                    >כללי — ללא שולחן</button>
                )}

                {zones.map(({ area, list, fitCount, freeCount }) => {
                    const visible = list.filter(matches);
                    if (searching && visible.length === 0) return null;
                    const isOpen = searching || openZone === area;
                    return (
                        <div key={area} className="border-b last:border-b-0">
                            <button
                                type="button"
                                onClick={() => setOpenZone(prev => (prev === area ? null : area))}
                                className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors ${
                                    isOpen ? 'bg-[#F4ECD8]' : 'bg-white hover:bg-gray-50'
                                }`}
                            >
                                <span className="text-[11px] text-gray-500 tabular-nums">
                                    {size > 0 ? `${fitCount} מתאימים` : `${freeCount} פנויים`}
                                </span>
                                <span className="flex items-center gap-2 text-[14px] font-semibold text-gray-800">
                                    {area}
                                    <span className="text-gray-400 text-[11px]">{isOpen ? '▲' : '▼'}</span>
                                </span>
                            </button>

                            {isOpen && (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 p-2 bg-gray-50/70">
                                    {visible.map(t => {
                                        const num = String(t.table_number);
                                        const isTaken = busy.has(num);
                                        const isSel = String(value) === num;
                                        const good = fits(t);
                                        return (
                                            <button
                                                key={num}
                                                type="button"
                                                disabled={isTaken && !isSel}
                                                onClick={() => pick(num)}
                                                className={`rounded-lg border px-1 py-1.5 text-center transition-all ${
                                                    isSel
                                                        ? 'bg-[#44512C] border-[#44512C] text-white'
                                                        : isTaken
                                                            ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                                            : good
                                                                ? 'bg-white border-[#D9BD83] text-gray-800 hover:border-[#A04A2E]'
                                                                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                                                }`}
                                            >
                                                <span className="block text-[15px] font-semibold tabular-nums leading-tight">
                                                    {good && !isTaken ? '⭐ ' : ''}{num}
                                                </span>
                                                <span className={`block text-[10px] tabular-nums ${isSel ? 'text-white/70' : 'text-gray-500'}`} dir="ltr">
                                                    {isTaken ? 'תפוס' : `${t.min_capacity}-${t.max_capacity}`}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}

                {zones.length === 0 && (
                    <div className="px-3 py-6 text-center text-sm text-gray-400">אין שולחנות להצגה</div>
                )}
            </div>
        </div>
    );

    if (inline) return panel;

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full h-11 mt-0.5 border rounded-lg px-3 bg-white text-base font-semibold flex items-center justify-between text-right"
            >
                <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
                <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
                    {selected
                        ? `${selected.table_number} · ${selected.area || 'ללא אזור'} · ${selected.min_capacity}-${selected.max_capacity} סועדים`
                        : 'כללי — ללא שולחן'}
                </span>
            </button>
            {open && panel}
        </div>
    );
}
