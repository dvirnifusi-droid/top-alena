import React, { useState } from 'react';
import { aiAnalyzeShiftReport } from '@/functions/aiAnalyzeShiftReport';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ShiftReportAiAnalysis({ reportId }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const res = await aiAnalyzeShiftReport({ report_id: reportId });
      if (res.data.success) setAnalysis(res.data.analysis);
      else toast.error('שגיאה בניתוח');
    } catch {
      toast.error('שגיאה בניתוח');
    }
    setLoading(false);
  };

  if (!reportId) return null;

  return (
    <div className="mt-4">
      {!analysis ? (
        <Button onClick={handleAnalyze} disabled={loading} className="w-full" variant="outline">
          {loading ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />מנתח משמרת...</> : <><Sparkles className="w-4 h-4 ml-2 text-purple-500" />ניתוח AI של המשמרת</>}
        </Button>
      ) : (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-500" />
              ניתוח AI
              <Badge className="bg-purple-100 text-purple-700">{analysis.score}/100</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium">{analysis.overall_assessment}</p>

            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-start gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div><span className="font-medium">הכנסות: </span>{analysis.revenue_analysis}</div>
              </div>
              {analysis.top_issue && (
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div><span className="font-medium">בעיה דחופה: </span>{analysis.top_issue}</div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div><span className="font-medium">צוות: </span>{analysis.staff_highlights}</div>
              </div>
            </div>

            {analysis.recommendations?.length > 0 && (
              <div>
                <p className="font-medium mb-1">המלצות:</p>
                <ul className="space-y-1">
                  {analysis.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-purple-500">•</span> {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-white rounded-lg p-2 border border-purple-100">
              <p className="text-xs font-medium text-purple-700 mb-1">תחזית למשמרת הבאה:</p>
              <p className="text-xs">{analysis.forecast_next_shift}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}