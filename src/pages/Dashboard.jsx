import React, { useState, useCallback, useEffect } from 'react';
import { User } from '@/entities/User';
import PageGuard from '../components/shared/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, CheckCircle, AlertTriangle, Star, Brain, Zap, ChevronRight, Bot, Sparkles, MessageCircle, BookOpen, Settings2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import ApparelShop from '../components/gamification/ApparelShop';
import ApparelCustomizer from '../components/gamification/ApparelCustomizer';

import RecentIncidents from '../components/dashboard/RecentIncidents';
import ChecklistStatus from '../components/dashboard/ChecklistStatus';
import TreatsReport from '../components/dashboard/TreatsReport';
import AiQuickAdd from '../components/dashboard/AiQuickAdd';
import SeatingAiHelper from '../components/dashboard/SeatingAiHelper';
import InvoiceScanner from '../components/dashboard/InvoiceScanner';
import ManualSurveyTool from '../components/dashboard/ManualSurveyTool';
import InventoryScanner from '../components/dashboard/InventoryScanner';
import SurveyQRGenerator from '../components/dashboard/SurveyQRGenerator';
import ActiveEmployeesWidget from '../components/dashboard/ActiveEmployeesWidget';
import RecruitmentLinkCard from '../components/dashboard/RecruitmentLinkCard';
import RecruitmentDashboard from '../components/dashboard/RecruitmentDashboard';
import BriefReadersWidget from '../components/dashboard/BriefReadersWidget';
import SalesChart from '../components/dashboard/SalesChart';
import DashboardCustomizer from '../components/dashboard/DashboardCustomizer';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import TodayTipsWidget from '../components/dashboard/TodayTipsWidget';
import BeecommLiveWidget from '../components/dashboard/BeecommLiveWidget';
import GomileyLiveWidget from '../components/dashboard/GomileyLiveWidget';
import GomileyDashboardWidget from '../components/dashboard/GomileyDashboardWidget';
import ShiftInsightsWidget from '../components/dashboard/ShiftInsightsWidget';
import LowInventoryWidget from '../components/dashboard/LowInventoryWidget';
import ActiveDeliveriesWidget from '../components/dashboard/ActiveDeliveriesWidget';
import PendingRequestsWidget from '../components/dashboard/PendingRequestsWidget';
import WeeklyLeaderboardWidget from '../components/dashboard/WeeklyLeaderboardWidget';
import QueueStatusWidget from '../components/dashboard/QueueStatusWidget';
import RecentFeedbackWidget from '../components/dashboard/RecentFeedbackWidget';
import TodayReservationsWidget from '../components/dashboard/TodayReservationsWidget';
import WeeklyPerformanceWidget from '../components/dashboard/WeeklyPerformanceWidget';
import ChangelogWidget from '../components/dashboard/ChangelogWidget';

