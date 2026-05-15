import React, { useState } from 'react';
import { aiGenerateBriefing } from '@/functions/aiGenerateBriefing';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles, Loader2, Target, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function BriefingAiGenerator({ onInsert, shiftType }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await aiGenerateBriefing({
        shift_type: shiftType || 'dinner',
        date: new Date().toISOString().split('T')[0]
      });
      if (res.data.success) setBriefing(res.data.briefing);
      else toast.error('שגיאה ביצירת התדריך');
    } catch {
      toast.error('שגיאה ביצירת התדריך');
    }
    setLoading(false);
  };

  const handleInsert = () => {
    if (briefing && onInsert) {
      const text = `**${briefing.title}**\n\n${briefing.greeting}\n\n${briefing.focus_points?.map(f => `• ${f}`).join('\n')}\n\n🎯 יעד: ${briefing.target_for_shift}\n\n${briefing.closing_message}`;
      onInsert(text);
      setBriefing(null);
    }
  };

  return (
    <div className="space-y-3">
      <Button onClick={handleGenerate} disabled={loading} variant="outline" className="w-full">
        {loading ? <><Loader2 className="w-4 h-4 ml-2 animate-spin" />יוצר תדריך...</> : <><Sparkles className="w-4 h-4 ml-2 text-purple-500" />צור תדריך עם AI</>}
      </Button>

      {briefing && (
        <Card className="border-purple-200 bg-purple-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{briefing.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="italic text-muted-foreground">{briefing.greeting}</p>
            {briefing.focus_points?.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                <span>{f}</span>
              </div>
            ))}
            {briefing.target_for_shift && (
              <div className="flex items-center gap-2 bg-white rounded p-2 border border-purple-100">
                <Target className="w-4 h-4 text-purple-500" />
                <span className="font-medium">{briefing.target_for_shift}</span>
              </div>
            )}
            <p className="font-medium text-purple-700">{briefing.closing_message}</p>
            {onInsert && (
              <Button onClick={handleInsert} size="sm" className="w-full mt-2">הכנס לתדריך</Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}