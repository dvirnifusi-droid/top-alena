import React from 'react';

// SVG Avatar בסגנון WhatsApp
export function AvatarRenderer({ skin, hair, eyes, body, accessories = [] }) {
  const sizeW = 200;
  const sizeH = 240;

  return (
    <svg viewBox={`0 0 ${sizeW} ${sizeH}`} xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* רקע */}
      <rect width={sizeW} height={sizeH} fill="#f5f0eb" />

      {/* ראש */}
      <circle cx="100" cy="70" r="45" fill={skin.color} />

      {/* שיער */}
      {hair.type === 'long' && (
        <>
          <path d="M 55 70 Q 50 50 100 40 Q 150 50 145 70" fill={hair.color} />
          <ellipse cx="60" cy="90" rx="18" ry="35" fill={hair.color} />
          <ellipse cx="140" cy="90" rx="18" ry="35" fill={hair.color} />
        </>
      )}
      {hair.type === 'short' && (
        <path d="M 55 65 Q 50 50 100 40 Q 150 50 145 65 Q 145 75 100 80 Q 55 75 55 65" fill={hair.color} />
      )}
      {hair.type === 'curly' && (
        <>
          <circle cx="65" cy="55" r="12" fill={hair.color} />
          <circle cx="85" cy="45" r="14" fill={hair.color} />
          <circle cx="100" cy="38" r="15" fill={hair.color} />
          <circle cx="115" cy="45" r="14" fill={hair.color} />
          <circle cx="135" cy="55" r="12" fill={hair.color} />
          <circle cx="55" cy="75" r="11" fill={hair.color} />
          <circle cx="145" cy="75" r="11" fill={hair.color} />
        </>
      )}

      {/* עיניים */}
      <circle cx="85" cy="65" r="6" fill="white" />
      <circle cx="115" cy="65" r="6" fill="white" />
      <circle cx={85 + eyes.direction} cy="67" r="3" fill={eyes.color} />
      <circle cx={115 + eyes.direction} cy="67" r="3" fill={eyes.color} />

      {/* אפשרות - משקפיים */}
      {accessories.includes('glasses') && (
        <>
          <rect x="78" y="60" width="14" height="12" rx="3" fill="none" stroke="#333" strokeWidth="2" />
          <rect x="108" y="60" width="14" height="12" rx="3" fill="none" stroke="#333" strokeWidth="2" />
          <line x1="92" y1="66" x2="108" y2="66" stroke="#333" strokeWidth="2" />
        </>
      )}

      {/* פה */}
      <path d="M 90 90 Q 100 100 110 90" fill="none" stroke="#d97706" strokeWidth="2" />

      {/* גוף */}
      <g>
        {body.type === 'shirt' && (
          <>
            {/* חולצה */}
            <path d="M 60 115 L 65 120 L 65 170 Q 60 175 55 180 L 145 180 Q 140 175 135 170 L 135 120 L 140 115" fill={body.color} />
            {/* שרוולים */}
            <ellipse cx="50" cy="130" rx="12" ry="25" fill={body.color} />
            <ellipse cx="150" cy="130" rx="12" ry="25" fill={body.color} />
            {/* כפתורים */}
            <circle cx="100" cy="135" r="2.5" fill="white" opacity="0.5" />
            <circle cx="100" cy="150" r="2.5" fill="white" opacity="0.5" />
          </>
        )}

        {body.type === 'dress' && (
          <>
            {/* שמלה */}
            <path d="M 65 120 L 135 120 L 145 180 L 55 180 Z" fill={body.color} />
            {/* שרוולים קצרים */}
            <ellipse cx="50" cy="125" rx="10" ry="18" fill={body.color} />
            <ellipse cx="150" cy="125" rx="10" ry="18" fill={body.color} />
            {/* עיטור */}
            <circle cx="80" cy="140" r="3" fill={body.accent} opacity="0.6" />
            <circle cx="120" cy="140" r="3" fill={body.accent} opacity="0.6" />
          </>
        )}
      </g>

      {/* אביזרים */}
      {accessories.includes('hat') && (
        <>
          <ellipse cx="100" cy="40" rx="50" ry="15" fill="#ef4444" />
          <path d="M 70 35 Q 70 20 100 18 Q 130 20 130 35" fill="#ef4444" />
        </>
      )}

      {accessories.includes('earring') && (
        <>
          <circle cx="48" cy="80" r="4" fill="#fbbf24" />
          <circle cx="152" cy="80" r="4" fill="#fbbf24" />
        </>
      )}

      {accessories.includes('necklace') && (
        <ellipse cx="100" cy="115" rx="35" ry="8" fill="none" stroke="#fbbf24" strokeWidth="2" />
      )}
    </svg>
  );
}

