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
import BadgesDisplay, { computeBadges } from '../components/gamification/BadgesDisplay';
import AvatarUploader from '../components/gamification/AvatarUploader';
import WhatsAppAvatar, { AvatarRenderer } from '../components/gamification/WhatsAppAvatar';

// תצוגה מיני של האווטר בכרטיס הפרופיל
function AvatarPreview({ employeeId }) {
  const skin = (() => { try { return JSON.parse(localStorage.getItem(`avatar_skin_${employeeId}`) || 'null') || { color: '#d4a574' }; } catch { return { color: '#d4a574' }; } })();
  const hair = (() => { try { return JSON.parse(localStorage.getItem(`avatar_hair_${employeeId}`) || 'null') || { type: 'long', color: '#3f2817' }; } catch { return { type: 'long', color: '#3f2817' }; } })();
  const eyes = (() => { try { return JSON.parse(localStorage.getItem(`avatar_eyes_${employeeId}`) || 'null') || { color: '#6b4226', direction: 0 }; } catch { return { color: '#6b4226', direction: 0 }; } })();
  const body = (() => { try { return JSON.parse(localStorage.getItem(`avatar_body_${employeeId}`) || 'null') || { type: 'shirt', color: '#3b82f6', accent: '#fbbf24' }; } catch { return { type: 'shirt', color: '#3b82f6', accent: '#fbbf24' }; } })();
  const accessories = (() => { try { return JSON.parse(localStorage.getItem(`avatar_accessories_${employeeId}`) || 'null') || []; } catch { return []; } })();
  return <AvatarRenderer skin={skin} hair={hair} eyes={eyes} body={body} accessories={accessories} />;
}
import { Sun, Palette } from 'lucide-react';

const RANKS = [
  { min: 0,     max: 499,      title: 'מתחיל',         emoji: '🥉', color: 'from-amber-400 to-orange-500' },
  { min: 500,   max: 1999,     title: 'מלצר מקצוען',   emoji: '🥈', color: 'from-gray-400 to-slate-500' },
  { min: 2000,  max: 4999,     title: 'כוכב המשמרת',   emoji: '⭐', color: 'from-yellow-400 to-amber-500' },
  { min: 5000,  max: 9999,     title: 'Ninja Waiter',   emoji: '🥷', color: 'from-indigo-500 to-purple-600' },
  { min: 10000, max: Infinity, title: 'אלוף המסעדה',   emoji: '👑', color: 'from-yellow-500 to-orange-600' },
];

const THEMES = [
  { id: 'light',  label: 'לבן',   icon: Sun,     preview: 'bg-gradient-to-br from-white to-gray-100 border border-gray-200' },
  { id: 'purple', label: 'סגול',  icon: Palette, preview: 'bg-gradient-to-br from-purple-100 to-purple-200 border border-purple-300' },
  { id: 'green',  label: 'ירוק',  icon: Palette, preview: 'bg-gradient-to-br from-green-100 to-emerald-200 border border-green-300' },
  { id: 'pink',   label: 'ורוד',  icon: Palette, preview: 'bg-gradient-to-br from-pink-100 to-rose-200 border border-pink-300' },
  { id: 'blue',   label: 'כחול',  icon: Palette, preview: 'bg-gradient-to-br from-blue-100 to-sky-200 border border-blue-300' },
];

