import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { aiDailySummary } from '@/functions/aiDailySummary';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, TrendingUp, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

export default function AiDailySummaryWidget() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    loadLatestSummary();
  }, []);

  const loadLatestSummary = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const suggestions = await base44.entities.AiSuggestion.filter({ type: 'daily_summary' });
      const todaySummary = suggestions.find(s => s.date === today);
      if (todaySummary) {
        setSummary(JSON.parse(todaySummary.content));
        setLastUpdated(new Date(todaySummary.updated_date).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
      }
    } catch {}
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const res = await aiDailySummary({});
      if (res.data.success) {
        setSummary(res.data.summary);
        setLastUpdated(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }));
      }
    } catch {}
    setLoading(false);
  };

  const scoreColor = summary?.daily_score >= 80 ? 'text-green-600' : summary?.daily_score >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <Card className="border-purple-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            סיכום יומי AI
          </CardTitle>
          <div className="flex items-center gap-2">
            {lastUpdated && <span className="text-xs text-muted-foreground">{lastUpdated}</span>}
            <Button onClick={handleRefresh} disabled={loading} size="sm" variant="ghost" className="h-7 w-7 p-0">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!summary ? (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">אין סיכום יומי עדיין</p>
            <Button onClick={handleRefresh} disabled={loading} size="sm">
              {loading ? <><Loader2 className="w-3 h-3 ml-1 animate-spin" />יוצר...</> : <><Sparkles className="w-3 h-3 ml-1" />צור סיכום</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{summary.headline}</p>
              <span className={`text-2xl font-bold ${scoreColor}`}>{summary.daily_score}</span>
            </div>

            {summary.wins?.length > 0 && (
              <div className="space-y-1">
                {summary.wins.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-green-700">
                    <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {w}
                  </div>
                ))}
              </div>
            )}

            {summary.concerns?.length > 0 && (
              <div className="space-y-1">
                {summary.concerns.map((c, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {c}
                  </div>
                ))}
              </div>
            )}

            {summary.action_for_tomorrow && (
              <div className="bg-purple-50 rounded-lg p-2 border border-purple-100">
                <p className="text-xs font-medium text-purple-700">פעולה למחר:</p>
                <p className="text-xs">{summary.action_for_tomorrow}</p>
              </div>
            )}

            {summary.instagram_post_idea && (
              <div className="bg-pink-50 rounded-lg p-2 border border-pink-100">
                <p className="text-xs font-medium text-pink-700">📸 רעיון לאינסטגרם:</p>
                <p className="text-xs">{summary.instagram_post_idea}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}