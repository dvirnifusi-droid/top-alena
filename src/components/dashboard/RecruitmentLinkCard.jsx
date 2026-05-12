import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Copy, Check, ExternalLink, Loader, RefreshCw } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { shortenUrl } from '@/functions/shortenUrl';

export default function RecruitmentLinkCard() {

    const [displayLink, setDisplayLink] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const generateAndSave = async (force = false) => {
        if (force) setRefreshing(true);

        // בדוק אם יש קישור שמור ב-DB
        const profiles = await base44.entities.RestaurantProfile.list();
        const profile = profiles[0];

        if (profile?.recruitment_short_url && !force) {
            setDisplayLink(profile.recruitment_short_url);
            setLoading(false);
            return;
        }

        // צור קישור חדש
        const rawLink = base44.agents.getWhatsAppConnectURL('recruitment_agent');
        const fullLink = rawLink.startsWith('http') ? rawLink : `https://app.base44.com${rawLink}`;

        try {
            const result = await shortenUrl({ url: fullLink });
            const short = result.shortUrl || fullLink;
            setDisplayLink(short);

            // שמור ב-DB
            if (profile) {
                await base44.entities.RestaurantProfile.update(profile.id, { recruitment_short_url: short });
            }
        } catch {
            setDisplayLink(fullLink);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        generateAndSave(false);
    }, []);

    const fullMessage = `היי ברוך הבא לעלינא 🌿
נשמח שתצטרפו אלינו לראיון התאמה בקישור הבא 👇
מחכים לכם בצד השני 😊

${displayLink}`;

    const [copiedMsg, setCopiedMsg] = useState(false);

    const copyFullMsg = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(fullMessage);
        setCopiedMsg(true);
        setTimeout(() => setCopiedMsg(false), 2500);
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

                {/* תצוגת ההודעה */}
                <div className="bg-white/10 rounded-lg p-3 mb-4 text-sm text-teal-100 whitespace-pre-line">
                    {loading ? (
                        <div className="flex items-center gap-2">
                            <Loader className="w-3 h-3 animate-spin flex-shrink-0" />
                            <span>יוצר קישור מקוצר...</span>
                        </div>
                    ) : fullMessage}
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={copyFullMsg}
                        disabled={loading}
                        className="flex-1 flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50"
                    >
                        {copiedMsg ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedMsg ? 'הועתק!' : 'העתק הודעה'}
                    </button>
                    <button
                        onClick={() => window.open(displayLink, '_blank')}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm disabled:opacity-50"
                    >
                        <ExternalLink className="w-4 h-4" />
                        פתח
                    </button>
                    <button
                        onClick={() => generateAndSave(true)}
                        disabled={loading || refreshing}
                        title="רענן קישור"
                        className="flex items-center justify-center bg-white/20 hover:bg-white/30 text-white p-2 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <p className="text-teal-200 text-xs mt-3 text-center">
                    📩 שלח קישור זה לכל מועמד — הסוכן ישאל שאלות בעצמו ויסנן
                </p>
            </CardContent>
        </Card>
    );
}