function QuickStats() {
    const [realTimeData, setRealTimeData] = React.useState({ todaySales: 0, completedChecklists: 0, totalChecklists: 0, openIncidents: 0 });
    const [loading, setLoading] = React.useState(true);

    const loadRealTimeData = React.useCallback(async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const [{ ShiftEndReport }, { ChecklistExecution }, { Checklist }, { Incident }] = await Promise.all([
                import('@/entities/ShiftEndReport').catch(() => ({ ShiftEndReport: null })),
                import('@/entities/ChecklistExecution').catch(() => ({ ChecklistExecution: null })),
                import('@/entities/Checklist').catch(() => ({ Checklist: null })),
                import('@/entities/Incident').catch(() => ({ Incident: null }))
            ]);
            let data = { todaySales: 0, completedChecklists: 0, totalChecklists: 0, openIncidents: 0 };
            if (ShiftEndReport) {
                try { const r = await ShiftEndReport.filter({ shift_date: today }); data.todaySales = r.reduce((s, x) => s + (x.total_revenue || 0), 0); } catch {}
            }
            if (ChecklistExecution && Checklist) {
                try {
                    const [ex, ch] = await Promise.all([ChecklistExecution.filter({ execution_date: { $gte: today + 'T00:00:00' } }), Checklist.filter({ status: 'active' })]);
                    data.completedChecklists = ex.filter(e => e.status === 'completed').length;
                    data.totalChecklists = ch.length;
                } catch {}
            }
            if (Incident) {
                try { const inc = await Incident.filter({ status: { $in: ['reported', 'investigating', 'in_progress'] } }); data.openIncidents = inc.length; } catch {}
            }
            setRealTimeData(data);
        } catch {} finally { setLoading(false); }
    }, []);

    React.useEffect(() => { loadRealTimeData(); }, [loadRealTimeData]);

    const statsData = [
        { title: "מכירות היום", value: loading ? "טוען..." : `₪${realTimeData.todaySales.toLocaleString()}`, icon: TrendingUp, color: "green", trend: "מדוחות יומיים", clickUrl: createPageUrl("Reports") },
        { title: "צ'קליסטים", value: loading ? "טוען..." : `${realTimeData.completedChecklists}/${realTimeData.totalChecklists}`, icon: CheckCircle, color: "purple", trend: `נותרו ${realTimeData.totalChecklists - realTimeData.completedChecklists}`, clickUrl: createPageUrl("Checklists") },
        { title: "תקריות פתוחות", value: loading ? "טוען..." : realTimeData.openIncidents.toString(), icon: AlertTriangle, color: "orange", trend: realTimeData.openIncidents > 0 ? "דורש טיפול" : "הכל תקין", clickUrl: createPageUrl("Incidents") }
    ];
    const colorVariants = { blue: "from-blue-500 to-blue-600", green: "from-green-500 to-green-600", purple: "from-purple-500 to-purple-600", orange: "from-orange-500 to-orange-600" };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            {statsData.map((stat, index) => {
                const Icon = stat.icon;
                return (
                    <Link key={index} to={stat.clickUrl}>
                        <Card className="relative overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer hover:scale-105">
                            <div className={`absolute inset-0 bg-gradient-to-br ${colorVariants[stat.color]} opacity-5`}></div>
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-gray-600 mb-1">{stat.title}</p>
                                        <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                                        <p className="text-xs text-gray-500 mt-1">{stat.trend}</p>
                                    </div>
                                    <div className={`p-3 rounded-lg bg-gradient-to-br ${colorVariants[stat.color]} text-white`}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                );
            })}
        </div>
    );
}

