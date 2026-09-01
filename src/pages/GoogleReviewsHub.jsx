import React, { useEffect, useState } from 'react';
import PageGuard from '../components/shared/PageGuard';
import { base44 } from '@/api/base44Client';
import ReviewDashboard from '../components/reviews/ReviewDashboard';
import ReviewQrCard from '../components/reviews/ReviewQrCard';
import TargetedReviewBroadcast from '../components/reviews/TargetedReviewBroadcast';
import ReviewReplyInbox from '../components/reviews/ReviewReplyInbox';

export default function GoogleReviewsHub() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.getReviewsHubDashboard({ days: 30 });
      setData(res.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const link = data?.review_link || 'https://g.page/r/CReDn7f8zub7EBM/review';

  return (
    <PageGuard pageName="GoogleReviewsHub" pageTitle="ניהול ביקורות גוגל">
      <div className="max-w-4xl mx-auto p-4 space-y-6" dir="rtl">
        <h1 className="text-2xl font-bold">⭐ ניהול ביקורות גוגל</h1>
        {loading ? <div>טוען…</div> : <ReviewDashboard data={data} onSaved={load} />}
        <div className="grid md:grid-cols-2 gap-4">
          <ReviewQrCard link={link} />
          <div className="rounded-xl border p-4 bg-white">
            <div className="font-semibold mb-1">וואטסאפ יום אחרי ביקור</div>
            <div className="text-sm text-gray-600 mb-2">בקשת דירוג אוטומטית נשלחת יום אחרי כל ביקור. לניהול הטקסט וההפעלה עבור לעמוד הגדרות ההתראות.</div>
            <a href="/NotificationSettings" className="text-blue-600 underline text-sm">פתח הגדרות התראות</a>
          </div>
        </div>
        <TargetedReviewBroadcast reviewLink={link} />
        <ReviewReplyInbox />
      </div>
    </PageGuard>
  );
}
