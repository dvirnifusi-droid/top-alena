// Recruitment & training hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { GraduationCap, Calendar, Users, Video } from 'lucide-react';
import RecruitmentInterviews from './RecruitmentInterviews';
import InterviewSettings from './InterviewSettings';
import Training from './Training';
import TrainingVideos from './TrainingVideos';
import PageHeader from '@/components/shared/PageHeader';

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
            <PageHeader title="גיוס והכשרה" subtitle="ראיונות, סלוטים, הכשרות וסרטוני הדרכה" icon={GraduationCap} />
            <Tabs value={tab} onValueChange={onChange}>
                <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pb-2 mb-3 border-b">
                    <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 justify-start md:grid md:grid-cols-4 md:max-w-3xl">
                        {TABS.map(t => (
                            <TabsTrigger key={t.id} value={t.id} className="text-sm py-2.5 px-3 whitespace-nowrap flex-shrink-0">
                                <t.icon className="w-4 h-4 ml-1.5" />
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
