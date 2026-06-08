import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function MyRankWidget() {
  const [data, setData] = useState({ rank: null, coins: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const user = await base44.auth.me();
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
        const transactions = await base44.entities.CoinTransaction.list('-created_date', 300);
        const recent = transactions.filter(t => t.amount > 0 && new Date(t.created_date) >= weekAgo);
        const totals = {};
        recent.forEach(t => {
          if (!t.employee_name) return;
          totals[t.employee_name] = (totals[t.employee_name] || 0) + t.amount;
        });
        const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        const myName = user.full_name;
        const myIdx = sorted.findIndex(([name]) => name === myName);
        const myCoins = totals[myName] || 0;
        setData({ rank: myIdx >= 0 ? myIdx + 1 : null, coins: myCoins, total: sorted.length });
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };

  return (
    <Link to={createPageUrl("Leaderboard")}>
      <Card className="hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02]">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-[#F4ECD8] rounded-xl"><Trophy className="w-5 h-5 text-yellow-600" /></div>
            <span className="text-xs text-muted-foreground">השבוע</span>
          </div>
          <p className="text-2xl font-black text-foreground">
            {loading ? '...' : data.rank ? (medals[data.rank] || `#${data.rank}`) : '—'}
          </p>
          <p className="text-sm font-semibold text-muted-foreground mt-1">🏆 הדירוג שלי</p>
          {!loading && data.coins > 0 && (
            <p className="text-xs text-yellow-600 mt-1">{data.coins} 🪙 מ-{data.total} עובדים</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}