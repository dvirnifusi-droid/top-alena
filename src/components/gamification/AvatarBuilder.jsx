import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

// קטגוריות פריטים
const SHOP_ITEMS = [
  // בסיס - פנים
  { id: 'base_chef',    category: 'base',   label: 'שף',        emoji: '👨‍🍳', cost: 0,   layer: 0 },
  { id: 'base_cool',    category: 'base',   label: 'כריש',      emoji: '😎', cost: 0,   layer: 0 },
  { id: 'base_star',    category: 'base',   label: 'כוכב',      emoji: '🤩', cost: 0,   layer: 0 },
  { id: 'base_ninja',   category: 'base',   label: 'נינג\'ה',   emoji: '🥷', cost: 0,   layer: 0 },
  { id: 'base_robot',   category: 'base',   label: 'רובוט',     emoji: '🤖', cost: 0,   layer: 0 },
  { id: 'base_alien',   category: 'base',   label: 'חייזר',     emoji: '👽', cost: 0,   layer: 0 },

  // כובעים
  { id: 'hat_crown',    category: 'hat',    label: 'כתר זהב',   emoji: '👑', cost: 100, layer: 1 },
  { id: 'hat_wizard',   category: 'hat',    label: 'כובע קסם',  emoji: '🧙', cost: 150, layer: 1 },
  { id: 'hat_top',      category: 'hat',    label: 'כובע ציל.',  emoji: '🎩', cost: 200, layer: 1 },
  { id: 'hat_helmet',   category: 'hat',    label: 'קסדת גיבור', emoji: '⛑️', cost: 250, layer: 1 },
  { id: 'hat_halo',     category: 'hat',    label: 'הילה',      emoji: '😇', cost: 300, layer: 1 },
  { id: 'hat_fire',     category: 'hat',    label: 'להבות',     emoji: '🔥', cost: 350, layer: 1 },

  // גלימות וחליפות
  { id: 'suit_super',   category: 'suit',   label: 'גלימת סופרמן', emoji: '🦸', cost: 200, layer: 2 },
  { id: 'suit_wizard',  category: 'suit',   label: 'גלימת קסם',  emoji: '🧙‍♂️', cost: 250, layer: 2 },
  { id: 'suit_ninja',   category: 'suit',   label: 'חליפת נינג\'ה', emoji: '🥷', cost: 300, layer: 2 },
  { id: 'suit_king',    category: 'suit',   label: 'גלימת מלך',  emoji: '🤴', cost: 400, layer: 2 },
  { id: 'suit_chef',    category: 'suit',   label: 'סינר שף',    emoji: '👨‍🍳', cost: 150, layer: 2 },
  { id: 'suit_tux',     category: 'suit',   label: 'חליפת ערב',  emoji: '🤵', cost: 350, layer: 2 },

  // אביזרים
  { id: 'acc_wand',     category: 'acc',    label: 'שרביט קסם',  emoji: '🪄', cost: 150, layer: 3 },
  { id: 'acc_sword',    category: 'acc',    label: 'חרב',        emoji: '⚔️', cost: 200, layer: 3 },
  { id: 'acc_shield',   category: 'acc',    label: 'מגן',        emoji: '🛡️', cost: 200, layer: 3 },
  { id: 'acc_trophy',   category: 'acc',    label: 'גביע',       emoji: '🏆', cost: 100, layer: 3 },
  { id: 'acc_mic',      category: 'acc',    label: 'מיקרופון',   emoji: '🎤', cost: 120, layer: 3 },
  { id: 'acc_star',     category: 'acc',    label: 'כוכב זהב',   emoji: '⭐', cost: 80,  layer: 3 },

  // רקע / אווירה
  { id: 'bg_fire',      category: 'bg',     label: 'אש',         emoji: '🔥', cost: 100, layer: -1 },
  { id: 'bg_rainbow',   category: 'bg',     label: 'קשת בענן',   emoji: '🌈', cost: 150, layer: -1 },
  { id: 'bg_stars',     category: 'bg',     label: 'כוכבים',     emoji: '✨', cost: 120, layer: -1 },
  { id: 'bg_lightning', category: 'bg',     label: 'ברק',        emoji: '⚡', cost: 180, layer: -1 },
  { id: 'bg_crown',     category: 'bg',     label: 'כתרים',      emoji: '👑', cost: 200, layer: -1 },
  { id: 'bg_music',     category: 'bg',     label: 'מוזיקה',     emoji: '🎵', cost: 100, layer: -1 },
];

const CATEGORIES = [
  { id: 'base',  label: '😊 פנים' },
  { id: 'hat',   label: '🎩 כובע' },
  { id: 'suit',  label: '👘 ביגוד' },
  { id: 'acc',   label: '🪄 אביזר' },
  { id: 'bg',    label: '✨ רקע' },
];

const CATEGORY_SLOTS = { base: 'base', hat: 'hat', suit: 'suit', acc: 'acc', bg: 'bg' };

const DEFAULT_EQUIPPED = { base: 'base_cool', hat: null, suit: null, acc: null, bg: null };

