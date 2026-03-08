import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';

const UPGRADE_COST = 50; // מטבעות לשיפור AI

export default function AvatarUploader({ currentAvatar, balance, onSave, onSpendCoins }) {
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
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
    
    // בנייה של prompt דינמי לפי אביזרים שקנה
    let apparelText = 'wearing a basic grey t-shirt and blue jeans';
    if (window.__employeeApparel) {
      const items = window.__employeeApparel.map(a => a.wearing_text).filter(Boolean);
      if (items.length > 0) apparelText = 'wearing ' + items.join(', ');
    }
    
    const prompt = `Full body 3D stylized character avatar, Pixar/Fortnite style, standing in a neutral T-pose. Character ${apparelText}. High-quality 3D render, studio lighting, solid white background. Maintain facial features from the uploaded photo. Professional 3D game character design.`;
    
    const { url } = await base44.integrations.Core.GenerateImage({
      prompt,
      existing_image_urls: [file_url]
    });
    setAiResult(url);
    setGenerating(false);
    setUploading(false);
  };



  const handleSave = async (url) => {
    setShowPreview(false);
    
    // שמור בחנות הביגדים את הבגדים הנוכחיים כברירת מחדל
    const defaultApparel = [
      { category: 'shirt', name: 'חולצה אפורה', wearing_text: 'wearing a basic grey t-shirt' },
      { category: 'pants', name: 'ג\'ינס כחול', wearing_text: 'wearing blue jeans' }
    ];
    
    // שמור לגלובל כדי שה-prompt הבא יוכל לגשת
    window.__employeeApparel = defaultApparel;
    
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
          <img src={aiResult} alt="ai avatar" className="w-20 h-20 rounded-full object-cover mx-auto border-4 border-green-500 shadow-lg cursor-pointer hover:opacity-80" onClick={() => setShowPreview(true)} />
          <div className="flex gap-2">
            <Button onClick={() => handleSave(aiResult)} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold">
              ✨ שמור כאווטר שלי
            </Button>
            <Button onClick={() => setShowPreview(true)} variant="outline" className="flex-1">
              👁️ צפה בהגדלה
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl p-0 border-0">
          <DialogTitle className="sr-only">תצוגה מקדימה של האווטר</DialogTitle>
          <div className="relative bg-gradient-to-b from-blue-50 to-white p-8 rounded-xl flex flex-col items-center gap-4">
            <img src={aiResult} alt="avatar fullscreen" className="w-full max-h-[70vh] object-contain" />
            <div className="flex gap-2 w-full">
              <Button onClick={() => handleSave(aiResult)} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold">
                ✨ שמור כאווטר שלי
              </Button>
              <Button onClick={() => setShowPreview(false)} variant="outline" className="flex-1">
                סגור
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}