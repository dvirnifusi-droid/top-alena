import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';

export default function QuestionGame({ players, category, questions }) {
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [answered, setAnswered] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState(null);
  const [showWinnerPicker, setShowWinnerPicker] = useState(false);

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

  const handleShare = () => {
    if (!currentQuestion) return;
    
    const text = `🎮 עלינא - משחק השאלות!\n\n${currentQuestion.text}\n\nתשובה: ___________\n\n#עלינא #משחקים #התור`;
    
    if (navigator.share) {
      navigator.share({ title: 'עלינא - משחק השאלות', text });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(text);
      alert('✅ הטקסט הועתק! אתה יכול להשתיל אותו בסטורי');
    }
  };

  if (gameOver) {
    const winner = selectedWinner || players[Math.floor(Math.random() * players.length)];
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="text-6xl animate-bounce">🎉</div>
        <h2 className="text-3xl font-black text-gray-800">משחק הסתיים!</h2>
        <p className="text-lg text-gray-600">ענית על {answered.length} שאלות</p>
        <div className="bg-gradient-to-r from-yellow-100 to-orange-100 border-2 border-orange-400 rounded-2xl p-6 w-full mt-4">
          <p className="text-sm text-orange-600 font-bold mb-2">המנצח הוא:</p>
          <p className="text-4xl font-black text-orange-700">🏆 {winner}</p>
          <p className="text-xs text-orange-500 mt-2">מי שתפתור את המטלה הבאה!</p>
        </div>
        <Button
          onClick={() => {
            setAnswered([]);
            setGameOver(false);
            getNextQuestion();
          }}
          className="bg-primary hover:bg-primary/90 text-white font-black py-3 px-6 rounded-xl mt-4"
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
    <div className="flex flex-col gap-6 p-6">
      {/* מעמד השאלה */}
      <div className="text-center text-sm text-gray-500">
        שאלה {answered.length + 1} 🔥 {answered.length > 0 && `(${answered.length} כבר ענו)`}
      </div>

      {/* השאלה */}
      <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-purple-300 rounded-2xl p-6 text-center">
        <p className="text-2xl font-black text-purple-800 leading-relaxed">
          {currentQuestion.text}
        </p>
      </div>

      {/* שם הנבחר */}
      <div className="bg-gradient-to-r from-yellow-100 to-orange-100 border-2 border-orange-400 rounded-2xl p-4 text-center">
        <p className="text-sm text-orange-600 font-bold mb-1">מישהו חייב לענות:</p>
        <p className="text-3xl font-black text-orange-700">
          {currentPlayer}
        </p>
      </div>

      {/* כפתורים */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <Button
          onClick={handleShare}
          variant="outline"
          className="flex-1 border-2 border-blue-400 text-blue-600 hover:bg-blue-50 font-black py-3 rounded-xl flex items-center justify-center gap-2"
        >
          <Share2 className="w-4 h-4" />
          שתף 📸
        </Button>
        <Button
          onClick={handleNext}
          className="flex-1 bg-gradient-to-r from-primary to-accent hover:shadow-lg text-white font-black py-3 rounded-xl"
        >
          👉 השאלה הבאה
        </Button>
        <Button
          onClick={() => setShowWinnerPicker(true)}
          variant="outline"
          className="flex-1 border-2 border-red-300 text-red-600 hover:bg-red-50 font-black py-3 rounded-xl"
        >
          🛑 סיים משחק
        </Button>
      </div>

      {/* פרוגרס - אין סוף */}
      <div className="text-center text-xs text-gray-400">
        🎮 המשחק לא מסתיים - שחקו כמה שאתם רוצים!
      </div>

      {/* מודאל בחירת מנצח */}
      {showWinnerPicker && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 p-4" dir="rtl">
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 shadow-2xl mb-4 max-h-96 overflow-y-auto">
            <h3 className="text-lg font-black text-gray-800 mb-4 text-center">בחר מנצח 🏆</h3>
            <div className="space-y-2 mb-4">
              {players.map(player => (
                <button
                  key={player}
                  onClick={() => {
                    setSelectedWinner(player);
                    setShowWinnerPicker(false);
                    setGameOver(true);
                  }}
                  className="w-full text-right px-4 py-4 rounded-2xl border-2 border-primary bg-primary/10 hover:bg-primary/20 text-gray-800 font-bold transition-all"
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