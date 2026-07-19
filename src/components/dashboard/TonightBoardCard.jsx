import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Trophy, Gift } from 'lucide-react';

// The host's view of tonight's board, and the one button that turns it into
// something: hand the leading table a benefit while they are still in the room.
//
// Awarding is a person's decision, never automatic — the same rule the weekly
// tournament follows. A prize given by the machine at closing time reaches
// someone who has already gone home.
export default function TonightBoardCard() {
  const [board, setBoard] = useState(null);
  const [busy, setBusy] = useState('');
  const [awarded, setAwarded] = useState({});

  const load = () =>
    base44.functions.queueTonightBoardAdmin()
      .then((r) => setBoard((r?.data ?? r) || null))
      .catch(() => setBoard(null));

  useEffect(() => {
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, []);

  const rows = board?.rows || [];
  if (rows.length === 0) return null;

  const award = async (row) => {
    setBusy(row.entry_id);
    try {
      const r = await base44.functions.clubGrantBenefit({
        customer_id: row.customer_id,
        description: 'מנצחי המשחק בתור 🏆',
        valid_days: 90,
      });
      const d = (r?.data ?? r) || {};
      setAwarded((p) => ({ ...p, [row.entry_id]: d.code || 'ניתן' }));
    } catch {
      setAwarded((p) => ({ ...p, [row.entry_id]: 'שגיאה' }));
    }
    setBusy('');
  };

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-600" /> המשחקים הערב
          </h3>
          <span className="text-xs text-slate-500">
            {board.waiting_now > 0 ? `${board.waiting_now} ממתינים` : 'כולם הושבו'}
          </span>
        </div>

        {rows.slice(0, 6).map((row, i) => (
          <div key={row.entry_id} className="flex items-center gap-2 py-1.5 border-b last:border-b-0">
            <span className="w-6 text-center text-sm font-bold text-slate-400">
              {i === 0 ? '🥇' : i + 1}
            </span>
            <span className="flex-1 text-sm text-slate-800 truncate">
              {row.name}
              {row.waiting && <span className="text-emerald-600 text-[10px] mr-1.5">ממתין</span>}
            </span>
            <span className="text-sm font-black text-slate-700">{row.points}</span>
            {/* Only offered where a club member is behind the entry — there is
                nowhere to put a benefit for an anonymous table. */}
            {i === 0 && row.customer_id && (
              awarded[row.entry_id] ? (
                <span className="text-xs font-bold text-emerald-700">{awarded[row.entry_id]}</span>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs shrink-0"
                  disabled={busy === row.entry_id} onClick={() => award(row)}>
                  {busy === row.entry_id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <><Gift className="w-3 h-3 ml-1" /> הטבה למנצח</>}
                </Button>
              )
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
