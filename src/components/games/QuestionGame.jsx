import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Share2, Download } from 'lucide-react';
import html2canvas from 'html2canvas';

export default function QuestionGame({ players, category, questions }) {
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [answered, setAnswered] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState(null);
  const [showWinnerPicker, setShowWinnerPicker] = useState(false);
  const storyRef = useRef(null);
  const [generatingStory, setGeneratingStory] = useState(false);

  const activeQuestions = questions.filter(q => q.is_active && q.category === category);

  const getNextQuestion = () => {
    if (activeQuestions.length === 0) {
      setGameOver(true);
      return;
    }

    const randomQuestion = activeQuestions[Math.floor(Math.random() * activeQuestions.length)];
    const randomPlayer = players[Math.floor(Math.random() * players.length)];
    
    const formattedQuestion = randomQuestion.question.replace('[שם]', randomPlayer);
    
    setCurrentQuestion({ ...randomQuestion, text: formattedQuestion });
    setCurrentPlayer(randomPlayer);
  };

  useEffect(() => {
    if (activeQuestions.length > 0) {
      getNextQuestion();
    }
  }, []);

  const handleNext = () => {
    if (currentQuestion) {
      setAnswered([...answered, currentQuestion]);
      getNextQuestion();
    }
  };

  const handleShareStory = async () => {
    if (!currentQuestion || !storyRef.current) return;
    
    setGeneratingStory(true);
    try {
      const canvas = await html2canvas(storyRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      
      canvas.toBlob((blob) => {
        if (navigator.share && navigator.canShare({ files: [new File([blob], 'story.png', { type: 'image/png' })] })) {
          navigator.share({
            files: [new File([blob], 'story.png', { type: 'image/png' })],
            title: 'עלינא - משחק השאלות',
          });
        } else {
          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'alina-story.png';
          a.click();
          URL.revokeObjectURL(url);
        }
      });
    } catch (e) {
      console.error('Error generating story:', e);
      alert('❌ שגיאה בייצור התמונה');
    } finally {
      setGeneratingStory(false);
    }
  };

  const handleShare = () => {
    if (!currentQuestion) return;
    
    const text = `🎮 עלינא - משחק השאלות!\n\n${currentQuestion.text}\n\nתשובה: ___________\n\n#עלינא #משחקים #התור`;
    
    if (navigator.share) {
      navigator.share({ title: 'עלינא - משחק השאלות', text });
    } else {
      navigator.clipboard.writeText(text);
      alert('✅ הטקסט הועתק!');
    }
  };

  if (gameOver) {
    const winner = selectedWinner || players[Math.floor(Math.random() * players.length)];
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-center p-4">
        <div className="text-7xl mb-4 animate-bounce">🎉</div>
        <h2 className="text-4xl font-black text-white mb-2 text-center">משחק הסתיים!</h2>
        <p className="text-lg text-purple-300 mb-8">ענית על {answered.length} שאלות 🔥</p>
        <div className="bg-gradient-to-r from-yellow-300 to-orange-300 rounded-3xl p-6 w-full max-w-sm mb-6 shadow-2xl border-2 border-yellow-400">
          <p className="text-xs text-center text-orange-700 font-bold mb-2">🏆 המנצח הוא:</p>
          <p className="text-4xl font-black text-center text-orange-900 break-words">
            {winner}
          </p>
          <p className="text-xs text-center text-orange-700 mt-3">✨ מי שתפתור את המטלה הבאה!</p>
        </div>
        <Button
          onClick={() => {
            setAnswered([]);
            setGameOver(false);
            getNextQuestion();
          }}
          className="bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 active:scale-95 text-white font-black py-3.5 px-8 rounded-2xl w-full max-w-sm shadow-lg"
        >
          🔄 שחק שוב
        </Button>
      </div>
    );
  }

  if (!currentQuestion || !currentPlayer) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="animate-spin text-2xl">⏳</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col items-center justify-start pt-6 pb-8 px-4" dir="rtl">
      {/* Hidden story generator */}
      <div
        ref={storyRef}
        className="fixed -left-96 top-0 w-80 h-screen bg-gradient-to-br from-purple-600 to-pink-600 flex flex-col items-center justify-between p-8 text-center pointer-events-none"
        style={{ visibility: 'hidden' }}
      >
        <div>
          <div className="text-6xl mb-4">🎮</div>
          <p className="text-4xl font-black text-white mb-8">עלינא</p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center">
          <p className="text-white text-2xl font-black leading-relaxed break-words max-w-xs mb-8">
            {currentQuestion?.text}
          </p>
          <p className="text-3xl font-black text-yellow-300 mb-4">{currentPlayer}</p>
        </div>
        <div className="text-white text-sm font-bold">
          🎮 משחק השאלות של עלינא
          <p className="text-xs mt-2 opacity-80">#עלינא #משחקים</p>
        </div>
      </div>

      {/* לוגו */}
      <div className="text-center mb-8">
        <div className="text-5xl mb-2">🍽️</div>
        <h1 className="text-2xl font-black text-white">עלינא</h1>
        <p className="text-purple-300 text-xs mt-1">משחק השאלות</p>
      </div>

      {/* מעמד השאלה */}
      <div className="text-center text-sm text-purple-300 mb-4 flex items-center justify-center gap-2">
        <span>🔥 שאלה {answered.length + 1}</span>
        {answered.length > 0 && <span className="text-orange-400">· {answered.length} ענו</span>}
      </div>

      {/* השאלה */}
      <div className="bg-white/95 backdrop-blur rounded-3xl p-6 w-full max-w-sm mb-5 shadow-2xl border-2 border-white/20">
        <p className="text-lg sm:text-xl font-black text-center text-purple-900 leading-relaxed">
          {currentQuestion.text}
        </p>
      </div>

      {/* שם הנבחר */}
      <div className="bg-gradient-to-r from-yellow-300 to-orange-300 rounded-3xl p-5 w-full max-w-sm mb-6 shadow-xl border-2 border-yellow-400">
        <p className="text-xs text-center text-orange-700 font-bold mb-2">✨ חייב לענות:</p>
        <p className="text-3xl sm:text-4xl font-black text-center text-orange-900 break-words">
          {currentPlayer}
        </p>
      </div>

      {/* כפתורים */}
      <div className="w-full max-w-sm space-y-3 mb-4">
        <div className="flex gap-2">
          <Button
            onClick={handleShareStory}
            disabled={generatingStory}
            className="flex-1 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 active:scale-95 disabled:opacity-50 text-white font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg"
          >
            {generatingStory ? (
              <div className="animate-spin">⏳</div>
            ) : (
              <>
                <span>📸</span>
                <span className="hidden sm:inline">סטורי</span>
              </>
            )}
          </Button>
          <Button
            onClick={handleShare}
            variant="outline"
            className="flex-1 border-2 border-sky-300 text-sky-300 hover:bg-sky-500/10 active:scale-95 font-black py-3.5 rounded-2xl text-sm shadow-lg"
          >
            💬
            <span className="hidden sm:inline ml-1">שתף</span>
          </Button>
          <Button
            onClick={handleNext}
            className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 active:scale-95 text-white font-black py-3.5 rounded-2xl text-sm shadow-lg"
          >
            ➡️
            <span className="hidden sm:inline ml-1">הבאה</span>
          </Button>
        </div>

        <Button
          onClick={() => setShowWinnerPicker(true)}
          variant="outline"
          className="w-full border-2 border-red-400 text-red-300 hover:bg-red-500/10 active:scale-95 font-black py-3.5 rounded-2xl text-sm shadow-lg"
        >
          🛑 סיים משחק
        </Button>
      </div>

      {/* סטטוס */}
      <p className="text-purple-300 text-xs text-center">🎮 המשחק לא מסתיים - שחקו כמה שאתם רוצים!</p>

      {/* חזור לתור */}
      <button
        onClick={() => window.history.back()}
        className="text-purple-300 hover:text-white text-sm transition-colors mt-4"
      >
        ← חזור לתור
      </button>

      {/* מודאל בחירת מנצח */}
      {showWinnerPicker && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4" dir="rtl">
          <div className="bg-white/95 backdrop-blur rounded-3xl w-full max-w-sm p-6 shadow-2xl mb-4 max-h-96 overflow-y-auto border-2 border-white/20">
            <h3 className="text-xl font-black text-gray-800 mb-4 text-center">🏆 בחר מנצח</h3>
            <div className="space-y-2 mb-4">
              {players.map(player => (
                <button
                  key={player}
                  onClick={() => {
                    setSelectedWinner(player);
                    setShowWinnerPicker(false);
                    setGameOver(true);
                  }}
                  className="w-full text-right px-4 py-3.5 rounded-2xl border-2 border-primary bg-gradient-to-r from-primary/10 to-accent/10 hover:from-primary/20 hover:to-accent/20 text-gray-800 font-black transition-all active:scale-95"
                >
                  {player}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowWinnerPicker(false)}
              className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
            >
              ← ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}