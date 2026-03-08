import React from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import AvatarUploader from './AvatarUploader';

// SVG Avatar בסגנון Pixar/Fortnite עם Layers
export function AvatarRenderer({ faceUrl, body = {}, accessories = [] }) {
  const sizeW = 200;
  const sizeH = 280;

  return (
    <svg viewBox={`0 0 ${sizeW} ${sizeH}`} xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <clipPath id="headClip">
          <circle cx="100" cy="80" r="38" />
        </clipPath>
        <filter id="shadow">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.2" />
        </filter>
      </defs>

      {/* רקע */}
      <rect width={sizeW} height={sizeH} fill="#f5f0eb" />

      {/* רגליים */}
      <rect x="78" y="210" width="12" height="55" rx="6" fill="#d4a574" filter="url(#shadow)" />
      <rect x="110" y="210" width="12" height="55" rx="6" fill="#d4a574" filter="url(#shadow)" />
      {/* נעליים */}
      <ellipse cx="84" cy="268" rx="8" ry="4" fill="#333" />
      <ellipse cx="116" cy="268" rx="8" ry="4" fill="#333" />

      {/* צוואר */}
      <rect x="94" y="132" width="12" height="8" fill="#d4a574" />

      {/* גוף - חולצה */}
      <g filter="url(#shadow)">
        <path d="M 70 142 L 75 140 L 75 205 Q 100 215 125 205 L 125 140 L 130 142 Q 100 130 70 142" 
          fill={body.color || '#3b82f6'} />
        {/* שרוולים */}
        <ellipse cx="55" cy="160" rx="11" ry="28" fill={body.color || '#3b82f6'} />
        <ellipse cx="145" cy="160" rx="11" ry="28" fill={body.color || '#3b82f6'} />
        {/* כפתורים */}
        <circle cx="100" cy="155" r="1.5" fill="white" opacity="0.5" />
        <circle cx="100" cy="170" r="1.5" fill="white" opacity="0.5" />
      </g>

      {/* ראש - תמונה מה-AI או צבע */}
      {faceUrl ? (
        <image href={faceUrl} x="62" y="42" width="76" height="76" 
          clipPath="url(#headClip)" preserveAspectRatio="xMidYMid slice" />
      ) : (
        <circle cx="100" cy="80" r="38" fill="#d4a574" filter="url(#shadow)" />
      )}

      {/* גבול ראש עדין */}
      <circle cx="100" cy="80" r="38" fill="none" stroke="#d4a574" strokeWidth="0.5" opacity="0.3" />

      {/* Layer: כובע */}
      {accessories.includes('hat') && (
        <>
          <ellipse cx="100" cy="50" rx="42" ry="10" fill="#ef4444" />
          <path d="M 72 48 Q 72 35 100 32 Q 128 35 128 48" fill="#ef4444" />
        </>
      )}

      {/* Layer: משקפיים */}
      {accessories.includes('glasses') && (
        <>
          <rect x="75" y="72" width="14" height="12" rx="2" fill="none" stroke="#1f2937" strokeWidth="1.5" />
          <rect x="111" y="72" width="14" height="12" rx="2" fill="none" stroke="#1f2937" strokeWidth="1.5" />
          <line x1="89" y1="78" x2="111" y2="78" stroke="#1f2937" strokeWidth="1" />
        </>
      )}

      {/* Layer: עגיל */}
      {accessories.includes('earring') && (
        <>
          <circle cx="52" cy="85" r="3" fill="#fbbf24" />
          <circle cx="148" cy="85" r="3" fill="#fbbf24" />
        </>
      )}

      {/* Layer: שרשרת */}
      {accessories.includes('necklace') && (
        <ellipse cx="100" cy="132" rx="28" ry="6" fill="none" stroke="#fbbf24" strokeWidth="1.2" />
      )}
    </svg>
  );
}

const AI_FACE_COST = 50;

