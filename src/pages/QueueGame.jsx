import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';

const QUESTIONS = [
  { q: 'מה שם המסעדה?', options: ['עלינא', 'נועה', 'אליס', 'בלינה'], answer: 0 },
  { q: 'מה הסלוגן של עלינא?', options: ['אוכל של אמא', 'כי מגיע לך', 'טעים תמיד', 'הכי טוב בעיר'], answer: 1 },
  { q: 'כמה שנים פועלת המסעדה?', options: ['2', '5', '10', '15'], answer: 2 },
  { q: 'מה המנה הפופולרית ביותר?', options: ['שניצל', 'סטייק', 'פסטה', 'סביח'], answer: 1 },
  { q: 'באיזה עיר נמצאת המסעדה?', options: ['תל אביב', 'ירושלים', 'חיפה', 'רמת גן'], answer: 0 },
  { q: 'כמה מקומות ישיבה יש במסעדה?', options: ['50', '80', '120', '200'], answer: 2 },
  { q: 'מי הקים את עלינא?', options: ['משפחת כהן', 'משפחת לוי', 'משפחת ישראלי', 'משפחת אברהם'], answer: 2 },
  { q: 'מה שעות הפתיחה בשישי?', options: ['08:00-15:00', '09:00-17:00', '10:00-16:00', '11:00-18:00'], answer: 0 },
];

const TOTAL_Q = 6;
const TIME_PER_Q = 12; // שניות