export default function WhatsAppAvatar({
  balance,
  employeeId,
  employeeName,
  onSpendCoins,
}) {
  const [skin, setSkin] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`avatar_skin_${employeeId}`) || 'null') || {
        color: '#d4a574',
      };
    } catch {
      return { color: '#d4a574' };
    }
  });

  const [hair, setHair] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`avatar_hair_${employeeId}`) || 'null') || {
        type: 'long',
        color: '#3f2817',
      };
    } catch {
      return { type: 'long', color: '#3f2817' };
    }
  });

  const [eyes, setEyes] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`avatar_eyes_${employeeId}`) || 'null') || {
        color: '#6b4226',
        direction: 0,
      };
    } catch {
      return { color: '#6b4226', direction: 0 };
    }
  });

  const [body, setBody] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`avatar_body_${employeeId}`) || 'null') || {
        type: 'shirt',
        color: '#3b82f6',
        accent: '#fbbf24',
      };
    } catch {
      return { type: 'shirt', color: '#3b82f6', accent: '#fbbf24' };
    }
  });

  const [accessories, setAccessories] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`avatar_accessories_${employeeId}`) || 'null') || [];
    } catch {
      return [];
    }
  });

  const [tab, setTab] = React.useState('skin');

  const save = () => {
    localStorage.setItem(`avatar_skin_${employeeId}`, JSON.stringify(skin));
    localStorage.setItem(`avatar_hair_${employeeId}`, JSON.stringify(hair));
    localStorage.setItem(`avatar_eyes_${employeeId}`, JSON.stringify(eyes));
    localStorage.setItem(`avatar_body_${employeeId}`, JSON.stringify(body));
    localStorage.setItem(`avatar_accessories_${employeeId}`, JSON.stringify(accessories));
  };

  React.useEffect(() => save(), [skin, hair, eyes, body, accessories]);

  const skinTones = [
    '#f8d5c4',
    '#d4a574',
    '#c68642',
    '#8d5524',
    '#654321',
  ];

  const hairColors = [
    '#3f2817',
    '#8b4513',
    '#fbbf24',
    '#dc2626',
    '#000000',
  ];

  const eyeColors = [
    '#6b4226',
    '#1e40af',
    '#059669',
    '#7c3aed',
  ];

  const bodyColors = [
    '#3b82f6',
    '#ec4899',
    '#10b981',
    '#f59e0b',
    '#6366f1',
  ];

  const accessoryOptions = [
    { id: 'glasses', label: '🕶️ משקפיים', cost: 50 },
    { id: 'hat', label: '🎩 כובע', cost: 80 },
    { id: 'earring', label: '💎 עגיל', cost: 60 },
    { id: 'necklace', label: '👑 שרשרת', cost: 100 },
  ];

  const toggleAccessory = async (acc) => {
    const item = accessoryOptions.find(a => a.id === acc.id);
    if (!accessories.includes(acc.id) && balance < item.cost) {
      alert(`נדרשים ${item.cost} 🪙`);
      return;
    }
    if (!accessories.includes(acc.id)) {
      await onSpendCoins(item.cost, `רכישת אביזר: ${item.label}`);
    }
    setAccessories(prev => prev.includes(acc.id) ? prev.filter(a => a !== acc.id) : [...prev, acc.id]);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* תצוגת האווטר */}
      <div className="flex justify-center p-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl">
        <div className="w-48">
          <AvatarRenderer skin={skin} hair={hair} eyes={eyes} body={body} accessories={accessories} />
        </div>
      </div>

      {/* שם */}
      <p className="text-center font-bold text-lg">{employeeName}</p>

      {/* טאבים */}
      <div className="grid grid-cols-4 gap-1 bg-muted rounded-lg p-1">
        <button
          onClick={() => setTab('skin')}
          className={`py-2 px-2 rounded text-xs font-bold transition ${tab === 'skin' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
        >
          🫀 עור
        </button>
        <button
          onClick={() => setTab('hair')}
          className={`py-2 px-2 rounded text-xs font-bold transition ${tab === 'hair' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
        >
          💇 שיער
        </button>
        <button
          onClick={() => setTab('body')}
          className={`py-2 px-2 rounded text-xs font-bold transition ${tab === 'body' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
        >
          👕 ביגוד
        </button>
        <button
          onClick={() => setTab('acc')}
          className={`py-2 px-2 rounded text-xs font-bold transition ${tab === 'acc' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
        >
          ✨ אביזר
        </button>
      </div>

      {/* תוכן טאבים */}
      {tab === 'skin' && (
        <div className="space-y-3">
          <p className="text-sm font-bold">בחר צבע עור:</p>
          <div className="grid grid-cols-5 gap-2">
            {skinTones.map(color => (
              <button
                key={color}
                onClick={() => setSkin({ ...skin, color })}
                className={`w-full h-12 rounded-lg border-2 transition ${
                  skin.color === color ? 'border-primary ring-2 ring-primary/30' : 'border-gray-300'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'hair' && (
        <div className="space-y-3">
          <p className="text-sm font-bold">סגנון שיער:</p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {['long', 'short', 'curly'].map(type => (
              <button
                key={type}
                onClick={() => setHair({ ...hair, type })}
                className={`py-2 px-3 rounded-lg border-2 text-xs font-bold transition ${
                  hair.type === type ? 'border-primary bg-primary/10' : 'border-gray-300'
                }`}
              >
                {type === 'long' ? '💃 ארוך' : type === 'short' ? '👦 קצר' : '🌀 מתולתל'}
              </button>
            ))}
          </div>
          <p className="text-sm font-bold">צבע שיער:</p>
          <div className="grid grid-cols-5 gap-2">
            {hairColors.map(color => (
              <button
                key={color}
                onClick={() => setHair({ ...hair, color })}
                className={`w-full h-12 rounded-lg border-2 transition ${
                  hair.color === color ? 'border-primary ring-2 ring-primary/30' : 'border-gray-300'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'body' && (
        <div className="space-y-3">
          <p className="text-sm font-bold">סגנון ביגוד:</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {['shirt', 'dress'].map(type => (
              <button
                key={type}
                onClick={() => setBody({ ...body, type })}
                className={`py-2 px-3 rounded-lg border-2 text-xs font-bold transition ${
                  body.type === type ? 'border-primary bg-primary/10' : 'border-gray-300'
                }`}
              >
                {type === 'shirt' ? '👕 חולצה' : '👗 שמלה'}
              </button>
            ))}
          </div>
          <p className="text-sm font-bold">צבע ביגוד:</p>
          <div className="grid grid-cols-5 gap-2">
            {bodyColors.map(color => (
              <button
                key={color}
                onClick={() => setBody({ ...body, color })}
                className={`w-full h-12 rounded-lg border-2 transition ${
                  body.color === color ? 'border-primary ring-2 ring-primary/30' : 'border-gray-300'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'acc' && (
        <div className="space-y-3">
          <p className="text-sm font-bold">אביזרים:</p>
          <div className="space-y-2">
            {accessoryOptions.map(acc => (
              <button
                key={acc.id}
                onClick={() => toggleAccessory(acc)}
                className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition ${
                  accessories.includes(acc.id)
                    ? 'border-primary bg-primary/10'
                    : balance >= acc.cost
                    ? 'border-yellow-300 bg-yellow-50'
                    : 'border-gray-200 bg-gray-50 opacity-50'
                }`}
              >
                <span className="font-medium text-sm">{acc.label}</span>
                <span className="text-xs font-bold">
                  {accessories.includes(acc.id) ? '✓' : `${acc.cost} 🪙`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        יתרה: <span className="font-black text-yellow-600">{balance} 🪙</span>
      </p>
    </div>
  );
}