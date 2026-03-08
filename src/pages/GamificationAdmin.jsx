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

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');

    const [txns, challenges, emps] = await Promise.all([
      base44.entities.CoinTransaction.filter({ status: 'pending_approval' }),
      base44.entities.DailyChallenge.filter({ date: today }),
      base44.entities.Employee.filter({ status: 'active' })
    ]);

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
          <TabsList className="w-full mb-6">
            <TabsTrigger value="redemptions" className="flex-1 relative">
              🎁 פדיונות
              {pendingRedemptions.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">
                  {pendingRedemptions.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="challenge" className="flex-1">🎯 אתגר יומי</TabsTrigger>
            <TabsTrigger value="bonus" className="flex-1">🪙 בונוס ידני</TabsTrigger>
            <TabsTrigger value="shoutout" className="flex-1">🔥 שאאוט</TabsTrigger>
            <TabsTrigger value="leaderboard" className="flex-1">🏆 לוח מובילים</TabsTrigger>
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