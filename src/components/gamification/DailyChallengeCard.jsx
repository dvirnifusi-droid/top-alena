import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import ConfettiEffect from './ConfettiEffect';

export default function DailyChallengeCard({ employeeId, employeeName, onCoinsEarned }) {
  const [challenge, setChallenge] = useState(null);
  const [completed, setCompleted] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadChallenge();
  }, [employeeId]);

  const loadChallenge = async () => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const challenges = await base44.entities.DailyChallenge.filter({ date: today, is_active: true });
    if (challenges.length > 0) {
      const c = challenges[0];
      setChallenge(c);
      setCompleted((c.completed_by || []).includes(employeeId));
    }
  };

  const handleComplete = async () => {
    if (!challenge || completed || !employeeId) return;
    setLoading(true);

    const updatedCompletedBy = [...(challenge.completed_by || []), employeeId];
    await base44.entities.DailyChallenge.update(challenge.id, { completed_by: updatedCompletedBy });

    await base44.entities.CoinTransaction.create({
      employee_id: employeeId,
      employee_name: employeeName,
      amount: challenge.reward_coins || 50,
      reason: `השלמת אתגר יומי: ${challenge.title}`,
      type: 'earned',
      trigger: 'daily_challenge',
      status: 'approved'
    });

    setCompleted(true);
    setShowConfetti(true);
    onCoinsEarned?.(challenge.reward_coins || 50, `השלמת: ${challenge.title}! 🎯`);
    setLoading(false);
  };

  if (!challenge) return null;

  return (
    <>
      <ConfettiEffect
        trigger={showConfetti}
        message={`בום! ${challenge.reward_coins} מטבעות! 🎯`}
        emoji="🎯"
        onDone={() => setShowConfetti(false)}
      />
      <Card className={`border-2 ${completed ? 'border-green-300 bg-green-50' : 'border-yellow-300 bg-gradient-to-r from-yellow-50 to-amber-50'}`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{challenge.emoji || '🎯'}</span>
              <div>
                <p className="text-xs font-bold text-yellow-600 uppercase tracking-wide">אתגר היום</p>
                <p className="font-bold text-gray-800">{challenge.title}</p>
                <p className="text-sm text-gray-600">{challenge.description}</p>
              </div>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-1 bg-yellow-400 text-white rounded-full px-3 py-1 text-sm font-bold">
                🪙 {challenge.reward_coins || 50}
              </div>
              {completed ? (
                <div className="text-green-600 font-bold text-sm flex items-center gap-1">✅ הושלם!</div>
              ) : (
                <Button size="sm" onClick={handleComplete} disabled={loading}
                  className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 text-xs">
                  {loading ? '...' : 'סיימתי! 🎉'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}