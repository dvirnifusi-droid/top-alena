// Queue & reservations admin hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, History, BarChart3, Trophy, FileText } from 'lucide-react';
import QueueDashboard from './QueueDashboard';
import QueueHistory from './QueueHistory';
import QueueAnalytics from './QueueAnalytics';
import GamesAdmin from './GamesAdmin';
import GameQuestionsAdmin from './GameQuestionsAdmin';
import PageHeader from '@/components/shared/PageHeader';

const TABS = [
    { id: 'dashboard', label: 'דאשבורד מארחת', icon: Users, C: QueueDashboard },
    { id: 'history', label: 'היסטוריה', icon: History, C: QueueHistory },
    { id: 'analytics', label: 'ניתוח', icon: BarChart3, C: QueueAnalytics },
    { id: 'games', label: 'משחקי ממתינים', icon: Trophy, C: GamesAdmin },
    { id: 'questions', label: 'שאלות משחקים', icon: FileText, C: GameQuestionsAdmin },
];

export default function QueueHub() {
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return TABS.find(t => t.id === h) ? h : 'dashboard';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };
    return (
        <div className="p-4" dir="rtl">
            <PageHeader title="תור והזמנות" icon={Users} />
            <Tabs value={tab} onValueChange={onChange}>
                <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pb-2 mb-3 border-b">
                    <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 justify-start md:grid md:grid-cols-5">
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
