import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift, TrendingUp, Users } from 'lucide-react';

export default function TreatsReport() {
  const [stats, setStats] = useState({
    totalTreats: 0,
    totalSpent: 0,
    uniqueCustomers: 0,
    topTreats: [],
    loading: true
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // טעינת כל הכניסות שמומשו פינוקים
        const entries = await base44.entities.QueueEntry.list('-timestamp_register', 1000);
        const treatedEntries = entries.filter(e => e.selected_treat_id && e.time_credits_spent);

        // טעינת כל הפינוקים
        const allTreats = await base44.entities.TimeTreat.list();

        // סיכום
        const totalTreats = treatedEntries.length;
        const totalSpent = treatedEntries.reduce((sum, e) => sum + (e.time_credits_spent || 0), 0);
        const uniqueCustomers = new Set(treatedEntries.map(e => e.phone)).size;

        // top treats
        const treatCounts = {};
        treatedEntries.forEach(e => {
          const treatId = e.selected_treat_id;
          treatCounts[treatId] = (treatCounts[treatId] || 0) + 1;
        });

        const topTreats = Object.entries(treatCounts)
          .map(([treatId, count]) => {
            const treat = allTreats.find(t => t.id === treatId);
            return {
              name: treat?.name || 'לא ידוע',
              emoji: treat?.emoji || '🎁',
              count,
              cost: treat?.cost || 0
            };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        setStats({
          totalTreats,
          totalSpent,
          uniqueCustomers,
          topTreats,
          loading: false
        });
      } catch (e) {
        console.error('Error fetching treats data:', e);
        setStats(prev => ({ ...prev, loading: false }));
      }
    };

    fetchData();
  }, []);

  if (stats.loading) {
    return (
      <Card className="bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8] border-pink-200">
        <CardContent className="p-6 text-center">
          <p className="text-gray-500">טוען נתונים...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8] border-pink-200 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-[#A04A2E] to-[#A04A2E] text-white">
        <CardTitle className="flex items-center gap-2">
          <Gift className="w-5 h-5" />
          דוח פינוקים מומשו
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* סטטיסטיקות */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-4 border border-pink-200 text-center">
            <p className="text-3xl font-black text-[#A04A2E]">{stats.totalTreats}</p>
            <p className="text-xs text-gray-600 mt-1">פינוקים מומשו</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-pink-200 text-center">
            <p className="text-3xl font-black text-[#A04A2E]">{stats.totalSpent}</p>
            <p className="text-xs text-gray-600 mt-1">💰 מטבעות הוצאו</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-pink-200 text-center">
            <p className="text-3xl font-black text-[#A04A2E]">{stats.uniqueCustomers}</p>
            <p className="text-xs text-gray-600 mt-1">👥 לקוחות ייחודיים</p>
          </div>
        </div>

        {/* פינוקים פופולריים */}
        {stats.topTreats.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-black text-sm text-gray-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              פינוקים הפופולריים ביותר
            </h4>
            <div className="space-y-2">
              {stats.topTreats.map((treat, i) => (
                <div key={i} className="flex items-center justify-between bg-white p-3 rounded-lg border border-[#F4ECD8]">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{treat.emoji}</span>
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{treat.name}</p>
                      <p className="text-xs text-gray-500">{treat.cost} 💰 לפי מחיר</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-[#A04A2E]">{treat.count}</p>
                    <p className="text-xs text-gray-500">פעמים</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* הערה */}
        <div className="bg-[#FAF5E8] border border-yellow-200 rounded-lg p-3">
          <p className="text-xs text-yellow-800">
            <span className="font-bold">💡 הערה:</span> פינוקים מומשו כאשר לקוח בחר treat בזמן ההמתנה בתור
          </p>
        </div>
      </CardContent>
    </Card>
  );
}