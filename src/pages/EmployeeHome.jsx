import React, { useState, useEffect, useRef } from 'react';
import { User } from '@/entities/User';
import { DailyBrief } from '@/entities/DailyBrief';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, GraduationCap, CheckSquare, AlertTriangle, Calendar, CalendarDays, Utensils, Brain, Sparkles, FileText, Megaphone, Briefcase, MessageCircle, Camera, UserCircle, LogOut, ChevronDown, BookOpen, Settings2 } from 'lucide-react';
import ShiftNotificationBell from '../components/shared/ShiftNotificationBell';
import { Employee } from '@/entities/Employee';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import PendingDocsBanner from '@/components/shared/PendingDocsBanner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from 'date-fns';

import InvoiceScanner from '../components/dashboard/InvoiceScanner';
import ManualSurveyTool from '../components/dashboard/ManualSurveyTool';
import SeatingAiHelper from '../components/dashboard/SeatingAiHelper';
import AiQuickAdd from '../components/dashboard/AiQuickAdd';
import DailyBriefView from '../components/briefing/DailyBriefView';
import ShiftClockWidget from '../components/shift/ShiftClockWidget';
import NextShiftCountdown from '../components/employee/NextShiftCountdown';
import HeroGlance from '../components/employee/HeroGlance';
import WeeklyScheduleSummary from '../components/employee/WeeklyScheduleSummary';
import CoinWidget from '../components/gamification/CoinWidget';
import DailyChallengeCard from '../components/gamification/DailyChallengeCard';
import ConfettiEffect from '../components/gamification/ConfettiEffect';
import StoriesBar from '../components/stories/StoriesBar';
import MyAssignedTasks from '../components/checklists/MyAssignedTasks';
import DashboardCustomizer from '../components/dashboard/DashboardCustomizer';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import MyTipsWidget from '../components/dashboard/MyTipsWidget';
import MyRankWidget from '../components/dashboard/MyRankWidget';
import MyNotificationsWidget from '../components/dashboard/MyNotificationsWidget';
import QueueStatusWidget from '../components/dashboard/QueueStatusWidget';
import ShiftSupervisorPanel from '../components/sales/ShiftSupervisorPanel';
import { isShiftSupervisor } from '@/lib/roleGates';
import SalesGoalsBanner from '../components/sales/SalesGoalsBanner';
import ShiftLeaderboard from '../components/sales/ShiftLeaderboard';
import RewardShowcase from '../components/sales/RewardShowcase';
import CompactCoinWidget from '../components/sales/CompactCoinWidget';
import WeeklyPersonalGoal from '../components/sales/WeeklyPersonalGoal';
import { isWaitstaff, isNonSalesRole } from '@/lib/roleGates';
import { useTenantBranding } from '@/hooks/useTenantBranding';

// Time-of-day greeting (Israel local time on the device).
function greetingForNow() {
    const h = new Date().getHours();
    if (h < 12) return 'בוקר טוב';
    if (h < 17) return 'צהריים טובים';
    if (h < 21) return 'ערב טוב';
    return 'לילה טוב';
}

