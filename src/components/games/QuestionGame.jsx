import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';

export default function QuestionGame({ players, category, questions }) {
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [answered, setAnswered] = useState([]);
  const [gameOver, setGameOver] = useState(false);

  const activeQuestions = questions.filter(q => q.is_active && q.category === category);

  const getNextQuestion = () => {
    if (answered.length >= Math.min(10, activeQuestions.length)) {
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
    return (
      <div className="flex flex-col items-center gap-4 p-6 text-center">
        <div className="text-6xl">🎉</div>
        <h2 className="text-3xl font-black text-gray-800">משחק הסתיים!</h2>
        <p className="text-lg text-gray-600">ענית על {answered.length} שאלות</p>
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
        שאלה {answered.length + 1} מתוך 10
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
      </div>

      {/* פרוגרס */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-gradient-to-r from-primary to-accent h-2 rounded-full transition-all"
          style={{ width: `${((answered.length + 1) / 10) * 100}%` }}
        />
      </div>
    </div>
  );
}