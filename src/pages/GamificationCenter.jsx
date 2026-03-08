import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import ConfettiEffect from '../components/gamification/ConfettiEffect';
import ShoutOutFeed from '../components/gamification/ShoutOutFeed';
import DailyChallengeCard from '../components/gamification/DailyChallengeCard';

const REWARDS = [
  { id: 'meal', title: 'ארוחה חינם במשמרת 🍽️', cost: 500, emoji: '🍽️', description: 'ארוחת עובד על הבית' },
  { id: 'early_exit', title: 'יציאה מוקדמת ⏰', cost: 2000, emoji: '⏰', description: 'יציאה מוקדמת ביום לבחירתך' },
  { id: 'bonus', title: 'בונוס כספי 200₪ 💵', cost: 5000, emoji: '💵', description: 'בונוס כספי אמיתי' },
  { id: 'day_off', title: 'יום חופש 🏖️', cost: 8000, emoji: '🏖️', description: 'יום חופש מיוחד' },
  { id: 'gift', title: 'כרטיס מתנה 50₪ 🎁', cost: 1500, emoji: '🎁', description: 'כרטיס מתנה לרשת לבחירתך' },
];

const RANKS = [
  { min: 0, max: 499, title: 'מתחיל', emoji: '🥉', color: 'text-amber-600' },
  { min: 500, max: 1999, title: 'מלצר מקצוען', emoji: '🥈', color: 'text-gray-500' },
  { min: 2000, max: 4999, title: 'כוכב המשמרת', emoji: '⭐', color: 'text-yellow-500' },
  { min: 5000, max: 9999, title: 'Ninja Waiter', emoji: '🥷', color: 'text-indigo-600' },
  { min: 10000, max: Infinity, title: 'אלוף המסעדה', emoji: '👑', color: 'text-purple-600' },
];

