import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

// ===== נתוני הפריטים =====
const SHOP_ITEMS = [
  // כובעים
  { id: 'hat_crown',    category: 'hat',  label: 'כתר זהב',      emoji: '👑', cost: 100 },
  { id: 'hat_wizard',   category: 'hat',  label: 'כובע קסם',     emoji: '🎩', cost: 150 },
  { id: 'hat_helmet',   category: 'hat',  label: 'קסדת גיבור',   emoji: '⛑️', cost: 200 },
  { id: 'hat_halo',     category: 'hat',  label: 'הילה',         emoji: '✨', cost: 250 },
  { id: 'hat_fire',     category: 'hat',  label: 'להבות',        emoji: '🔥', cost: 300 },
  { id: 'hat_glasses',  category: 'hat',  label: 'משקפי שמש',    emoji: '🕶️', cost: 80  },

  // ביגוד
  { id: 'suit_cape',    category: 'suit', label: 'גלימת גיבור',  emoji: '🦸', cost: 200 },
  { id: 'suit_chef',    category: 'suit', label: 'חליפת שף',     emoji: '👨‍🍳', cost: 150 },
  { id: 'suit_tux',     category: 'suit', label: 'חליפת ערב',    emoji: '🤵', cost: 300 },
  { id: 'suit_king',    category: 'suit', label: 'גלימת מלך',    emoji: '🤴', cost: 400 },
  { id: 'suit_ninja',   category: 'suit', label: 'חליפת נינג\'ה', emoji: '🥷', cost: 250 },
  { id: 'suit_santa',   category: 'suit', label: 'תלבושת סנטה',  emoji: '🎅', cost: 180 },

  // אביזרים
  { id: 'acc_wand',     category: 'acc',  label: 'שרביט קסם',    emoji: '🪄', cost: 120 },
  { id: 'acc_sword',    category: 'acc',  label: 'חרב',          emoji: '⚔️', cost: 180 },
  { id: 'acc_trophy',   category: 'acc',  label: 'גביע',         emoji: '🏆', cost: 80  },
  { id: 'acc_mic',      category: 'acc',  label: 'מיקרופון',     emoji: '🎤', cost: 100 },
  { id: 'acc_shield',   category: 'acc',  label: 'מגן',          emoji: '🛡️', cost: 160 },
  { id: 'acc_gem',      category: 'acc',  label: 'יהלום',        emoji: '💎', cost: 350 },

  // רקע
  { id: 'bg_stars',     category: 'bg',   label: 'כוכבים',       emoji: '⭐', cost: 100 },
  { id: 'bg_rainbow',   category: 'bg',   label: 'קשת בענן',     emoji: '🌈', cost: 150 },
  { id: 'bg_fire',      category: 'bg',   label: 'אש',           emoji: '🔥', cost: 120 },
  { id: 'bg_lightning', category: 'bg',   label: 'ברק',          emoji: '⚡', cost: 180 },
  { id: 'bg_flowers',   category: 'bg',   label: 'פרחים',        emoji: '🌸', cost: 100 },
  { id: 'bg_crown',     category: 'bg',   label: 'כתרים',        emoji: '👑', cost: 200 },
];

const CATEGORIES = [
  { id: 'face', label: '📷 פנים' },
  { id: 'hat',  label: '🎩 כובע' },
  { id: 'suit', label: '👘 ביגוד' },
  { id: 'acc',  label: '🪄 אביזר' },
  { id: 'bg',   label: '✨ רקע' },
];

// גוף בסיס - SVG פשוט לפי מגדר
const BODY_MALE = (
  <svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    {/* גוף */}
    <rect x="30" y="80" width="60" height="70" rx="12" fill="#4f46e5" />
    {/* עניבה */}
    <polygon points="60,85 55,95 60,110 65,95" fill="#818cf8" />
    {/* שרוולים */}
    <rect x="10" y="82" width="22" height="45" rx="10" fill="#4f46e5" />
    <rect x="88" y="82" width="22" height="45" rx="10" fill="#4f46e5" />
    {/* ידיים */}
    <ellipse cx="21" cy="128" rx="10" ry="8" fill="#fcd9b8" />
    <ellipse cx="99" cy="128" rx="10" ry="8" fill="#fcd9b8" />
    {/* כפתורים */}
    <circle cx="60" cy="105" r="2.5" fill="white" opacity="0.6"/>
    <circle cx="60" cy="115" r="2.5" fill="white" opacity="0.6"/>
    {/* צוואר */}
    <rect x="50" y="68" width="20" height="18" rx="6" fill="#fcd9b8" />
  </svg>
);

