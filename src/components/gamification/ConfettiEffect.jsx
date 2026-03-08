import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

export default function ConfettiEffect({ trigger, message, emoji = '🎉', onDone }) {
  const timerRef = useRef(null);

  useEffect(() => {
    if (!trigger) return;

    // פיצוץ קונפטי גדול
    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff']
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff']
      });

      if (Date.now() < end) requestAnimationFrame(frame);
    };

    frame();

    // פיצוץ מרכזי
    confetti({
      particleCount: 120,
      spread: 90,
      origin: { y: 0.6 },
      colors: ['#FFD700', '#FF6B35', '#00C49F', '#9B59B6']
    });

    timerRef.current = setTimeout(() => {
      onDone?.();
    }, 3500);

    return () => clearTimeout(timerRef.current);
  }, [trigger]);

  if (!trigger) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
      <div className="bg-white rounded-3xl shadow-2xl p-8 text-center animate-bounce max-w-sm mx-4 pointer-events-auto border-4 border-yellow-400">
        <div className="text-7xl mb-4 animate-spin" style={{ animationDuration: '0.5s', animationIterationCount: 3 }}>
          {emoji}
        </div>
        <h2 className="text-2xl font-black text-gray-800 mb-2">{message}</h2>
        <p className="text-yellow-600 font-bold text-lg">🪙 מטבעות נוספו לחשבונך!</p>
      </div>
    </div>
  );
}