import React, { useState } from 'react';
import { aiScoreCandidate } from '@/functions/aiScoreCandidate';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';

export default function CandidateAiScore({ candidate }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleScore = async () => {
    setLoading(true);
    try {
      const res = await aiScoreCandidate({ candidate_id: candidate.id, candidate_data: candidate });
      if (res.data.score !== undefined) setResult(res.data);
      else toast.error('שגיאה בדירוג');
    } catch {
      toast.error('שגיאה בדירוג');
    }
    setLoading(false);
  };

  const recColor = {
    approved: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-700'
  };

  const recLabel = { approved: 'מומלץ לאישור', pending: 'דורש בדיקה', rejected: 'לא מומלץ' };

  if (candidate.score) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-purple-100 text-purple-700">AI: {candidate.score}/100</Badge>
      </div>
    );
  }

  return (
    <div>
      {!result ? (
        <Button onClick={handleScore} disabled={loading} size="sm" variant="outline">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Sparkles className="w-3 h-3 ml-1 text-purple-500" />דרג</>}
        </Button>
      ) : (
        <Card className="border-purple-200 bg-purple-50/50 text-xs mt-2">
          <CardContent className="pt-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-purple-100 text-purple-700 text-sm font-bold">{result.score}/100</Badge>
              <Badge className={recColor[result.recommendation]}>{recLabel[result.recommendation]}</Badge>
            </div>
            <p>{result.reason}</p>
            {result.strengths?.length > 0 && (
              <div className="flex items-start gap-1">
                <ThumbsUp className="w-3 h-3 text-green-500 mt-0.5" />
                <span>{result.strengths.join(', ')}</span>
              </div>
            )}
            {result.concerns?.length > 0 && (
              <div className="flex items-start gap-1">
                <ThumbsDown className="w-3 h-3 text-red-400 mt-0.5" />
                <span>{result.concerns.join(', ')}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}