const BODY_FEMALE = (
  <svg viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    {/* שמלה */}
    <path d="M25 78 Q60 72 95 78 L105 150 Q60 158 15 150 Z" fill="#ec4899" />
    {/* חגורה */}
    <rect x="28" y="95" width="64" height="10" rx="5" fill="#f472b6" />
    {/* שרוולים */}
    <path d="M25 78 Q10 90 12 118 Q18 120 22 118 Q24 95 35 85" fill="#ec4899" />
    <path d="M95 78 Q110 90 108 118 Q102 120 98 118 Q96 95 85 85" fill="#ec4899" />
    {/* ידיים */}
    <ellipse cx="17" cy="120" rx="9" ry="7" fill="#fcd9b8" />
    <ellipse cx="103" cy="120" rx="9" ry="7" fill="#fcd9b8" />
    {/* עיטור */}
    <circle cx="60" cy="88" r="5" fill="#f9a8d4" />
    <circle cx="50" cy="91" r="3.5" fill="#f9a8d4" />
    <circle cx="70" cy="91" r="3.5" fill="#f9a8d4" />
    {/* צוואר */}
    <rect x="50" y="66" width="20" height="18" rx="6" fill="#fcd9b8" />
  </svg>
);

// תצוגה ויזואלית של האווטר
export function AvatarDisplay({ faceUrl, gender, equipped, size = 'md', employeeName = '' }) {
  const getItem = (id) => id ? SHOP_ITEMS.find(i => i.id === id) : null;
  const hatItem  = getItem(equipped?.hat);
  const suitItem = getItem(equipped?.suit);
  const accItem  = getItem(equipped?.acc);
  const bgItem   = getItem(equipped?.bg);

  const sizeClasses = {
    sm:  'w-20 h-24',
    md:  'w-36 h-44',
    lg:  'w-56 h-72',
    xl:  'w-72 h-96',
  };

  const faceSizes = { sm: 'w-10 h-10 -top-5', md: 'w-16 h-16 -top-8', lg: 'w-24 h-24 -top-12', xl: 'w-32 h-32 -top-16' };
  const hatSizes  = { sm: 'text-xl -top-8',    md: 'text-3xl -top-14',  lg: 'text-5xl -top-20',   xl: 'text-6xl -top-28' };
  const accSizes  = { sm: 'text-lg',            md: 'text-2xl',          lg: 'text-4xl',            xl: 'text-5xl' };

  // רקע צבע לפי מגדר
  const bgColor = (equipped?.suit?.includes('suit')) ? '' :
    gender === 'female' ? 'bg-gradient-to-b from-pink-50 to-pink-100' : 'bg-gradient-to-b from-indigo-50 to-indigo-100';

  return (
    <div className={`relative ${sizeClasses[size]} flex-shrink-0`}>
      {/* רקע אווירה */}
      {bgItem && (
        <div className="absolute inset-0 rounded-2xl overflow-hidden flex items-center justify-center opacity-20 text-7xl pointer-events-none">
          {bgItem.emoji}{bgItem.emoji}{bgItem.emoji}
        </div>
      )}

      {/* גוף */}
      <div className={`absolute bottom-0 left-0 right-0 rounded-b-2xl overflow-hidden ${bgColor}`}
           style={{ top: size === 'sm' ? '30%' : '35%' }}>
        {gender === 'female' ? BODY_FEMALE : BODY_MALE}
      </div>

      {/* ביגוד overlay */}
      {suitItem && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center"
             style={{ bottom: size === 'sm' ? '-4px' : '-6px', fontSize: accSizes[size].split(' ')[0].replace('text-','') + 'px' }}>
          <span className={accSizes[size]}>{suitItem.emoji}</span>
        </div>
      )}

      {/* פנים - עיגול עם תמונה או אימוג'י */}
      <div className={`absolute left-1/2 -translate-x-1/2 ${faceSizes[size]} rounded-full border-4 border-white shadow-lg z-20 overflow-hidden bg-yellow-100 flex items-center justify-center`}>
        {faceUrl ? (
          <img src={faceUrl} alt="face" className="w-full h-full object-cover" />
        ) : (
          <span style={{ fontSize: size === 'sm' ? '1.5rem' : size === 'md' ? '2.2rem' : size === 'lg' ? '3.5rem' : '4.5rem' }}>
            {gender === 'female' ? '👧' : '👦'}
          </span>
        )}
      </div>

      {/* כובע */}
      {hatItem && (
        <div className={`absolute left-1/2 -translate-x-1/2 ${hatSizes[size]} z-30 pointer-events-none`}>
          {hatItem.emoji}
        </div>
      )}

      {/* אביזר */}
      {accItem && (
        <div className={`absolute bottom-1 right-0 ${accSizes[size]} z-30`}>
          {accItem.emoji}
        </div>
      )}
    </div>
  );
}

