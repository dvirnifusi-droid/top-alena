import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function getLootSettings() {
  try {
    const saved = localStorage.getItem('lootbox_settings');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { realRewardChance: 15, coinPrizes: '10,25,50,100,200' };
}

function pickCoinPrize(coinPrizesStr) {
  const prizes = (coinPrizesStr || '10,25,50,100,200')
    .split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
  if (prizes.length === 0) return 10;
  return prizes[Math.floor(Math.random() * prizes.length)];
}

// יצירת צלילים עם Web Audio API
function playSound(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    if (type === 'shake') {
      // ניעור — קישקוש כמו קופסה עם אוכל בפנים
      const times = [0, 80, 160, 240, 320, 400, 480];
      times.forEach(delay => {
        setTimeout(() => {
          const buf = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.4)) * 0.5;
          }
          const src = ctx.createBufferSource();
          const filter = ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 1200 + Math.random() * 800;
          filter.Q.value = 2;
          src.buffer = buf;
          src.connect(filter);
          filter.connect(ctx.destination);
          src.start();
        }, delay);
      });

    } else if (type === 'open') {
      // פתיחה — "פופ" עולה
      [0, 80, 160].forEach((delay, i) => {
        setTimeout(() => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(400 + i * 200, ctx.currentTime);
          o.frequency.exponentialRampToValueAtTime(800 + i * 300, ctx.currentTime + 0.15);
          g.gain.setValueAtTime(0.4, ctx.currentTime);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
          o.connect(g); g.connect(ctx.destination);
          o.start(); o.stop(ctx.currentTime + 0.2);
        }, delay);
      });

    } else if (type === 'reveal') {
      // שלב 1: מחיאות כפיים מואצות — חפלה ערבית 🎉
      const claps = [0, 120, 230, 330, 420, 500, 570, 630, 680, 720, 760, 800];
      claps.forEach(delay => {
        setTimeout(() => {
          const buf = ctx.createBuffer(2, ctx.sampleRate * 0.15, ctx.sampleRate);
          for (let ch = 0; ch < 2; ch++) {
            const data = buf.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
              const env = Math.exp(-i / (data.length * 0.2));
              data[i] = (Math.random() * 2 - 1) * env * (0.7 + Math.random() * 0.3);
            }
          }
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 1000;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = 2500;
          bp.Q.value = 1.5;
          const g = ctx.createGain();
          g.gain.value = 1.0;
          src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(ctx.destination);
          src.start();
        }, delay);
      });

      // שלב 2: ריר "וואו" — סוויפ עולה
      setTimeout(() => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(200, ctx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.5);
        g.gain.setValueAtTime(0.0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 1200;
        o.connect(lp); lp.connect(g); g.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.5);
      }, 900);

      // שלב 3: פנפרה חגיגית מלאה
      const fanfare = [
        { freq: 523, t: 0, dur: 0.15 },
        { freq: 659, t: 0.14, dur: 0.15 },
        { freq: 784, t: 0.28, dur: 0.15 },
        { freq: 1047, t: 0.42, dur: 0.35 },
        { freq: 1047, t: 0.42, dur: 0.35, type: 'square', gain: 0.12 },
        { freq: 784, t: 0.58, dur: 0.15 },
        { freq: 1047, t: 0.72, dur: 0.5 },
      ];
      setTimeout(() => {
        fanfare.forEach(({ freq, t, dur, type = 'triangle', gain = 0.28 }) => {
          setTimeout(() => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = type;
            o.frequency.value = freq;
            g.gain.setValueAtTime(gain, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
            o.connect(g); g.connect(ctx.destination);
            o.start(); o.stop(ctx.currentTime + dur);
          }, t * 1000);
        });
      }, 1050);

      // שלב 4: עוד גל כפיים בסוף — קהל מריע
      const finalClaps = [1950, 2060, 2160, 2250, 2330, 2400, 2460, 2510];
      finalClaps.forEach(delay => {
        setTimeout(() => {
          const buf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.18)) * 0.6;
          }
          const src = ctx.createBufferSource();
          const hp = ctx.createBiquadFilter();
          hp.type = 'highpass'; hp.frequency.value = 900;
          const g = ctx.createGain(); g.gain.value = 0.8;
          src.buffer = buf;
          src.connect(hp); hp.connect(g); g.connect(ctx.destination);
          src.start();
        }, delay);
      });
    }
  } catch (e) {}
}

