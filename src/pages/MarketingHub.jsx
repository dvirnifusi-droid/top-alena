// Marketing hub — THE single channel-first marketing cockpit (consolidation
// phase 3). A top row of channel groups; each group's screens as sub-tabs. All
// screens are existing self-contained components reused here — nothing forked.
// Deep-link hashes (#club, #builder…) preserved.
import React, { useState } from 'react';
import { Tabs } from '@/components/ui/tabs';
import { Megaphone, Users, Send, MessageSquare, QrCode, Image, FileText, Sparkles, Star, Wand2, Brain, Palette } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import MarketingHQ from './MarketingHQ';
import SocialReviewer from './SocialReviewer';
import StoryStudio from './StoryStudio';
import MarketingDashboard from './MarketingDashboard';
import CustomerClub from './CustomerClub';
import MarketingCampaigns from './MarketingCampaigns';
import InstagramStudio from './InstagramStudio';
import MessageTemplates from './MessageTemplates';
import CustomerSurveys from './CustomerSurveys';
import SurveyQRCodes from './SurveyQRCodes';
// Reused advisor/actions components (the paid-ads machine + strategy tools).
import CampaignBuilder from '@/components/marketing/CampaignBuilder';
import MarketingPlaybook from '@/components/marketing/MarketingPlaybook';
import ProposedActions from '@/components/marketing/ProposedActions';
import PerformanceReview from '@/components/marketing/PerformanceReview';
import LiveCampaigns from '@/components/marketing/LiveCampaigns';
import MarketingLinks from '@/components/marketing/MarketingLinks';

const T = {
    // Strategy
    hq: { id: 'hq', label: 'מטה שיווק', icon: Sparkles, C: MarketingHQ },
    playbook: { id: 'playbook', label: 'תוכנית ורעיונות', icon: Brain, C: MarketingPlaybook },
    actions: { id: 'actions', label: 'פעולות מהירות', icon: Send, C: ProposedActions },
    // Paid (Meta)
    builder: { id: 'builder', label: 'בנה קמפיין', icon: Wand2, C: CampaignBuilder },
    live: { id: 'live', label: 'קמפיינים חיים', icon: Megaphone, C: LiveCampaigns },
    review: { id: 'review', label: 'מעקב ואופטימיזציה', icon: Star, C: PerformanceReview },
    links: { id: 'links', label: 'קישורי קמפיין', icon: FileText, C: MarketingLinks },
    // Club (WhatsApp/SMS)
    campaigns: { id: 'campaigns', label: 'קמפיינים (WhatsApp/SMS)', icon: Send, C: MarketingCampaigns },
    club: { id: 'club', label: 'מועדון לקוחות', icon: Users, C: CustomerClub },
    templates: { id: 'templates', label: 'תבניות הודעה', icon: FileText, C: MessageTemplates },
    dashboard: { id: 'dashboard', label: 'דשבורד', icon: Megaphone, C: MarketingDashboard },
    // Design / Organic
    story: { id: 'story', label: 'סטודיו סטורי', icon: Wand2, C: StoryStudio },
    instagram: { id: 'instagram', label: 'Instagram', icon: Image, C: InstagramStudio },
    // Insight & feedback
    social: { id: 'social', label: 'בוחן סושיאל', icon: Star, C: SocialReviewer },
    surveys: { id: 'surveys', label: 'סקרי לקוחות', icon: MessageSquare, C: CustomerSurveys },
    qr: { id: 'qr', label: 'QR סקרים', icon: QrCode, C: SurveyQRCodes },
};

// Grouped by CHANNEL (the consolidation spec). Left→right = idea → execution →
// creative → insight.
const GROUPS = [
    { key: 'strategy', name: '🧠 אסטרטגיה', icon: Brain, tabs: [T.hq, T.playbook, T.actions] },
    { key: 'paid', name: '💰 ממומן (Meta)', icon: Megaphone, tabs: [T.builder, T.live, T.review, T.links] },
    { key: 'club', name: '📱 מועדון (WhatsApp/SMS)', icon: Users, tabs: [T.campaigns, T.club, T.templates, T.dashboard] },
    { key: 'design', name: '🎨 עיצוב', icon: Palette, tabs: [T.story] },
    { key: 'organic', name: '📢 אורגני', icon: Image, tabs: [T.instagram] },
    { key: 'insight', name: '🔎 בקרה ומשוב', icon: Star, tabs: [T.social, T.surveys, T.qr] },
];
const ALL = Object.values(T);

export default function MarketingHub() {
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return ALL.find(t => t.id === h) ? h : 'hq';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };

    const activeGroup = GROUPS.find(g => g.tabs.some(t => t.id === tab)) || GROUPS[0];
    const active = ALL.find(t => t.id === tab) || GROUPS[0].tabs[0];
    const ActiveC = active.C;

    return (
        <div className="p-4" dir="rtl">
            <PageHeader title="שיווק ולקוחות" icon={Megaphone} />

            <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pb-2 mb-3 border-b space-y-2">
                {/* Channel groups */}
                <div className="flex gap-1.5 overflow-x-auto pt-1">
                    {GROUPS.map(g => (
                        <button key={g.key} onClick={() => onChange(g.tabs[0].id)}
                            className={`text-sm font-bold rounded-lg px-3 py-2 whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 transition-colors ${g === activeGroup ? 'bg-[#A04A2E] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                            {g.name}
                        </button>
                    ))}
                </div>
                {/* Sub-tabs of the active group */}
                {activeGroup.tabs.length > 1 && (
                    <div className="flex gap-1 overflow-x-auto">
                        {activeGroup.tabs.map(t => (
                            <button key={t.id} onClick={() => onChange(t.id)}
                                className={`text-sm rounded-lg px-3 py-1.5 whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 ${t.id === tab ? 'bg-amber-100 text-amber-800 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}>
                                <t.icon className="w-4 h-4 hidden md:inline" /> {t.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <Tabs value={tab}>
                <ActiveC />
            </Tabs>
        </div>
    );
}