const AI_FACE_COST = 50;

const DEFAULT_EQUIPPED = { hat: null, suit: null, acc: null, bg: null };

export default function AvatarBuilder({ balance, employeeId, employeeName, onSpendCoins }) {
  const [activeCategory, setActiveCategory] = useState('face');
  const [gender, setGender] = useState(() => localStorage.getItem(`avatar_gender_${employeeId}`) || 'male');
  const [faceUrl, setFaceUrl] = useState(() => localStorage.getItem(`avatar_face_${employeeId}`) || null);
  const [equipped, setEquipped] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`avatar_equipped_${employeeId}`) || 'null') || DEFAULT_EQUIPPED; }
    catch { return DEFAULT_EQUIPPED; }
  });
  const [owned, setOwned] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`avatar_owned_${employeeId}`) || 'null') || []; }
    catch { return []; }
  });
  const [buying, setBuying] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadedOriginal, setUploadedOriginal] = useState(null);
  const [showFullView, setShowFullView] = useState(false);
  const fileRef = useRef();

  const save = (newEquipped, newOwned, newFace, newGender) => {
    localStorage.setItem(`avatar_equipped_${employeeId}`, JSON.stringify(newEquipped ?? equipped));
    localStorage.setItem(`avatar_owned_${employeeId}`, JSON.stringify(newOwned ?? owned));
    if (newFace !== undefined) localStorage.setItem(`avatar_face_${employeeId}`, newFace || '');
    if (newGender) localStorage.setItem(`avatar_gender_${employeeId}`, newGender);
  };

  const handleGenderChange = (g) => {
    setGender(g);
    save(equipped, owned, undefined, g);
  };

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
      prompt: `Convert this person's face into a cute cartoon avatar head, round face, big friendly eyes, smooth skin, clean background, chibi anime style, high quality, profile picture`,
      existing_image_urls: [uploadedOriginal]
    });
    await onSpendCoins(AI_FACE_COST, 'שיפור פנים AI לאווטר');
    setFaceUrl(url);
    save(equipped, owned, url, undefined);
    setGenerating(false);
  };

  const handleUseDirect = () => {
    if (!uploadedOriginal) return;
    setFaceUrl(uploadedOriginal);
    save(equipped, owned, uploadedOriginal, undefined);
  };

  const handleEquip = (item) => {
    const newEquipped = { ...equipped, [item.category]: equipped[item.category] === item.id ? null : item.id };
    setEquipped(newEquipped);
    save(newEquipped, owned, undefined, undefined);
  };

  const handleBuy = async (item) => {
    if (balance < item.cost) return;
    setBuying(item.id);
    await onSpendCoins(item.cost, `רכישת פריט אווטר: ${item.label}`);
    const newOwned = [...owned, item.id];
    const newEquipped = { ...equipped, [item.category]: item.id };
    setOwned(newOwned);
    setEquipped(newEquipped);
    save(newEquipped, newOwned, undefined, undefined);
    setBuying(null);
  };

  const categoryItems = SHOP_ITEMS.filter(i => i.category === activeCategory);

  return (
    <div className="space-y-4" dir="rtl">

      {/* תצוגת האווטר + כפתור הגדלה */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-end justify-center gap-4 bg-gradient-to-b from-sky-100 to-indigo-100 rounded-3xl p-6 w-full relative">
          <AvatarDisplay
            faceUrl={faceUrl}
            gender={gender}
            equipped={equipped}
            size="md"
            employeeName={employeeName}
          />
          <button
            onClick={() => setShowFullView(true)}
            className="absolute top-2 left-2 text-xs bg-white/80 hover:bg-white rounded-full px-2 py-1 shadow text-gray-600 font-medium"
          >
            🔍 הגדל
          </button>
        </div>
        <p className="font-bold text-sm text-foreground">{employeeName}</p>
      </div>

      {/* בחירת מגדר */}
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => handleGenderChange('male')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${gender === 'male' ? 'border-indigo-400 bg-indigo-100 text-indigo-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
        >
          👦 בן
        </button>
        <button
          onClick={() => handleGenderChange('female')}
          className={`flex-1 py-2 rounded-xl text-sm font-bold border-2 transition-all ${gender === 'female' ? 'border-pink-400 bg-pink-100 text-pink-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
        >
          👧 בת
        </button>
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

      {/* תוכן קטגוריה פנים */}
      {activeCategory === 'face' && (
        <div className="space-y-3">
          <p className="text-xs text-center text-muted-foreground">העלה תמונה ו-AI יהפוך אותה לאווטר קריקטורה</p>

          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          <Button
            onClick={() => fileRef.current?.click()}
            variant="outline"
            className="w-full h-20 border-dashed border-2 flex flex-col gap-1"
            disabled={uploading}
          >
            {uploading ? <span className="animate-pulse">⏳ מעלה...</span>
              : uploadedOriginal ? (
                <div className="flex items-center gap-2">
                  <img src={uploadedOriginal} alt="orig" className="w-12 h-12 rounded-full object-cover" />
                  <span className="text-sm">לחץ לשינוי התמונה</span>
                </div>
              ) : (
                <>
                  <span className="text-2xl">📷</span>
                  <span className="text-sm font-medium">העלה תמונה</span>
                </>
              )}
          </Button>

          {uploadedOriginal && !generating && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={handleUseDirect}
                variant="outline"
                className="text-sm h-12"
              >
                📷 השתמש ישירות
              </Button>
              <Button
                onClick={handleGenerateAI}
                disabled={balance < AI_FACE_COST}
                className="text-sm h-12 bg-purple-600 hover:bg-purple-700 text-white"
              >
                🤖 AI קריקטורה ({AI_FACE_COST}🪙)
              </Button>
            </div>
          )}

          {generating && (
            <div className="text-center py-6 space-y-2">
              <div className="text-4xl animate-spin inline-block">🎨</div>
              <p className="text-sm font-medium text-muted-foreground">AI מייצר פנים קריקטורה...</p>
              <p className="text-xs text-muted-foreground">לוקח כ-10 שניות</p>
            </div>
          )}

          {faceUrl && (
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200">
              <img src={faceUrl} alt="face" className="w-12 h-12 rounded-full object-cover border-2 border-green-300" />
              <div>
                <p className="text-sm font-bold text-green-700">✅ פנים מוגדרות</p>
                <button onClick={() => { setFaceUrl(null); save(equipped, owned, null, undefined); }} className="text-xs text-red-500 underline">הסר</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* גריד פריטים לשאר הקטגוריות */}
      {activeCategory !== 'face' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {categoryItems.map(item => {
            const isOwned = owned.includes(item.id);
            const isEquipped = equipped[item.category] === item.id;
            const canAfford = balance >= item.cost;
            const isBuying = buying === item.id;

            return (
              <button
                key={item.id}
                onClick={() => isOwned ? handleEquip(item) : handleBuy(item)}
                disabled={(!isOwned && !canAfford) || isBuying}
                className={`rounded-2xl p-2 text-center transition-all border-2 ${
                  isEquipped
                    ? 'border-primary bg-primary/10 shadow-md scale-105'
                    : isOwned
                    ? 'border-green-300 bg-green-50 hover:bg-green-100'
                    : canAfford
                    ? 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100 cursor-pointer'
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
      )}

      <p className="text-center text-xs text-muted-foreground">יתרה: <span className="font-black text-yellow-600">{balance} 🪙</span></p>

      {/* תצוגה מוגדלת */}
      {showFullView && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
          onClick={() => setShowFullView(false)}
        >
          <div
            className="bg-gradient-to-b from-sky-100 to-indigo-200 rounded-3xl p-10 flex flex-col items-center gap-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <AvatarDisplay faceUrl={faceUrl} gender={gender} equipped={equipped} size="xl" employeeName={employeeName} />
            <p className="font-black text-xl text-foreground mt-4">{employeeName}</p>
            <button onClick={() => setShowFullView(false)} className="text-sm text-gray-500 underline">סגור</button>
          </div>
        </div>
      )}
    </div>
  );
}