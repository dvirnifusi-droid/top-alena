// Employees & scheduling hub.
import React, { useState, useEffect } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, Briefcase, Calendar, CalendarDays, MessageSquare, Lock, FileText } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import useMyPermissions from '@/hooks/useMyPermissions';
import Employees from './Employees';
import PositionsManagement from './PositionsManagement';
import WorkScheduling from './WorkScheduling';
import AvailabilityRequests from './AvailabilityRequests';
import LeaveRequests from './LeaveRequests';
import ShiftChat from './ShiftChat';
import EmployeeFeedback from './EmployeeFeedback';
import AgreementAdmin from './AgreementAdmin';
import Form101Admin from './Form101Admin';

// Each tab is a separately-guarded page. We show only the tabs the user can
// access (their permission tier) so an employee sees just their functions
// instead of hitting an "אין גישה" wall on a tab they weren't granted.
const TABS = [
    { id: 'list', label: 'רשימת עובדים', icon: Users, C: Employees, page: 'Employees' },
    { id: 'positions', label: 'תפקידים', icon: Briefcase, C: PositionsManagement, page: 'PositionsManagement' },
    { id: 'schedule', label: 'סידור עבודה', icon: Calendar, C: WorkScheduling, page: 'WorkScheduling' },
    { id: 'avail', label: 'בקשות זמינות', icon: Calendar, C: AvailabilityRequests, page: 'AvailabilityRequests' },
    { id: 'leave', label: 'בקשות חופשה', icon: CalendarDays, C: LeaveRequests, page: 'LeaveRequests' },
    { id: 'chat', label: 'צ׳אט משמרת', icon: MessageSquare, C: ShiftChat, page: 'ShiftChat' },
    { id: 'feedback', label: 'משוב עובדים', icon: MessageSquare, C: EmployeeFeedback, page: 'EmployeeFeedback' },
    { id: 'agreement', label: 'הסכם עבודה', icon: FileText, C: AgreementAdmin, page: 'AgreementAdmin' },
    { id: 'form101', label: 'טופס 101', icon: FileText, C: Form101Admin, page: 'Form101Admin' },
];

export default function EmployeesHub() {
    const { can, loading } = useMyPermissions();
    const visible = TABS.filter(t => can(t.page));

    const [tab, setTab] = useState(() => {
        const h = (typeof window !== 'undefined' && window.location.hash.replace('#', '')) || '';
        // Schedule first: the reason someone opens this hub during a shift is
        // almost always "who is working", not "show me the staff list".
        return TABS.find(t => t.id === h) ? h : 'schedule';
    });
    const onChange = (v) => { setTab(v); if (typeof window !== 'undefined') window.location.hash = v; };

    // If the current tab isn't one the user can access, jump to the first they can.
    useEffect(() => {
        if (!loading && visible.length && !visible.some(t => t.id === tab)) {
            onChange((visible.find(t => t.id === 'schedule') || visible[0]).id);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, visible.length, tab]);

    if (!loading && visible.length === 0) {
        return (
            <div className="p-4" dir="rtl">
                <PageHeader title="עובדים וסידור" icon={Users} />
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-8 h-8 text-red-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 mb-1">אין לך עדיין גישה לפונקציות כאן</h2>
                    <p className="text-slate-500 text-sm">בקש מהמנהל/בעלים להוסיף לך הרשאה ל"עובדים וסידור" (או לפונקציה מסוימת) במסך ההרשאות.</p>
                </div>
            </div>
        );
    }

    const shown = visible.length ? visible : TABS; // during load, show all (guards still protect)
    return (
        <div className="p-4" dir="rtl">
            <PageHeader title="עובדים וסידור" icon={Users} />
            <Tabs value={tab} onValueChange={onChange}>
                <div className="sticky top-0 z-10 bg-white -mx-4 px-4 pb-2 mb-3 border-b">
                    <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 justify-start">
                        {shown.map(t => (
                            <TabsTrigger key={t.id} value={t.id} className="text-sm py-2.5 px-3 whitespace-nowrap flex-shrink-0">
                                <t.icon className="w-4 h-4 ml-1.5 hidden md:inline" />
                                {t.label}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>
                {shown.map(t => (
                    <TabsContent key={t.id} value={t.id} className="mt-0">
                        <t.C />
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
