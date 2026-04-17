import React, { useState } from 'react';

const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6],
];

function calcWinner(squares) {
  for (const [a,b,c] of WIN_LINES) {
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c])
      return { winner: squares[a], line: [a,b,c] };
  }
  return null;
}

export default function TicTacToe({ playerName, onBack }) {
  const [squares, setSquares] = useState(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true);

  const result = calcWinner(squares);
  const isFull = squares.every(Boolean);
  const status = result
    ? `🎉 ${result.winner === 'X' ? playerName || 'שחקן' : 'המחשב'} ניצח!`
    : isFull ? '🤝 תיקו!'
    : xIsNext ? `תורך, ${playerName || 'שחקן'}! (X)` : '🤔 המחשב חושב...';

  const cpuMove = (board) => {
    // try to win
    for (const [a,b,c] of WIN_LINES) {
      if (board[a] === 'O' && board[b] === 'O' && !board[c]) return c;
      if (board[a] === 'O' && board[c] === 'O' && !board[b]) return b;
      if (board[b] === 'O' && board[c] === 'O' && !board[a]) return a;
    }
    // block player
    for (const [a,b,c] of WIN_LINES) {
      if (board[a] === 'X' && board[b] === 'X' && !board[c]) return c;
      if (board[a] === 'X' && board[c] === 'X' && !board[b]) return b;
      if (board[b] === 'X' && board[c] === 'X' && !board[a]) return a;
    }
    // center
    if (!board[4]) return 4;
    // random corner
    const corners = [0,2,6,8].filter(i => !board[i]);
    if (corners.length) return corners[Math.floor(Math.random() * corners.length)];
    // any
    const empty = board.map((v,i) => v ? null : i).filter(v => v !== null);
    return empty[Math.floor(Math.random() * empty.length)];
  };

  const handleClick = (i) => {
    if (squares[i] || result || !xIsNext) return;
    const next = [...squares];
    next[i] = 'X';
    setSquares(next);
    setXIsNext(false);

    // CPU plays after short delay
    const res = calcWinner(next);
    if (!res && next.some(v => !v)) {
      setTimeout(() => {
        const cpuIdx = cpuMove(next);
        if (cpuIdx !== undefined && cpuIdx !== null) {
          const after = [...next];
          after[cpuIdx] = 'O';
          setSquares(after);
          setXIsNext(true);
        }
      }, 400);
    }
  };

  const reset = () => { setSquares(Array(9).fill(null)); setXIsNext(true); };

  const SYMBOLS = { X: { text: '✕', cls: 'text-blue-600' }, O: { text: '○', cls: 'text-red-500' } };

  return (
    <div className="flex flex-col items-center" dir="rtl">
      <p className="text-white font-bold text-center mb-4 text-lg">{status}</p>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {squares.map((sq, i) => {
          const winning = result?.line?.includes(i);
          return (
            <button
              key={i}
              onClick={() => handleClick(i)}
              className={`w-20 h-20 rounded-2xl text-4xl font-black flex items-center justify-center transition-all active:scale-90 ${
                winning ? 'bg-yellow-300' : sq ? 'bg-white/20' : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {sq && <span className={SYMBOLS[sq].cls}>{SYMBOLS[sq].text}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button onClick={reset} className="px-5 py-2.5 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-2xl text-sm transition-all">
          🔄 משחק חדש
        </button>
        <button onClick={onBack} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl text-sm transition-all">
          🔙 חזור
        </button>
      </div>
    </div>
  );
}