export default function AvatarBuilder({ balance, employeeId, employeeName, onSpendCoins }) {
  const [activeCategory, setActiveCategory] = useState('base');
  const [equipped, setEquipped] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`avatar_equipped_${employeeId}`) || 'null') || DEFAULT_EQUIPPED; }
    catch { return DEFAULT_EQUIPPED; }
  });
  const [owned, setOwned] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`avatar_owned_${employeeId}`) || 'null') || ['base_cool', 'base_chef', 'base_star', 'base_ninja', 'base_robot', 'base_alien']; }
    catch { return ['base_cool', 'base_chef', 'base_star', 'base_ninja', 'base_robot', 'base_alien']; }
  });
  const [buying, setBuying] = useState(null);

  const saveState = (newEquipped, newOwned) => {
    localStorage.setItem(`avatar_equipped_${employeeId}`, JSON.stringify(newEquipped));
    localStorage.setItem(`avatar_owned_${employeeId}`, JSON.stringify(newOwned));
  };

  const handleEquip = (item) => {
    const slot = CATEGORY_SLOTS[item.category];
    const newEquipped = { ...equipped, [slot]: equipped[slot] === item.id ? null : item.id };
    // base תמיד חייב להיות equipped
    if (item.category === 'base') newEquipped.base = item.id;
    setEquipped(newEquipped);
    saveState(newEquipped, owned);
  };

  const handleBuy = async (item) => {
    if (balance < item.cost) return;
    setBuying(item.id);
    await onSpendCoins(item.cost, `רכישת אביזר אווטר: ${item.label}`);
    const newOwned = [...owned, item.id];
    setOwned(newOwned);
    const slot = CATEGORY_SLOTS[item.category];
    const newEquipped = { ...equipped, [slot]: item.id };
    setEquipped(newEquipped);
    saveState(newEquipped, newOwned);
    setBuying(null);
  };

  // בניית האווטר הויזואלי
  const getItem = (id) => id ? SHOP_ITEMS.find(i => i.id === id) : null;
  const baseItem  = getItem(equipped.base);
  const hatItem   = getItem(equipped.hat);
  const suitItem  = getItem(equipped.suit);
  const accItem   = getItem(equipped.acc);
  const bgItem    = getItem(equipped.bg);

  const categoryItems = SHOP_ITEMS.filter(i => i.category === activeCategory);

  return (
    <div className="space-y-4" dir="rtl">

      {/* תצוגת האווטר */}
      <div className="flex justify-center">
        <div className="relative">
          {/* רקע */}
          <div className="w-40 h-40 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 border-4 border-primary/30 shadow-2xl flex items-center justify-center relative overflow-hidden">
            {/* רקע אווירה */}
            {bgItem && (
              <div className="absolute inset-0 flex items-center justify-center opacity-30 text-8xl select-none pointer-events-none">
                {bgItem.emoji}
              </div>
            )}
            {/* גוף / ביגוד */}
            {suitItem && (
              <div className="absolute bottom-2 left-0 right-0 text-center text-4xl select-none">
                {suitItem.emoji}
              </div>
            )}
            {/* פנים בסיס */}
            <div className="text-7xl z-10 select-none leading-none">
              {baseItem?.emoji || '😎'}
            </div>
            {/* כובע */}
            {hatItem && (
              <div className="absolute top-1 left-0 right-0 text-center text-4xl select-none z-20">
                {hatItem.emoji}
              </div>
            )}
            {/* אביזר */}
            {accItem && (
              <div className="absolute bottom-1 right-1 text-3xl select-none z-20">
                {accItem.emoji}
              </div>
            )}
          </div>
          {/* שם */}
          <p className="text-center mt-2 font-bold text-sm text-foreground truncate max-w-[10rem]">{employeeName}</p>
        </div>
      </div>

      {/* טאבי קטגוריות */}
      <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              activeCategory === cat.id
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* גריד פריטים */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        {categoryItems.map(item => {
          const isOwned = owned.includes(item.id);
          const isEquipped = Object.values(equipped).includes(item.id);
          const canAfford = balance >= item.cost;
          const isBuying = buying === item.id;

          return (
            <button
              key={item.id}
              onClick={() => isOwned ? handleEquip(item) : handleBuy(item)}
              disabled={!isOwned && !canAfford || isBuying}
              className={`rounded-2xl p-2 text-center transition-all border-2 ${
                isEquipped
                  ? 'border-primary bg-primary/10 shadow-md scale-105'
                  : isOwned
                  ? 'border-green-300 bg-green-50 hover:bg-green-100'
                  : canAfford
                  ? 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100'
                  : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="text-3xl mb-1">{item.emoji}</div>
              <div className="text-xs font-bold text-foreground leading-tight">{item.label}</div>
              {isEquipped && <div className="text-xs text-primary font-black mt-0.5">✓ לבוש</div>}
              {isOwned && !isEquipped && <div className="text-xs text-green-600 font-medium mt-0.5">בבעלותי</div>}
              {!isOwned && (
                <div className={`text-xs font-black mt-0.5 ${canAfford ? 'text-yellow-600' : 'text-gray-400'}`}>
                  {isBuying ? '⏳' : `${item.cost} 🪙`}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground">יתרה: <span className="font-black text-yellow-600">{balance} 🪙</span></p>
    </div>
  );
}