import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Star } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function RecentFeedbackWidget() {
  const [feedbacks, setFeedbacks] = useState([]);
  const [avgRating, setAvgRating] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const items = await base44.entities.CustomerFeedback.list('-created_date', 10);
        setFeedbacks(items.slice(0, 3));
        const rated = items.filter(f => f.rating);
        if (rated.length > 0) {
          setAvgRating((rated.reduce((s, f) => s + f.rating, 0) / rated.length).toFixed(1));
        }
      } catch {} finally { setLoading(false); }
    };
    load();
  }, []);

  return (
    <Link to={createPageUrl("CustomerSurveys")}>
      <Card className="hover:shadow-lg transition-all cursor-pointer hover:scale-[1.02]">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-[#A04A2E]" />
            סקרי לקוחות אחרונים
            {avgRating > 0 && (
              <span className="text-xs bg-[#F4ECD8] text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1 mr-auto">
                <Star className="w-3 h-3" />{avgRating}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {loading ? <p className="text-sm text-muted-foreground">טוען...</p> :
            feedbacks.length === 0 ? <p className="text-sm text-muted-foreground">אין סקרים עדיין</p> :
            <div className="space-y-2">
              {feedbacks.map((f, i) => (
                <div key={f.id || i} className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground truncate flex-1">{f.comment || f.feedback_text || 'ללא הערה'}</p>
                  {f.rating && (
                    <span className="text-xs font-bold text-yellow-600 flex-shrink-0">{'⭐'.repeat(Math.round(f.rating))}</span>
                  )}
                </div>
              ))}
            </div>
          }
        </CardContent>
      </Card>
    </Link>
  );
}