import React from 'react';

// תגי הישג — מחושבים מהנתונים
export const BADGES = [
  {
    id: 'first_coin',
    title: 'הטבעה הראשונה',
    emoji: '🪙',
    description: 'הרווחת את המטבע הראשון שלך',
    check: ({ balance, transactions }) => balance > 0,
    color: 'bg-yellow-100 border-yellow-400 text-yellow-800',
  },
  {
    id: 'hundred_coins',
    title: 'מאה פנים',
    emoji: '💯',
    description: 'צברת 100 מטבעות',
    check: ({ balance }) => balance >= 100,
    color: 'bg-amber-100 border-amber-400 text-amber-800',
  },
  {
    id: 'streak_3',
    title: 'רצף אלוף',
    emoji: '🔥',
    description: '3 משמרות ברצף עם מטבעות',
    check: ({ transactions }) => {
      const earned = transactions.filter(t => t.type === 'earned' && t.trigger === 'shift_completed');
      return earned.length >= 3;
    },
    color: 'bg-orange-100 border-orange-400 text-orange-800',
  },
  {
    id: 'challenge_done',
    title: 'מקבל אתגרים',
    emoji: '🎯',
    description: 'השלמת אתגר יומי',
    check: ({ transactions }) => transactions.some(t => t.trigger === 'daily_challenge'),
    color: 'bg-blue-100 border-blue-400 text-blue-800',
  },
  {
    id: 'training_hero',
    title: 'גיבור ההכשרות',
    emoji: '🎓',
    description: 'השלמת הכשרה',
    check: ({ transactions }) => transactions.some(t => t.trigger === 'training_done'),
    color: 'bg-purple-100 border-purple-400 text-purple-800',
  },
  {
    id: 'five_hundred',
    title: 'חצי אלף',
    emoji: '🥈',
    description: 'צברת 500 מטבעות',
    check: ({ balance }) => balance >= 500,
    color: 'bg-gray-100 border-gray-400 text-gray-700',
  },
  {
    id: 'redeemed',
    title: 'פורה פרסים',
    emoji: '🎁',
    description: 'פדית פרס לראשונה',
    check: ({ transactions }) => transactions.some(t => t.type === 'redeemed'),
    color: 'bg-pink-100 border-pink-400 text-pink-800',
  },
  {
    id: 'checklist_master',
    title: 'מאסטר צ\'קליסטים',
    emoji: '✅',
    description: 'השלמת צ\'קליסט',
    check: ({ transactions }) => transactions.some(t => t.trigger === 'checklist_done'),
    color: 'bg-green-100 border-green-400 text-green-800',
  },
  {
    id: 'ninja',
    title: 'Ninja Waiter',
    emoji: '🥷',
    description: 'הגעת לדרגת Ninja Waiter',
    check: ({ balance }) => balance >= 5000,
    color: 'bg-indigo-100 border-indigo-400 text-indigo-800',
  },
  {
    id: 'champion',
    title: 'אלוף המסעדה',
    emoji: '👑',
    description: 'הגעת לדרגה הגבוהה ביותר',
    check: ({ balance }) => balance >= 10000,
    color: 'bg-yellow-100 border-yellow-500 text-yellow-900',
  },
];

export function computeBadges({ balance, transactions }) {
  return BADGES.map(b => ({
    ...b,
    earned: b.check({ balance, transactions }),
  }));
}

export default function BadgesDisplay({ balance, transactions }) {
  const badges = computeBadges({ balance, transactions });
  const earned = badges.filter(b => b.earned);
  const locked = badges.filter(b => !b.earned);

  return (
    <div className="space-y-4">
      {earned.length > 0 && (
        <div>
          <p className="text-sm font-bold text-gray-600 mb-2">✅ תגים שהשגת ({earned.length})</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {earned.map(b => (
              <div key={b.id} className={`border-2 rounded-2xl p-3 text-center ${b.color} shadow-sm`}>
                <div className="text-3xl mb-1">{b.emoji}</div>
                <p className="font-bold text-xs leading-tight">{b.title}</p>
                <p className="text-xs opacity-70 mt-0.5 leading-tight hidden sm:block">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <p className="text-sm font-bold text-gray-400 mb-2">🔒 תגים לפתיחה ({locked.length})</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {locked.map(b => (
              <div key={b.id} className="border-2 border-gray-200 rounded-2xl p-3 text-center bg-gray-50 opacity-50">
                <div className="text-3xl mb-1 grayscale">{b.emoji}</div>
                <p className="font-bold text-xs text-gray-400 leading-tight">{b.title}</p>
                <p className="text-xs text-gray-300 mt-0.5 leading-tight hidden sm:block">{b.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}