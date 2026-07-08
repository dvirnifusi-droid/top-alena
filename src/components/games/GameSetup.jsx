import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Plus } from 'lucide-react';
import { useTenantBranding } from '@/hooks/useTenantBranding';

const CATEGORIES = {
  friends: { label: '👯 ארוחת חברים', vibe: '😂 מצחיק • מביך • טיפשי', color: 'from-pink-500 to-rose-500' },
  date: { label: '💕 דייט רומנטי', vibe: '🌹 רומנטי • קרוב • מתוק', color: 'from-red-500 to-pink-500' },
  family: { label: '👨‍👩‍👧‍👦 ארוחה משפחתית', vibe: '🏡 נוסטלגיה • חום • ממלא פה', color: 'from-amber-500 to-yellow-500' },
  bday: { label: '🎉 חגיגת יום הולדת', vibe: '🎊 חגיגה • כיף • שמחה', color: 'from-purple-500 to-pink-500' },
  girls: { label: '💃 ערב בנות', vibe: '✨ חברויות • דקויות • סוד\n⚠️ גיל 24+', color: 'from-violet-500 to-purple-500' },
  business: { label: '💼 פגישת עסקים', vibe: '🤝 מקצועי • חזק • בררני', color: 'from-blue-500 to-indigo-500' },
};

const GAME_TYPES = [
  { id: 'wheel', label: '🎡 גלגל המזל - מי משלם?', description: 'מסובבים את הגלגל - מי שיוצא משלם!' },
  { id: 'questions', label: '❓ מי עונה?', description: '10 שאלות עם שמות רנדומליים' },
];

export default function GameSetup({ onStart }) {
  const brandName = useTenantBranding()?.name || 'המסעדה';
  const [step, setStep] = useState(1); // 1: שמות, 2: קטגוריה, 3: משחק
  const [players, setPlayers] = useState(['']);
  const [selectedCategory, setSelectedCategory] = useState('friends');
  const [selectedGame, setSelectedGame] = useState('wheel');

  const addPlayer = () => {
    setPlayers([...players, '']);
  };

  const removePlayer = (index) => {
    setPlayers(players.filter((_, i) => i !== index));
  };

  const updatePlayer = (index, name) => {
    const updated = [...players];
    updated[index] = name;
    setPlayers(updated);
  };

  const validPlayers = players.filter(p => p.trim());
  const canProceed = validPlayers.length > 0;

  if (step === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-start pt-8 pb-8 px-4" dir="rtl">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🍽️</div>
          <h2 className="text-3xl font-black text-white mb-2">{brandName}</h2>
          <p className="text-purple-300 text-sm">🎮 מי איתנו?</p>
        </div>

        <div className="w-full max-w-sm space-y-3 mb-6">
          {players.map((player, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                placeholder={`אדם ${i + 1}`}
                value={player}
                onChange={(e) => updatePlayer(i, e.target.value)}
                className="flex-1 border-2 border-white/30 rounded-2xl px-4 py-3 focus:outline-none focus:border-white/60 text-center font-bold bg-white/10 text-white placeholder-white/50"
              />
              {players.length > 1 && (
                <button
                  onClick={() => removePlayer(i)}
                  className="w-10 h-10 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 flex items-center justify-center transition-all flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <Button
          onClick={addPlayer}
          variant="outline"
          className="w-full max-w-sm border-2 border-dashed border-cyan-400 text-cyan-300 hover:bg-cyan-500/10 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 mb-4"
        >
          <Plus className="w-5 h-5" />
          הוסף עוד אדם
        </Button>

        <Button
          onClick={() => setStep(2)}
          disabled={!canProceed}
          className="w-full max-w-sm bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 disabled:opacity-50 text-white font-black py-4 rounded-2xl"
        >
          👉 המשך
        </Button>

        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-4 text-sm text-cyan-300 text-center mt-6 w-full max-w-sm">
          ✨ {validPlayers.length} {validPlayers.length === 1 ? 'אדם' : 'אנשים'} בשולחן
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-start pt-8 pb-8 px-4" dir="rtl">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white mb-1">🎭 מה הסיבה למסיבה?</h2>
          <p className="text-purple-300 text-sm">בחר את ה-vibe של הערב</p>
        </div>

        <div className="w-full max-w-sm space-y-3 mb-6">
           {Object.entries(CATEGORIES).map(([key, value]) => (
             <button
               key={key}
               onClick={() => setSelectedCategory(key)}
               className={`w-full p-4 rounded-2xl border-3 transition-all text-center font-black transform hover:scale-105 active:scale-95 ${
                 selectedCategory === key
                   ? `bg-gradient-to-br ${value.color} text-white border-white shadow-2xl`
                   : 'bg-white/10 border-white/20 text-white hover:bg-white/20 shadow-lg'
               }`}
             >
               <div className="text-4xl mb-2">{value.label.split(' ')[0]}</div>
               <div className="text-base font-bold">{value.label.split(' ').slice(1).join(' ')}</div>
               <div className={`text-xs mt-2 ${selectedCategory === key ? 'text-white/90' : 'text-white/60'}`}>{value.vibe}</div>
             </button>
            ))}
         </div>

        <div className="flex gap-3 w-full max-w-sm">
          <Button
            onClick={() => setStep(1)}
            variant="outline"
            className="flex-1 border-2 border-white/30 text-white hover:bg-white/10 font-bold py-3 rounded-2xl"
          >
            ← חזור
          </Button>
          <Button
            onClick={() => setStep(3)}
            className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white font-black py-3 rounded-2xl"
          >
            המשך 👉
          </Button>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-start pt-8 pb-8 px-4" dir="rtl">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-black text-white mb-1">🎪 בחר משחק</h2>
          <p className="text-purple-300 text-sm">מה אתם רוצים לשחק?</p>
        </div>

        <div className="w-full max-w-sm space-y-3 mb-6">
          {GAME_TYPES.map((game) => (
            <button
              key={game.id}
              onClick={() => setSelectedGame(game.id)}
              className={`w-full p-4 rounded-2xl border-2 transition-all text-center font-black ${
                selectedGame === game.id
                  ? 'border-white bg-white/10 text-white shadow-2xl'
                  : 'border-white/20 text-white/70 hover:border-white/40 hover:bg-white/5'
              }`}
            >
              <div className="text-lg mb-1">{game.label}</div>
              <div className="text-xs opacity-80">{game.description}</div>
            </button>
          ))}
        </div>

        <div className="flex gap-3 w-full max-w-sm">
          <Button
            onClick={() => setStep(2)}
            variant="outline"
            className="flex-1 border-2 border-white/30 text-white hover:bg-white/10 font-bold py-3 rounded-2xl"
          >
            ← חזור
          </Button>
          <Button
            onClick={() => onStart({
              players: validPlayers,
              category: selectedCategory,
              gameType: selectedGame,
            })}
            className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white font-black py-3 rounded-2xl shadow-lg"
          >
            🎮 התחל משחק!
          </Button>
        </div>
      </div>
    );
  }
}