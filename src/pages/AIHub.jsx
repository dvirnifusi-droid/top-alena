// AI tools hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Brain, Sparkles, Rocket, Megaphone, TrendingUp, Inbox } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import PinGate, { PIN_LOCKED_PAGES } from '@/components/shared/PinGate';
import AgentInbox from './AgentInbox';
import AiDashboard from './AiDashboard';
import SmartPrediction from './SmartPrediction';
import MarketingAdvisor from './MarketingAdvisor';
import MarketingAgentsHub from './MarketingAgentsHub';
import AgentPrompts from './AgentPrompts';
import RevenueForecasting from './RevenueForecasting';

const TABS = [
    { id: 'inbox', label: 'תיבת הסוכן', icon: Inbox, C: AgentInbox, page: 'AgentInbox' },
    { id: 'dashboard', label: 'מרכז AI', icon: Sparkles, C: AiDashboard, page: 'AiDashboard' },
    { id: 'predict', label: 'חיזוי עומסים', icon: Brain, C: SmartPrediction, page: 'SmartPrediction' },
    { id: 'advisor', label: 'יועץ שיווק', icon: Rocket, C: MarketingAdvisor, page: 'MarketingAdvisor' },
    { id: 'agents', label: 'סוכני שיווק', icon: Megaphone, C: MarketingAgentsHub, page: 'MarketingAgentsHub' },
    { id: 'prompts', label: 'פרומפטים', icon: Brain, C: AgentPrompts, page: 'AgentPrompts' },
    { id: 'forecast', label: 'תחזיות הכנסות', icon: TrendingUp, C: RevenueForecasting, page: 'RevenueForecasting' },
];

export default function AIHub() {
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return TABS.find(t => t.id === h) ? h : 'inbox';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };
    return (
        <div className="p-4" dir="rtl">
            <PageHeader title="כלי AI" icon={Sparkles} />
            <Tabs value={tab} onValueChange={onChange}>
                <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pb-2 mb-3 border-b">
                    <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 justify-start md:grid md:grid-cols-7">
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
                        {PIN_LOCKED_PAGES.has(t.page) ? <PinGate><t.C /></PinGate> : <t.C />}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