export default function EmployeeHome() {
    const [user, setUser] = useState(null);
    const [currentEmployee, setCurrentEmployee] = useState(null);
    const [showSmartTools, setShowSmartTools] = useState(false);
    const [todayBriefs, setTodayBriefs] = useState([]);
    const [selectedBrief, setSelectedBrief] = useState(null);
    const [todayPosition, setTodayPosition] = useState(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [confettiMsg, setConfettiMsg] = useState('');
    const [showSwitchUser, setShowSwitchUser] = useState(false);
    const [allEmployees, setAllEmployees] = useState([]);
    const [showCustomizer, setShowCustomizer] = useState(false);
    const fileInputRef = useRef();
    const branding = useTenantBranding();

    const { layout, saveLayout, isVisible } = useDashboardLayout(user?.email, 'employee');

    // Per-tenant hero palette (falls back to the warm Alena identity).
    const bc = branding?.brand_colors || {};
    const primary = bc.primary || '#A04A2E';
    const secondary = bc.secondary || '#44512C';
    const accent = bc.accent || '#C9A15A';
    const hasCover = !!branding?.cover_photo_url;
    // Gradient is always the base (shows under/around the photo). The cover photo
    // layers on top with a slow Ken Burns zoom for a "living" premium feel.
    const heroStyle = { background: `radial-gradient(130% 120% at 12% 8%, ${accent}66 0%, transparent 42%), linear-gradient(140deg, ${primary} 0%, ${secondary} 78%, ${primary} 130%)` };
    const overlayStyle = hasCover
        // Bottom-weighted scrim: dark where the greeting sits (readable), light at
        // the top so the photo breathes.
        ? { background: `linear-gradient(to top, ${secondary}f2 0%, ${primary}80 45%, ${primary}26 100%)` }
        : { background: `radial-gradient(120% 120% at 85% 15%, ${accent}59 0%, transparent 55%)` };
    const firstName = user?.full_name?.split(' ')[0] || 'עובד';
    let todayLabel = 'הכלים שלך למשמרת היום';
    try { todayLabel = new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }); } catch { /* keep fallback */ }

    useEffect(() => {
        User.me().then(async u => {
            setUser(u);
            loadTodayBriefs();
            loadTodayPosition();
            const emps = await Employee.filter({ status: 'active' });
            setAllEmployees(emps);
            const me = emps.find(e => e.email?.toLowerCase() === u.email?.toLowerCase());
            setCurrentEmployee(me || null);
        }).catch(() => setUser(null));
    }, []);

    const loadTodayBriefs = async () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        const briefs = await DailyBrief.filter({ date: today, status: 'published' });
        setTodayBriefs(briefs);
    };

    const loadTodayPosition = async () => {
        try {
            const currentUser = await User.me();
            const today = format(new Date(), 'yyyy-MM-dd');
            const todayShifts = await base44.entities.WorkShift.filter({ date: today });
            for (const shift of todayShifts) {
                const assignment = (shift.assigned_staff || []).find(
                    a => a.employee_name && currentUser.full_name &&
                    a.employee_name.toLowerCase() === currentUser.full_name.toLowerCase()
                );
                if (assignment) { setTodayPosition(assignment.position); return; }
            }
        } catch (error) {
            console.error('Error loading today position:', error);
        }
    };

    const handleMarkAsRead = async (briefId) => {
        if (!user) return;
        const brief = todayBriefs.find(b => b.id === briefId);
        if (!brief) return;
        const alreadyRead = brief.read_by?.includes(user.id);
        if (alreadyRead) return;
        const updatedReadBy = [...(brief.read_by || []), user.id];
        await DailyBrief.update(briefId, { read_by: updatedReadBy });
        setTodayBriefs(prev => prev.map(b => b.id === briefId ? { ...b, read_by: updatedReadBy } : b));
        if (selectedBrief?.id === briefId) setSelectedBrief(prev => ({ ...prev, read_by: updatedReadBy }));
    };

    const smartTools = [
        { component: InvoiceScanner, title: "סריקת חשבוניות ספק", description: "סרוק חשבונית ועדכן מלאי אוטומטית", icon: FileText, color: "from-[#44512C] to-[#A04A2E]" },
        { component: ManualSurveyTool, title: "שליחת סקר ללקוח", description: "שלח סקר שביעות רצון בוואטסאפ", icon: Star, color: "from-green-500 to-emerald-600" },
        { component: SeatingAiHelper, title: "עוזר הושבה חכם", description: "קבל המלצות הושבה מבוסס AI", icon: Brain, color: "from-[#44512C] to-[#A04A2E]" },
        { component: AiQuickAdd, title: "הוספת ידע לעוזר AI", description: "הכנס מתכונים, נהלים ומידע חדש", icon: Sparkles, color: "from-[#A04A2E] to-[#44512C]" }
    ];

    // סדר הגאדג'טים לפי layout
    const widgetOrder = layout.map(w => w.id);

    const widgets = {
        supervisor_panel: isVisible('supervisor_panel') && isShiftSupervisor(currentEmployee, user) && (
            <ShiftSupervisorPanel key="supervisor_panel" />
        ),
        sales_banner: isVisible('sales_banner') && !isNonSalesRole(currentEmployee, user) && (
            <SalesGoalsBanner key="sales_banner" />
        ),
        shift_leaderboard: isVisible('shift_leaderboard') && !isNonSalesRole(currentEmployee, user) && (
            <ShiftLeaderboard key="shift_leaderboard" myEmployeeId={currentEmployee?.id} />
        ),
        reward_showcase: isVisible('reward_showcase') && !isNonSalesRole(currentEmployee, user) && (
            <RewardShowcase key="reward_showcase" />
        ),
        compact_coin: isVisible('compact_coin') && isNonSalesRole(currentEmployee, user) && (
            <CompactCoinWidget key="compact_coin" />
        ),
        weekly_goal: isVisible('weekly_goal') && isWaitstaff(currentEmployee, user) && (
            <WeeklyPersonalGoal key="weekly_goal" />
        ),
        stories: isVisible('stories') && <StoriesBar key="stories" currentEmployee={currentEmployee} />,
        daily_challenge: isVisible('daily_challenge') && currentEmployee && (
            <div key="daily_challenge" className="mb-4">
                <DailyChallengeCard
                    employeeId={currentEmployee.id}
                    employeeName={currentEmployee.full_name}
                    onCoinsEarned={(amount, msg) => { setConfettiMsg(msg); setShowConfetti(true); }}
                />
            </div>
        ),
        shift_clock: isVisible('shift_clock') && <ShiftClockWidget key="shift_clock" />,
        next_shift: isVisible('next_shift') && user && (
            <NextShiftCountdown key="next_shift" currentEmployee={currentEmployee} user={user} />
        ),
        weekly_schedule: isVisible('weekly_schedule') && user && (
            <WeeklyScheduleSummary key="weekly_schedule" userId={user.id} currentEmployee={currentEmployee} />
        ),
        assigned_tasks: isVisible('assigned_tasks') && currentEmployee && (
            <MyAssignedTasks key="assigned_tasks" currentEmployee={currentEmployee} />
        ),
        daily_briefs: isVisible('daily_briefs') && todayBriefs.length > 0 && (
            <div key="daily_briefs" className="mb-6 space-y-3">
                <h2 className="font-display text-xl font-bold text-[#2A2018] flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-orange-500" />
                    תדריכי היום
                </h2>
                {todayBriefs.map(brief => {
                    const isRead = brief.read_by?.includes(user?.id);
                    return (
                        <Card
                            key={brief.id}
                            className={`cursor-pointer transition-all border-2 hover:shadow-md ${isRead ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50 animate-pulse-slow'}`}
                            onClick={() => setSelectedBrief(brief)}
                        >
                            <CardContent className="p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${isRead ? 'bg-green-100' : 'bg-orange-100'}`}>
                                        {brief.shift_type === 'lunch' ? '☀️' : '🌙'}
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-800">תדריך {brief.shift_type === 'lunch' ? 'צהריים' : 'ערב'}</p>
                                        <p className="text-xs text-gray-500">מנהל/ת: {brief.created_by_name}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isRead
                                        ? <Badge className="bg-green-500 text-white text-xs">✅ קראתי</Badge>
                                        : <Badge className="bg-orange-500 text-white text-xs animate-bounce">📣 חדש!</Badge>
                                    }
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        ),
        delivery_button: isVisible('delivery_button') && (
            <div key="delivery_button" className="mb-4">
                <Link to={createPageUrl("Deliveries") + "?autoScan=1"}>
                    <button className="w-full bg-primary text-primary-foreground rounded-2xl py-5 flex flex-col items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform hover:opacity-90">
                        <Camera className="w-10 h-10" />
                        <span className="text-xl font-bold">הכנס משלוח</span>
                    </button>
                </Link>
            </div>
        ),
        smart_tools: isVisible('smart_tools') && (
            <div key="smart_tools">
                <Card
                    className="border-0 text-white cursor-pointer hover:shadow-xl transition-all duration-300 rounded-2xl"
                    style={{ background: `linear-gradient(120deg, ${primary}, ${secondary})` }}
                    onClick={() => setShowSmartTools(true)}
                >
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="font-display text-xl font-bold mb-2 flex items-center gap-2">
                                    <Brain className="w-6 h-6" />
                                    כלי עבודה חכמים
                                </h3>
                                <p className="text-[#F4ECD8] mb-4">כלים מבוססי AI לחיסכון בזמן ושיפור היעילות</p>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-white/20 text-white">{smartTools.length} כלים</Badge>
                                    <Badge variant="secondary" className="bg-white/20 text-white">זמין עבורך!</Badge>
                                </div>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-2">
                                    <Sparkles className="w-8 h-8" />
                                </div>
                                <span className="text-sm">לחץ לפתיחה</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        ),
        my_tips: isVisible('my_tips') && <MyTipsWidget key="my_tips" />,
        my_rank: isVisible('my_rank') && <MyRankWidget key="my_rank" />,
        my_notifications: isVisible('my_notifications') && <MyNotificationsWidget key="my_notifications" />,
        queue_status: isVisible('queue_status') && <QueueStatusWidget key="queue_status" />,
        quick_access: isVisible('quick_access') && (
            <div key="quick_access" className="space-y-5">
                {[
                    { title: 'המשמרת שלי', color: primary, items: [
                        { to: createPageUrl("Checklists"), icon: CheckSquare, title: "צ'קליסטים" },
                        { to: createPageUrl("WaiterTables"), icon: Utensils, title: "השולחנות שלי" },
                        { to: createPageUrl("ShiftEndReport"), icon: CheckSquare, title: "דוח סיום משמרת" },
                        { to: createPageUrl("ShiftChat"), icon: MessageCircle, title: "צ'אט משמרת" },
                    ] },
                    { title: 'הזמן שלי', color: primary, items: [
                        { to: createPageUrl("WorkScheduling"), icon: Calendar, title: "סידור העבודה" },
                        { to: createPageUrl("LeaveRequests"), icon: CalendarDays, title: "בקשות חופשה" },
                        { to: createPageUrl("EmployeeReports"), icon: FileText, title: "דוחות עובדים" },
                    ] },
                    { title: 'התקדמות והישגים', color: accent, items: [
                        { to: createPageUrl("Leaderboard"), icon: Star, title: "לוח מובילים" },
                        { to: createPageUrl("MyPerformance"), icon: Star, title: "הביצועים שלי" },
                        { to: createPageUrl("Training"), icon: GraduationCap, title: "הכשרות ואימונים" },
                    ] },
                    { title: 'עזרה ותמיכה', color: '#8A7C64', items: [
                        { to: createPageUrl("Incidents"), icon: AlertTriangle, title: "דיווח תקריות" },
                        { to: "/UserGuide", icon: BookOpen, title: "מדריך שימוש" },
                    ] },
                ].map((cat) => (
                    <div key={cat.title}>
                        <h2 className="font-display text-xl font-bold text-[#2A2018] mb-3 pb-1.5 border-b-2" style={{ borderColor: `${cat.color}44` }}>
                            {cat.title}
                        </h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {cat.items.map((item) => (
                                <Link key={item.to} to={item.to}>
                                    <Card className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-md shadow-sm hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97] transition-all duration-200 cursor-pointer h-full">
                                        <CardContent className="p-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-sm ring-1 ring-black/5 flex-shrink-0" style={{ background: cat.color }}>
                                                    <item.icon className="w-5 h-5 text-white" />
                                                </div>
                                                <h3 className="font-bold text-sm text-[#3A2E1E] leading-tight">{item.title}</h3>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        ),
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] p-4 sm:p-6" dir="rtl">
            <style>{`
                @keyframes heroFloat1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-18px,14px) scale(1.15)} }
                @keyframes heroFloat2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(20px,-12px) scale(1.1)} }
                @keyframes heroTwinkle { 0%,100%{opacity:.08;transform:scale(1) rotate(0deg)} 50%{opacity:.22;transform:scale(1.15) rotate(12deg)} }
                @keyframes kenBurns { 0%{transform:scale(1) translate(0,0)} 100%{transform:scale(1.12) translate(-2%,-1.5%)} }
                @media (prefers-reduced-motion: reduce) {
                    [style*="heroFloat1"],[style*="heroFloat2"],[style*="heroTwinkle"],[style*="coinShine"],[style*="kenBurns"]{animation:none !important}
                }
            `}</style>
            <div className="max-w-7xl mx-auto">
                <PendingDocsBanner />
                {/* אדר "וואו" קומפקטי — תמונת העסק/גרדיאנט מותגי + לוגו + ברכה. כל הכפתורים נשמרים. */}
                <div
                    className="relative overflow-hidden rounded-3xl shadow-xl mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
                    style={heroStyle}
                >
                    {hasCover && (
                        <div
                            className="absolute inset-0 pointer-events-none"
                            style={{ backgroundImage: `url("${branding.cover_photo_url}")`, backgroundSize: 'cover', backgroundPosition: 'center', animation: 'kenBurns 22s ease-in-out infinite alternate' }}
                        />
                    )}
                    <div className="absolute inset-0 pointer-events-none" style={overlayStyle} />
                    {/* אורות רקע נעים — תחושת אפליקציה "חיה" */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        <div className="absolute -top-16 -right-10 w-52 h-52 rounded-full blur-3xl opacity-40" style={{ background: accent, animation: 'heroFloat1 9s ease-in-out infinite' }} />
                        <div className="absolute -bottom-20 -left-8 w-56 h-56 rounded-full blur-3xl opacity-25" style={{ background: '#ffffff', animation: 'heroFloat2 11s ease-in-out infinite' }} />
                    </div>
                    {/* נצנוץ עדין לאנרגיה */}
                    <div className="relative p-6 sm:p-8">
                        {/* שורה עליונה: לוגו + שם העסק | כפתורי פעולה */}
                        <div className="flex items-center justify-between gap-3 mb-4">
                            <div className="flex items-center gap-2.5 min-w-0">
                                {branding?.logo_url && (
                                    <img src={branding.logo_url} alt="logo" className="h-9 w-9 rounded-xl object-cover bg-white/90 p-0.5 shadow-sm flex-shrink-0" />
                                )}
                                <span className="text-white font-bold text-base sm:text-lg drop-shadow-sm truncate">{branding?.name}</span>
                                <span className="text-white/40 text-[9px] font-mono flex-shrink-0">v14</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                {currentEmployee && <CoinWidget employeeId={currentEmployee.id} employeeName={currentEmployee.full_name} />}
                                <ShiftNotificationBell currentEmployee={currentEmployee} isManager={false} />
                                <button
                                    onClick={() => setShowCustomizer(true)}
                                    className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 rounded-xl px-3 py-2 text-sm text-white font-medium transition-colors"
                                >
                                    <Settings2 className="w-4 h-4" />
                                    <span className="hidden sm:inline">ערוך דשבורד</span>
                                </button>
                            </div>
                        </div>
                        {/* שורת ברכה: אוואטר + ברכה לפי שעה + תפקיד | החלף משתמש */}
                        <div className="flex items-end justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3 min-w-0">
                                {currentEmployee?.avatar_url && (
                                    <img src={currentEmployee.avatar_url} alt="avatar" className="w-14 h-14 rounded-full object-cover border-2 border-white/70 shadow-lg flex-shrink-0" />
                                )}
                                <div className="min-w-0">
                                    <h1 className="font-display text-4xl sm:text-5xl font-black text-white drop-shadow mb-1 leading-none">
                                        {greetingForNow()}, {firstName}
                                    </h1>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-white/85 text-sm uppercase tracking-wide">{todayLabel}</p>
                                        {todayPosition && (
                                            <Badge className="bg-white/25 backdrop-blur-sm text-white border border-white/30 flex items-center gap-1">
                                                <Briefcase className="w-3.5 h-3.5" />
                                                {todayPosition}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowSwitchUser(true)}
                                className="flex items-center gap-1 bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 rounded-xl px-3 py-2 text-sm text-white transition-colors"
                            >
                                <UserCircle className="w-4 h-4" />
                                <span>החלף משתמש</span>
                                <ChevronDown className="w-3 h-3" />
                            </button>
                        </div>
                        {/* 🎯 מבט על — נתונים אישיים שקופצים לעין מיד */}
                        <HeroGlance user={user} currentEmployee={currentEmployee} />
                    </div>
                </div>

                <ConfettiEffect trigger={showConfetti} message={confettiMsg} emoji="🎉" onDone={() => setShowConfetti(false)} />

                {/* גאדג'טים לפי סדר המשתמש */}
                {/* פעולות ראשיות — שעון + סידור מוצמדים ישר מתחת לאדר, לא נגררים לאמצע */}
                {widgets.shift_clock && (
                    <div className="mb-4 animate-in fade-in slide-in-from-bottom-3 duration-500">{widgets.shift_clock}</div>
                )}
                {widgets.next_shift && (
                    <div className="mb-4 animate-in fade-in slide-in-from-bottom-3 duration-500">{widgets.next_shift}</div>
                )}
                {widgets.weekly_schedule && (
                    <div className="mb-4 animate-in fade-in slide-in-from-bottom-3 duration-500">{widgets.weekly_schedule}</div>
                )}
                <div className="space-y-4">
                    {widgetOrder.filter(id => !['shift_clock', 'next_shift', 'weekly_schedule'].includes(id)).map((id, i) => (
                        widgets[id]
                            ? <div key={id} className="animate-in fade-in slide-in-from-bottom-3 duration-500" style={{ animationDelay: `${Math.min(i * 55, 400)}ms`, animationFillMode: 'both' }}>{widgets[id]}</div>
                            : null
                    ))}
                </div>
            </div>

            {/* דיאלוג תדריך */}
            <Dialog open={!!selectedBrief} onOpenChange={(open) => !open && setSelectedBrief(null)}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0" dir="rtl">
                    <DailyBriefView
                        brief={selectedBrief}
                        employeeId={user?.id}
                        employeeName={user?.full_name}
                        onReady={handleMarkAsRead}
                    />
                </DialogContent>
            </Dialog>

            {/* דיאלוג החלפת משתמש */}
            <Dialog open={showSwitchUser} onOpenChange={setShowSwitchUser}>
                <DialogContent className="max-w-sm" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="text-center text-lg">החלפת משתמש</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 p-2">
                        <div className="bg-slate-50 rounded-xl p-3 border-2 border-indigo-200">
                            <p className="text-xs text-slate-500 mb-1">מחובר כרגע:</p>
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-[#F4ECD8] rounded-full flex items-center justify-center">
                                    <span className="text-sm font-bold text-[#A04A2E]">{user?.full_name?.charAt(0) || '?'}</span>
                                </div>
                                <div>
                                    <p className="font-bold text-sm">{user?.full_name || 'משתמש'}</p>
                                    <p className="text-xs text-slate-500">{user?.email}</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => base44.auth.redirectToLogin()}
                            className="w-full flex items-center justify-center gap-2 bg-white border-2 border-[#D9BD83] text-[#44512C] rounded-xl py-3 font-bold hover:bg-[#F4ECD8] transition-colors shadow-sm"
                        >
                            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                            התחבר עם חשבון Google
                        </button>
                        <button
                            onClick={() => { base44.auth.logout(); }}
                            className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl py-3 font-bold hover:bg-red-100 transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            התנתק והתחבר עם חשבון אחר
                        </button>
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                            <div className="relative flex justify-center text-xs text-slate-400 bg-white px-2">או בחר עובד קיים</div>
                        </div>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                            {allEmployees.filter(e => e.email && e.email !== user?.email).map(emp => (
                                <button
                                    key={emp.id}
                                    onClick={() => base44.auth.logout()}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-right transition-colors"
                                >
                                    <div className="w-9 h-9 bg-gradient-to-br from-slate-400 to-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                                        <span className="text-white font-bold text-sm">{emp.full_name?.charAt(0) || '?'}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm text-slate-800">{emp.full_name}</p>
                                        <p className="text-xs text-slate-500 truncate">{emp.email}</p>
                                    </div>
                                    <LogOut className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                </button>
                            ))}
                            {allEmployees.filter(e => e.email && e.email !== user?.email).length === 0 && (
                                <p className="text-center text-sm text-slate-400 py-4">אין עובדים נוספים עם מייל מוגדר</p>
                            )}
                        </div>
                        <p className="text-xs text-slate-400 text-center">לאחר לחיצה תועבר לדף ההתחברות</p>
                    </div>
                </DialogContent>
            </Dialog>

            {/* דיאלוג כלי עבודה חכמים */}
            <Dialog open={showSmartTools} onOpenChange={setShowSmartTools}>
                <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl text-center mb-4">🤖 כלי עבודה חכמים - פתרונות AI למסעדה</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
                        {smartTools.map((tool, index) => {
                            const ToolComponent = tool.component;
                            return <div key={index}><ToolComponent /></div>;
                        })}
                    </div>
                </DialogContent>
            </Dialog>

            {/* דשבורד קסטומייזר */}
            <DashboardCustomizer
                open={showCustomizer}
                onClose={() => setShowCustomizer(false)}
                layout={layout}
                onSave={saveLayout}
            />
        </div>
    );
}