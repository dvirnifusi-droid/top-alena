import React from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

// SVG Avatar עם ראש מתמונה אמיתית המחוברת לגוף
export function AvatarRenderer({ faceUrl, skin, hair, eyes, body, accessories = [] }) {
  const sizeW = 200;
  const sizeH = 280;

  return (
    <svg viewBox={`0 0 ${sizeW} ${sizeH}`} xmlns="http://www.w3.org/2000/svg" className="w-full h-full" style={{ backgroundColor: '#f5f0eb' }}>
      {/* הגדרת Clip Path להראש עגול */}
      <defs>
        <clipPath id="headMask">
          <circle cx="100" cy="75" r="45" />
        </clipPath>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* רגליים */}
      <rect x="75" y="200" width="15" height="70" rx="7" fill={skin.color} />
      <rect x="110" y="200" width="15" height="70" rx="7" fill={skin.color} />
      {/* נעליים */}
      <ellipse cx="82.5" cy="270" rx="10" ry="5" fill="#333" />
      <ellipse cx="117.5" cy="270" rx="10" ry="5" fill="#333" />

      {/* צוואר - מחבר בין ראש לגוף */}
      <ellipse cx="100" cy="122" rx="22" ry="10" fill={skin.color} />

      {/* גוף - חולצה/שמלה */}
      <g>
        {body.type === 'shirt' && (
          <>
            <path d="M 60 135 L 75 125 L 75 200 Q 100 210 125 200 L 125 125 L 140 135 Q 100 120 60 135" fill={body.color} filter="url(#shadow)" />
            {/* שרוולים */}
            <ellipse cx="50" cy="155" rx="14" ry="30" fill={body.color} />
            <ellipse cx="150" cy="155" rx="14" ry="30" fill={body.color} />
            {/* כפתורים */}
            <circle cx="100" cy="150" r="2" fill="white" opacity="0.6" />
            <circle cx="100" cy="165" r="2" fill="white" opacity="0.6" />
            <circle cx="100" cy="180" r="2" fill="white" opacity="0.6" />
          </>
        )}
        {body.type === 'dress' && (
          <>
            <path d="M 75 125 L 125 125 L 140 200 L 60 200 Z" fill={body.color} filter="url(#shadow)" />
            {/* שרוולים */}
            <ellipse cx="48" cy="150" rx="12" ry="25" fill={body.color} />
            <ellipse cx="152" cy="150" rx="12" ry="25" fill={body.color} />
            {/* דקוריות */}
            <circle cx="75" cy="160" r="2.5" fill={body.accent} opacity="0.7" />
            <circle cx="125" cy="160" r="2.5" fill={body.accent} opacity="0.7" />
            <circle cx="75" cy="175" r="2.5" fill={body.accent} opacity="0.7" />
            <circle cx="125" cy="175" r="2.5" fill={body.accent} opacity="0.7" />
          </>
        )}
      </g>

      {/* ראש - תמונה או צבע */}
      {faceUrl ? (
        <>
          {/* תמונה אמיתית כראש */}
          <image href={faceUrl} x="55" y="30" width="90" height="90" clipPath="url(#headMask)" preserveAspectRatio="xMidYMid slice" />
          {/* גבול עדין */}
          <circle cx="100" cy="75" r="45" fill="none" stroke={skin.color} strokeWidth="1" opacity="0.3" />
        </>
      ) : (
        <>
          {/* ראש בצבע כברירת מחדל */}
          <circle cx="100" cy="75" r="45" fill={skin.color} filter="url(#shadow)" />
          {/* עיניים */}
          <circle cx="85" cy="70" r="5" fill="white" />
          <circle cx="115" cy="70" r="5" fill="white" />
          <circle cx={85 + eyes.direction} cy="71" r="2.5" fill={eyes.color} />
          <circle cx={115 + eyes.direction} cy="71" r="2.5" fill={eyes.color} />
          {/* ריסים */}
          <path d="M 80 66 Q 85 64 90 66" stroke={hair.color} strokeWidth="1" fill="none" />
          <path d="M 110 66 Q 115 64 120 66" stroke={hair.color} strokeWidth="1" fill="none" />
          {/* פה */}
          <path d="M 90 95 Q 100 105 110 95" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" />
        </>
      )}

      {/* שיער */}
      {hair.type === 'long' && (
        <>
          <path d="M 55 75 Q 50 50 100 38 Q 150 50 145 75" fill={hair.color} />
          <ellipse cx="58" cy="95" rx="16" ry="32" fill={hair.color} />
          <ellipse cx="142" cy="95" rx="16" ry="32" fill={hair.color} />
        </>
      )}
      {hair.type === 'short' && (
        <path d="M 55 70 Q 50 50 100 40 Q 150 50 145 70 Q 145 80 100 85 Q 55 80 55 70" fill={hair.color} />
      )}
      {hair.type === 'curly' && (
        <>
          <circle cx="65" cy="55" r="12" fill={hair.color} />
          <circle cx="85" cy="42" r="14" fill={hair.color} />
          <circle cx="100" cy="36" r="15" fill={hair.color} />
          <circle cx="115" cy="42" r="14" fill={hair.color} />
          <circle cx="135" cy="55" r="12" fill={hair.color} />
          <circle cx="55" cy="78" r="11" fill={hair.color} />
          <circle cx="145" cy="78" r="11" fill={hair.color} />
        </>
      )}

      {/* משקפיים */}
      {accessories.includes('glasses') && (
        <>
          <rect x="77" y="63" width="16" height="14" rx="2" fill="none" stroke="#1f2937" strokeWidth="1.5" />
          <rect x="107" y="63" width="16" height="14" rx="2" fill="none" stroke="#1f2937" strokeWidth="1.5" />
          <line x1="93" y1="70" x2="107" y2="70" stroke="#1f2937" strokeWidth="1" />
        </>
      )}

      {/* כובע */}
      {accessories.includes('hat') && (
        <>
          <ellipse cx="100" cy="32" rx="48" ry="12" fill={accessories.includes('hat_red') ? '#ef4444' : '#333'} />
          <path d="M 70 30 Q 70 15 100 12 Q 130 15 130 30" fill={accessories.includes('hat_red') ? '#ef4444' : '#333'} />
        </>
      )}

      {/* עגיל */}
      {accessories.includes('earring') && (
        <>
          <circle cx="50" cy="80" r="4" fill="#fbbf24" />
          <circle cx="150" cy="80" r="4" fill="#fbbf24" />
        </>
      )}

      {/* שרשרת */}
      {accessories.includes('necklace') && (
        <ellipse cx="100" cy="130" rx="32" ry="7" fill="none" stroke="#fbbf24" strokeWidth="1.5" />
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
        <div className="space-y-3">
          <p className="text-sm font-bold">העלה תמונה והמיר ל-AI אווטר:</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          <Button
            onClick={() => fileRef.current?.click()}
            variant="outline"
            className="w-full h-16 border-dashed border-2 flex flex-col gap-1"
            disabled={uploading}
          >
            {uploading ? <span className="animate-pulse">⏳ מעלה...</span>
              : uploadedOriginal ? (
                <div className="flex items-center gap-2 text-xs">
                  <img src={uploadedOriginal} alt="orig" className="w-8 h-8 rounded-full object-cover" />
                  <span>שנה תמונה</span>
                </div>
              ) : (
                <>
                  <span className="text-xl">📷</span>
                  <span className="text-xs font-medium">בחר תמונה</span>
                </>
              )}
          </Button>

          {uploadedOriginal && !generating && (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleUseDirect} variant="outline" className="text-xs h-10">
                ✓ השתמש ישירות
              </Button>
              <Button
                onClick={handleGenerateAI}
                disabled={balance < AI_FACE_COST}
                className="text-xs h-10 bg-purple-600 hover:bg-purple-700 text-white"
              >
                🤖 AI ({AI_FACE_COST}🪙)
              </Button>
            </div>
          )}

          {generating && (
            <div className="text-center py-6 space-y-2">
              <div className="text-3xl animate-spin inline-block">🎨</div>
              <p className="text-xs font-medium">AI מייצר אווטר...</p>
            </div>
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