const AVATAR_OPTIONS = ['😎', '🤩', '🥷', '👨‍🍳', '👩‍🍳', '🦁', '🐯', '🔥', '⭐', '💎', '🎯', '🏆'];

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
  const [rewards, setRewards] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('gc_theme') || 'light');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('gc_avatar') || '😎');
  const [avatarIsImage, setAvatarIsImage] = useState(() => localStorage.getItem('gc_avatar_is_image') === 'true');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const u = await base44.auth.me();
    setUser(u);
    const emps = await base44.entities.Employee.filter({ status: 'active' });
    const me = emps.find(e => e.email?.toLowerCase() === u.email?.toLowerCase());
    setEmployee(me || null);
    if (me) loadTransactions(me.id);
    const rws = await base44.entities.Reward.filter({ is_active: true });
    setRewards(rws);
  };

  const loadTransactions = async (empId) => {
    const txns = await base44.entities.CoinTransaction.filter({ employee_id: empId });
    const sorted = txns.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    setTransactions(sorted);
    const approved = sorted.filter(t => t.status === 'approved');
    setBalance(approved.reduce((sum, t) => sum + (t.amount || 0), 0));
    setPendingRedemptions(sorted.filter(t => t.status === 'pending_approval'));
  };

  const handleRedeemRequest = async (reward) => {
    if (!employee || balance < reward.cost) return;
    await base44.entities.CoinTransaction.create({
      employee_id: employee.id, employee_name: employee.full_name,
      amount: -reward.cost, reason: `בקשת פדיון: ${reward.title}`,
      type: 'redeemed', trigger: 'redemption', status: 'pending_approval',
      redemption_reward: reward.id || reward.title
    });
    setShowRedeem(false); setSelectedReward(null);
    setConfettiMsg('בקשת הפדיון נשלחה למנהל! 🙌');
    setShowConfetti(true);
    loadTransactions(employee.id);
  };

  const setAndSaveTheme = (id) => {
    setTheme(id);
    localStorage.setItem('gc_theme', id);
    setShowThemePicker(false);
  };
  const setAndSaveAvatar = (a, isImage = false) => {
    setAvatar(a);
    setAvatarIsImage(isImage);
    localStorage.setItem('gc_avatar', a);
    localStorage.setItem('gc_avatar_is_image', isImage ? 'true' : 'false');
    setShowAvatarPicker(false);
  };

  const handleSpendCoins = async (cost, reason) => {
    if (!employee) return;
    await base44.entities.CoinTransaction.create({
      employee_id: employee.id,
      employee_name: employee.full_name,
      amount: -cost,
      reason,
      type: 'redeemed',
      trigger: 'redemption',
      status: 'approved'
    });
    loadTransactions(employee.id);
  };

  const getRank = (bal) => RANKS.find(r => bal >= r.min && bal <= r.max) || RANKS[0];
  const rank = getRank(balance);
  const nextRank = RANKS[RANKS.indexOf(rank) + 1];
  const progressToNext = nextRank ? Math.min(100, ((balance - rank.min) / (nextRank.min - rank.min)) * 100) : 100;

  const badges = computeBadges({ balance, transactions });
  const earnedBadges = badges.filter(b => b.earned);

  // Stats
  const totalEarned = transactions.filter(t => t.amount > 0 && t.status === 'approved').reduce((s, t) => s + t.amount, 0);
  const totalRedeemed = transactions.filter(t => t.type === 'redeemed').length;
  const challengesDone = transactions.filter(t => t.trigger === 'daily_challenge').length;
  const shiftsCompleted = transactions.filter(t => t.trigger === 'shift_completed').length;

  return (
    <div className="min-h-screen p-4 pb-20" dir="rtl">
      <ConfettiEffect trigger={showConfetti} message={confettiMsg} emoji="🏆" onDone={() => setShowConfetti(false)} />

      <div className="max-w-2xl mx-auto space-y-5">

        {/* כפתורי ניווט מהיר */}
        <div className="flex justify-between items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowThemePicker(true)}
            className="gap-2"
          >
            <Palette className="w-4 h-4" />
            🎨 ערכת נושא
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => document.getElementById('badges-tab')?.click()}
            className="gap-2"
          >
            🏅 {earnedBadges.length} תגים
          </Button>
        </div>

        {/* כרטיס פרופיל + דרגה */}
        <Card className={`bg-gradient-to-br ${rank.color} text-white border-0 shadow-xl overflow-hidden`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-4 mb-4">
              {/* אווטאר */}
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setShowAvatarPicker(true)}
                  className="w-20 h-20 rounded-2xl bg-white/20 hover:bg-white/30 transition-all shadow-lg border-2 border-white/40 overflow-hidden flex items-center justify-center"
                  title="פתח בונה אווטר"
                >
                  <AvatarPreview employeeId={employee?.id || 'guest'} />
                </button>
                <span className="text-white/60 text-xs">✏️ עצב</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-sm">שלום,</p>
                <h2 className="text-2xl font-black leading-tight truncate">{user?.full_name}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-lg">{rank.emoji}</span>
                  <span className="font-bold text-white/90">{rank.title}</span>
                  {earnedBadges.length > 0 && (
                    <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">{earnedBadges.length} תגים</span>
                  )}
                </div>
              </div>
              <div className="text-center flex-shrink-0">
                <div className="text-5xl font-black">{balance.toLocaleString()}</div>
                <div className="text-white/80 text-sm">מטבעות</div>
              </div>
            </div>

            {nextRank && (
              <div>
                <div className="flex justify-between text-xs text-white/80 mb-1">
                  <span>לדרגה הבאה: {nextRank.emoji} {nextRank.title}</span>
                  <span>{(nextRank.min - balance).toLocaleString()} נוספים</span>
                </div>
                <div className="w-full bg-white/30 rounded-full h-3">
                  <div className="bg-white h-3 rounded-full transition-all duration-500" style={{ width: `${progressToNext}%` }} />
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

        {/* סטטיסטיקות אישיות — "השיא שלי" */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">📊 השיא שלי</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'סה״כ הרווחתי', value: `${totalEarned.toLocaleString()} 🪙`, sub: 'מטבעות' },
              { label: 'משמרות עם מטבעות', value: shiftsCompleted, sub: 'משמרות' },
              { label: 'אתגרים שסיימתי', value: challengesDone, sub: 'אתגרים' },
              { label: 'פרסים שפדיתי', value: totalRedeemed, sub: 'פרסים' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="rounded-2xl p-3 text-center bg-muted/50">
                <p className="text-xl font-black text-foreground">{value}</p>
                <p className="text-xs font-medium mt-0.5 text-muted-foreground">{label}</p>
              </div>
            ))}
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
              <p className="font-bold text-blue-700">⏳ בקשות פדיון ממתינות לאישור מנהל</p>
              {pendingRedemptions.map(r => (
                <div key={r.id} className="text-sm text-blue-600 mt-1 flex items-center gap-2">
                  <Badge className="bg-blue-200 text-blue-800">ממתין</Badge>
                  {r.reason}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* טאבים */}
        <Tabs defaultValue="badges">
          <TabsList className="w-full">
            <TabsTrigger id="badges-tab" value="badges" className="flex-1 text-xs sm:text-sm px-1">🏅 תגים</TabsTrigger>
            <TabsTrigger value="shoutouts" className="flex-1 text-xs sm:text-sm px-1">🏆 תהילה</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 text-xs sm:text-sm px-1">📜 היסטוריה</TabsTrigger>
          </TabsList>

          <TabsContent value="badges" className="mt-3">
            <Card>
              <CardContent className="p-4">
                <BadgesDisplay balance={balance} transactions={transactions} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="shoutouts" className="mt-3">
            <ShoutOutFeed currentEmployeeId={employee?.id} limit={8} />
          </TabsContent>

          <TabsContent value="history" className="mt-3">
            <div className="space-y-2">
              {transactions.slice(0, 20).map(t => (
                <div key={t.id} className="flex items-center justify-between rounded-xl p-3 shadow-sm border bg-card">
                  <div>
                    <p className="font-medium text-sm text-foreground">{t.reason}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.created_date).toLocaleDateString('he-IL')}</p>
                    {t.status === 'pending_approval' && <Badge className="text-xs bg-orange-100 text-orange-700">ממתין לאישור</Badge>}
                    {t.status === 'rejected' && <Badge className="text-xs bg-red-100 text-red-700">נדחה</Badge>}
                  </div>
                  <span className={`text-lg font-black ${t.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.amount > 0 ? '+' : ''}{t.amount} 🪙
                  </span>
                </div>
              ))}
              {transactions.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">עדיין אין מטבעות - התחל להרוויח! 💪</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* דיאלוג בחירת אווטאר */}
      <Dialog open={showAvatarPicker} onOpenChange={setShowAvatarPicker}>
        <DialogContent dir="rtl" className="max-w-sm w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">🧑‍🎤 בנה את האווטר שלך</DialogTitle>
          </DialogHeader>
          <WhatsAppAvatar
           balance={balance}
           employeeId={employee?.id || 'guest'}
           employeeName={employee?.full_name || user?.full_name || ''}
           onSpendCoins={handleSpendCoins}
          />
        </DialogContent>
      </Dialog>

      {/* דיאלוג ערכת נושא */}
      <Dialog open={showThemePicker} onOpenChange={setShowThemePicker}>
        <DialogContent dir="rtl" className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-center">🎨 ערכת נושא לכל האפליקציה</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-center text-gray-500 mb-2">השינוי יחול על כל הדפים</p>
          <div className="grid grid-cols-2 gap-3 p-2">
            {THEMES.map(t => {
              const Icon = t.icon;
              const isSelected = theme === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setAndSaveTheme(t.id)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all ${isSelected ? 'border-primary ring-2 ring-primary/30 scale-105' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className={`w-full h-12 rounded-xl ${t.preview}`} />
                  <div className="flex items-center gap-1">
                    <Icon className="w-3 h-3" />
                    <span className="text-sm font-medium">{t.label}</span>
                    {isSelected && <span className="text-primary font-bold text-xs">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* דיאלוג פדיון */}
      <Dialog open={showRedeem} onOpenChange={setShowRedeem}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-xl">🎁 פדה את הפרס שלך</DialogTitle>
          </DialogHeader>
          <p className="text-center text-2xl font-black text-yellow-600 mb-4">{balance.toLocaleString()} 🪙 זמינים</p>
          <div className="space-y-3">
            {rewards.map(reward => {
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