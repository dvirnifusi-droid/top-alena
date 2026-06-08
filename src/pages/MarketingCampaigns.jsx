import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Send, Mail, Heart, Users } from 'lucide-react';

const CAMPAIGNS = [
  {
    id: 'newsletter',
    name: '📧 ניוזלטר שבועי',
    desc: 'עדכון מנות חדשות ואירועים',
    fn: 'sendWeeklyNewsletter',
    icon: Mail,
    color: 'from-[#44512C] to-[#44512C]',
    target: 'לקוחות עם coins',
  },
  {
    id: 'couple',
    name: '💕 הצעה לזוגות',
    desc: 'ערב רומנטי באמצע שבוע',
    fn: 'sendCoupleOffer',
    icon: Heart,
    color: 'from-[#A04A2E] to-[#A04A2E]',
    target: 'זוגות (2 סועדים)',
  },
  {
    id: 'group',
    name: '👥 הצעה לקבוצות',
    desc: 'אירועים וימי הולדת',
    fn: 'sendGroupOffer',
    icon: Users,
    color: 'from-[#A04A2E] to-[#A04A2E]',
    target: 'קבוצות (6+ סועדים)',
  },
  {
    id: 'abandoned',
    name: '🎁 התגעגענו',
    desc: 'הודעה לנוטשים - הקינוח עלינו',
    fn: 'sendAbandonedReminder',
    icon: Send,
    color: 'from-orange-500 to-orange-600',
    target: 'נטשו בתור 24-48 שעות אחורה',
  },
];

export default function MarketingCampaigns() {
  const [loading, setLoading] = useState({});
  const [results, setResults] = useState({});

  const handleSend = async (campaign) => {
    setLoading(prev => ({ ...prev, [campaign.id]: true }));
    try {
      const response = await base44.asServiceRole.functions.invoke(campaign.fn, {});
      const sent = response.data?.sent || response.sent || 0;
      setResults(prev => ({
        ...prev,
        [campaign.id]: { success: true, count: sent, time: new Date().toLocaleTimeString('he-IL') }
      }));
    } catch (e) {
      setResults(prev => ({
        ...prev,
        [campaign.id]: { success: false, error: e.message }
      }));
    } finally {
      setLoading(prev => ({ ...prev, [campaign.id]: false }));
    }
  };

  return (
    <div className="p-6 min-h-screen bg-gradient-to-b from-gray-50 to-gray-100" dir="rtl">
      {/* כותרת */}
      <div className="mb-8">
        <h1 className="text-4xl font-black text-gray-800 mb-2">📧 קמפיינים שיווקיים</h1>
        <p className="text-gray-600">שלח הודעות WhatsApp מיוחדות לקבוצות שונות של לקוחות</p>
      </div>

      {/* רשת קמפיינים */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {CAMPAIGNS.map(campaign => {
          const Icon = campaign.icon;
          const result = results[campaign.id];
          const isLoading = loading[campaign.id];

          return (
            <Card key={campaign.id} className="overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
              {/* כותרת צבעונית */}
              <div className={`bg-gradient-to-l ${campaign.color} text-white p-6`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-black mb-1">{campaign.name}</h3>
                    <p className="text-white/80 text-sm font-medium">{campaign.desc}</p>
                  </div>
                  <div className="text-3xl">
                    <Icon className="w-8 h-8" />
                  </div>
                </div>
              </div>

              {/* תוכן */}
              <CardContent className="p-6">
                {/* מטרה */}
                <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-600">
                    <span className="font-bold text-gray-800">🎯 יעד: </span>
                    {campaign.target}
                  </p>
                </div>

                {/* תוצאה */}
                {result && (
                  <div className={`mb-4 p-3 rounded-lg border-2 ${
                    result.success
                      ? 'bg-green-50 border-green-300 text-green-800'
                      : 'bg-red-50 border-red-300 text-red-800'
                  }`}>
                    {result.success ? (
                      <>
                        <p className="font-bold text-sm">✅ נשלח בהצלחה!</p>
                        <p className="text-sm">{result.count} הודעות בשעה {result.time}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-sm">❌ שגיאה</p>
                        <p className="text-sm">{result.error}</p>
                      </>
                    )}
                  </div>
                )}

                {/* כפתור שליחה */}
                <Button
                  onClick={() => handleSend(campaign)}
                  disabled={isLoading}
                  className="w-full font-bold"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      שולח...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Send className="w-4 h-4" />
                      שלח עכשיו
                    </span>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* הערה */}
      <Card className="bg-[#F4ECD8] border-[#E8D9B5]">
        <CardContent className="p-4 text-sm text-[#2E3819]">
          <p className="font-bold mb-2">ℹ️ הערות חשובות:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>כל הודעה נשלחת דרך WhatsApp ל-Twilio</li>
            <li>ההודעות מותאמות אישית לפי מספר הטלפון</li>
            <li>הנוטשים - רק מ-24 עד 48 שעות אחרי הנטישה</li>
            <li>אפשר גם להשתמש באוטומציות המתוזמנות כל שבוע</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}