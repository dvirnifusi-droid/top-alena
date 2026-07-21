// Marketing hub — all marketing/customer-comms admin pages in one shell.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Megaphone, Users, Send, MessageSquare, QrCode, Image, FileText, Sparkles, Star } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import MarketingHQ from './MarketingHQ';
import SocialReviewer from './SocialReviewer';
import MarketingDashboard from './MarketingDashboard';
import CustomerClub from './CustomerClub';
import MarketingCampaigns from './MarketingCampaigns';
import InstagramStudio from './InstagramStudio';
import MessageTemplates from './MessageTemplates';
import CustomerSurveys from './CustomerSurveys';
import SurveyQRCodes from './SurveyQRCodes';

const TABS = [
    { id: 'hq', label: 'מטה שיווק', icon: Sparkles, C: MarketingHQ },
    { id: 'dashboard', label: 'דשבורד', icon: Megaphone, C: MarketingDashboard },
    { id: 'club', label: 'מועדון לקוחות', icon: Users, C: CustomerClub },
    { id: 'campaigns', label: 'קמפיינים', icon: Send, C: MarketingCampaigns },
    { id: 'instagram', label: 'Instagram', icon: Image, C: InstagramStudio },
    { id: 'social', label: 'בוחן סושיאל', icon: Star, C: SocialReviewer },
    { id: 'templates', label: 'תבניות הודעה', icon: FileText, C: MessageTemplates },
    { id: 'surveys', label: 'סקרי לקוחות', icon: MessageSquare, C: CustomerSurveys },
    { id: 'qr', label: 'QR סקרים', icon: QrCode, C: SurveyQRCodes },
];

export default function MarketingHub() {
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return TABS.find(t => t.id === h) ? h : 'hq';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };
    return (
        <div className="p-4" dir="rtl">
            <PageHeader title="שיווק ולקוחות" icon={Megaphone} />
            <Tabs value={tab} onValueChange={onChange}>
                <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pb-2 mb-3 border-b">
                    <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 justify-start md:grid md:grid-cols-9">
                        {TABS.map(t => (
                            <TabsTrigger key={t.id} value={t.id} className="text-sm py-2.5 px-3 whitespace-nowrap flex-shrink-0">
                                <t.icon className="w-4 h-4 ml-1.5 hidden md:inline" />
                                {t.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                {TABS.map(t => (
                    <TabsContent key={t.id} value={t.id} className="mt-0">
                        <t.C />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
