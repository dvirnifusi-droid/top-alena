import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function WeeklyLeaderboardWidget() {
  const [top, setTop] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        // Get coin transactions from the last 7 days
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const transactions = await base44.entities.CoinTransaction.list('-created_date', 200);
        const recent = transactions.filter(t => t.amount > 0 && new Date(t.created_date) >= weekAgo);
        // Aggregate by employee
        const totals = {};
        recent.forEach(t => {
          if (!t.employee_name) return;
          totals[t.employee_name] = (totals[t.employee_name] || 0) + t.amount;
        });
        const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 3);
        setTop(sorted);
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  const medals = ['🥇', '🥈', '🥉'];

  return (
    <Link to={createPageUrl("Leaderboard")}>
      <Card className="hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02]">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            מובילי השבוע
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {loading ? <p className="text-sm text-muted-foreground">טוען...</p> :
            top.length === 0 ? <p className="text-sm text-muted-foreground">אין נתונים עדיין</p> :
            <div className="space-y-2">
              {top.map(([name, coins], i) => (
                <div key={name} className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-2">
                    <span>{medals[i]}</span>
                    <span className="truncate max-w-[120px]">{name.split(' ')[0]}</span>
                  </span>
                  <span className="text-xs font-bold text-yellow-600">{coins} 🪙</span>
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </Link>
  );
}