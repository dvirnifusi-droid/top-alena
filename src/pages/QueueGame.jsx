import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import TicTacToe from '@/components/games/TicTacToe';

const FALLBACK_QUESTIONS = [
  { question: 'מה שם המסעדה?', options: ['עלינא', 'נועה', 'אליס', 'בלינה'], answer: 0 },
  { question: 'מה הסלוגן של עלינא?', options: ['אוכל של אמא', 'כי מגיע לך', 'טעים תמיד', 'הכי טוב בעיר'], answer: 1 },
  { question: 'כמה שנים פועלת המסעדה?', options: ['2', '5', '10', '15'], answer: 2 },
  { question: 'מה המנה הפופולרית ביותר?', options: ['שניצל', 'סטייק', 'פסטה', 'סביח'], answer: 1 },
  { question: 'באיזה עיר נמצאת המסעדה?', options: ['תל אביב', 'ירושלים', 'חיפה', 'רמת גן'], answer: 0 },
  { question: 'כמה מקומות ישיבה יש במסעדה?', options: ['50', '80', '120', '200'], answer: 2 },
];

const TOTAL_Q = 6;
const TIME_PER_Q = 12;

// ===== TRIVIA GAME =====
function TriviaGame({ playerName, entryId, allQuestions }) {
  const [phase, setPhase] = useState('playing');
  const [questions] = useState(() => {
    const pool = allQuestions.length >= TOTAL_Q ? allQuestions : FALLBACK_QUESTIONS;
    return [...pool].sort(() => Math.random() - 0.5).slice(0, TOTAL_Q);
  });
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
  const [leaderboard, setLeaderboard] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const timerRef = useRef(null);

  const fetchLeaderboard = async () => {
    const sessions = await base44.entities.QueueGameSession.filter({ finished: true });
    setLeaderboard(sessions.sort((a, b) => b.score - a.score).slice(0, 10));
  };

  useEffect(() => {
    base44.entities.QueueGameSession.create({
      player_name: playerName,
      queue_entry_id: entryId,
      score: 0,
      answers: [],
      finished: false,
    }).then(s => setSessionId(s.id));
    fetchLeaderboard();
    const iv = setInterval(fetchLeaderboard, 8000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    setTimeLeft(TIME_PER_Q);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timerRef.current); handleAnswer(null); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [qIndex, phase]);

  const handleAnswer = async (optionIdx) => {
    clearInterval(timerRef.current);
    if (selected !== null) return;
    const q = questions[qIndex];
    const correct = optionIdx === q.answer;
    const timeBonus = correct ? Math.round((timeLeft / TIME_PER_Q) * 50) : 0;
    const points = correct ? 100 + timeBonus : 0;
    setSelected(optionIdx);
    const newScore = score + points;
    const newAnswers = [...answers, { q: qIndex, correct, ms: timeLeft }];
    setScore(newScore);
    setAnswers(newAnswers);
    await new Promise(r => setTimeout(r, 900));
    if (qIndex + 1 >= TOTAL_Q) {
      if (sessionId) await base44.entities.QueueGameSession.update(sessionId, { score: newScore, answers: newAnswers, finished: true });
      setPhase('done');
    } else {
      setSelected(null);
      setQIndex(qIndex + 1);
    }
  };

  const shareUrl = `${window.location.origin}/QueueGame?entry=${entryId}&name=${encodeURIComponent(playerName)}`;
  const getRankEmoji = (i) => ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;

  if (phase === 'done') {
    const correct = answers.filter(a => a.correct).length;
    return (
      <div className="flex flex-col items-center w-full max-w-sm mx-auto pt-6" dir="rtl">
        <div className="bg-white rounded-3xl shadow-2xl p-6 w-full text-center mb-5">
          <div className="text-5xl mb-3">{correct >= 5 ? '🏆' : correct >= 3 ? '🎉' : '💪'}</div>
          <p className="font-black text-2xl text-gray-800">{playerName}</p>
          <p className="text-gray-500 text-sm mb-4">{correct}/{TOTAL_Q} נכונות</p>
          <div className="bg-purple-50 rounded-2xl p-4 mb-4">
            <p className="text-4xl font-black text-purple-700">{score}</p>
            <p className="text-purple-500 text-sm">נקודות</p>
          </div>
          <button
            onClick={() => navigator.share ? navigator.share({ title: `${score} נקודות בטריוויה של עלינא!`, url: shareUrl }) : (navigator.clipboard.writeText(shareUrl), alert('הועתק!'))}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-2xl text-sm mb-2 transition-all"
          >📤 שתף את הניקוד</button>
          <button onClick={() => window.history.back()} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-2xl text-sm transition-all">🔙 חזור לתור</button>
        </div>
        <div className="bg-white/10 backdrop-blur rounded-3xl p-4 w-full">
          <p className="text-white font-black text-center mb-3">🏅 לוח מובילים</p>
          {leaderboard.length === 0 ? <p className="text-white/50 text-center text-sm">אין עדיין שחקנים...</p> : (
            <div className="space-y-2">
              {leaderboard.map((s, i) => (
                <div key={s.id} className={`flex items-center justify-between px-4 py-2.5 rounded-2xl ${s.player_name === playerName ? 'bg-purple-400/40 border border-purple-300' : 'bg-white/10'}`}>
                  <span className="text-white font-bold text-sm">{getRankEmoji(i)} {s.player_name}</span>
                  <span className="text-yellow-300 font-black">{s.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // playing
  const q = questions[qIndex];
  const timerPct = (timeLeft / TIME_PER_Q) * 100;
  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto" dir="rtl">
      <div className="w-full mb-4">
        <div className="flex justify-between text-white text-sm mb-2">
          <span>שאלה {qIndex + 1}/{TOTAL_Q}</span>
          <span>⭐ {score}</span>
        </div>
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-purple-400 rounded-full transition-all" style={{ width: `${(qIndex / TOTAL_Q) * 100}%` }} />
        </div>
      </div>
      <div className="w-full mb-3">
        <div className="h-2 bg-white/20 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 4 ? 'bg-red-400' : 'bg-green-400'}`} style={{ width: `${timerPct}%` }} />
        </div>
        <p className={`text-center text-sm mt-1 font-bold ${timeLeft <= 4 ? 'text-red-300' : 'text-white/70'}`}>{timeLeft}s</p>
      </div>
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-full">
        <p className="font-black text-xl text-gray-800 mb-6 text-center leading-relaxed">{q.question}</p>
        <div className="space-y-3">
          {q.options.map((opt, i) => {
            let style = 'bg-gray-50 border-2 border-gray-200 text-gray-700';
            if (selected !== null) {
              if (i === q.answer) style = 'bg-green-100 border-2 border-green-500 text-green-800';
              else if (i === selected) style = 'bg-red-100 border-2 border-red-400 text-red-700';
              else style = 'bg-gray-50 border-2 border-gray-200 text-gray-400';
            }
            return (
              <button key={i} onClick={() => handleAnswer(i)} disabled={selected !== null}
                className={`w-full px-4 py-3.5 rounded-2xl font-bold text-right transition-all active:scale-95 ${style}`}>
                <span className="text-xs opacity-60 ml-2">{['א','ב','ג','ד'][i]}.</span>{opt}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== MAIN LOBBY =====
export default function QueueGame() {
  const urlParams = new URLSearchParams(window.location.search);
  const entryId = urlParams.get('entry') || '';
  const playerName = urlParams.get('name') || 'אורח';

  const [game, setGame] = useState(null); // null=lobby | 'trivia' | 'tictactoe'
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    base44.entities.TriviaQuestion.filter({ is_active: true }).then(qs => setQuestions(qs));
  }, []);

  const shareUrl = `${window.location.origin}/QueueGame?entry=${entryId}&name=${encodeURIComponent(playerName)}`;

  const GAMES = [
    { id: 'trivia', emoji: '🧠', title: 'טריוויה', desc: 'שאלות על המסעדה — תתחרו בניקוד!', color: 'from-purple-600 to-indigo-600' },
    { id: 'tictactoe', emoji: '✕○', title: 'איקס עיגול', desc: 'שחק נגד המחשב', color: 'from-emerald-500 to-teal-600' },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-8 p-5" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)' }} dir="rtl">

      {!game ? (
        <>
          <div className="text-center mb-8">
            <div className="text-6xl mb-3 animate-bounce">🎮</div>
            <h1 className="text-3xl font-black text-white">משחקי ממתינים</h1>
            <p className="text-purple-300 mt-1">שלום, {playerName}! בחר משחק 👇</p>
          </div>

          <div className="w-full max-w-sm space-y-4 mb-6">
            {GAMES.map(g => (
              <button key={g.id} onClick={() => setGame(g.id)}
                className={`w-full bg-gradient-to-l ${g.color} text-white rounded-3xl p-5 text-right shadow-xl active:scale-95 transition-all`}>
                <div className="flex items-center gap-4">
                  <span className="text-4xl">{g.emoji}</span>
                  <div>
                    <p className="font-black text-xl">{g.title}</p>
                    <p className="text-white/80 text-sm">{g.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => navigator.share ? navigator.share({ title: 'שחק איתי בתור!', url: shareUrl }) : (navigator.clipboard.writeText(shareUrl), alert('הועתק!'))}
            className="w-full max-w-sm bg-white/10 hover:bg-white/20 text-white font-bold py-3 rounded-2xl text-sm transition-all mb-3"
          >
            📤 שלח לחבר שיצטרף
          </button>
          <button onClick={() => window.history.back()} className="text-white/50 text-sm hover:text-white/80 transition-colors">
            🔙 חזור לתור
          </button>
        </>
      ) : game === 'trivia' ? (
        <TriviaGame playerName={playerName} entryId={entryId} allQuestions={questions} />
      ) : (
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-black text-white">✕○ איקס עיגול</h2>
            <p className="text-purple-300 text-sm">אתה X, המחשב O</p>
          </div>
          <TicTacToe playerName={playerName} onBack={() => setGame(null)} />
        </div>
      )}
    </div>
  );
}