export default function WhatsAppAvatar({
  balance,
  employeeId,
  employeeName,
  onSpendCoins,
}) {
  const fileRef = React.useRef();
  const [uploading, setUploading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [uploadedOriginal, setUploadedOriginal] = React.useState(null);

  const [faceUrl, setFaceUrl] = React.useState(() => {
    try {
      return localStorage.getItem(`avatar_face_${employeeId}`) || null;
    } catch {
      return null;
    }
  });

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

  const [tab, setTab] = React.useState('face');

  const save = () => {
    localStorage.setItem(`avatar_face_${employeeId}`, faceUrl || '');
    localStorage.setItem(`avatar_skin_${employeeId}`, JSON.stringify(skin));
    localStorage.setItem(`avatar_hair_${employeeId}`, JSON.stringify(hair));
    localStorage.setItem(`avatar_eyes_${employeeId}`, JSON.stringify(eyes));
    localStorage.setItem(`avatar_body_${employeeId}`, JSON.stringify(body));
    localStorage.setItem(`avatar_accessories_${employeeId}`, JSON.stringify(accessories));
  };

  React.useEffect(() => save(), [faceUrl, skin, hair, eyes, body, accessories]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploadedOriginal(file_url);
    setUploading(false);
  };

  const handleGenerateAI = async () => {
    if (!uploadedOriginal) return;
    if (balance < AI_FACE_COST) { alert(`נדרשים ${AI_FACE_COST} 🪙`); return; }
    setGenerating(true);
    const { url } = await base44.integrations.Core.GenerateImage({
      prompt: `Transform this person's face into a cute cartoon avatar style character in white circle, vibrant colors, clean art style, friendly expression, profile picture quality`,
      existing_image_urls: [uploadedOriginal]
    });
    await onSpendCoins(AI_FACE_COST, 'שיפור פנים AI לאווטר');
    setFaceUrl(url);
    setGenerating(false);
  };

  const handleUseDirect = () => {
    if (!uploadedOriginal) return;
    setFaceUrl(uploadedOriginal);
  };

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
          <AvatarRenderer faceUrl={faceUrl} skin={skin} hair={hair} eyes={eyes} body={body} accessories={accessories} />
        </div>
      </div>

      {/* שם */}
      <p className="text-center font-bold text-lg">{employeeName}</p>

      {/* טאבים */}
      <div className="grid grid-cols-5 gap-1 bg-muted rounded-lg p-1">
        <button
          onClick={() => setTab('face')}
          className={`py-2 px-1 rounded text-xs font-bold transition ${tab === 'face' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
        >
          📷 פנים
        </button>
        <button
          onClick={() => setTab('skin')}
          className={`py-2 px-1 rounded text-xs font-bold transition ${tab === 'skin' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
        >
          🫀 עור
        </button>
        <button
          onClick={() => setTab('hair')}
          className={`py-2 px-1 rounded text-xs font-bold transition ${tab === 'hair' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
        >
          💇 שיער
        </button>
        <button
          onClick={() => setTab('body')}
          className={`py-2 px-1 rounded text-xs font-bold transition ${tab === 'body' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
        >
          👕 ביגוד
        </button>
        <button
          onClick={() => setTab('shop')}
          className={`py-2 px-1 rounded text-xs font-bold transition ${tab === 'shop' ? 'bg-primary text-white' : 'text-muted-foreground'}`}
        >
          🛍️ חנות
        </button>
      </div>

      {/* תוכן טאבים */}
      {tab === 'face' && (
        <AvatarUploader
          employeeId={employeeId}
          employeeName={employeeName}
          balance={balance}
          onFaceGenerated={(url) => setFaceUrl(url)}
          onSpendCoins={onSpendCoins}
        />
      )}

      {faceUrl && (
        <div className="flex items-center gap-3 p-2 bg-green-50 rounded-lg border border-green-200">
          <img src={faceUrl} alt="face" className="w-10 h-10 rounded-full object-cover" />
          <div className="flex-1">
            <p className="text-xs font-bold text-green-700">✅ פנים מוגדרות</p>
            <button onClick={() => { setFaceUrl(null); save(); }} className="text-xs text-red-500 underline">הסר</button>
          </div>
        </div>
      )}

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

      {tab === 'shop' && (
        <div className="space-y-3">
          <p className="text-sm font-bold">🛍️ חנות - אביזרים ובגדים:</p>
          <div className="space-y-2">
            {accessoryOptions.map(acc => {
              const item = accessoryOptions.find(a => a.id === acc.id);
              const canAfford = balance >= item.cost;
              return (
                <button
                  key={acc.id}
                  onClick={() => toggleAccessory(acc)}
                  disabled={!accessories.includes(acc.id) && !canAfford}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition ${
                    accessories.includes(acc.id)
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : canAfford
                      ? 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100 cursor-pointer'
                      : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <span className="font-medium text-sm">{acc.label}</span>
                  <span className={`text-xs font-bold ${accessories.includes(acc.id) ? 'text-primary' : canAfford ? 'text-yellow-600' : 'text-gray-400'}`}>
                    {accessories.includes(acc.id) ? '✓ בבעלותי' : `${acc.cost} 🪙`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        יתרה: <span className="font-black text-yellow-600">{balance} 🪙</span>
      </p>
    </div>
  );
}