export default function LootBox({ employeeId, employeeName, onDone }) {
  const [phase, setPhase] = useState('closed');
  const [prize, setPrize] = useState(null);
  const [rewards, setRewards] = useState([]);

  useEffect(() => {
    base44.entities.Reward.filter({ is_active: true }).then(setRewards);
  }, []);

  const openBox = async () => {
    playSound('shake');
    setPhase('shaking');
    setTimeout(() => {
      playSound('open');
      setPhase('opening');
    }, 1000);
    setTimeout(async () => {
      const settings = getLootSettings();
      const realRewardChance = Math.random() * 100;
      let result;

      if (realRewardChance < settings.realRewardChance && rewards.length > 0) {
        const lootPool = rewards.filter(r => r.in_lootbox);
        if (lootPool.length === 0) {
          // אין פרסים בקופסה — תן מטבעות
          const coins = pickCoinPrize(settings.coinPrizes);
          result = { type: 'coins', coins };
          await base44.entities.CoinTransaction.create({
            employee_id: employeeId, employee_name: employeeName,
            amount: coins, reason: `🎲 הפתעה עלינא - יציאה ממשמרת`,
            type: 'earned', trigger: 'manager_bonus', status: 'approved'
          });
          playSound('reveal'); setPrize(result); setPhase('reveal'); return;
        }
        const picked = lootPool[Math.floor(Math.random() * lootPool.length)];
        result = { type: 'reward', reward: picked };
        await base44.entities.CoinTransaction.create({
          employee_id: employeeId,
          employee_name: employeeName,
          amount: 0,
          reason: `🎁 זכייה בהפתעה עלינא: ${picked.emoji} ${picked.title}`,
          type: 'redeemed',
          trigger: 'redemption',
          status: 'pending_approval',
          redemption_reward: picked.id || picked.title,
          manager_notes: 'זכייה אוטומטית מהפתעה עלינא - יציאה ממשמרת'
        });
      } else {
        const coins = pickCoinPrize(settings.coinPrizes);
        result = { type: 'coins', coins };
        await base44.entities.CoinTransaction.create({
          employee_id: employeeId,
          employee_name: employeeName,
          amount: coins,
          reason: `🎲 הפתעה עלינא - יציאה ממשמרת`,
          type: 'earned',
          trigger: 'manager_bonus',
          status: 'approved'
        });
      }

      playSound('reveal');
      setPrize(result);
      setPhase('reveal');
    }, 2200);
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        dir="rtl"
        className="max-w-lg w-full text-center overflow-hidden p-0"
        onPointerDownOutside={e => e.preventDefault()}
        style={{ borderRadius: '1.5rem' }}
      >
        <style>{`
          @keyframes shake { 0%,100%{transform:rotate(-10deg) scale(1.05)} 50%{transform:rotate(10deg) scale(1.1)} }
          @keyframes bigBounce { 0%,100%{transform:translateY(0) scale(1)} 40%{transform:translateY(-18px) scale(1.08)} 70%{transform:translateY(-8px) scale(1.04)} }
          @keyframes pop { 0%{transform:scale(0.8)} 60%{transform:scale(1.35)} 100%{transform:scale(1.15)} }
          @keyframes revealPop { 0%{transform:scale(0) rotate(-10deg);opacity:0} 70%{transform:scale(1.15) rotate(3deg);opacity:1} 100%{transform:scale(1) rotate(0deg);opacity:1} }
          @keyframes starFloat { 0%,100%{opacity:0.6;transform:translateY(0)} 50%{opacity:1;transform:translateY(-10px)} }
          .star1{animation:starFloat 1.8s ease-in-out infinite}
          .star2{animation:starFloat 2.1s ease-in-out 0.4s infinite}
          .star3{animation:starFloat 1.6s ease-in-out 0.8s infinite}
        `}</style>

        {/* Phase: closed */}
        {phase === 'closed' && (
          <div className="py-10 px-8 space-y-6 bg-gradient-to-br from-purple-600 via-pink-500 to-yellow-400 relative overflow-hidden">
            <div className="absolute top-4 right-6 text-2xl star1">✨</div>
            <div className="absolute top-8 left-8 text-xl star2">🌟</div>
            <div className="absolute bottom-16 right-10 text-lg star3">⭐</div>
            <div className="text-9xl" style={{ animation: 'bigBounce 1.4s ease-in-out infinite', display:'inline-block' }}>🎁</div>
            <div>
              <h2 className="text-3xl font-black text-white drop-shadow-lg">הפתעה עלינא!</h2>
              <p className="text-white/80 text-base mt-1">סיימת משמרת מלאה — מגיע לך פרס! 🎉</p>
            </div>
            <Button
              onClick={openBox}
              className="w-full bg-white hover:bg-yellow-50 text-purple-700 font-black text-xl py-7 rounded-2xl shadow-2xl border-0"
            >
              🎲 פתח את ההפתעה!
            </Button>
          </div>
        )}

        {/* Phase: shaking */}
        {phase === 'shaking' && (
          <div className="py-16 px-8 bg-gradient-to-br from-purple-600 via-pink-500 to-yellow-400">
            <div className="text-9xl" style={{ animation: 'shake 0.25s infinite', display:'inline-block' }}>🎁</div>
            <p className="text-white font-black text-xl mt-6">מערבב...</p>
          </div>
        )}

        {/* Phase: opening */}
        {phase === 'opening' && (
          <div className="py-16 px-8 bg-gradient-to-br from-purple-600 via-pink-500 to-yellow-400">
            <div className="text-9xl" style={{ animation: 'pop 0.6s ease-out forwards', display:'inline-block' }}>📦</div>
            <p className="text-yellow-200 font-black text-2xl mt-6">פותח! 🔓</p>
          </div>
        )}

        {/* Phase: reveal */}
        {phase === 'reveal' && prize && (
          <div className="py-10 px-8 space-y-5 bg-gradient-to-br from-yellow-50 to-orange-50">
            <div className="text-8xl" style={{ animation: 'revealPop 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards', display:'inline-block' }}>
              {prize.type === 'coins' ? '🪙' : prize.reward?.emoji || '🎁'}
            </div>
            <div className="bg-white border-2 border-yellow-300 rounded-3xl p-6 shadow-xl">
              {prize.type === 'coins' ? (
                <>
                  <p className="text-7xl font-black text-yellow-500">+{prize.coins}</p>
                  <p className="text-2xl font-black text-gray-700 mt-1">מטבעות! 🎉</p>
                  <p className="text-sm text-gray-400 mt-2">נוספו לחשבונך אוטומטית</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-black text-orange-600">{prize.reward?.emoji} {prize.reward?.title}</p>
                  <p className="text-base text-gray-600 mt-2">{prize.reward?.description}</p>
                  <div className="mt-3 bg-blue-50 rounded-xl p-3 text-sm text-blue-600 font-medium">
                    ⏳ הבקשה נשלחה למנהל לאישור
                  </div>
                </>
              )}
            </div>
            <Button
              onClick={() => { setPhase('done'); onDone && onDone(prize); }}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-black text-lg py-5 rounded-2xl shadow-lg"
            >
              🙌 תודה! סיום
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}