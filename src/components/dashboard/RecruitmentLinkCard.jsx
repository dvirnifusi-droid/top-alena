import React, { useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Copy, Check, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function RecruitmentLinkCard() {
    const [copied, setCopied] = useState(false);

    const recruitmentLink = base44.agents.getWhatsAppConnectURL('recruitment_agent');

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

                <div className="bg-white/10 rounded-lg p-3 mb-4 text-xs text-teal-100 break-all font-mono">
                    {recruitmentLink}
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
                        פתח
                    </button>
                </div>

                <p className="text-teal-200 text-xs mt-3 text-center">
                    📩 שלח קישור זה לכל מועמד — הסוכן ישאל שאלות בעצמו ויסנן
                </p>
            </CardContent>
        </Card>
    );
}