import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';

const AI_FACE_COST = 50; // עלות הפיכת תמונה לאווטר AI

export default function AvatarUploader({
  employeeId,
  employeeName,
  balance,
  onFaceGenerated,
  onSpendCoins,
}) {
  const fileRef = React.useRef();
  const [uploading, setUploading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [uploadedOriginal, setUploadedOriginal] = React.useState(null);
  const [generatedFace, setGeneratedFace] = React.useState(null);

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
    if (balance < AI_FACE_COST) {
      alert(`נדרשים ${AI_FACE_COST} 🪙, יש לך ${balance} 🪙`);
      return;
    }
    setGenerating(true);
    try {
      const { url } = await base44.integrations.Core.GenerateImage({
        prompt: `A high-end 3D stylized character portrait in the style of Apple Memoji and Fortnite. The character must have a large head, expressive eyes, and maintain the exact facial features, hair style, and hair color of the person in the uploaded photo. Use soft studio lighting, realistic 3D textures (skin and hair), and a clean, solid white background (or transparent). The character should have a friendly smile, look directly at the camera, and have a high-quality Pixar-style render finish. Aspect ratio 1:1 (Square). High quality professional render.`,
        existing_image_urls: [uploadedOriginal],
      });
      setGeneratedFace(url);
    } catch (err) {
      alert('❌ שגיאה בהפקת AI: ' + err.message);
    }
    setGenerating(false);
  };

  const handleSaveFace = async () => {
    if (!generatedFace) return;
    await onSpendCoins(AI_FACE_COST, 'שיפור פנים AI לאווטר');
    onFaceGenerated(generatedFace);
    setUploadedOriginal(null);
    setGeneratedFace(null);
  };

  const handleUseDirect = () => {
    if (!uploadedOriginal) return;
    onFaceGenerated(uploadedOriginal);
    setUploadedOriginal(null);
    setGeneratedFace(null);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <p className="text-sm font-bold text-center">📷 העלה סלפי והפוך לפנים אווטר</p>

      {/* בוחר תמונה */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
      <Button
        onClick={() => fileRef.current?.click()}
        variant="outline"
        className="w-full h-20 border-dashed border-2 border-purple-300 flex flex-col gap-1 hover:bg-purple-50"
        disabled={uploading}
      >
        {uploading ? (
          <span className="animate-pulse text-lg">⏳ מעלה...</span>
        ) : uploadedOriginal ? (
          <div className="flex flex-col items-center gap-1">
            <img src={uploadedOriginal} alt="original" className="w-12 h-12 rounded-full object-cover" />
            <span className="text-xs">שנה תמונה</span>
          </div>
        ) : (
          <>
            <span className="text-2xl">📷</span>
            <span className="text-xs font-medium">לחץ להעלאת סלפי</span>
          </>
        )}
      </Button>

      {/* אפשרויות עם תמונה */}
      {uploadedOriginal && !generatedFace && (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 text-center">בחר אפשרות:</p>
          <Button
            onClick={handleUseDirect}
            variant="outline"
            className="w-full h-10 text-xs bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100"
          >
            ✓ השתמש בתמונה כמו שהיא
          </Button>
          <Button
            onClick={handleGenerateAI}
            disabled={balance < AI_FACE_COST || generating}
            className="w-full h-10 text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold"
          >
            {generating ? '🎨 AI מייצר...' : `🤖 הפוך ל-AI אווטר (${AI_FACE_COST}🪙)`}
          </Button>
        </div>
      )}

      {/* תצוגה של AI שנוצר */}
      {generatedFace && (
        <div className="space-y-3 p-4 bg-green-50 rounded-xl border-2 border-green-300">
          <p className="text-xs font-bold text-green-700 text-center">✨ אווטר AI שנוצר:</p>
          <img src={generatedFace} alt="generated" className="w-full aspect-square rounded-xl object-cover" />
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => {
                setGeneratedFace(null);
                setUploadedOriginal(null);
              }}
              variant="outline"
              className="text-xs h-9"
            >
              ❌ בטל
            </Button>
            <Button
              onClick={handleSaveFace}
              className="text-xs h-9 bg-green-600 hover:bg-green-700 text-white font-bold"
            >
              ✅ שמור פנים
            </Button>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-gray-500">
        💰 יתרה: <span className="font-bold text-yellow-600">{balance}🪙</span>
      </p>
    </div>
  );
}