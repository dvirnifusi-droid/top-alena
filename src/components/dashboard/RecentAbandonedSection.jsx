import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

export default function RecentAbandonedSection({ entries = [], recentAbandoned = [], fetchEntries }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-2 text-lg font-bold text-red-600 mb-3 hover:text-red-700 transition-colors"
      >
        <span className="w-2 h-2 bg-red-400 rounded-full inline-block"></span>
        נטשו לאחרונה ({recentAbandoned.length})
        <span className="text-sm text-gray-400 font-normal">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-2">
          {recentAbandoned.map(entry => {
            const minsAgo = Math.round((Date.now() - new Date(entry.timestamp_end).getTime()) / 60000);
            return (
              <Card key={entry.id} className="border-red-200 bg-red-50">
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-black text-gray-800 truncate">{entry.customer_name}</p>
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full flex-shrink-0">👥 {entry.party_size}</span>
                    </div>
                    <p className="text-xs text-gray-400">לפני {minsAgo} דק' • {entry.phone}</p>
                    {entry.notes && <p className="text-xs text-red-500 mt-0.5">{entry.notes}</p>}
                  </div>
                  <button
                    onClick={async () => {
                      const maxOrder = Math.max(0, ...entries.filter(x => x.status === 'active').map(x => x.sort_order ?? 0));
                      await base44.entities.QueueEntry.update(entry.id, {
                        status: 'active',
                        timestamp_end: null,
                        seat_called_at: null,
                        sort_order: maxOrder + 1,
                      });
                      fetchEntries();
                    }}
                    className="flex-shrink-0 bg-[#44512C] hover:bg-[#44512C] text-white text-xs font-black px-3 py-2 rounded-xl transition-all active:scale-95"
                  >
                    ↩️ החזר לתור
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}