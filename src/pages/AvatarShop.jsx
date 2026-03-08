import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ConfettiEffect from '../components/gamification/ConfettiEffect';
import { AvatarRenderer } from '../components/gamification/WhatsAppAvatar';

export default function AvatarShop() {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [storeItems, setStoreItems] = useState([]);
  const [balance, setBalance] = useState(0);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewEquipped, setPreviewEquipped] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiMsg, setConfettiMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('hat');

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const u = await base44.auth.me();
    setUser(u);
    
    const emps = await base44.entities.Employee.filter({ status: 'active' });
    const me = emps.find(e => e.email?.toLowerCase() === u.email?.toLowerCase());
    setEmployee(me);

    if (me) {
      const avatars = await base44.entities.Avatar.filter({ employee_id: me.id });
      if (avatars.length > 0) {
        setAvatar(avatars[0]);
        setPreviewEquipped(avatars[0].equipped_items || []);
      } else {
        const newAvatar = await base44.entities.Avatar.create({ 
          employee_id: me.id,
          equipped_items: [],
          inventory: []
        });
        setAvatar(newAvatar);
      }

      const txns = await base44.entities.CoinTransaction.filter({ employee_id: me.id, status: 'approved' });
      const bal = txns.reduce((sum, t) => sum + (t.amount || 0), 0);
      setBalance(Math.max(0, bal));
    }

    const items = await base44.entities.StoreItem.filter({ is_active: true });
    setStoreItems(items);
    setLoading(false);
  };

  const rarityColors = {
    common: 'bg-gray-200 text-gray-800',
    rare: 'bg-blue-200 text-blue-800',
    legendary: 'bg-yellow-200 text-yellow-800',
  };

  const handlePreview = (item) => {
    setSelectedItem(item);
    setShowPreview(true);
    setPreviewEquipped(prev => {
      const updated = [...prev];
      const existing = updated.findIndex(id => {
        const itemData = storeItems.find(i => i.id === id);
        return itemData?.category === item.category;
      });
      if (existing >= 0) updated.splice(existing, 1);
      updated.push(item.id);
      return updated;
    });
  };

  const handlePurchase = async (item) => {
    if (balance < item.cost) {
      alert(`נדרשים ${item.cost} 🪙. יש לך ${balance} 🪙`);
      return;
    }

    if (!employee || !avatar) return;

    await base44.entities.CoinTransaction.create({
      employee_id: employee.id,
      employee_name: employee.full_name,
      amount: -item.cost,
      reason: `קנייה: ${item.name}`,
      type: 'redeemed',
      trigger: 'redemption',
      status: 'approved',
      redemption_reward: item.id,
    });

    const newInventory = [...(avatar.inventory || []), item.id];
    await base44.entities.Avatar.update(avatar.id, {
      inventory: newInventory,
      equipped_items: [item.id, ...(avatar.equipped_items || [])].slice(0, 10),
    });

    setBalance(balance - item.cost);
    setAvatar(prev => ({
      ...prev,
      inventory: newInventory,
      equipped_items: [item.id, ...(prev.equipped_items || [])].slice(0, 10),
    }));

    setConfettiMsg(`🎉 קנית ${item.name}!`);
    setShowConfetti(true);

    playLevelUpSound();
    setShowPreview(false);
    init();
  };

  const handleEquip = async (itemId) => {
    if (!avatar) return;
    const item = storeItems.find(i => i.id === itemId);
    if (!item) return;

    const updated = [...(avatar.equipped_items || [])];
    const existing = updated.findIndex(id => {
      const itemData = storeItems.find(i => i.id === id);
      return itemData?.category === item.category;
    });
    
    if (existing >= 0) updated.splice(existing, 1);
    updated.push(itemId);

    await base44.entities.Avatar.update(avatar.id, {
      equipped_items: updated,
    });

    setAvatar(prev => ({ ...prev, equipped_items: updated }));
    setPreviewEquipped(updated);
  };

  const playLevelUpSound = () => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  };

  if (loading) return <div className="p-6 text-center">⏳ טוען...</div>;

  const categoryItems = storeItems.filter(item => item.category === selectedCategory);
  const ownedIds = avatar?.inventory || [];
  const equippedIds = avatar?.equipped_items || [];

  return (
    <div className="min-h-screen p-4 pb-20" dir="rtl">
      <ConfettiEffect trigger={showConfetti} message={confettiMsg} emoji="🎁" onDone={() => setShowConfetti(false)} />

      <div className="max-w-6xl mx-auto space-y-6">
        {/* כרטיס עליון */}
        <Card className="bg-gradient-to-r from-purple-100 to-pink-100">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-black text-gray-900 mb-2">🛍️ חנות האוואטר</h1>
                <p className="text-lg font-bold text-purple-700">💰 יש לך: {balance.toLocaleString()} 🪙</p>
              </div>
              <div className="text-right text-sm text-gray-600">
                <p>💎 {ownedIds.length} פריטים בבעלותך</p>
                <p>👕 {equippedIds.length} פריטים לבושים</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* עמודה שמאל - תצוגת אווטר */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-center">👤 האווטר שלך</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="w-full">
                  {avatar && (
                    <AvatarRenderer
                      faceUrl={avatar.face_url}
                      body={avatar.customization || {}}
                      accessories={equippedIds}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* עמודה ימין - חנות */}
          <div className="lg:col-span-2 space-y-4">
            {/* קטגוריות */}
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm font-bold mb-3">📂 בחר קטגוריה:</p>
              <div className="grid grid-cols-3 gap-2">
                {['hat', 'glasses', 'earring', 'necklace', 'shirt', 'pants'].map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`py-2 px-3 rounded-lg font-bold text-xs transition ${
                      selectedCategory === cat
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 hover:bg-gray-200'
                    }`}
                  >
                    {cat === 'hat' && '👒'}
                    {cat === 'glasses' && '👓'}
                    {cat === 'earring' && '💍'}
                    {cat === 'necklace' && '📿'}
                    {cat === 'shirt' && '👕'}
                    {cat === 'pants' && '👖'}
                  </button>
                ))}
              </div>
            </div>

            {/* רשת פריטים */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {categoryItems.map(item => {
                const isOwned = ownedIds.includes(item.id);
                const isEquipped = equippedIds.includes(item.id);
                const canAfford = balance >= item.cost;

                return (
                  <div
                    key={item.id}
                    className={`rounded-xl p-3 border-2 transition cursor-pointer ${
                      isEquipped
                        ? 'border-green-500 bg-green-50'
                        : isOwned
                        ? 'border-blue-300 bg-blue-50'
                        : canAfford
                        ? 'border-yellow-300 bg-yellow-50'
                        : 'border-gray-200 bg-gray-50 opacity-50'
                    }`}
                    onClick={() => handlePreview(item)}
                  >
                    <div className="aspect-square bg-gray-200 rounded-lg mb-2 flex items-center justify-center text-3xl overflow-hidden">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <span>📦</span>
                      )}
                    </div>
                    <p className="text-xs font-bold truncate">{item.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <Badge className={`text-xs ${rarityColors[item.rarity] || rarityColors.common}`}>
                        {item.rarity}
                      </Badge>
                      <span className={`text-xs font-bold ${isOwned ? 'text-green-700' : 'text-yellow-700'}`}>
                        {isOwned ? '✓' : `${item.cost}🪙`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* דיאלוג תצוגה מקדימה */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{selectedItem?.name}</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4">
              <div className="aspect-square bg-gray-100 rounded-xl flex items-center justify-center text-6xl overflow-hidden">
                {selectedItem.image_url ? (
                  <img src={selectedItem.image_url} alt={selectedItem.name} className="w-full h-full object-cover" />
                ) : (
                  <span>📦</span>
                )}
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-700 mb-3">תצוגה מקדימה:</p>
                {avatar && (
                  <div className="w-full">
                    <AvatarRenderer
                      faceUrl={avatar.face_url}
                      body={avatar.customization || {}}
                      accessories={previewEquipped}
                    />
                  </div>
                )}
              </div>
              <div className="space-y-2">
                {avatar?.inventory?.includes(selectedItem.id) ? (
                  <>
                    <Button
                      onClick={() => {
                        handleEquip(selectedItem.id);
                        setShowPreview(false);
                      }}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      {equippedIds.includes(selectedItem.id) ? '✓ לובש כרגע' : '👕 הלבש'}
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={() => handlePurchase(selectedItem)}
                    disabled={balance < selectedItem.cost}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    קנה ב-{selectedItem.cost} 🪙
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}