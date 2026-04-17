import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Plus } from 'lucide-react';

const CATEGORIES = {
  friends: { label: '👯 ארוחת חברים', vibe: '😂 מצחיק • מביך • טיפשי', color: 'from-pink-500 to-rose-500' },
  date: { label: '💕 דייט רומנטי', vibe: '🌹 רומנטי • קרוב • מתוק', color: 'from-red-500 to-pink-500' },
  family: { label: '👨‍👩‍👧‍👦 ארוחה משפחתית', vibe: '🏡 נוסטלגיה • חום • ממלא פה', color: 'from-amber-500 to-yellow-500' },
  bday: { label: '🎉 חגיגת יום הולדת', vibe: '🎊 חגיגה • כיף • שמחה', color: 'from-purple-500 to-pink-500' },
  girls: { label: '💃 ערב בנות', vibe: '✨ חברויות • דקויות • סוד', color: 'from-violet-500 to-purple-500' },
  business: { label: '💼 פגישת עסקים', vibe: '🤝 מקצועי • חזק • בררני', color: 'from-blue-500 to-indigo-500' },
};

const GAME_TYPES = [
  { id: 'wheel', label: '🎡 גלגל המזל - מי משלם?', description: 'מסובבים את הגלגל - מי שיוצא משלם!' },
  { id: 'questions', label: '❓ מי עונה?', description: '10 שאלות עם שמות רנדומליים' },
];

export default function GameSetup({ onStart }) {
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
      <div className="flex flex-col gap-6 p-6">
        <div className="text-center">
          <h2 className="text-3xl font-black text-gray-800 mb-2">🎮 מי איתנו?</h2>
          <p className="text-gray-600 text-sm">הזן את שמות החברים בשולחן</p>
        </div>

        <div className="space-y-3">
          {players.map((player, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                placeholder={`אדם ${i + 1}`}
                value={player}
                onChange={(e) => updatePlayer(i, e.target.value)}
                className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:border-primary text-center font-bold"
              />
              {players.length > 1 && (
                <button
                  onClick={() => removePlayer(i)}
                  className="w-10 h-10 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-all flex-shrink-0"
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
          className="border-2 border-dashed border-primary text-primary hover:bg-primary/5 font-bold py-3 rounded-xl flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          הוסף עוד אדם
        </Button>

        <Button
          onClick={() => setStep(2)}
          disabled={!canProceed}
          className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-black py-4 rounded-xl"
        >
          👉 המשך
        </Button>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 text-center">
          ✨ {validPlayers.length} {validPlayers.length === 1 ? 'אדם' : 'אנשים'} בשולחן
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="text-center">
          <h2 className="text-3xl font-black text-gray-800 mb-2">🎭 מה הסיבה למסיבה?</h2>
          <p className="text-gray-600 text-sm">בחר את ה-vibe של הערב</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-1">
           {Object.entries(CATEGORIES).map(([key, value]) => (
             <button
               key={key}
               onClick={() => setSelectedCategory(key)}
               className={`p-4 rounded-2xl border-3 transition-all text-center font-black transform hover:scale-105 active:scale-95 ${
                 selectedCategory === key
                   ? `bg-gradient-to-br ${value.color} text-white border-white shadow-2xl scale-105`
                   : 'bg-white border-gray-200 text-gray-800 hover:border-gray-400 shadow-lg'
               }`}
             >
               <div className="text-3xl mb-2">{value.label.split(' ')[0]}</div>
               <div className="text-sm font-bold">{value.label.split(' ').slice(1).join(' ')}</div>
               <div className={`text-xs mt-2 ${selectedCategory === key ? 'text-white/90' : 'text-gray-600'}`}>{value.vibe}</div>
             </button>
           ))}
         </div>

        <div className="flex gap-3">
          <Button
            onClick={() => setStep(1)}
            variant="outline"
            className="flex-1 border-2 font-bold py-3 rounded-xl"
          >
            ← חזור
          </Button>
          <Button
            onClick={() => setStep(3)}
            className="flex-1 bg-primary hover:bg-primary/90 text-white font-black py-3 rounded-xl"
          >
            המשך 👉
          </Button>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="text-center">
          <h2 className="text-3xl font-black text-gray-800 mb-2">🎪 בחר משחק</h2>
          <p className="text-gray-600 text-sm">מה אתם רוצים לשחק?</p>
        </div>

        <div className="space-y-3">
          {GAME_TYPES.map((game) => (
            <button
              key={game.id}
              onClick={() => setSelectedGame(game.id)}
              className={`w-full p-4 rounded-xl border-2 transition-all text-left font-bold ${
                selectedGame === game.id
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-gray-200 text-gray-700 hover:border-gray-400'
              }`}
            >
              <div className="text-lg">{game.label}</div>
              <div className="text-xs text-gray-500 mt-1">{game.description}</div>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={() => setStep(2)}
            variant="outline"
            className="flex-1 border-2 font-bold py-3 rounded-xl"
          >
            ← חזור
          </Button>
          <Button
            onClick={() => onStart({
              players: validPlayers,
              category: selectedCategory,
              gameType: selectedGame,
            })}
            className="flex-1 bg-gradient-to-r from-primary to-accent hover:shadow-lg text-white font-black py-3 rounded-xl"
          >
            🎮 התחל משחק!
          </Button>
        </div>
      </div>
    );
  }
}