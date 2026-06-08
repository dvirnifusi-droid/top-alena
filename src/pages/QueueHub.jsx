// Queue & reservations admin hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, History, BarChart3, Trophy, FileText } from 'lucide-react';
import QueueDashboard from './QueueDashboard';
import QueueHistory from './QueueHistory';
import QueueAnalytics from './QueueAnalytics';
import GamesAdmin from './GamesAdmin';
import GameQuestionsAdmin from './GameQuestionsAdmin';

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
            <h1 className="text-2xl font-bold mb-3 flex items-center gap-2">
                <Users className="w-6 h-6 text-cyan-600" />
                תור והזמנות
            </h1>
            <Tabs value={tab} onValueChange={onChange}>
                <TabsList className="grid grid-cols-3 md:grid-cols-5 mb-4 h-auto">
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
