import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, Trophy } from 'lucide-react';
import { useTenantBranding } from '@/hooks/useTenantBranding';

// The customer club's tournament table — deliberately NOT Leaderboard.jsx, which
// is the staff performance board and has nothing to do with this.
//
// Every club member who plays lands here, whether they played waiting for a
// table or from their sofa on a Tuesday. First names only: a leaderboard is a
// public wall, and a club has no business publishing the full name of every
// member who played a round of trivia.
export default function ClubLeaderboard() {
  const [search] = useSearchParams();
  const c = search.get('c') || '';
  const s = search.get('s') || '';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const branding = useTenantBranding();
  const brand = branding?.name || 'המסעדה';
  const ACCENT = '#A04A2E';

  useEffect(() => {
    (async () => {
      try {
        const r = await base44.asServiceRole.functions.clubTournament(c && s ? { c, s } : {});
        setData(r?.data || r || {});
      } catch { setData(null); }
      setLoading(false);
    })();
  }, [c, s]);

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center" style={{ background: '#FAF5E8' }}>
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#D9BD83' }} />
      </div>
    );
  }

  const standings = data?.standings || [];
  const winning = data?.winners_count || 0;
  const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);
  const playUrl = `/QueueGame?c=${encodeURIComponent(c)}&s=${encodeURIComponent(s)}`;

  return (
    <div dir="rtl" className="min-h-screen p-4 md:p-8" style={{ background: '#FAF5E8' }}>
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <Trophy className="w-10 h-10 mx-auto mb-2" style={{ color: '#D9BD83' }} />
          <h1 className="text-2xl font-black" style={{ color: ACCENT }}>טורניר {brand}</h1>
          {data?.prize && (
            <p className="text-sm text-gray-600 mt-1">
              {winning === 1 ? 'המוביל מקבל' : `${winning} המובילים מקבלים`}: {data.prize}
            </p>
          )}
          {data?.multiplier > 1 && (
            <p className="text-xs font-bold mt-2 inline-block rounded-full px-3 py-1"
              style={{ background: '#FFFBF2', color: ACCENT }}>
              🔥 משחק במסעדה שווה פי {data.multiplier} נקודות
            </p>
          )}
        </div>

        {standings.length === 0 ? (
          <div className="bg-white rounded-3xl border p-8 text-center" style={{ borderColor: '#D9BD83' }}>
            <p className="text-gray-600">הסבב נפתח — אף אחד עוד לא שיחק.</p>
            <p className="text-sm text-gray-400 mt-1">מי שישחק ראשון מוביל.</p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border overflow-hidden" style={{ borderColor: '#D9BD83' }}>
            {standings.map((row) => {
              const inPrizes = row.rank <= winning;
              return (
                <div key={row.rank}
                  className="flex items-center gap-3 px-5 py-3 border-b last:border-b-0"
                  style={{ background: inPrizes ? '#FFFBF2' : undefined }}>
                  <span className="w-8 text-center text-lg font-black"
                    style={{ color: inPrizes ? ACCENT : '#9CA3AF' }}>
                    {medal(row.rank)}
                  </span>
                  <span className="flex-1 font-semibold text-slate-800">{row.name}</span>
                  <span className="text-left">
                    <span className="font-black" style={{ color: ACCENT }}>{row.points}</span>
                    <span className="block text-[10px] text-gray-400">{row.games} משחקים</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Their own line — the row most people opened this page to find. */}
        {data?.me && (
          <div className="mt-4 rounded-2xl p-4 text-center border-2 border-dashed"
            style={{ borderColor: '#D9BD83', background: '#FFFBF2' }}>
            {data.me.rank ? (
              <p className="text-sm text-gray-700">
                אתה במקום <span className="font-black" style={{ color: ACCENT }}>{data.me.rank}</span>
                {' '}עם {data.me.points} נקודות
              </p>
            ) : (
              <p className="text-sm text-gray-600">עוד לא שיחקת בסבב הזה.</p>
            )}
            <a href={playUrl}
              className="inline-block mt-3 rounded-xl px-6 py-2.5 font-bold text-white text-sm"
              style={{ background: ACCENT }}>
              {data.me.rank ? 'לשפר את המקום' : 'להתחיל לשחק'}
            </a>
          </div>
        )}

        {c && s && (
          <a href={`/MemberCard?c=${encodeURIComponent(c)}&s=${encodeURIComponent(s)}`}
            className="block text-center text-xs mt-5 underline" style={{ color: ACCENT }}>
            חזרה לכרטיס החבר
          </a>
        )}
      </div>
    </div>
  );
}
