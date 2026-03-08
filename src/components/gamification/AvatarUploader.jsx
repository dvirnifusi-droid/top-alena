import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import AvatarClothingShop from './AvatarClothingShop';

const AI_AVATAR_COST = 50;

export default function AvatarUploader({
  employeeId,
  employeeName,
  balance,
  onSpendCoins,
}) {
  const fileRef = React.useRef();
  const [uploading, setUploading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [uploadedOriginal, setUploadedOriginal] = React.useState(null);
  const [avatarImage, setAvatarImage] = React.useState(() => {
    try {
      return localStorage.getItem(`avatar_image_${employeeId}`) || null;
    } catch {
      return null;
    }
  });

  React.useEffect(() => {
    if (avatarImage) {
      localStorage.setItem(`avatar_image_${employeeId}`, avatarImage);
    }
  }, [avatarImage, employeeId]);

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
    if (balance < AI_AVATAR_COST) {
      alert(`נדרשים ${AI_AVATAR_COST} 🪙`);
      return;
    }
    setGenerating(true);
    const { url } = await base44.integrations.Core.GenerateImage({
      prompt: `Create a full-body 3D stylized character (Apple Memoji + Fortnite style) from the person in this photo. Show head to toe, wearing a simple blue shirt and black pants, standing facing camera with friendly smile. Clean white background, professional render.`,
      existing_image_urls: [uploadedOriginal],
    });
    await onSpendCoins(AI_AVATAR_COST, 'יצירת אווטר');
    setAvatarImage(url);
    setUploadedOriginal(null);
    setGenerating(false);
  };

  return (
    <div className="space-y-4" dir="rtl">
      {!avatarImage ? (
        <>
          {/* העלאת תמונה */}
          <div className="space-y-4 p-4 border rounded-lg bg-blue-50">
            <p className="text-sm font-bold text-center">📷 העלה תמונה וצור אווטר</p>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

            {!uploadedOriginal ? (
              <Button
                onClick={() => fileRef.current?.click()}
                variant="outline"
                className="w-full h-20 border-dashed border-2 border-blue-300 flex flex-col gap-1 hover:bg-blue-100"
                disabled={uploading}
              >
                {uploading ? (
                  <span className="animate-pulse text-lg">⏳ מעלה...</span>
                ) : (
                  <>
                    <span className="text-2xl">📷</span>
                    <span className="text-xs">לחץ להעלאת תמונה</span>
                  </>
                )}
              </Button>
            ) : (
              <div className="space-y-3">
                <img src={uploadedOriginal} alt="preview" className="w-full rounded-lg border" />
                <Button
                  onClick={handleGenerateAI}
                  disabled={balance < AI_AVATAR_COST || generating}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {generating ? '🎨 AI מייצר...' : `✨ צור אווטר (${AI_AVATAR_COST}🪙)`}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setUploadedOriginal(null)}
                  className="w-full text-xs"
                >
                  🔄 תמונה אחרת
                </Button>
              </div>
            )}

            <p className="text-center text-xs text-gray-500">
              💰 יתרה: <span className="font-bold text-yellow-600">{balance}🪙</span>
            </p>
          </div>
        </>
      ) : (
        <>
          {/* האווטר גדול */}
          <div className="rounded-xl overflow-hidden border-2 border-gray-200 shadow-xl bg-white">
            <img src={avatarImage} alt={employeeName} className="w-full" />
          </div>

          <div className="text-center space-y-1">
            <p className="font-bold text-xl">{employeeName}</p>
            <p className="text-xs text-gray-500">💫 מתנה בזמן עבודה</p>
          </div>




        </>
      )}
    </div>
  );
}