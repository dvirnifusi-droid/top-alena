import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Copy, Check, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function RecruitmentLinkCard() {
    const [copied, setCopied] = useState(false);

    // קישור ה-activation המקורי מה-SDK
    const rawLink = base44.agents.getWhatsAppConnectURL('recruitment_agent');
    const activationLink = rawLink.startsWith('http') ? rawLink : `https://app.base44.com${rawLink}`;

    // חילוץ ה-token מהקישור לשימוש כ-activation code
    const tokenMatch = activationLink.match(/token=([^&]+)/);
    const token = tokenMatch ? tokenMatch[1] : '';

    // טקסט ההודעה שהמועמד יראה מוכן לשליחה
    const welcomeMessage = `היי ברוך הבא לעוזר הדיגיטלי של עלינא 🌿\nכדי להתחיל את שאלון ההתאמה שלח את ההודעה הזו:\n\nActivation code: ${token}`;

    // קישור wa.me עם מספר Twilio וטקסט מוכן
    const twilioNumber = '14155238886'; // מספר Twilio WhatsApp סטנדרטי של base44
    const waLink = `https://wa.me/${twilioNumber}?text=${encodeURIComponent(welcomeMessage)}`;

    // תצוגה מקוצרת
    const shortDisplay = `wa.me/${twilioNumber}?...`;

    const copyLink = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(waLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const openLink = () => {
        window.open(waLink, '_blank');
    };

    return (
        <Card className="bg-gradient-to-r from-green-600 to-teal-600 text-white hover:shadow-xl transition-all duration-300">
            <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h3 className="text-xl font-bold mb-1">💬 סוכן גיוס וואטסאפ</h3>
                        <p className="text-teal-100 text-sm">
                            שלח את הקישור למועמדים — הסוכן מתחיל אוטומטית
                        </p>
                    </div>
                    <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <MessageCircle className="w-6 h-6" />
                    </div>
                </div>

                {/* תצוגת הקישור המקוצר */}
                <div className="bg-white/10 rounded-lg p-3 mb-3 text-sm text-white font-mono flex items-center gap-2">
                    <span className="text-green-200">🔗</span>
                    <span className="truncate">{shortDisplay}</span>
                </div>

                {/* תצוגת ההודעה שתישלח */}
                <div className="bg-white/10 rounded-lg p-3 mb-4 text-xs text-teal-100 whitespace-pre-line leading-relaxed">
                    <p className="text-white/60 text-xs mb-1 font-semibold">📝 הודעה שהמועמד יראה מוכנה:</p>
                    {welcomeMessage}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={copyLink}
                        className="flex-1 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'הועתק!' : 'העתק קישור'}
                    </button>
                    <button
                        onClick={openLink}
                        className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 active:bg-white/40 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
                    >
                        <ExternalLink className="w-4 h-4" />
                        בדוק
                    </button>
                </div>

                <p className="text-teal-200 text-xs mt-3 text-center">
                    📩 המועמד לוחץ → נפתח וואטסאפ עם הודעה מוכנה → שולח → הסוכן עונה
                </p>
            </CardContent>
        </Card>
    );
}