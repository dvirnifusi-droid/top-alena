import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2, Gift, Coins, Trophy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTenantBranding } from '@/hooks/useTenantBranding';

// What a member can see about their own membership.
//
// Until this page existed the answer was nothing at all — clubGetProfile
// deliberately withholds the balance and the tier, and no screen anywhere showed
// a customer either one. A club whose members cannot see what they have is a
// mailing list with a nicer name.
//
// Benefits lead and coins follow, because that is the true order of what a
// member has: almost nobody has a coin balance yet, and opening on a big zero
// would say "you have nothing" to someone who is holding a free dessert.
export default function MemberCard() {
  const [search] = useSearchParams();
  const c = search.get('c') || '';
  const s = search.get('s') || '';
  const [state, setState] = useState('loading');   // loading | ready | error
  const [card, setCard] = useState(null);
  const branding = useTenantBranding();
  const brand = branding?.name || 'המסעדה';
  const ACCENT = '#A04A2E';

  useEffect(() => {
    if (!c || !s) { setState('error'); return; }
    (async () => {
      try {
        const r = await base44.asServiceRole.functions.clubMemberCard({ c, s });
        setCard(r?.data || r || {});
        setState('ready');
      } catch { setState('error'); }
    })();
  }, [c, s]);

  if (state === 'loading') {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center" style={{ background: '#FAF5E8' }}>
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: '#D9BD83' }} />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center p-4" style={{ background: '#FAF5E8' }}>
        <div className="max-w-sm w-full bg-white rounded-3xl shadow-xl p-8 text-center border" style={{ borderColor: '#D9BD83' }}>
          <h1 className="text-xl font-black mb-2" style={{ color: ACCENT }}>הקישור לא תקין</h1>
          <p className="text-sm text-gray-600">
            ייתכן שהוא נחתך בהעתקה. אפשר לבקש קישור חדש מהצוות.
          </p>
        </div>
      </div>
    );
  }

  const benefits = card?.benefits || [];
  const coins = card?.coins || 0;

  return (
    <div dir="rtl" className="min-h-screen p-4 md:p-8" style={{ background: '#FAF5E8' }}>
      <div className="max-w-md mx-auto">

        <div className="bg-white rounded-3xl shadow-xl border overflow-hidden" style={{ borderColor: '#D9BD83' }}>
          <div className="p-6 text-center" style={{ background: ACCENT }}>
            <p className="text-xs tracking-widest text-white/70 mb-1">מועדון הלקוחות</p>
            <h1 className="text-2xl font-black text-white">{brand}</h1>
            <p className="text-white/90 mt-2">{card?.name}</p>
            {card?.tier && (
              <span className="inline-block mt-2 text-xs font-bold px-3 py-1 rounded-full bg-white/20 text-white">
                {card.tier}
              </span>
            )}
          </div>

          <div className="p-6">
            {benefits.length > 0 ? (
              <>
                <p className="text-xs font-bold mb-3 flex items-center gap-1.5" style={{ color: ACCENT }}>
                  <Gift className="w-4 h-4" /> ההטבות שמחכות לך
                </p>
                <div className="space-y-3">
                  {benefits.map((b) => (
                    <div key={b.id} className="rounded-2xl p-4 border-2 border-dashed"
                      style={{ borderColor: '#D9BD83', background: '#FFFBF2' }}>
                      <p className="text-gray-800 font-semibold leading-snug">{b.description}</p>
                      {/* The QR encodes a link to the redemption screen rather
                          than the bare code, so staff can use the phone's own
                          camera — no scanner library, no in-app camera
                          permission, and it works on every device in the room.
                          The code stays printed underneath for when a camera
                          will not cooperate. */}
                      <div className="flex items-center gap-4 mt-3">
                        <div className="bg-white p-2 rounded-lg border shrink-0" style={{ borderColor: '#E8DCC0' }}>
                          <QRCodeSVG
                            value={`${window.location.origin}/ClubRedeem?code=${encodeURIComponent(b.code || '')}`}
                            size={92}
                            level="M"
                          />
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">הציגו למלצר</p>
                          <p className="text-2xl font-black tracking-[0.15em]" style={{ color: ACCENT }}>
                            {b.code}
                          </p>
                        </div>
                      </div>
                      {b.expiry_date && (
                        <p className="text-[11px] text-gray-400 mt-2">בתוקף עד {b.expiry_date.split('-').reverse().join('/')}</p>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <Gift className="w-8 h-8 mx-auto mb-2" style={{ color: '#D9BD83' }} />
                <p className="text-sm text-gray-600">
                  אין כרגע הטבה פתוחה. בכל ביקור צוברים, ובימי הולדת יש הפתעות.
                </p>
              </div>
            )}

            {/* Coins sit below the benefits and only when there are any. A club
                that opens on "0 מטבעות" has told the member they have nothing. */}
            {coins > 0 && (
              <div className="mt-5 pt-5 border-t flex items-center justify-between">
                <span className="text-sm text-gray-600 flex items-center gap-1.5">
                  <Coins className="w-4 h-4" style={{ color: '#D9BD83' }} /> המטבעות שלך
                </span>
                <span className="text-left">
                  <span className="text-2xl font-black" style={{ color: ACCENT }}>{coins}</span>
                  <span className="block text-[11px] text-gray-400">
                    שווים ₪{coins * (card?.coin_value_ils || 4)} בהטבות
                  </span>
                </span>
              </div>
            )}

            {/* The tournament is the reason to open this page when there is no
                benefit waiting. Points cost the restaurant nothing, so playing
                is unlimited — the prize is what is bounded, not the play. */}
            {card?.tournament && (
              <div className="mt-5 pt-5 border-t">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5">
                    <Trophy className="w-4 h-4" style={{ color: '#D9BD83' }} /> טורניר המועדון
                  </span>
                  {card.tournament.rank ? (
                    <span className="text-sm font-black" style={{ color: ACCENT }}>
                      מקום {card.tournament.rank}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">עוד לא שיחקת</span>
                  )}
                </div>
                {card.tournament.points > 0 && (
                  <p className="text-xs text-gray-500 mb-1">
                    {card.tournament.points} נקודות · {card.tournament.games} משחקים
                  </p>
                )}
                <p className="text-xs text-gray-500 mb-3">הפרס למובילים: {card.tournament.prize}</p>
                {card.tournament.multiplier > 1 && (
                  <p className="text-xs font-bold mb-3 rounded-lg px-3 py-2"
                    style={{ background: '#FFFBF2', color: ACCENT }}>
                    🔥 משחק במסעדה שווה פי {card.tournament.multiplier} נקודות — ומזכה גם במטבעות
                  </p>
                )}
                <a href={`/QueueGame?c=${encodeURIComponent(c)}&s=${encodeURIComponent(s)}&name=${encodeURIComponent(card.first_name || '')}`}
                  className="block w-full text-center rounded-xl py-3 font-bold text-white"
                  style={{ background: ACCENT }}>
                  {card.tournament.points > 0 ? 'לשחק עוד' : 'לשחק ולצבור נקודות'}
                </a>
                <a href={`/ClubLeaderboard?c=${encodeURIComponent(c)}&s=${encodeURIComponent(s)}`}
                  className="block text-center text-xs mt-2 underline" style={{ color: ACCENT }}>
                  לטבלת המובילים
                </a>
              </div>
            )}

            {card?.visits > 0 && (
              <p className="text-xs text-gray-400 text-center mt-4">
                {card.visits === 1 ? 'ביקור אחד עד היום' : `${card.visits} ביקורים עד היום`}
              </p>
            )}
          </div>
        </div>

        {card?.history?.length > 0 && (
          <div className="mt-4 bg-white/60 rounded-2xl p-4 border" style={{ borderColor: '#E8DCC0' }}>
            <p className="text-xs font-bold text-gray-500 mb-2">הטבות שכבר מימשת</p>
            {card.history.map((h, i) => (
              <p key={i} className="text-xs text-gray-500 py-0.5">
                {h.description}
                {h.redeemed_at && ` · ${new Date(h.redeemed_at).toLocaleDateString('he-IL')}`}
              </p>
            ))}
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-5">
          שמרו את הקישור הזה — זה כרטיס החבר שלכם.
        </p>
      </div>
    </div>
  );
}
