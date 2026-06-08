// AI tools hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Brain, Sparkles, Rocket, Megaphone, TrendingUp, Inbox } from 'lucide-react';
import AgentInbox from './AgentInbox';
import AiDashboard from './AiDashboard';
import SmartPrediction from './SmartPrediction';
import MarketingAdvisor from './MarketingAdvisor';
import MarketingAgentsHub from './MarketingAgentsHub';
import AgentPrompts from './AgentPrompts';
import RevenueForecasting from './RevenueForecasting';

const TABS = [
    { id: 'inbox', label: 'תיבת הסוכן', icon: Inbox, C: AgentInbox },
    { id: 'dashboard', label: 'מרכז AI', icon: Sparkles, C: AiDashboard },
    { id: 'predict', label: 'חיזוי עומסים', icon: Brain, C: SmartPrediction },
    { id: 'advisor', label: 'יועץ שיווק', icon: Rocket, C: MarketingAdvisor },
    { id: 'agents', label: 'סוכני שיווק', icon: Megaphone, C: MarketingAgentsHub },
    { id: 'prompts', label: 'פרומפטים', icon: Brain, C: AgentPrompts },
    { id: 'forecast', label: 'תחזיות הכנסות', icon: TrendingUp, C: RevenueForecasting },
];

export default function AIHub() {
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return TABS.find(t => t.id === h) ? h : 'inbox';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };
    return (
        <div className="p-4" dir="rtl">
            <h1 className="text-2xl font-bold mb-3 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-violet-600" />
                כלי AI
            </h1>
            <Tabs value={tab} onValueChange={onChange}>
                <TabsList className="grid grid-cols-3 md:grid-cols-7 mb-4 h-auto">
                    {TABS.map(t => (
                        <TabsTrigger key={t.id} value={t.id} className="text-xs py-2">
                            <t.icon className="w-3.5 h-3.5 ml-1 hidden md:inline" />
                            {t.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {TABS.map(t => (
                    <TabsContent key={t.id} value={t.id} className="mt-0">
                        <t.C />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