function SmartToolsPanel() {
    const [isOpen, setIsOpen] = useState(false);
    const [showShop, setShowShop] = useState(false);
    const [employee, setEmployee] = useState(null);
    const [balance, setBalance] = useState(0);
    const [employeeAvatar, setEmployeeAvatar] = useState(null);
    const [refreshApparel, setRefreshApparel] = useState(0);

    useEffect(() => {
        const loadData = async () => {
            try {
                const user = await base44.auth.me();
                const emps = await base44.entities.Employee.filter({ email: user.email });
                if (emps.length > 0) {
                    setEmployee(emps[0]);
                    const trans = await base44.entities.CoinTransaction.filter({ employee_id: emps[0].id });
                    setBalance(trans.reduce((acc, t) => acc + (t.amount || 0), 0));
                }
            } catch (e) { console.error('Failed to load employee data:', e); }
        };
        loadData();
    }, []);

    const tools = [
        { component: AiQuickAdd, title: "הוספת ידע לעוזר AI", description: "הכנס מתכונים, נהלים ומידע חדש", icon: Brain },
        { component: SeatingAiHelper, title: "עוזר הושבה חכם", description: "קבל המלצות הושבה מבוסס AI", icon: Bot },
        { component: InvoiceScanner, title: "סריקת חשבוניות", description: "סרוק חשבוניות ועדכן מלאי אוטומטית", icon: Sparkles },
        { component: InventoryScanner, title: "סורק מלאי חכם", description: "צלם מדף וקבל התראות מלאי", icon: Zap },
        { component: ManualSurveyTool, title: "שליחת סקר ללקוח", description: "שלח סקר שביעות רצון בוואטסאפ", icon: Star },
        { component: SurveyQRGenerator, title: "ברקודי סקרים", description: "יצור ברקודים להדפסה על חשבונות", icon: CheckCircle }
    ];

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:scale-105" onClick={() => setIsOpen(true)}>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold mb-2">🤖 כלי עבודה חכמים</h3>
                                <p className="text-indigo-100 mb-4">כלים מבוססי AI לחיסכון בזמן</p>
                                <Badge variant="secondary" className="bg-white/20 text-white">{tools.length} כלים</Badge>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-2"><Brain className="w-8 h-8" /></div>
                                <ChevronRight className="w-6 h-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-gradient-to-r from-orange-600 to-amber-600 text-white cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:scale-105" onClick={() => setShowShop(true)}>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold mb-2">👗 חנות בגדים</h3>
                                <p className="text-amber-100 mb-4">התחפשות וקנייה של אביזרים</p>
                                <span className="text-white font-semibold text-sm">{balance.toLocaleString()} 🪙</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center"><span className="text-3xl">👕</span></div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <RecruitmentLinkCard />
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader><DialogTitle className="text-2xl text-center mb-4">🤖 כלי עבודה חכמים - פתרונות AI למסעדה</DialogTitle></DialogHeader>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
                        {tools.map((tool, index) => { const ToolComponent = tool.component; return <div key={index}><ToolComponent /></div>; })}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showShop} onOpenChange={setShowShop}>
                <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle className="text-center">👗 חנות בגדים - התחפשות לדמות</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        {employee ? (
                            <>
                                <ApparelShop employeeId={employee.id} balance={balance}
                                    onPurchase={async (item) => {
                                        await base44.entities.CoinTransaction.create({ employee_id: employee.id, employee_name: employee.full_name, amount: -item.cost, reason: `קנייה: ${item.name}`, type: 'redeemed', trigger: 'redemption', status: 'approved' });
                                        setBalance(b => b - item.cost); setRefreshApparel(r => r + 1);
                                    }}
                                    onApparelUpdate={async (item) => {
                                        const prompt = `Full body 3D stylized character avatar, Pixar/Fortnite style, standing in a neutral T-pose. Character ${item.wearing_text}. High-quality 3D render, studio lighting, solid white background.`;
                                        try { const { url } = await base44.integrations.Core.GenerateImage({ prompt }); setEmployeeAvatar(url); } catch {}
                                    }}
                                />
                                <div className="border-t pt-4">
                                    <p className="font-bold text-sm mb-3">🎨 עדכן את הלבוש:</p>
                                    <ApparelCustomizer key={`${showShop}-${refreshApparel}`} employeeId={employee.id} employeeAvatar={employeeAvatar} balance={balance}
                                        onAvatarUpdate={(url) => setEmployeeAvatar(url)}
                                        onSpendCoins={async (cost, reason) => {
                                            await base44.entities.CoinTransaction.create({ employee_id: employee.id, employee_name: employee.full_name, amount: -cost, reason, type: 'redeemed', trigger: 'redemption', status: 'approved' });
                                            setBalance(b => b - cost);
                                        }}
                                    />
                                </div>
                            </>
                        ) : <p className="text-center text-gray-600">טוען נתונים...</p>}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function DashboardInner() {
    const [user, setUser] = React.useState(null);
    const [showCustomizer, setShowCustomizer] = React.useState(false);

    React.useEffect(() => {
        User.me().then(setUser).catch(() => setUser(null));
    }, []);

    const isAdmin = !user || user.role === 'admin';
    const page = isAdmin ? 'admin' : 'employee';
    const { layout, saveLayout, isVisible } = useDashboardLayout(user?.email, page);

    // תצוגה לעובדים רגילים
    if (user && user.role !== 'admin') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6" dir="rtl">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-8 flex items-start justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900 mb-2">שלום {user?.full_name?.split(' ')[0] || 'עובד'}! 👋</h1>
                            <p className="text-slate-600">הכלים שלך למשמרת היום</p>
                        </div>
                        <button onClick={() => setShowCustomizer(true)} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm">
                            <Settings2 className="w-4 h-4" />
                            <span>ערוך דשבורד</span>
                        </button>
                    </div>
                    <div className="grid grid-cols-1 gap-8">
                        {isVisible('smart_tools') && <SmartToolsPanel />}
                        {isVisible('quick_access') && (
                            <Card>
                                <CardHeader><CardTitle className="flex items-center gap-2"><Star className="w-5 h-5 text-yellow-500" />הכלים שלך</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-gray-600">גש לתפריט הניווט עבור:</p>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                        <div className="p-3 bg-blue-50 rounded-lg"><h4 className="font-semibold text-blue-900">הכשרות</h4><p className="text-blue-700">קורסים ואימונים</p></div>
                                        <div className="p-3 bg-green-50 rounded-lg"><h4 className="font-semibold text-green-900">צ'קליסטים</h4><p className="text-green-700">בדיקות יומיות</p></div>
                                        <div className="p-3 bg-purple-50 rounded-lg"><h4 className="font-semibold text-purple-900">לוח מובילים</h4><p className="text-purple-700">הישגים ונקודות</p></div>
                                        <div className="p-3 bg-orange-50 rounded-lg"><h4 className="font-semibold text-orange-900">דיווח תקריות</h4><p className="text-orange-700">דיווח מהיר</p></div>
                                    </div>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
                <DashboardCustomizer open={showCustomizer} onClose={() => setShowCustomizer(false)} layout={layout} onSave={saveLayout} />
            </div>
        );
    }

    // תצוגה למנהלים
    const widgetOrder = layout.map(w => w.id);

    const adminWidgets = {
        smart_tools: isVisible('smart_tools') && (
            <section key="smart_tools">
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">🤖 כלי עבודה חכמים <Badge className="bg-indigo-100 text-indigo-800">AI</Badge></h2>
                <SmartToolsPanel />
            </section>
        ),
        recruitment: isVisible('recruitment') && (
            <div key="recruitment" className="mt-6"><RecruitmentDashboard /></div>
        ),
        quick_stats: isVisible('quick_stats') && (
            <section key="quick_stats">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">📊 מבט מהיר</h2>
                <QuickStats />
            </section>
        ),
        user_guide: isVisible('user_guide') && (
            <Link key="user_guide" to="/UserGuide">
                <Card className="bg-gradient-to-r from-green-600 to-emerald-600 text-white cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                    <CardContent className="p-6 flex items-center justify-between">
                        <div>
                            <h3 className="text-xl font-bold mb-1 flex items-center gap-2"><BookOpen className="w-6 h-6" />📖 מדריך שימוש במערכת</h3>
                            <p className="text-green-100">הסברים מפורטים + סרטוני הדרכה לכל הכלים</p>
                        </div>
                        <ChevronRight className="w-8 h-8 opacity-70" />
                    </CardContent>
                </Card>
            </Link>
        ),
        sales_chart: isVisible('sales_chart') && (
            <section key="sales_chart">
                <h2 className="text-2xl font-bold text-slate-900 mb-4">📈 מכירות וביצועים</h2>
                <SalesChart />
            </section>
        ),
        beecomm_live: isVisible('beecomm_live') && <BeecommLiveWidget key="beecomm_live" />,
        gomiley_live: isVisible('gomiley_live') && <GomileyLiveWidget key="gomiley_live" />,
        gomiley_dashboard: isVisible('gomiley_dashboard') && <GomileyDashboardWidget key="gomiley_dashboard" />,
        shift_insights: isVisible('shift_insights') && <ShiftInsightsWidget key="shift_insights" />,
        active_employees: isVisible('active_employees') && <ActiveEmployeesWidget key="active_employees" />,
        treats_report: isVisible('treats_report') && <TreatsReport key="treats_report" />,
        brief_readers: isVisible('brief_readers') && <BriefReadersWidget key="brief_readers" />,
        recent_incidents: isVisible('recent_incidents') && <RecentIncidents key="recent_incidents" />,
        checklist_status: isVisible('checklist_status') && <ChecklistStatus key="checklist_status" />,
      today_tips: isVisible('today_tips') && <TodayTipsWidget key="today_tips" />,
      low_inventory: isVisible('low_inventory') && <LowInventoryWidget key="low_inventory" />,
      active_deliveries: isVisible('active_deliveries') && <ActiveDeliveriesWidget key="active_deliveries" />,
      pending_requests: isVisible('pending_requests') && <PendingRequestsWidget key="pending_requests" />,
      weekly_leaderboard: isVisible('weekly_leaderboard') && <WeeklyLeaderboardWidget key="weekly_leaderboard" />,
      queue_status: isVisible('queue_status') && <QueueStatusWidget key="queue_status" />,
      recent_feedback: isVisible('recent_feedback') && <RecentFeedbackWidget key="recent_feedback" />,
      today_reservations: isVisible('today_reservations') && <TodayReservationsWidget key="today_reservations" />,
      weekly_performance: isVisible('weekly_performance') && <WeeklyPerformanceWidget key="weekly_performance" />,
      changelog: isVisible('changelog') && <ChangelogWidget key="changelog" />,
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="mb-8 flex items-start justify-between">
                    <div>
                        <h1 className="text-4xl font-bold text-slate-900 mb-2">ברוך הבא, {user?.full_name?.split(' ')[0] || 'מנהל'}! 🎯</h1>
                        <p className="text-xl text-slate-600">מבט כולל על מצב המסעדה היום</p>
                    </div>
                    <button onClick={() => setShowCustomizer(true)} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 shadow-sm font-medium">
                        <Settings2 className="w-4 h-4" />
                        ערוך דשבורד
                    </button>
                </div>

                {widgetOrder.map(id => adminWidgets[id] || null)}
            </div>
            <DashboardCustomizer open={showCustomizer} onClose={() => setShowCustomizer(false)} layout={layout} onSave={saveLayout} />
        </div>
    );
}

export default function Dashboard() {
    return (
        <PageGuard pageName="Dashboard" pageTitle="לוח בקרה">
            <DashboardInner />
        </PageGuard>
    );
}