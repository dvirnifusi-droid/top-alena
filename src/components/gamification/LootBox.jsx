import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// פרסים ממטבעות: רנדומלי בין min ל-max
const COIN_PRIZES = [
  { weight: 50, coins: 10 },
  { weight: 30, coins: 25 },
  { weight: 15, coins: 50 },
  { weight: 4,  coins: 100 },
  { weight: 1,  coins: 200 },
];

function pickCoinPrize() {
  const total = COIN_PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of COIN_PRIZES) {
    r -= p.weight;
    if (r <= 0) return p.coins;
  }
  return 10;
}

export default function LootBox({ employeeId, employeeName, onDone }) {
  const [phase, setPhase] = useState('closed'); // closed → shaking → opening → reveal → done
  const [prize, setPrize] = useState(null); // { type: 'coins'|'reward', coins?, reward? }
  const [rewards, setRewards] = useState([]);

  useEffect(() => {
    base44.entities.Reward.filter({ is_active: true }).then(setRewards);
  }, []);

  const openBox = async () => {
    setPhase('shaking');
    setTimeout(() => setPhase('opening'), 1000);
    setTimeout(async () => {
      // 15% סיכוי לפרס אמיתי, 85% מטבעות
      const realRewardChance = Math.random();
      let result;

      if (realRewardChance < 0.15 && rewards.length > 0) {
        // פרס אמיתי - בחר רנדומלי מהפרסים הזולים (עד 1000 מטבעות)
        const cheapRewards = rewards.filter(r => r.cost <= 1000);
        const pool = cheapRewards.length > 0 ? cheapRewards : rewards;
        const picked = pool[Math.floor(Math.random() * pool.length)];
        result = { type: 'reward', reward: picked };

        // יצור טרנזקציה לפדיון ממתין לאישור מנהל
        await base44.entities.CoinTransaction.create({
          employee_id: employeeId,
          employee_name: employeeName,
          amount: 0,
          reason: `🎁 זכייה בקופסת הפתעה: ${picked.emoji} ${picked.title}`,
          type: 'redeemed',
          trigger: 'redemption',
          status: 'pending_approval',
          redemption_reward: picked.id || picked.title,
          manager_notes: 'זכייה אוטומטית מקופסת הפתעה - יציאה ממשמרת'
        });
      } else {
        // מטבעות
        const coins = pickCoinPrize();
        result = { type: 'coins', coins };

        await base44.entities.CoinTransaction.create({
          employee_id: employeeId,
          employee_name: employeeName,
          amount: coins,
          reason: `🎲 קופסת הפתעה - יציאה ממשמרת`,
          type: 'earned',
          trigger: 'manager_bonus',
          status: 'approved'
        });
      }

      setPrize(result);
      setPhase('reveal');
    }, 2200);
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent dir="rtl" className="max-w-sm text-center overflow-hidden" onPointerDownOutside={e => e.preventDefault()}>

        {/* Phase: closed */}
        {phase === 'closed' && (
          <div className="py-6 space-y-4">
            <div className="text-6xl animate-bounce">🎁</div>
            <h2 className="text-2xl font-black text-gray-800">קופסת הפתעה!</h2>
            <p className="text-gray-500 text-sm">סיימת משמרת — מגיע לך פרס!</p>
            <Button
              onClick={openBox}
              className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-black text-lg py-6 rounded-2xl shadow-lg"
            >
              🎲 פתח את הקופסה!
            </Button>
          </div>
        )}

        {/* Phase: shaking */}
        {phase === 'shaking' && (
          <div className="py-10">
            <div className="text-7xl" style={{ animation: 'shake 0.3s infinite' }}>🎁</div>
            <p className="text-gray-500 mt-4 font-medium">מערבב...</p>
            <style>{`@keyframes shake { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }`}</style>
          </div>
        )}

        {/* Phase: opening */}
        {phase === 'opening' && (
          <div className="py-10">
            <div className="text-7xl" style={{ animation: 'pop 0.5s ease-out forwards' }}>📦</div>
            <p className="text-yellow-600 mt-4 font-bold text-lg">פותח...</p>
            <style>{`@keyframes pop { 0%{transform:scale(1)} 50%{transform:scale(1.4)} 100%{transform:scale(1.1)} }`}</style>
          </div>
        )}

        {/* Phase: reveal */}
        {phase === 'reveal' && prize && (
          <div className="py-6 space-y-4">
            <div className="text-6xl animate-bounce">
              {prize.type === 'coins' ? '🪙' : prize.reward?.emoji || '🎁'}
            </div>
            <div className="bg-gradient-to-br from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-2xl p-5">
              {prize.type === 'coins' ? (
                <>
                  <p className="text-5xl font-black text-yellow-600">+{prize.coins}</p>
                  <p className="text-lg font-bold text-gray-700 mt-1">מטבעות! 🎉</p>
                  <p className="text-xs text-gray-500 mt-2">נוספו לחשבונך אוטומטית</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black text-orange-600">{prize.reward?.emoji} {prize.reward?.title}</p>
                  <p className="text-sm text-gray-600 mt-1">{prize.reward?.description}</p>
                  <p className="text-xs text-blue-500 mt-3 bg-blue-50 rounded-lg p-2">⏳ הבקשה נשלחה למנהל לאישור</p>
                </>
              )}
            </div>
            <Button
              onClick={() => { setPhase('done'); onDone && onDone(prize); }}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl"
            >
              🙌 תודה! סיום
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}