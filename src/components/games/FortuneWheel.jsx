import React, { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function FortuneWheel({ players, onResult }) {
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);

  const handleSpin = () => {
    if (spinning || players.length === 0) return;
    
    setSpinning(true);
    setWinner(null);

    // סימולציה של סיבוב - 3 שניות
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * players.length);
      const selectedPlayer = players[randomIndex];
      setWinner(selectedPlayer);
      setSpinning(false);
      onResult(selectedPlayer);
    }, 3000);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      {/* גלגל מזל */}
      <div className="relative w-64 h-64 rounded-full border-8 border-white flex items-center justify-center bg-white shadow-2xl overflow-hidden" style={{ boxShadow: '0 0 30px rgba(139, 92, 246, 0.4)' }}>
        {/* רקע גלגל */}
        <div 
          className={`absolute inset-0 transition-transform duration-3000 ease-out ${spinning ? 'rotate-[720deg]' : ''}`}
          style={{
            background: `conic-gradient(
              #FF6B6B 0deg,
              #FF8C42 45deg,
              #FFD93D 90deg,
              #6BCB77 135deg,
              #4D96FF 180deg,
              #9D84B7 225deg,
              #FF77A8 270deg,
              #FF6B6B 360deg
            )`,
          }}
        >
          {/* חלוקות לשמות */}
          {players.map((player, i) => {
            const angle = (i * 360) / players.length;
            return (
              <div
                key={i}
                className="absolute w-full h-full flex items-center justify-center font-bold text-white text-sm"
                style={{
                  transform: `rotate(${angle}deg) translateY(-80px)`,
                }}
              >
                <span style={{ transform: `rotate(${-angle}deg)` }}>
                  {player.substring(0, 10)}
                </span>
              </div>
            );
          })}
        </div>

        {/* חץ למעלה */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-5 border-r-5 border-t-8 border-l-transparent border-r-transparent border-t-red-500 z-10 drop-shadow-lg" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />

        {/* טקסט במרכז */}
        <div className="relative z-10 text-center">
          {winner ? (
            <div className="text-2xl font-black text-gray-800">
              {winner}
            </div>
          ) : (
            <div className="text-gray-500 font-bold">סובב!</div>
          )}
        </div>
      </div>

      {/* כפתור סיבוב */}
      <Button
        onClick={handleSpin}
        disabled={spinning || players.length === 0}
        className="bg-gradient-to-r from-primary to-accent hover:shadow-lg text-white font-black py-6 px-8 text-lg rounded-2xl transition-all active:scale-95"
      >
        {spinning ? '🎡 מסתובב...' : '🎪 סובב את הגלגל!'}
      </Button>

      {/* תוצאה */}
      {winner && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-orange-300 rounded-2xl p-6 text-center w-full">
          <p className="text-3xl font-black text-orange-700 mb-2">
            🎉 {winner}!
          </p>
          <p className="text-sm text-orange-600 font-bold">
            אתה מי שהיה צריך לתשלם! 💸
          </p>
        </div>
      )}
    </div>
  );
}