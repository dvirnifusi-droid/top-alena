import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Maximize2 } from 'lucide-react';

export default function ApparelCustomizer({ employeeId, employeeAvatar, onAvatarUpdate, balance, onSpendCoins }) {
  const [showDialog, setShowDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [apparel, setApparel] = useState([]);
  const [equipped, setEquipped] = useState({});
  const [ownedApparel, setOwnedApparel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
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
    setCurrentAvatarUrl(employeeAvatar);
  }, [employeeAvatar]);

  const handleEquip = async (itemId, category) => {
    if (regenerating) return;

    setRegenerating(true);
    try {
      // בנה את ה-wearing text מהביגדים החדשים
      const apparelItems = [];
      if (category === 'shirt' || equipped.shirt) {
        const shirt = apparel.find(a => a.id === (category === 'shirt' ? itemId : equipped.shirt));
        if (shirt) apparelItems.push(shirt.wearing_text);
      }
      if (category === 'pants' || equipped.pants) {
        const pants = apparel.find(a => a.id === (category === 'pants' ? itemId : equipped.pants));
        if (pants) apparelItems.push(pants.wearing_text);
      }
      if (category === 'shoes' || equipped.shoes) {
        const shoes = apparel.find(a => a.id === (category === 'shoes' ? itemId : equipped.shoes));
        if (shoes) apparelItems.push(shoes.wearing_text);
      }
      if (category === 'hat' || equipped.hat) {
        const hat = apparel.find(a => a.id === (category === 'hat' ? itemId : equipped.hat));
        if (hat) apparelItems.push(hat.wearing_text);
      }
      if (category === 'outerwear' || equipped.outerwear) {
        const outerwear = apparel.find(a => a.id === (category === 'outerwear' ? itemId : equipped.outerwear));
        if (outerwear) apparelItems.push(outerwear.wearing_text);
      }
      equipped.accessories?.forEach(accId => {
        const acc = apparel.find(a => a.id === accId);
        if (acc) apparelItems.push(acc.wearing_text);
      });

      const wearingText = apparelItems.join(', ');
      const prompt = `Full body 3D stylized character avatar, Pixar/Fortnite style, standing in a neutral T-pose. Character ${wearingText || 'wearing a basic grey t-shirt and blue jeans'}. High-quality 3D render, studio lighting, solid white background. Professional 3D game character design.`;

      // טען את התמונה הנוכחית (נדרוש שתשמרו את URL בשדה)
      const { url } = await base44.integrations.Core.GenerateImage({
        prompt
      });

      // עדכן את הביגדים בעובד
      const updated = { ...equipped, [category]: itemId };
      setEquipped(updated);

      // עדכן ב-DB
      if (employeeApparelId) {
        await base44.entities.EmployeeApparel.update(employeeApparelId, updated);
      }

      // עדכן את האווטר
      setCurrentAvatarUrl(url);
      onAvatarUpdate(url);

      // אפקט חגיגי
      if (window.triggerConfetti) window.triggerConfetti();
    } catch (error) {
      console.error('Error updating apparel:', error);
    }
    setRegenerating(false);
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
      <Button
        onClick={() => setShowDialog(true)}
        className="w-full bg-purple-600 hover:bg-purple-700"
      >
        🎨 עדכן הלבוש
      </Button>

      {currentAvatarUrl && (
        <div className="mt-3 flex justify-center">
          <img src={currentAvatarUrl} alt="avatar" className="w-24 h-24 rounded-full object-cover border-4 border-purple-400 shadow-lg cursor-pointer hover:scale-110 transition-transform" onClick={() => setShowPreview(true)} title="לחץ להגדלה" />
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>בחר הלבוש לדמות</DialogTitle>
          <div className="space-y-4" dir="rtl">
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
                     const isOwned = equipped.owned?.includes(item.id);
                     const isEquipped = cat.value === item.id;

                     return (
                       <button
                         key={item.id}
                         onClick={() => handleEquip(item.id, cat.key)}
                         disabled={regenerating || !isOwned}
                         className={`p-2 rounded-lg border-2 text-sm transition-all opacity-${isOwned ? '100' : '50'} cursor-${isOwned ? 'pointer' : 'not-allowed'} ${
                           isEquipped
                             ? 'border-green-500 bg-green-50'
                             : isOwned
                             ? 'border-blue-300 bg-blue-50 hover:border-blue-400'
                             : 'border-gray-300 bg-gray-100'
                         }`}
                       >
                         <div className="text-2xl mb-1">{item.emoji}</div>
                         <div className="text-xs font-semibold">{item.name}</div>
                         <div className="text-xs text-gray-500">
                           {isOwned ? '✅ בבעלותך' : `${item.cost} 🪙`}
                         </div>
                       </button>
                     );
                   })}
                  </div>
                </div>
              );
            })}
          </div>
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
    </div>
  );
}