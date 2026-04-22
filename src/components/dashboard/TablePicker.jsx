import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

const ZONES = [
  {
    id: 'inside',
    label: 'פנים',
    emoji: '🏠',
    color: 'bg-blue-100 text-blue-700 border-blue-300',
    activeColor: 'bg-blue-600 text-white border-blue-600',
    tables: [9,10,11,12,13,20,30,31,40,41,50,60,61,70,71,80,81],
  },
  {
    id: 'outside',
    label: 'חוץ',
    emoji: '🌳',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    activeColor: 'bg-emerald-600 text-white border-emerald-600',
    tables: [100,101,102,103,104,150,151,152,153,154,200,201,202,203,204,205],
  },
  {
    id: 'far',
    label: 'חוץ רחוק',
    emoji: '🌿',
    color: 'bg-orange-100 text-orange-700 border-orange-300',
    activeColor: 'bg-orange-500 text-white border-orange-500',
    tables: [300,301,400,401,402,403,500,501,503,600,601,603,604,700,701,702,703,704,800,801,802,803,900],
  },
];

function getCurrentTable(entry) {
  if (entry.notes?.startsWith('שולחן:')) return entry.notes.replace('שולחן:', '').trim();
  return '';
}

export default function TablePicker({ entry, onSave }) {
  const [open, setOpen] = useState(false);
  const [activeZone, setActiveZone] = useState(null);
  const [customVal, setCustomVal] = useState('');

  const current = getCurrentTable(entry);

  const saveTable = async (val) => {
    await base44.entities.QueueEntry.update(entry.id, { notes: val ? `שולחן: ${val}` : '' });
    onSave();
    setOpen(false);
    setActiveZone(null);
  };

  const handleCustomSave = async () => {
    await saveTable(customVal.trim());
    setCustomVal('');
  };

  return (
    <div className="mb-2">
      {/* שורה ראשית */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 font-bold flex-shrink-0">🪑 שולחן:</span>
        <button
          onClick={() => setOpen(!open)}
          className={`flex-1 text-sm border-2 border-dashed rounded-xl px-3 py-1.5 font-bold text-right transition-all ${
            current
              ? 'border-blue-400 bg-blue-50 text-blue-700'
              : 'border-gray-200 bg-gray-50 text-gray-400 hover:border-blue-300'
          }`}
        >
          {current || 'בחר שולחן...'}
        </button>
        {current && (
          <button
            onClick={() => saveTable('')}
            className="text-gray-300 hover:text-red-400 text-lg transition-all"
            title="נקה"
          >✕</button>
        )}
      </div>

      {/* פאנל בחירה */}
      {open && (
        <div className="mt-2 bg-white border-2 border-blue-200 rounded-2xl p-3 shadow-lg">
          {/* כתיבה חופשית */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={customVal}
              onChange={e => setCustomVal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && customVal.trim() && handleCustomSave()}
              placeholder="כתוב מספר שולחן..."
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={handleCustomSave}
              disabled={!customVal.trim()}
              className="px-3 py-2 bg-blue-500 disabled:opacity-40 text-white rounded-xl text-sm font-black"
            >✓</button>
          </div>

          {/* טאבי אזורים */}
          <div className="flex gap-1.5 mb-2">
            {ZONES.map(z => (
              <button
                key={z.id}
                onClick={() => setActiveZone(activeZone === z.id ? null : z.id)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                  activeZone === z.id ? z.activeColor : z.color
                }`}
              >
                {z.emoji} {z.label}
              </button>
            ))}
          </div>

          {/* גריד שולחנות */}
          {activeZone && (
            <div className="grid grid-cols-5 gap-1.5 max-h-40 overflow-y-auto">
              {ZONES.find(z => z.id === activeZone)?.tables.map(t => (
                <button
                  key={t}
                  onClick={() => saveTable(String(t))}
                  className={`py-2 rounded-xl text-sm font-black border-2 transition-all active:scale-95 ${
                    current === String(t)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-blue-50 hover:border-blue-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}