export default function GamificationCenter() {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(0);
  const [showRedeem, setShowRedeem] = useState(false);
  const [selectedReward, setSelectedReward] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [confettiMsg, setConfettiMsg] = useState('');
  const [pendingRedemptions, setPendingRedemptions] = useState([]);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const u = await base44.auth.me();
    setUser(u);
    const emps = await base44.entities.Employee.filter({ status: 'active' });
    const me = emps.find(e => e.email?.toLowerCase() === u.email?.toLowerCase());
    setEmployee(me || null);
    if (me) {
      loadTransactions(me.id);
    }
  };

  const loadTransactions = async (empId) => {
    const txns = await base44.entities.CoinTransaction.filter({ employee_id: empId });
    setTransactions(txns.sort((a, b) => new Date(b.created_date) - new Date(a.created_date)));
    const approved = txns.filter(t => t.status === 'approved');
    setBalance(approved.reduce((sum, t) => sum + (t.amount || 0), 0));
    const pending = txns.filter(t => t.status === 'pending_approval');
    setPendingRedemptions(pending);
  };

  const handleRedeemRequest = async (reward) => {
    if (!employee || balance < reward.cost) return;
    await base44.entities.CoinTransaction.create({
      employee_id: employee.id,
      employee_name: employee.full_name,
      amount: -reward.cost,
      reason: `בקשת פדיון: ${reward.title}`,
      type: 'redeemed',
      trigger: 'redemption',
      status: 'pending_approval',
      redemption_reward: reward.id
    });
    setShowRedeem(false);
    setSelectedReward(null);
    setConfettiMsg(`בקשת הפדיון נשלחה למנהל! 🙌`);
    setShowConfetti(true);
    loadTransactions(employee.id);
  };

  const getRank = (bal) => RANKS.find(r => bal >= r.min && bal <= r.max) || RANKS[0];
  const rank = getRank(balance);
  const nextRank = RANKS[RANKS.indexOf(rank) + 1];
  const progressToNext = nextRank ? Math.min(100, ((balance - rank.min) / (nextRank.min - rank.min)) * 100) : 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50 p-4 pb-20" dir="rtl">
      <ConfettiEffect trigger={showConfetti} message={confettiMsg} emoji="🏆" onDone={() => setShowConfetti(false)} />

      <div className="max-w-2xl mx-auto space-y-5">
        {/* כרטיס מעמד */}
        <Card className="bg-gradient-to-br from-yellow-400 to-orange-500 text-white border-0 shadow-xl overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-yellow-100 text-sm font-medium">הדרגה שלך</p>
                <h2 className="text-3xl font-black flex items-center gap-2">{rank.emoji} {rank.title}</h2>
                <p className="text-yellow-100 text-sm">{user?.full_name}</p>
              </div>
              <div className="text-center">
                <div className="text-5xl font-black">{balance.toLocaleString()}</div>
                <div className="text-yellow-100 text-sm">מטבעות</div>
              </div>
            </div>

            {nextRank && (
              <div>
                <div className="flex justify-between text-xs text-yellow-100 mb-1">
                  <span>לדרגה הבאה: {nextRank.emoji} {nextRank.title}</span>
                  <span>{(nextRank.min - balance).toLocaleString()} מטבעות נוספים</span>
                </div>
                <div className="w-full bg-white/30 rounded-full h-3">
                  <div className="bg-white h-3 rounded-full transition-all" style={{ width: `${progressToNext}%` }} />
                </div>
              </div>
            )}

            <Button
              onClick={() => setShowRedeem(true)}
              className="mt-4 w-full bg-white text-orange-600 font-bold hover:bg-yellow-50 shadow-lg"
            >
              🎁 פדה פרס עם המטבעות שלך
            </Button>
          </CardContent>
        </Card>

        {/* אתגר יומי */}
        {employee && (
          <DailyChallengeCard
            employeeId={employee.id}
            employeeName={employee.full_name}
            onCoinsEarned={(amount, msg) => {
              setConfettiMsg(msg);
              setShowConfetti(true);
              loadTransactions(employee.id);
            }}
          />
        )}

        {/* פדיון בהמתנה */}
        {pendingRedemptions.length > 0 && (
          <Card className="border-2 border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <p className="font-bold text-blue-700 flex items-center gap-2">⏳ בקשות פדיון ממתינות לאישור מנהל</p>
              {pendingRedemptions.map(r => (
                <div key={r.id} className="text-sm text-blue-600 mt-1 flex items-center gap-2">
                  <Badge className="bg-blue-200 text-blue-800">ממתין</Badge>
                  {r.reason} ({Math.abs(r.amount)} 🪙)
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* קיר תהילה + היסטוריה */}
        <Tabs defaultValue="shoutouts">
          <TabsList className="w-full">
            <TabsTrigger value="shoutouts" className="flex-1">🏆 קיר תהילה</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">📜 היסטוריית מטבעות</TabsTrigger>
          </TabsList>
          <TabsContent value="shoutouts" className="mt-3">
            <ShoutOutFeed currentEmployeeId={employee?.id} limit={8} />
          </TabsContent>
          <TabsContent value="history" className="mt-3">
            <div className="space-y-2">
              {transactions.slice(0, 20).map(t => (
                <div key={t.id} className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm border">
                  <div>
                    <p className="font-medium text-sm text-gray-800">{t.reason}</p>
                    <p className="text-xs text-gray-400">{new Date(t.created_date).toLocaleDateString('he-IL')}</p>
                    {t.status === 'pending_approval' && <Badge className="text-xs bg-orange-100 text-orange-700">ממתין לאישור</Badge>}
                    {t.status === 'rejected' && <Badge className="text-xs bg-red-100 text-red-700">נדחה</Badge>}
                  </div>
                  <span className={`text-lg font-black ${t.amount > 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {t.amount > 0 ? '+' : ''}{t.amount} 🪙
                  </span>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="text-center text-gray-500 py-8">עדיין אין מטבעות - התחל להרוויח! 💪</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* דיאלוג פדיון */}
      <Dialog open={showRedeem} onOpenChange={setShowRedeem}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">🎁 פדה את הפרס שלך</DialogTitle>
          </DialogHeader>
          <p className="text-center text-2xl font-black text-yellow-600 mb-4">{balance.toLocaleString()} 🪙 זמינים</p>
          <div className="space-y-3">
            {REWARDS.map(reward => {
              const canAfford = balance >= reward.cost;
              return (
                <button
                  key={reward.id}
                  disabled={!canAfford}
                  onClick={() => setSelectedReward(reward)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-right ${canAfford ? 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100 cursor-pointer' : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'}`}
                >
                  <span className="text-2xl">{reward.emoji}</span>
                  <div className="flex-1">
                    <p className="font-bold text-sm">{reward.title}</p>
                    <p className="text-xs text-gray-500">{reward.description}</p>
                  </div>
                  <span className={`font-black text-sm ${canAfford ? 'text-yellow-600' : 'text-gray-400'}`}>{reward.cost.toLocaleString()} 🪙</span>
                </button>
              );
            })}
          </div>
          {selectedReward && (
            <div className="mt-4 p-3 bg-orange-50 border-2 border-orange-300 rounded-xl">
              <p className="font-bold text-center text-orange-700 mb-3">בחרת: {selectedReward.emoji} {selectedReward.title}</p>
              <p className="text-xs text-center text-gray-600 mb-3">הבקשה תישלח למנהל לאישור</p>
              <Button className="w-full bg-orange-500 hover:bg-orange-600" onClick={() => handleRedeemRequest(selectedReward)}>
                שלח בקשה למנהל ✅
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}