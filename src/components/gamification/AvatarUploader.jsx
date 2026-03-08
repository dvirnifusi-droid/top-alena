import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

const UPGRADE_COST = 50; // מטבעות לשיפור AI

export default function AvatarUploader({ currentAvatar, balance, onSave, onSpendCoins }) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const fileRef = useRef();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploadedUrl(file_url);
    
    // אוטומטית להפיק 3D avatar
    setGenerating(true);
    setAiResult(null);
    const { url } = await base44.integrations.Core.GenerateImage({
      prompt: 'Convert this photo into a professional 3D avatar with full body and face, wearing casual clothes, character design with clean white background, showing head and torso, friendly expression, high quality 3D illustration',
      existing_image_urls: [file_url]
    });
    setAiResult(url);
    setGenerating(false);
    setUploading(false);
  };

  const handleGenerateAI = async (style) => {
    if (!uploadedUrl) return;
    const styleDef = AI_STYLES.find(s => s.id === style);
    if (!styleDef) return;
    if (balance < styleDef.cost) {
      alert(`אין מספיק מטבעות! נדרשים ${styleDef.cost} 🪙`);
      return;
    }
    setGenerating(true);
    setAiResult(null);
    const { url } = await base44.integrations.Core.GenerateImage({
      prompt: styleDef.prompt + ', profile picture, square format, high quality',
      existing_image_urls: [uploadedUrl]
    });
    await onSpendCoins(styleDef.cost, `שיפור אווטר AI - ${styleDef.label}`);
    setAiResult(url);
    setGenerating(false);
  };

  const handleSave = (url) => {
    onSave(url);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* טאבים */}
      <div className="flex rounded-xl overflow-hidden border">
        <button
          onClick={() => setTab('upload')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === 'upload' ? 'bg-primary text-primary-foreground' : 'bg-white hover:bg-gray-50'}`}
        >
          📷 העלה תמונה
        </button>
        <button
          onClick={() => setTab('ai')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${tab === 'ai' ? 'bg-primary text-primary-foreground' : 'bg-white hover:bg-gray-50'}`}
        >
          🤖 שדרג עם AI
        </button>
      </div>

      {tab === 'upload' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 text-center">העלה תמונה אישית שתשמש כאווטר שלך</p>
          <input type="file" accept="image/*" ref={fileRef} onChange={handleFileChange} className="hidden" />
          <Button
            onClick={() => fileRef.current?.click()}
            variant="outline"
            className="w-full h-24 border-dashed border-2 flex flex-col gap-1"
            disabled={uploading}
          >
            {uploading ? (
              <span className="animate-pulse">⏳ מעלה...</span>
            ) : uploadedUrl ? (
              <>
                <img src={uploadedUrl} alt="uploaded" className="w-12 h-12 rounded-full object-cover mx-auto" />
                <span className="text-xs text-gray-500">לחץ לשינוי</span>
              </>
            ) : (
              <>
                <span className="text-2xl">📷</span>
                <span className="text-sm">לחץ להעלאת תמונה</span>
              </>
            )}
          </Button>

          {uploadedUrl && (
            <Button onClick={() => handleSave(uploadedUrl)} className="w-full bg-green-500 hover:bg-green-600 text-white font-bold">
              ✅ שמור כאווטר
            </Button>
          )}
        </div>
      )}

      {tab === 'ai' && (
        <div className="space-y-3">
          {!uploadedUrl ? (
            <div className="text-center p-4 bg-yellow-50 rounded-xl border border-yellow-200">
              <p className="text-sm text-yellow-700 font-medium">⚠️ קודם העלה תמונה בטאב "העלה תמונה"</p>
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <img src={uploadedUrl} alt="original" className="w-16 h-16 rounded-full object-cover border-2 border-gray-200" />
              </div>
              <p className="text-sm text-center text-gray-600">בחר סגנון AI לשדרוג האווטר שלך</p>
              <div className="grid grid-cols-2 gap-2">
                {AI_STYLES.map(style => {
                  const canAfford = balance >= style.cost;
                  return (
                    <button
                      key={style.id}
                      onClick={() => handleGenerateAI(style.id)}
                      disabled={generating || !canAfford}
                      className={`p-3 rounded-xl border-2 text-right transition-all ${
                        canAfford
                          ? 'border-purple-300 bg-purple-50 hover:bg-purple-100 cursor-pointer'
                          : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                      }`}
                    >
                      <div className="font-bold text-sm">{style.label}</div>
                      <div className={`text-xs mt-1 font-black ${canAfford ? 'text-purple-600' : 'text-gray-400'}`}>
                        {style.cost} 🪙
                      </div>
                    </button>
                  );
                })}
              </div>

              {generating && (
                <div className="text-center py-6 space-y-2">
                  <div className="text-4xl animate-spin">🎨</div>
                  <p className="text-sm text-gray-600 font-medium">AI מייצר את האווטר שלך...</p>
                  <p className="text-xs text-gray-400">לוקח כ-10 שניות</p>
                </div>
              )}

              {aiResult && (
                <div className="space-y-3 text-center">
                  <p className="font-bold text-green-600">🎉 האווטר שלך מוכן!</p>
                  <img src={aiResult} alt="ai avatar" className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-purple-400 shadow-lg" />
                  <Button onClick={() => handleSave(aiResult)} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold">
                    ✨ שמור אווטר AI
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}