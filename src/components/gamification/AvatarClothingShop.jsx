import React from 'react';
import { Button } from '@/components/ui/button';

export default function AvatarClothingShop({
  balance,
  equippedItems = {},
  onBuyItem,
  onEquipItem,
}) {
  const shirts = [
    { id: 'shirt_blue', name: '👕 חולצה כחולה', color: '#3b82f6', cost: 100 },
    { id: 'shirt_red', name: '👕 חולצה אדומה', color: '#ef4444', cost: 100 },
    { id: 'shirt_green', name: '👕 חולצה ירוקה', color: '#10b981', cost: 100 },
    { id: 'shirt_purple', name: '👕 חולצה סגולה', color: '#a855f7', cost: 100 },
  ];

  const pants = [
    { id: 'pants_black', name: '👖 מכנסיים שחורים', color: '#1f2937', cost: 80 },
    { id: 'pants_blue', name: '👖 מכנסיים כחולים', color: '#1e40af', cost: 80 },
    { id: 'pants_gray', name: '👖 מכנסיים אפורים', color: '#6b7280', cost: 80 },
  ];

  const accessories = [
    { id: 'hat', name: '🎩 כובע', cost: 150 },
    { id: 'glasses', name: '🕶️ משקפיים', cost: 120 },
    { id: 'earring', name: '💎 עגילים', cost: 100 },
    { id: 'necklace', name: '👑 שרשרת', cost: 200 },
  ];

  const handlePurchase = async (item) => {
    if (balance < item.cost) {
      alert(`נדרשים ${item.cost} 🪙, יש לך ${balance} 🪙`);
      return;
    }
    await onBuyItem(item);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <p className="text-center text-sm font-bold">🛍️ חנות בגדים ואביזרים</p>

      {/* חולצות */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-gray-700">👕 חולצות</h3>
        <div className="grid grid-cols-2 gap-2">
          {shirts.map(item => (
            <div key={item.id} className="p-2 border rounded-lg">
              <div
                className="w-full h-16 rounded mb-2"
                style={{ backgroundColor: item.color }}
              />
              <p className="text-xs font-medium mb-1">{item.name}</p>
              <Button
                size="sm"
                className="w-full text-xs h-7"
                onClick={() => handlePurchase(item)}
                disabled={balance < item.cost}
              >
                {balance >= item.cost ? `קנה ${item.cost}🪙` : 'אין מטבעות'}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* מכנסיים */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-gray-700">👖 מכנסיים</h3>
        <div className="grid grid-cols-2 gap-2">
          {pants.map(item => (
            <div key={item.id} className="p-2 border rounded-lg">
              <div
                className="w-full h-16 rounded mb-2"
                style={{ backgroundColor: item.color }}
              />
              <p className="text-xs font-medium mb-1">{item.name}</p>
              <Button
                size="sm"
                className="w-full text-xs h-7"
                onClick={() => handlePurchase(item)}
                disabled={balance < item.cost}
              >
                {balance >= item.cost ? `קנה ${item.cost}🪙` : 'אין מטבעות'}
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* אביזרים */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-gray-700">✨ אביזרים</h3>
        <div className="grid grid-cols-2 gap-2">
          {accessories.map(item => (
            <Button
              key={item.id}
              variant="outline"
              size="sm"
              className="h-16 text-xs flex flex-col gap-1"
              onClick={() => handlePurchase(item)}
              disabled={balance < item.cost}
            >
              <span className="text-lg">{item.name.split(' ')[0]}</span>
              <span className="text-xs">{item.cost}🪙</span>
            </Button>
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-gray-500">
        💰 יתרה: <span className="font-bold text-yellow-600">{balance}🪙</span>
      </p>
    </div>
  );
}