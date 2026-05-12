import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Copy, Check, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function RecruitmentLinkCard() {
    const [copied, setCopied] = useState(false);

    // הקישור המקורי של Base44 — כשלוחצים עליו נפתח וואטסאפ עם הקוד אוטומטית
    const rawLink = base44.agents.getWhatsAppConnectURL('recruitment_agent');
    const recruitmentLink = rawLink.startsWith('http') ? rawLink : `https://app.base44.com${rawLink}`;

    // חילוץ הטוקן/קוד להצגה
    const tokenMatch = recruitmentLink.match(/token=([^&]+)/);
    const token = tokenMatch ? tokenMatch[1].substring(0, 12) + '...' : 'טוען...';

    const copyLink = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(recruitmentLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const openLink = () => {
        window.open(recruitmentLink, '_blank');
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
                    <span>🔗</span>
                    <span className="truncate text-teal-100">app.base44.com/...whatsapp?token={token}</span>
                </div>

                {/* תצוגת ההודעה שהמועמד יראה */}
                <div className="bg-white/10 rounded-lg p-3 mb-4 text-xs text-teal-100 leading-relaxed">
                    <p className="text-white/70 text-xs mb-1 font-semibold">📝 ההודעה שתיפתח אצל המועמד:</p>
                    <p>היי ברוך הבא לעוזר הדיגיטלי של עלינא 🌿</p>
                    <p>כדי להתחיל את שאלון ההתאמה שלח את ההודעה הזו:</p>
                    <p className="text-white font-semibold mt-1">Activation code: {token}</p>
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
                    📩 מועמד לוחץ ← וואטסאפ נפתח עם הקוד ← שולח ← הסוכן עונה
                </p>
            </CardContent>
        </Card>
    );
}