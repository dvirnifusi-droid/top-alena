import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { format } from 'date-fns';
import ConfettiEffect from '../components/gamification/ConfettiEffect';

export default function GamificationAdmin() {
  const [pendingRedemptions, setPendingRedemptions] = useState([]);
  const [todayChallenge, setTodayChallenge] = useState(null);
  const [newChallenge, setNewChallenge] = useState({ title: '', description: '', emoji: '🎯', reward_coins: 50 });
  const [shoutoutForm, setShoutoutForm] = useState({ recipient_name: '', recipient_id: '', message: '', emoji: '🔥' });
  const [employees, setEmployees] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [editingReward, setEditingReward] = useState(null);
  const [newReward, setNewReward] = useState({ title: '', description: '', emoji: '🎁', cost: 500, is_active: true });
  const [lootSettings, setLootSettings] = useState({ realRewardChance: 15, coinPrizes: '10,25,50,100,200' });
  const [lootSettingsSaved, setLootSettingsSaved] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    const [txns, challenges, emps, rws] = await Promise.all([
      base44.entities.CoinTransaction.filter({ status: 'pending_approval' }),
      base44.entities.DailyChallenge.filter({ date: today }),
      base44.entities.Employee.filter({ status: 'active' }),
      base44.entities.Reward.list()
    ]);
    setRewards(rws);

    // טעינת הגדרות קופסת הפתעה מ-localStorage
    const saved = localStorage.getItem('lootbox_settings');
    if (saved) setLootSettings(JSON.parse(saved));

    setPendingRedemptions(txns);
    setTodayChallenge(challenges[0] || null);
    setEmployees(emps);

    // לוח מובילים מטבעות
    const allTxns = await base44.entities.CoinTransaction.filter({ status: 'approved' });
    const balances = {};
    allTxns.forEach(t => {
      if (!balances[t.employee_name]) balances[t.employee_name] = 0;
      balances[t.employee_name] += t.amount;
    });
    const sorted = Object.entries(balances).sort((a, b) => b[1] - a[1]).slice(0, 10);
    setLeaderboard(sorted);
  };

  const handleApprove = async (txn) => {
    await base44.entities.CoinTransaction.update(txn.id, { status: 'approved', approved_by: 'מנהל' });
    setPendingRedemptions(prev => prev.filter(t => t.id !== txn.id));
    setShowConfetti(true);
  };

  const handleReject = async (txn) => {
    // החזרת המטבעות - מחיקת הטרנזקציה השלילית + הוספת חיובית
    await base44.entities.CoinTransaction.update(txn.id, { status: 'rejected' });
    await base44.entities.CoinTransaction.create({
      employee_id: txn.employee_id,
      employee_name: txn.employee_name,
      amount: Math.abs(txn.amount),
      reason: `החזר מטבעות - בקשה נדחתה`,
      type: 'bonus',
      trigger: 'redemption',
      status: 'approved'
    });
    setPendingRedemptions(prev => prev.filter(t => t.id !== txn.id));
  };

  const handleCreateChallenge = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    if (todayChallenge) {
      await base44.entities.DailyChallenge.update(todayChallenge.id, { ...newChallenge, date: today, is_active: true, completed_by: [] });
    } else {
      await base44.entities.DailyChallenge.create({ ...newChallenge, date: today, is_active: true, completed_by: [] });
    }
    loadAll();
    setNewChallenge({ title: '', description: '', emoji: '🎯', reward_coins: 50 });
  };

  const handleBonusCoins = async (emp, amount, reason) => {
    await base44.entities.CoinTransaction.create({
      employee_id: emp.id,
      employee_name: emp.full_name,
      amount: Number(amount),
      reason: reason || 'בונוס מנהל',
      type: 'bonus',
      trigger: 'manager_bonus',
      status: 'approved'
    });
    setShowConfetti(true);
    loadAll();
  };

  const handleShoutout = async () => {
    const emp = employees.find(e => e.full_name === shoutoutForm.recipient_name);
    await base44.entities.ShoutOut.create({
      recipient_id: emp?.id || 'unknown',
      recipient_name: shoutoutForm.recipient_name,
      message: shoutoutForm.message,
      emoji: shoutoutForm.emoji,
      auto_generated: false,
      reactions: []
    });
    setShoutoutForm({ recipient_name: '', recipient_id: '', message: '', emoji: '🔥' });
    setShowConfetti(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <ConfettiEffect trigger={showConfetti} message="בוצע! 🎉" emoji="✅" onDone={() => setShowConfetti(false)} />
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-black text-gray-800 mb-6 flex items-center gap-3">
          🎮 מרכז גמיפיקציה - ניהול
        </h1>

        <Tabs defaultValue="redemptions">
          <TabsList className="w-full mb-6 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="redemptions" className="flex-1 min-w-[80px] relative text-xs sm:text-sm px-1 py-2">
              🎁 <span className="hidden sm:inline">פדיונות</span><span className="sm:hidden">פדיון</span>
              {pendingRedemptions.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
                  {pendingRedemptions.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="challenge" className="flex-1 min-w-[80px] text-xs sm:text-sm px-1 py-2">🎯 <span className="hidden sm:inline">אתגר יומי</span><span className="sm:hidden">אתגר</span></TabsTrigger>
            <TabsTrigger value="bonus" className="flex-1 min-w-[80px] text-xs sm:text-sm px-1 py-2">🪙 <span className="hidden sm:inline">בונוס ידני</span><span className="sm:hidden">בונוס</span></TabsTrigger>
            <TabsTrigger value="shoutout" className="flex-1 min-w-[80px] text-xs sm:text-sm px-1 py-2">🔥 <span className="hidden sm:inline">שאאוט</span><span className="sm:hidden">שאאוט</span></TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex-1 min-w-[80px] text-xs sm:text-sm px-1 py-2">🏆 <span className="hidden sm:inline">לוח מובילים</span><span className="sm:hidden">מובילים</span></TabsTrigger>
            <TabsTrigger value="rewards" className="flex-1 min-w-[80px] text-xs sm:text-sm px-1 py-2">🎁 <span className="hidden sm:inline">פרסים</span><span className="sm:hidden">פרסים</span></TabsTrigger>
          </TabsList>

          {/* פדיונות */}
          <TabsContent value="redemptions">
            <div className="space-y-4">
              {pendingRedemptions.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-gray-500">אין בקשות פדיון ממתינות 👍</CardContent></Card>
              ) : pendingRedemptions.map(t => (
                <Card key={t.id} className="border-2 border-orange-200 bg-orange-50">
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-lg">{t.employee_name}</p>
                      <p className="text-gray-600">{t.reason}</p>
                      <p className="text-orange-600 font-bold">{Math.abs(t.amount)} 🪙</p>
                      <p className="text-xs text-gray-400">{new Date(t.created_date).toLocaleDateString('he-IL')}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleApprove(t)} className="bg-green-500 hover:bg-green-600 text-white">✅ אשר</Button>
                      <Button onClick={() => handleReject(t)} variant="outline" className="border-red-300 text-red-600 hover:bg-red-50">❌ דחה</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* אתגר יומי */}
          <TabsContent value="challenge">
            <Card>
              <CardHeader><CardTitle>🎯 הגדר אתגר להיום</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {todayChallenge && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-xl mb-4">
                    <p className="font-bold text-green-700">אתגר פעיל: {todayChallenge.emoji} {todayChallenge.title}</p>
                    <p className="text-sm text-green-600">{todayChallenge.description} | 🪙 {todayChallenge.reward_coins}</p>
                    <p className="text-xs text-gray-500">השלימו: {(todayChallenge.completed_by || []).length} עובדים</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input placeholder="אמוג'י" value={newChallenge.emoji} onChange={e => setNewChallenge(p => ({ ...p, emoji: e.target.value }))} className="w-20" />
                  <Input placeholder="כותרת האתגר" value={newChallenge.title} onChange={e => setNewChallenge(p => ({ ...p, title: e.target.value }))} className="flex-1" />
                </div>
                <Textarea placeholder="תיאור האתגר" value={newChallenge.description} onChange={e => setNewChallenge(p => ({ ...p, description: e.target.value }))} rows={2} />
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium">מטבעות:</label>
                  <Input type="number" value={newChallenge.reward_coins} onChange={e => setNewChallenge(p => ({ ...p, reward_coins: Number(e.target.value) }))} className="w-24" />
                </div>
                <Button onClick={handleCreateChallenge} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold">
                  {todayChallenge ? '🔄 עדכן אתגר' : '✅ פרסם אתגר להיום'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* בונוס ידני */}
          <TabsContent value="bonus">
            <Card>
              <CardHeader><CardTitle>🪙 הענק מטבעות ידנית לעובד</CardTitle></CardHeader>
              <CardContent>
                <BonusForm employees={employees} onBonus={handleBonusCoins} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* שאאוט */}
          <TabsContent value="shoutout">
            <Card>
              <CardHeader><CardTitle>🔥 פרסם שאאוט לעובד מצטיין</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <select
                    className="flex-1 border rounded-lg p-2 text-sm"
                    value={shoutoutForm.recipient_name}
                    onChange={e => setShoutoutForm(p => ({ ...p, recipient_name: e.target.value }))}
                  >
                    <option value="">בחר עובד</option>
                    {employees.map(e => <option key={e.id} value={e.full_name}>{e.full_name}</option>)}
                  </select>
                  <Input placeholder="🔥" value={shoutoutForm.emoji} onChange={e => setShoutoutForm(p => ({ ...p, emoji: e.target.value }))} className="w-16" />
                </div>
                <Textarea
                  placeholder="כותבים כאן מה הוא עשה מדהים... (למשל: מכר 5 סטייקים היום!)"
                  value={shoutoutForm.message}
                  onChange={e => setShoutoutForm(p => ({ ...p, message: e.target.value }))}
                  rows={3}
                />
                <Button onClick={handleShoutout} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold">
                  🚀 פרסם בקיר התהילה!
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* לוח מובילים */}
          <TabsContent value="leaderboard">
            <Card>
              <CardHeader><CardTitle>🏆 לוח מובילי מטבעות</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {leaderboard.map(([name, coins], i) => (
                  <div key={name} className="flex items-center gap-3 p-3 bg-white rounded-xl border">
                    <span className="text-xl w-8">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                    <span className="flex-1 font-semibold">{name}</span>
                    <span className="font-black text-yellow-600">{coins.toLocaleString()} 🪙</span>
                  </div>
                ))}
                {leaderboard.length === 0 && <p className="text-center text-gray-500 py-4">אין נתונים עדיין</p>}
              </CardContent>
            </Card>
          </TabsContent>

          {/* עריכת פרסים */}
          <TabsContent value="rewards">
            <div className="space-y-4">
              {/* הוספת פרס חדש */}
              <Card>
                <CardHeader><CardTitle>➕ {editingReward ? 'עריכת פרס' : 'הוסף פרס חדש'}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input placeholder="אמוג'י" value={newReward.emoji} onChange={e => setNewReward(p => ({ ...p, emoji: e.target.value }))} className="w-20" />
                    <Input placeholder="שם הפרס" value={newReward.title} onChange={e => setNewReward(p => ({ ...p, title: e.target.value }))} className="flex-1" />
                  </div>
                  <Input placeholder="תיאור הפרס" value={newReward.description} onChange={e => setNewReward(p => ({ ...p, description: e.target.value }))} />
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium">מחיר במטבעות:</label>
                    <Input type="number" value={newReward.cost} onChange={e => setNewReward(p => ({ ...p, cost: Number(e.target.value) }))} className="w-28" />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={async () => {
                        if (editingReward) {
                          await base44.entities.Reward.update(editingReward.id, newReward);
                          setEditingReward(null);
                        } else {
                          await base44.entities.Reward.create(newReward);
                        }
                        setNewReward({ title: '', description: '', emoji: '🎁', cost: 500, is_active: true });
                        loadAll();
                      }}
                      disabled={!newReward.title || !newReward.cost}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold"
                    >
                      {editingReward ? '💾 שמור שינויים' : '✅ הוסף פרס'}
                    </Button>
                    {editingReward && (
                      <Button variant="outline" onClick={() => { setEditingReward(null); setNewReward({ title: '', description: '', emoji: '🎁', cost: 500, is_active: true }); }}>
                        ביטול
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* פרסים כשירים לקופסה */}
              <Card className="border-2 border-orange-200 bg-orange-50">
                <CardHeader><CardTitle>🎁 פרסים בקופסת ההפתעה</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-3">סמן אילו פרסים יכולים לצאת בקופסת ההפתעה:</p>
                  {rewards.filter(r => r.is_active).length === 0 ? (
                    <p className="text-orange-600 text-sm font-medium">⚠️ אין פרסים פעילים — הוסף פרסים תחילה</p>
                  ) : (
                    <div className="space-y-2">
                      {rewards.filter(r => r.is_active).map(r => (
                        <div key={r.id} className={`flex items-center gap-3 p-3 bg-white rounded-xl border-2 transition-colors ${r.in_lootbox ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
                          <input
                            type="checkbox"
                            checked={!!r.in_lootbox}
                            onChange={async (e) => {
                              await base44.entities.Reward.update(r.id, { in_lootbox: e.target.checked });
                              loadAll();
                            }}
                            className="w-5 h-5 accent-orange-500 cursor-pointer"
                          />
                          <span className="text-2xl">{r.emoji}</span>
                          <div className="flex-1">
                            <p className="font-bold text-sm">{r.title}</p>
                            {r.description && <p className="text-xs text-gray-500">{r.description}</p>}
                          </div>
                          <span className="font-black text-yellow-600 text-sm">{r.cost?.toLocaleString()} 🪙</span>
                          {r.in_lootbox && <span className="text-xs bg-orange-500 text-white px-2 py-1 rounded-full font-bold">בקופסה ✓</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* הגדרות קופסת הפתעה */}
              <Card className="border-2 border-purple-200 bg-[#F4ECD8]">
                <CardHeader><CardTitle>🎲 הגדרות קופסת הפתעה</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="text-sm font-medium whitespace-nowrap">% סיכוי לפרס אמיתי:</label>
                    <Input
                      type="number" min="0" max="100"
                      value={lootSettings.realRewardChance}
                      onChange={e => setLootSettings(p => ({ ...p, realRewardChance: Number(e.target.value) }))}
                      className="w-20"
                    />
                    <span className="text-sm text-gray-500">(שאר הסיכוי = מטבעות)</span>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium">אפשרויות מטבעות (מופרדות בפסיק):</label>
                    <Input
                      placeholder="10,25,50,100,200"
                      value={lootSettings.coinPrizes}
                      onChange={e => setLootSettings(p => ({ ...p, coinPrizes: e.target.value }))}
                    />
                    <p className="text-xs text-gray-500">כל ערך = כמות שווה. לדוגמה: 10,25,50,100,200</p>
                  </div>
                  <Button
                    onClick={() => {
                      localStorage.setItem('lootbox_settings', JSON.stringify(lootSettings));
                      setLootSettingsSaved(true);
                      setTimeout(() => setLootSettingsSaved(false), 2000);
                    }}
                    className="bg-[#A04A2E] hover:bg-[#7A3722] text-white font-bold"
                  >
                    {lootSettingsSaved ? '✅ נשמר!' : '💾 שמור הגדרות'}
                  </Button>
                </CardContent>
              </Card>

              {/* רשימת פרסים קיימים */}
              {rewards.length === 0 && (
                <Card><CardContent className="p-6 text-center text-gray-500">אין פרסים עדיין — הוסף את הראשון!</CardContent></Card>
              )}
              {rewards.map(r => (
                <Card key={r.id} className={`border-2 ${r.is_active ? 'border-yellow-200 bg-[#FAF5E8]' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <span className="text-3xl">{r.emoji}</span>
                    <div className="flex-1">
                      <p className="font-bold">{r.title}</p>
                      <p className="text-sm text-gray-500">{r.description}</p>
                      <p className="text-yellow-600 font-black text-sm">{r.cost?.toLocaleString()} 🪙</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm" variant="outline"
                        onClick={() => { setEditingReward(r); setNewReward({ title: r.title, description: r.description || '', emoji: r.emoji, cost: r.cost, is_active: r.is_active }); }}
                      >✏️ ערוך</Button>
                      <Button
                        size="sm" variant="outline"
                        className={r.is_active ? 'text-gray-500' : 'text-green-600'}
                        onClick={async () => { await base44.entities.Reward.update(r.id, { is_active: !r.is_active }); loadAll(); }}
                      >{r.is_active ? '🔴 בטל' : '🟢 הפעל'}</Button>
                      <Button
                        size="sm" variant="outline" className="text-red-600 border-red-200"
                        onClick={async () => { await base44.entities.Reward.delete(r.id); loadAll(); }}
                      >🗑️ מחק</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function BonusForm({ employees, onBonus }) {
  const [emp, setEmp] = useState('');
  const [amount, setAmount] = useState(50);
  const [reason, setReason] = useState('');

  const selected = employees.find(e => e.id === emp);

  return (
    <div className="space-y-3">
      <select className="w-full border rounded-lg p-2 text-sm" value={emp} onChange={e => setEmp(e.target.value)}>
        <option value="">בחר עובד</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
      </select>
      <div className="flex gap-2">
        <Input type="number" placeholder="כמות מטבעות" value={amount} onChange={e => setAmount(e.target.value)} className="w-32" />
        <Input placeholder="סיבה (למשל: שירות מעולה היום!)" value={reason} onChange={e => setReason(e.target.value)} className="flex-1" />
      </div>
      <Button
        onClick={() => { if (selected) { onBonus(selected, amount, reason); setEmp(''); setReason(''); setAmount(50); } }}
        disabled={!selected || !amount}
        className="w-full bg-green-500 hover:bg-green-600 text-white font-bold"
      >
        🪙 הענק {amount} מטבעות ל{selected?.full_name || '...'}
      </Button>
    </div>
  );
}