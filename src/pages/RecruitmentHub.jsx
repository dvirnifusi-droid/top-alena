// Recruitment & training hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { GraduationCap, Calendar, Users, Video } from 'lucide-react';
import RecruitmentInterviews from './RecruitmentInterviews';
import InterviewSettings from './InterviewSettings';
import Training from './Training';
import TrainingVideos from './TrainingVideos';

const TABS = [
    { id: 'interviews', label: 'ראיונות וגיוס', icon: Users, C: RecruitmentInterviews },
    { id: 'slots', label: 'סלוטים לראיונות', icon: Calendar, C: InterviewSettings },
    { id: 'training', label: 'הכשרות', icon: GraduationCap, C: Training },
    { id: 'videos', label: 'סרטוני הדרכה', icon: Video, C: TrainingVideos },
];

export default function RecruitmentHub() {
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return TABS.find(t => t.id === h) ? h : 'interviews';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };
    return (
        <div className="p-4" dir="rtl">
            <h1 className="text-2xl font-bold mb-3 flex items-center gap-2">
                <GraduationCap className="w-6 h-6 text-indigo-600" />
                גיוס והכשרה
            </h1>
            <Tabs value={tab} onValueChange={onChange}>
                <TabsList className="grid grid-cols-2 md:grid-cols-4 mb-4 max-w-3xl h-auto">
                    {TABS.map(t => (
                        <TabsTrigger key={t.id} value={t.id} className="text-xs sm:text-sm py-2">
                            <t.icon className="w-3.5 h-3.5 ml-1" />
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
