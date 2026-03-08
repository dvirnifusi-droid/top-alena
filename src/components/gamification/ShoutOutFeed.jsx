import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';

const REACTION_EMOJIS = ['🔥', '👏', '💪', '❤️', '⭐'];

export default function ShoutOutFeed({ currentEmployeeId, limit = 5 }) {
  const [shoutouts, setShoutouts] = useState([]);

  useEffect(() => {
    loadShoutouts();
    const unsub = base44.entities.ShoutOut.subscribe(() => loadShoutouts());
    return unsub;
  }, []);

  const loadShoutouts = async () => {
    const data = await base44.entities.ShoutOut.list('-created_date', limit);
    setShoutouts(data);
  };

  const handleReact = async (shoutoutId, emoji) => {
    const shoutout = shoutouts.find(s => s.id === shoutoutId);
    if (!shoutout) return;
    const reactions = shoutout.reactions || [];
    const existing = reactions.find(r => r.employee_id === currentEmployeeId);
    let updated;
    if (existing) {
      updated = reactions.map(r => r.employee_id === currentEmployeeId ? { ...r, emoji } : r);
    } else {
      updated = [...reactions, { employee_id: currentEmployeeId, emoji }];
    }
    await base44.entities.ShoutOut.update(shoutoutId, { reactions: updated });
    setShoutouts(prev => prev.map(s => s.id === shoutoutId ? { ...s, reactions: updated } : s));
  };

  if (shoutouts.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">🏆 קיר התהילה</h3>
      {shoutouts.map(s => {
        const reactionCounts = (s.reactions || []).reduce((acc, r) => {
          acc[r.emoji] = (acc[r.emoji] || 0) + 1;
          return acc;
        }, {});
        const myReaction = (s.reactions || []).find(r => r.employee_id === currentEmployeeId)?.emoji;

        return (
          <Card key={s.id} className="border border-orange-100 bg-gradient-to-r from-orange-50 to-yellow-50">
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <span className="text-2xl flex-shrink-0">{s.emoji || '🔥'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 text-sm">{s.recipient_name}</p>
                  <p className="text-gray-700 text-sm">{s.message}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {REACTION_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => handleReact(s.id, emoji)}
                        className={`text-sm px-2 py-0.5 rounded-full border transition-all ${myReaction === emoji ? 'bg-yellow-200 border-yellow-400' : 'bg-white border-gray-200 hover:bg-yellow-50'}`}
                      >
                        {emoji} {reactionCounts[emoji] ? <span className="text-xs text-gray-500">{reactionCounts[emoji]}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}