import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Maximize2, Trash2, Upload } from 'lucide-react';

export default function ApparelCustomizer({ employeeId, employeeAvatar, onAvatarUpdate, balance, onSpendCoins }) {
  const [showDialog, setShowDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [apparel, setApparel] = useState([]);
  const [equipped, setEquipped] = useState({});
  const [ownedApparel, setOwnedApparel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [originalAvatarUrl, setOriginalAvatarUrl] = useState(employeeAvatar);
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState(employeeAvatar);
  const [employeeApparelId, setEmployeeApparelId] = useState(null);

  useEffect(() => {
    loadData();
  }, [employeeId, balance]);

  const loadData = async () => {
    try {
      // טען את כל הביגדים
      const items = await base44.entities.Apparel.list();
      setApparel(items.filter(a => a.is_active));

      // טען את הביגדים של העובד הנוכחי
      const employeeApparel = await base44.entities.EmployeeApparel.filter({ employee_id: employeeId });
      if (employeeApparel.length > 0) {
        const owned = employeeApparel[0].owned_apparel || [];
        setEmployeeApparelId(employeeApparel[0].id);
        setOwnedApparel(owned);
        setEquipped({
          shirt: employeeApparel[0].shirt_id,
          pants: employeeApparel[0].pants_id,
          shoes: employeeApparel[0].shoes_id,
          hat: employeeApparel[0].hat_id,
          accessories: employeeApparel[0].accessories || [],
          outerwear: employeeApparel[0].outerwear_id
        });
      } else {
        // הגדר ברירות מחדל
        const defaults = {
          shirt: items.find(a => a.category === 'shirt' && a.name.includes('אפור'))?.id,
          pants: items.find(a => a.category === 'pants' && a.name.includes('כחול'))?.id,
          shoes: null,
          hat: null,
          accessories: [],
          outerwear: null
        };
        setEquipped(defaults);
        setOwnedApparel([]);
      }
    } catch (error) {
      console.error('Error loading apparel:', error);
    }
    setLoading(false);
  };

  useEffect(() => {
    setOriginalAvatarUrl(employeeAvatar);
    setCurrentAvatarUrl(employeeAvatar);
  }, [employeeAvatar]);

  const handleEquip = async (itemId, category) => {
    // עדכן את הביגדים בלי ליצור אוואטר חדש
    const updated = { ...equipped, [category]: itemId };
    setEquipped(updated);

    // עדכן ב-DB
    if (employeeApparelId) {
      await base44.entities.EmployeeApparel.update(employeeApparelId, updated);
    }
  };

  const handleBuyAndEquip = async (item) => {
    if (balance < item.cost) {
      alert(`אין מספיק מטבעות! נדרשים ${item.cost} 🪙`);
      return;
    }

    // הוסף לרשימת הבגדים שלך
    const newOwned = [...ownedApparel, item.id];
    setOwnedApparel(newOwned);

    // עדכן ב-DB
    if (employeeApparelId) {
      await base44.entities.EmployeeApparel.update(employeeApparelId, { owned_apparel: newOwned });
    }

    // הפחת מטבעות
    if (onSpendCoins) {
      onSpendCoins(item.cost);
    }

    // הלבש את הבגד החדש
    await handleEquip(item.id, item.category);
  };

  const handleUpdateAvatarWithApparel = async () => {
    if (regenerating) return;
    setRegenerating(true);

    try {
      const apparelItems = [];
      
      if (equipped.shirt) {
        const item = apparel.find(a => a.id === equipped.shirt);
        if (item) apparelItems.push(item.wearing_text);
      }
      if (equipped.pants) {
        const item = apparel.find(a => a.id === equipped.pants);
        if (item) apparelItems.push(item.wearing_text);
      }
      if (equipped.shoes) {
        const item = apparel.find(a => a.id === equipped.shoes);
        if (item) apparelItems.push(item.wearing_text);
      }
      if (equipped.hat) {
        const item = apparel.find(a => a.id === equipped.hat);
        if (item) apparelItems.push(item.wearing_text);
      }
      if (equipped.outerwear) {
        const item = apparel.find(a => a.id === equipped.outerwear);
        if (item) apparelItems.push(item.wearing_text);
      }

      const wearingText = apparelItems.join(', ') || 'wearing casual clothes';
      const prompt = `Take this 3D character and update their clothing: ${wearingText}. Keep the same person, same pose, same style, just update the clothes to match the description. High-quality 3D render, studio lighting, solid white background.`;

      const { url } = await base44.integrations.Core.GenerateImage({
        prompt,
        existing_image_urls: [originalAvatarUrl]
      });

      setCurrentAvatarUrl(url);
      if (onAvatarUpdate) {
        onAvatarUpdate(url);
      }
      
      // שמור את התמונה החדשה ל-DB
      if (employeeApparelId) {
        try {
          await base44.entities.EmployeeApparel.update(employeeApparelId, { avatar_url: url });
        } catch (error) {
          console.error('Error saving avatar URL:', error);
        }
      }
    } catch (error) {
      console.error('Error updating avatar:', error);
      alert('שגיאה בעדכון הדמות');
    }
    setRegenerating(false);
  };

  const handleUploadNewAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setOriginalAvatarUrl(file_url);
      setCurrentAvatarUrl(file_url);
      if (onAvatarUpdate) {
        onAvatarUpdate(file_url);
      }
      
      // שמור את התמונה החדשה ל-DB
      if (employeeApparelId) {
        try {
          await base44.entities.EmployeeApparel.update(employeeApparelId, { avatar_url: file_url });
        } catch (error) {
          console.error('Error saving avatar URL:', error);
        }
      }
      setShowUploadDialog(false);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('שגיאה בהעלאת התמונה');
    }
    setUploading(false);
  };

  const handleDeleteAvatar = async () => {
    if (!window.confirm('האם אתה בטוח שאתה רוצה למחוק את הדמות?')) return;
    setOriginalAvatarUrl(null);
    setCurrentAvatarUrl(null);
    if (onAvatarUpdate) {
      onAvatarUpdate(null);
    }
    setShowUploadDialog(false);
  };

  const handlePublishAvatar = async () => {
    if (!currentAvatarUrl) {
      alert('אין דמות להצגה. אנא הגדר דמות תחילה.');
      return;
    }
    
    if (employeeApparelId) {
      try {
        await base44.entities.EmployeeApparel.update(employeeApparelId, { avatar_url: currentAvatarUrl });
        alert('✅ הדמות שלך פורסמה בסלון הדמויות!');
      } catch (error) {
        console.error('Error publishing avatar:', error);
        alert('שגיאה בפרסום הדמות');
      }
    }
  };



  if (loading) return <div>טוען...</div>;

  const categories = [
    { key: 'shirt', label: '👕 חולצות', value: equipped.shirt },
    { key: 'pants', label: '👖 מכנסיים', value: equipped.pants },
    { key: 'shoes', label: '👟 נעליים', value: equipped.shoes },
    { key: 'hat', label: '🎩 כובעים', value: equipped.hat },
    { key: 'outerwear', label: '🧥 חיצוניות', value: equipped.outerwear }
  ];

  return (
    <div>
      {/* תצוגת האוואטר המקורי */}
      <div className="mb-4">
        {currentAvatarUrl ? (
          <div className="flex flex-col items-center gap-3">
            <img src={currentAvatarUrl} alt="avatar" className="w-24 h-24 rounded-full object-cover border-4 border-purple-400 shadow-lg cursor-pointer hover:scale-110 transition-transform" onClick={() => setShowPreview(true)} title="לחץ להגדלה" />
            <Button
              onClick={() => setShowUploadDialog(true)}
              variant="outline"
              size="sm"
              className="text-xs"
            >
              <Upload className="w-3 h-3 mr-1" /> החלף תמונה
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-24 h-24 rounded-full bg-gray-200 border-4 border-gray-300 flex items-center justify-center text-gray-400 text-xs">
              אין תמונה
            </div>
            <Button
              onClick={() => setShowUploadDialog(true)}
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-xs"
            >
              <Upload className="w-3 h-3 mr-1" /> העלה תמונה
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Button
          onClick={() => setShowDialog(true)}
          className="w-full bg-purple-600 hover:bg-purple-700"
        >
          🎨 עדכן הלבוש
        </Button>
        <Button
          onClick={handlePublishAvatar}
          className="w-full bg-green-600 hover:bg-green-700"
        >
          📢 פרסום דמות לסלון
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogTitle>בחר הלבוש לדמות</DialogTitle>
          
          {/* תצוגה ל-Desktop: grid פשוט */}
          <div className="hidden sm:block space-y-4">
            {currentAvatarUrl && (
              <div className="flex justify-center mb-4 p-4 bg-gray-50 rounded-lg">
                <img src={currentAvatarUrl} alt="avatar preview" className="h-32 object-contain" />
              </div>
            )}
            {categories.map(cat => {
               const currentItem = apparel.find(a => a.id === cat.value);
               const categoryItems = apparel.filter(a => a.category === cat.key);

               return (
                 <div key={cat.key} className="space-y-2">
                   <p className="font-bold text-sm">
                     {cat.label}
                     {currentItem && <span className="text-xs text-gray-500 mr-2">({currentItem.name})</span>}
                   </p>
                   <div className="grid grid-cols-3 gap-2">
                    {categoryItems.map(item => {
                      const isOwned = ownedApparel.includes(item.id);
                      const isEquipped = cat.value === item.id;

                      return (
                        <div key={item.id} className={`p-2 rounded-lg border-2 text-sm transition-all flex flex-col ${
                          isEquipped && isOwned
                            ? 'border-green-500 bg-green-50'
                            : isOwned
                            ? 'border-blue-300 bg-blue-50'
                            : 'border-gray-300 bg-gray-100'
                        }`}>
                          <div className="text-2xl mb-1 text-center">{item.emoji}</div>
                          <div className="text-xs font-semibold text-center mb-1">{item.name}</div>
                          {isOwned ? (
                            <button
                              onClick={() => handleEquip(item.id, cat.key)}
                              className="text-xs bg-green-500 hover:bg-green-600 text-white py-1 rounded"
                            >
                              ✅ בבעלותך
                            </button>
                          ) : (
                            <button
                              onClick={() => handleBuyAndEquip(item)}
                              disabled={balance < item.cost}
                              className="text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-1 rounded"
                            >
                              {item.cost} 🪙
                            </button>
                          )}
                        </div>
                      );
                    })}
                   </div>
                 </div>
               );
             })}
          </div>

          {/* תצוגה ל-Mobile: tabs */}
          <div className="sm:hidden">
            {currentAvatarUrl && (
              <div className="flex justify-center mb-3 p-3 bg-gray-50 rounded-lg">
                <img src={currentAvatarUrl} alt="avatar preview" className="h-24 object-contain" />
              </div>
            )}
            <Tabs defaultValue="shirt" className="w-full">
              <TabsList className="flex overflow-x-auto gap-1 w-full bg-transparent p-0 border-b border-gray-200 mb-4">
                {categories.map(cat => (
                  <TabsTrigger key={cat.key} value={cat.key} className="text-xs px-2.5 py-2 whitespace-nowrap flex-shrink-0">
                    {cat.label.split(' ')[0]}
                  </TabsTrigger>
                ))}
              </TabsList>

              {categories.map(cat => {
                const currentItem = apparel.find(a => a.id === cat.value);
                const categoryItems = apparel.filter(a => a.category === cat.key);

                return (
                  <TabsContent key={cat.key} value={cat.key} className="space-y-3">
                    {currentItem && (
                      <div className="text-sm text-gray-600 text-center">
                        נבחר כרגע: <strong>{currentItem.name}</strong>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {categoryItems.map(item => {
                        const isOwned = ownedApparel.includes(item.id);
                        const isEquipped = cat.value === item.id;

                        return (
                          <div key={item.id} className={`p-2 rounded-lg border-2 text-sm transition-all flex flex-col ${
                            isEquipped && isOwned
                              ? 'border-green-500 bg-green-50'
                              : isOwned
                              ? 'border-blue-300 bg-blue-50'
                              : 'border-gray-300 bg-gray-100'
                          }`}>
                            <div className="text-2xl mb-1 text-center">{item.emoji}</div>
                            <div className="text-xs font-semibold text-center mb-1">{item.name}</div>
                            {isOwned ? (
                              <button
                                onClick={() => handleEquip(item.id, cat.key)}
                                className="text-xs bg-green-500 hover:bg-green-600 text-white py-1 rounded"
                              >
                                ✅ בחר
                              </button>
                            ) : (
                              <button
                                onClick={() => handleBuyAndEquip(item)}
                                disabled={balance < item.cost}
                                className="text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white py-1 rounded"
                              >
                                {item.cost} 🪙
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>

          <Button 
            onClick={handleUpdateAvatarWithApparel}
            disabled={regenerating}
            className="w-full mt-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {regenerating ? '⏳ מעדכן דמות...' : '✨ שמור וחדש בגדים'}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl p-0 border-0 bg-gradient-to-b from-purple-50 to-white">
          <DialogTitle className="sr-only">תצוגה מוגדלת של הדמות</DialogTitle>
          <div className="flex flex-col items-center justify-center p-8 min-h-[500px]">
            {currentAvatarUrl && (
              <img src={currentAvatarUrl} alt="avatar fullscreen" className="w-full max-h-[600px] object-contain" />
            )}
            <p className="text-center text-gray-600 text-sm mt-4">כך הדמות שלך נראית עם הלבוש הנוכחי</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג העלאת תמונה חדשה */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogTitle>עדכן את הדמות שלך</DialogTitle>
          <div className="space-y-4 py-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={handleUploadNewAvatar}
                disabled={uploading}
                className="hidden"
                id="avatar-upload"
              />
              <label htmlFor="avatar-upload" className="cursor-pointer">
                <Button
                  as="div"
                  className="bg-blue-600 hover:bg-blue-700 cursor-pointer"
                  disabled={uploading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'מעלה...' : 'בחר תמונה חדשה'}
                </Button>
              </label>
              <p className="text-xs text-gray-500">או גרור תמונה לכאן</p>
            </div>
            
            {currentAvatarUrl && (
              <Button
                onClick={handleDeleteAvatar}
                variant="destructive"
                className="w-full"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                מחק את הדמות הנוכחית
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}