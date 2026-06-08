// Gamification + Stories hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Trophy, Shirt, User, Archive, BarChart3, Bell } from 'lucide-react';
import Leaderboard from './Leaderboard';
import GamificationAdmin from './GamificationAdmin';
import ApparelManagement from './ApparelManagement';
import CharacterLounge from './CharacterLounge';
import StoriesArchive from './StoriesArchive';
import StoriesLeaderboard from './StoriesLeaderboard';
import StoriesAnalytics from './StoriesAnalytics';
import StoriesNotifications from './StoriesNotifications';

const TABS = [
    { id: 'leaderboard', label: 'לוח מובילים', icon: Trophy, C: Leaderboard },
    { id: 'admin', label: 'מרכז גמיפיקציה', icon: Trophy, C: GamificationAdmin },
    { id: 'apparel', label: 'חנות בגדים', icon: Shirt, C: ApparelManagement },
    { id: 'lounge', label: 'סלון דמויות', icon: User, C: CharacterLounge },
    { id: 'archive', label: 'סטוריז · ארכיון', icon: Archive, C: StoriesArchive },
    { id: 'stories-lb', label: 'סטוריז · דירוג', icon: Trophy, C: StoriesLeaderboard },
    { id: 'stories-an', label: 'סטוריז · ניתוח', icon: BarChart3, C: StoriesAnalytics },
    { id: 'stories-notif', label: 'סטוריז · הודעות', icon: Bell, C: StoriesNotifications },
];

export default function StoriesHub() {
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return TABS.find(t => t.id === h) ? h : 'leaderboard';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };
    return (
        <div className="p-4" dir="rtl">
            <h1 className="text-2xl font-bold mb-3 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-rose-600" />
                גמיפיקציה וסטוריז
            </h1>
            <Tabs value={tab} onValueChange={onChange}>
                <TabsList className="grid grid-cols-4 md:grid-cols-8 mb-4 h-auto">
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
