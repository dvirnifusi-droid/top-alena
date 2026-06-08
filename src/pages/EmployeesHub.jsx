// Employees & scheduling hub.
import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, Briefcase, Calendar, CalendarDays, MessageSquare } from 'lucide-react';
import Employees from './Employees';
import PositionsManagement from './PositionsManagement';
import WorkScheduling from './WorkScheduling';
import AvailabilityRequests from './AvailabilityRequests';
import LeaveRequests from './LeaveRequests';
import ShiftChat from './ShiftChat';
import EmployeeFeedback from './EmployeeFeedback';

const TABS = [
    { id: 'list', label: 'רשימת עובדים', icon: Users, C: Employees },
    { id: 'positions', label: 'תפקידים', icon: Briefcase, C: PositionsManagement },
    { id: 'schedule', label: 'סידור עבודה', icon: Calendar, C: WorkScheduling },
    { id: 'avail', label: 'בקשות זמינות', icon: Calendar, C: AvailabilityRequests },
    { id: 'leave', label: 'בקשות חופשה', icon: CalendarDays, C: LeaveRequests },
    { id: 'chat', label: 'צ׳אט משמרת', icon: MessageSquare, C: ShiftChat },
    { id: 'feedback', label: 'משוב עובדים', icon: MessageSquare, C: EmployeeFeedback },
];

export default function EmployeesHub() {
    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        return TABS.find(t => t.id === h) ? h : 'list';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };
    return (
        <div className="p-4" dir="rtl">
            <h1 className="text-2xl font-bold mb-3 flex items-center gap-2">
                <Users className="w-6 h-6 text-[#44512C]" />
                עובדים וסידור
            </h1>
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
                        <t.C />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
