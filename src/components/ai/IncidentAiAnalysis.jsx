import React, { useState } from 'react';
import { aiAnalyzeIncident } from '@/functions/aiAnalyzeIncident';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function IncidentAiAnalysis({ incidentId }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const res = await aiAnalyzeIncident({ incident_id: incidentId });
      if (res.data.success) setAnalysis(res.data.analysis);
      else toast.error('שגיאה בניתוח');
    } catch {
      toast.error('שגיאה בניתוח');
    }
    setLoading(false);
  };

  const priorityColor = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-green-100 text-green-700' };

  if (!incidentId) return null;

  return (
    <div className="mt-3">
      {!analysis ? (
        <Button onClick={handleAnalyze} disabled={loading} size="sm" variant="outline" className="w-full">
          {loading ? <><Loader2 className="w-3 h-3 ml-1 animate-spin" />מנתח...</> : <><Sparkles className="w-3 h-3 ml-1 text-purple-500" />ניתוח AI + מניעה</>}
        </Button>
      ) : (
        <Card className="border-amber-200 bg-amber-50/50 text-sm">
          <CardContent className="pt-3 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="font-medium">ניתוח AI</span>
              <Badge className={priorityColor[analysis.priority] || 'bg-gray-100'}>{analysis.priority}</Badge>
            </div>
            <p><span className="font-medium">גורם: </span>{analysis.root_cause}</p>
            <p><span className="font-medium">פעולה מיידית: </span>{analysis.immediate_action}</p>
            <p><span className="font-medium">מניעה: </span>{analysis.prevention_plan}</p>
            {analysis.team_training_needed && (
              <p className="text-amber-700"><span className="font-medium">הכשרה: </span>{analysis.team_training_needed}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}