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



  const handleSave = (url) => {
    onSave(url);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <p className="text-sm text-gray-600 text-center font-medium">העלה תמונה שלך - AI יהפוך אותה ל-3D avatar!</p>
      <input type="file" accept="image/*" ref={fileRef} onChange={handleFileChange} className="hidden" />
      
      <Button
        onClick={() => fileRef.current?.click()}
        variant="outline"
        className="w-full h-24 border-dashed border-2 flex flex-col gap-1"
        disabled={uploading || generating}
      >
        {uploading ? (
          <span className="animate-pulse">⏳ מעלה...</span>
        ) : generating ? (
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl animate-spin">🎨</span>
            <span className="text-xs">יוצר אווטר...</span>
          </div>
        ) : aiResult ? (
          <>
            <img src={aiResult} alt="avatar" className="w-12 h-12 rounded-full object-cover mx-auto" />
            <span className="text-xs text-gray-500">לחץ להעלאת תמונה חדשה</span>
          </>
        ) : (
          <>
            <span className="text-2xl">📷</span>
            <span className="text-sm">לחץ להעלאת תמונה</span>
          </>
        )}
      </Button>

      {aiResult && (
        <div className="space-y-3 text-center p-4 bg-green-50 rounded-xl border-2 border-green-300">
          <p className="font-bold text-green-700">🎉 האווטר שלך מוכן!</p>
          <img src={aiResult} alt="ai avatar" className="w-20 h-20 rounded-full object-cover mx-auto border-4 border-green-500 shadow-lg" />
          <Button onClick={() => handleSave(aiResult)} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold">
            ✨ שמור כאווטר שלי
          </Button>
        </div>
      )}
    </div>
  );
}