export default function QueueGame() {
  const urlParams = new URLSearchParams(window.location.search);
  const entryId = urlParams.get('entry') || '';
  const playerName = urlParams.get('name') || 'אורח';

  const [phase, setPhase] = useState('intro'); // intro | playing | done
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_Q);
  const [leaderboard, setLeaderboard] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const timerRef = useRef(null);

  // shuffle + pick TOTAL_Q questions
  const [questions] = useState(() => {
    const shuffled = [...QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, TOTAL_Q);
  });

  // fetch leaderboard
  const fetchLeaderboard = async () => {
    const sessions = await base44.entities.QueueGameSession.filter({ finished: true });
    const sorted = sessions
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    setLeaderboard(sorted);
  };

  useEffect(() => {
    if (phase === 'done') fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 8000);
    return () => clearInterval(interval);
  }, [phase]);

  // timer per question
  useEffect(() => {
    if (phase !== 'playing') return;
    setTimeLeft(TIME_PER_Q);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleAnswer(null); // timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [qIndex, phase]);

  const startGame = async () => {
    const session = await base44.entities.QueueGameSession.create({
      player_name: playerName,
      queue_entry_id: entryId,
      score: 0,
      answers: [],
      finished: false,
    });
    setSessionId(session.id);
    setPhase('playing');
  };

  const handleAnswer = async (optionIdx) => {
    clearInterval(timerRef.current);
    if (selected !== null) return; // already answered

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
      // done
      if (sessionId) {
        await base44.entities.QueueGameSession.update(sessionId, {
          score: newScore,
          answers: newAnswers,
          finished: true,
        });
      }
      setPhase('done');
    } else {
      setSelected(null);
      setQIndex(qIndex + 1);
    }
  };

  const shareUrl = `${window.location.origin}/QueueGame?entry=${entryId}&name=${encodeURIComponent(playerName)}`;

  const getRankEmoji = (i) => ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;

  // ========== INTRO ==========
  if (phase === 'intro') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)' }} dir="rtl">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3 animate-bounce">🎮</div>
          <h1 className="text-3xl font-black text-white">משחק ממתינים</h1>
          <p className="text-purple-300 mt-2">טריוויה על מסעדת עלינא</p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm text-center">
          <p className="font-black text-xl text-gray-800 mb-2">שלום, {playerName}! 👋</p>
          <p className="text-gray-500 text-sm mb-6">ענה על {TOTAL_Q} שאלות וצבור כמה שיותר נקודות.<br/>ככל שתענה מהר יותר — תקבל יותר בונוס!</p>

          <div className="flex items-center justify-around bg-purple-50 rounded-2xl p-4 mb-6">
            <div className="text-center">
              <p className="text-2xl font-black text-purple-700">{TOTAL_Q}</p>
              <p className="text-xs text-purple-500">שאלות</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-purple-700">{TIME_PER_Q}s</p>
              <p className="text-xs text-purple-500">לשאלה</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-purple-700">150</p>
              <p className="text-xs text-purple-500">מקס' לשאלה</p>
            </div>
          </div>

          <button
            onClick={startGame}
            className="w-full bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-black py-4 rounded-2xl text-lg transition-all shadow-lg"
          >
            🚀 התחל משחק
          </button>

          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: 'שחק איתי בתור!', url: shareUrl });
              } else {
                navigator.clipboard.writeText(shareUrl);
                alert('הקישור הועתק!');
              }
            }}
            className="w-full mt-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-2xl text-sm transition-all"
          >
            📤 שלח לחבר שיצטרף
          </button>
        </div>
      </div>
    );
  }

  // ========== PLAYING ==========
  if (phase === 'playing') {
    const q = questions[qIndex];
    const progress = ((qIndex) / TOTAL_Q) * 100;
    const timerPct = (timeLeft / TIME_PER_Q) * 100;

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)' }} dir="rtl">
        {/* Header */}
        <div className="w-full max-w-sm mb-4">
          <div className="flex justify-between text-white text-sm mb-2">
            <span>שאלה {qIndex + 1}/{TOTAL_Q}</span>
            <span>⭐ {score}</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-purple-400 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Timer */}
        <div className="w-full max-w-sm mb-3">
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${timeLeft <= 4 ? 'bg-red-400' : 'bg-green-400'}`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
          <p className={`text-center text-sm mt-1 font-bold ${timeLeft <= 4 ? 'text-red-300' : 'text-white/70'}`}>{timeLeft}s</p>
        </div>

        {/* Question */}
        <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm">
          <p className="font-black text-xl text-gray-800 mb-6 text-center leading-relaxed">{q.q}</p>

          <div className="space-y-3">
            {q.options.map((opt, i) => {
              let style = 'bg-gray-50 border-2 border-gray-200 text-gray-700';
              if (selected !== null) {
                if (i === q.answer) style = 'bg-green-100 border-2 border-green-500 text-green-800';
                else if (i === selected && selected !== q.answer) style = 'bg-red-100 border-2 border-red-400 text-red-700';
                else style = 'bg-gray-50 border-2 border-gray-200 text-gray-400';
              }

              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  disabled={selected !== null}
                  className={`w-full px-4 py-3.5 rounded-2xl font-bold text-right transition-all active:scale-95 ${style}`}
                >
                  <span className="text-xs opacity-60 ml-2">{['א', 'ב', 'ג', 'ד'][i]}.</span>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ========== DONE ==========
  const correctCount = answers.filter(a => a.correct).length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-8 p-5" style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4c1d95 100%)' }} dir="rtl">
      {/* Result card */}
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm text-center mb-5">
        <div className="text-5xl mb-3">{correctCount >= 5 ? '🏆' : correctCount >= 3 ? '🎉' : '💪'}</div>
        <p className="font-black text-2xl text-gray-800">{playerName}</p>
        <p className="text-gray-500 text-sm mb-4">{correctCount}/{TOTAL_Q} תשובות נכונות</p>

        <div className="bg-purple-50 rounded-2xl p-4 mb-4">
          <p className="text-4xl font-black text-purple-700">{score}</p>
          <p className="text-purple-500 text-sm">נקודות</p>
        </div>

        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: `השגתי ${score} נקודות בטריוויה של עלינא!`, url: shareUrl });
            } else {
              navigator.clipboard.writeText(`השגתי ${score} נקודות בטריוויה של עלינא! שחק גם אתה: ${shareUrl}`);
              alert('הועתק!');
            }
          }}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-2xl text-sm mb-2 transition-all"
        >
          📤 שתף את הניקוד שלך
        </button>
        <button
          onClick={() => window.history.back()}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold py-3 rounded-2xl text-sm transition-all"
        >
          🔙 חזור לתור
        </button>
      </div>

      {/* Leaderboard */}
      <div className="bg-white/10 backdrop-blur rounded-3xl p-4 w-full max-w-sm">
        <p className="text-white font-black text-center mb-3">🏅 לוח מובילים — ממתינים היום</p>
        {leaderboard.length === 0 ? (
          <p className="text-white/50 text-center text-sm">אין עדיין שחקנים...</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((s, i) => (
              <div key={s.id} className={`flex items-center justify-between px-4 py-2.5 rounded-2xl ${s.player_name === playerName ? 'bg-purple-400/40 border border-purple-300' : 'bg-white/10'}`}>
                <span className="text-white font-bold text-sm flex items-center gap-2">
                  <span>{getRankEmoji(i)}</span>
                  {s.player_name}
                </span>
                <span className="text-yellow-300 font-black">{s.score}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}