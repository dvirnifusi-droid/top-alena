import React, { useState, useCallback, useEffect } from 'react';
import { User } from '@/entities/User';
import PageGuard from '../components/shared/PageGuard';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, CheckCircle, AlertTriangle, Star, Brain, Zap, ChevronRight, Bot, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import ApparelShop from '../components/gamification/ApparelShop';
import ApparelCustomizer from '../components/gamification/ApparelCustomizer';

import RecentIncidents from '../components/dashboard/RecentIncidents';
import ChecklistStatus from '../components/dashboard/ChecklistStatus';


import AiQuickAdd from '../components/dashboard/AiQuickAdd';
import SeatingAiHelper from '../components/dashboard/SeatingAiHelper';
import InvoiceScanner from '../components/dashboard/InvoiceScanner';
import ManualSurveyTool from '../components/dashboard/ManualSurveyTool';
import InventoryScanner from '../components/dashboard/InventoryScanner';
import SurveyQRGenerator from '../components/dashboard/SurveyQRGenerator';
import ActiveEmployeesWidget from '../components/dashboard/ActiveEmployeesWidget';
import BriefReadersWidget from '../components/dashboard/BriefReadersWidget';
import DashboardViewersWidget from '../components/dashboard/DashboardViewersWidget';

// רכיב סטטיסטיקות מהירות מעודכן
function QuickStats() {
    const [realTimeData, setRealTimeData] = React.useState({
        todayReservations: 0,
        todaySales: 0,
        completedChecklists: 0,
        totalChecklists: 0,
        openIncidents: 0
    });
    const [loading, setLoading] = React.useState(true);

    const loadRealTimeData = React.useCallback(async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // טעינת נתונים אמיתיים
            const [
                { TableSession },
                { ShiftEndReport },
                { ChecklistExecution },
                { Checklist },
                { Incident }
            ] = await Promise.all([
                import('@/entities/TableSession').catch(() => ({ TableSession: null })),
                import('@/entities/ShiftEndReport').catch(() => ({ ShiftEndReport: null })),
                import('@/entities/ChecklistExecution').catch(() => ({ ChecklistExecution: null })),
                import('@/entities/Checklist').catch(() => ({ Checklist: null })),
                import('@/entities/Incident').catch(() => ({ Incident: null }))
            ]);

            // Initialize a fresh data object for the current fetch to avoid stale closure issues
            let data = {
                todayReservations: 0,
                todaySales: 0,
                completedChecklists: 0,
                totalChecklists: 0,
                openIncidents: 0
            };

            // הזמנות היום מניהול הושבה
            if (TableSession) {
                try {
                    const todaySessions = await TableSession.filter({ 
                        session_start: { $gte: today + 'T00:00:00', $lt: today + 'T23:59:59' } 
                    });
                    data.todayReservations = todaySessions.length;
                } catch (e) {
                    console.warn('Could not load table sessions:', e);
                }
            }

            // מכירות מדוחות סוף משמרת
            if (ShiftEndReport) {
                try {
                    const todayReports = await ShiftEndReport.filter({ shift_date: today });
                    data.todaySales = todayReports.reduce((sum, report) => sum + (report.total_revenue || 0), 0);
                } catch (e) {
                    console.warn('Could not load shift reports:', e);
                }
            }

            // צ'קליסטים
            if (ChecklistExecution && Checklist) {
                try {
                    const [executions, checklists] = await Promise.all([
                        ChecklistExecution.filter({ execution_date: { $gte: today + 'T00:00:00' } }),
                        Checklist.filter({ status: 'active' })
                    ]);
                    data.completedChecklists = executions.filter(e => e.status === 'completed').length;
                    data.totalChecklists = checklists.length;
                } catch (e) {
                    console.warn('Could not load checklists:', e);
                }
            }

            // תקריות פתוחות
            if (Incident) {
                try {
                    const openIncidents = await Incident.filter({ 
                        status: { $in: ['reported', 'investigating', 'in_progress'] } 
                    });
                    data.openIncidents = openIncidents.length;
                } catch (e) {
                    console.warn('Could not load incidents:', e);
                }
            }

            setRealTimeData(data);
        } catch (error) {
            console.error('Error loading real-time data:', error);
        } finally {
            setLoading(false);
        }
    }, []); // Empty dependency array as `loadRealTimeData` constructs new state from scratch.

    React.useEffect(() => {
        loadRealTimeData();
    }, [loadRealTimeData]); // `useEffect` depends on the memoized `loadRealTimeData` function.

    const statsData = [
        {
            title: "מכירות היום",
            value: loading ? "טוען..." : `₪${realTimeData.todaySales.toLocaleString()}`,
            icon: TrendingUp,
            color: "green",
            trend: "מדוחות יומיים",
            clickUrl: createPageUrl("Reports")
        },
        {
            title: "צ'קליסטים",
            value: loading ? "טוען..." : `${realTimeData.completedChecklists}/${realTimeData.totalChecklists}`,
            icon: CheckCircle,
            color: "purple",
            trend: `נותרו ${realTimeData.totalChecklists - realTimeData.completedChecklists}`,
            clickUrl: createPageUrl("Checklists")
        },
        {
            title: "תקריות פתוחות",
            value: loading ? "טוען..." : realTimeData.openIncidents.toString(),
            icon: AlertTriangle,
            color: "orange",
            trend: realTimeData.openIncidents > 0 ? "דורש טיפול" : "הכל תקין",
            clickUrl: createPageUrl("Incidents")
        }
    ];

    const colorVariants = {
        blue: "from-blue-500 to-blue-600",
        green: "from-green-500 to-green-600", 
        purple: "from-purple-500 to-purple-600",
        orange: "from-orange-500 to-orange-600"
    };

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

// רכיב כלים חכמים
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
                    const sum = trans.reduce((acc, t) => acc + (t.amount || 0), 0);
                    setBalance(sum);
                }
            } catch (e) {
                console.error('Failed to load employee data:', e);
            }
        };
        loadData();
    }, []);

    const tools = [
        {
            component: AiQuickAdd,
            title: "הוספת ידע לעוזר AI",
            description: "הכנס מתכונים, נהלים ומידע חדש",
            icon: Brain
        },
        {
            component: SeatingAiHelper,
            title: "עוזר הושבה חכם",
            description: "קבל המלצות הושבה מבוסס AI",
            icon: Bot
        },
        {
            component: InvoiceScanner,
            title: "סריקת חשבוניות",
            description: "סרוק חשבוניות ועדכן מלאי אוטומטית",
            icon: Sparkles
        },
        {
            component: InventoryScanner,
            title: "סורק מלאי חכם",
            description: "צלם מדף וקבל התראות מלאי",
            icon: Zap
        },
        {
            component: ManualSurveyTool,
            title: "שליחת סקר ללקוח",
            description: "שלח סקר שביעות רצון בוואטסאפ",
            icon: Star
        },
        {
            component: SurveyQRGenerator,
            title: "ברקודי סקרים",
            description: "יצור ברקודים להדפסה על חשבונות",
            icon: CheckCircle
        }
    ];

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card 
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                    onClick={() => setIsOpen(true)}
                >
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold mb-2">🤖 כלי עבודה חכמים</h3>
                                <p className="text-indigo-100 mb-4">
                                    כלים מבוססי AI לחיסכון בזמן
                                </p>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-white/20 text-white">
                                        {tools.length} כלים
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-2">
                                    <Brain className="w-8 h-8" />
                                </div>
                                <ChevronRight className="w-6 h-6" />
                            </div>
                        </div>
                    </CardContent>
                </Card>



                <Card 
                    className="bg-gradient-to-r from-orange-600 to-amber-600 text-white cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                    onClick={() => setShowShop(true)}
                >
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xl font-bold mb-2">👗 חנות בגדים</h3>
                                <p className="text-amber-100 mb-4">
                                    התחפשות וקנייה של אביזרים
                                </p>
                                <span className="text-white font-semibold text-sm">{balance.toLocaleString()} 🪙</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                                    <span className="text-3xl">👕</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl text-center mb-4">
                            🤖 כלי עבודה חכמים - פתרונות AI למסעדה
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
                        {tools.map((tool, index) => {
                            const ToolComponent = tool.component;
                            return (
                                <div key={index}>
                                    <ToolComponent />
                                </div>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={showShop} onOpenChange={setShowShop}>
                <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="text-center">👗 חנות בגדים - התחפשות לדמות</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {employee ? (
                            <>
                                <ApparelShop 
                                employeeId={employee.id}
                                balance={balance}
                                onPurchase={async (item) => {
                                    await base44.entities.CoinTransaction.create({
                                        employee_id: employee.id,
                                        employee_name: employee.full_name,
                                        amount: -item.cost,
                                        reason: `קנייה: ${item.name}`,
                                        type: 'redeemed',
                                        trigger: 'redemption',
                                        status: 'approved'
                                    });
                                    setBalance(b => b - item.cost);
                                    setRefreshApparel(r => r + 1);
                                }}
                                onApparelUpdate={async (item) => {
                                    // עדכן את הדמות להציג את הפריט החדש
                                    const apparelItems = [item.wearing_text];
                                    const prompt = `Full body 3D stylized character avatar, Pixar/Fortnite style, standing in a neutral T-pose. Character ${apparelItems.join(', ')}. High-quality 3D render, studio lighting, solid white background. Professional 3D game character design.`;

                                    try {
                                      const { url } = await base44.integrations.Core.GenerateImage({ prompt });
                                      setEmployeeAvatar(url);
                                    } catch (error) {
                                      console.error('Error generating avatar:', error);
                                    }
                                }}
                                />
                                <div className="border-t pt-4">
                                    <p className="font-bold text-sm mb-3">🎨 עדכן את הלבוש:</p>
                                    <ApparelCustomizer 
                                        key={`${showShop}-${refreshApparel}`}
                                        employeeId={employee.id}
                                        employeeAvatar={employeeAvatar}
                                        balance={balance}
                                        onAvatarUpdate={(url) => {
                                            setEmployeeAvatar(url);
                                        }}
                                        onSpendCoins={async (cost, reason) => {
                                            await base44.entities.CoinTransaction.create({
                                                employee_id: employee.id,
                                                employee_name: employee.full_name,
                                                amount: -cost,
                                                reason,
                                                type: 'redeemed',
                                                trigger: 'redemption',
                                                status: 'approved'
                                            });
                                            setBalance(b => b - cost);
                                        }}
                                    />
                                </div>
                            </>
                        ) : (
                            <p className="text-center text-gray-600">טוען נתונים...</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

function DashboardInner() {
     const [user, setUser] = React.useState(null);

     React.useEffect(() => {
         User.me().then(setUser).catch(() => setUser(null));
     }, []);

     // Track dashboard view
     React.useEffect(() => {
         const trackDashboardView = async () => {
             try {
                 const currentUser = await base44.auth.me();
                 if (currentUser) {
                     const today = new Date().toISOString().split('T')[0];
                     await base44.entities.DashboardView.create({
                         user_email: currentUser.email,
                         user_name: currentUser.full_name || currentUser.email,
                         view_date: today,
                         view_time: new Date().toISOString(),
                         user_role: currentUser.role
                     });
                 }
             } catch (error) {
                 console.error('Failed to track dashboard view:', error);
             }
         };
         trackDashboardView();
     }, []);

    // תצוגה לעובדים רגילים
    if (user && user.role !== 'admin') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6" dir="rtl">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-8">
                        <h1 className="text-3xl font-bold text-slate-900 mb-2">
                            שלום {user?.full_name?.split(' ')[0] || 'עובד'}! 👋
                        </h1>
                        <p className="text-slate-600">הכלים שלך למשמרת היום</p>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                        <SmartToolsPanel />
                        
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Star className="w-5 h-5 text-yellow-500" />
                                    הכלים שלך
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-gray-600">גש לתפריט הניווט עבור:</p>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="p-3 bg-blue-50 rounded-lg">
                                        <h4 className="font-semibold text-blue-900">הכשרות</h4>
                                        <p className="text-blue-700">קורסים ואימונים</p>
                                    </div>
                                    <div className="p-3 bg-green-50 rounded-lg">
                                        <h4 className="font-semibold text-green-900">צ'קליסטים</h4>
                                        <p className="text-green-700">בדיקות יומיות</p>
                                    </div>
                                    <div className="p-3 bg-purple-50 rounded-lg">
                                        <h4 className="font-semibold text-purple-900">לוח מובילים</h4>
                                        <p className="text-purple-700">הישגים ונקודות</p>
                                    </div>
                                    <div className="p-3 bg-orange-50 rounded-lg">
                                        <h4 className="font-semibold text-orange-900">דיווח תקריות</h4>
                                        <p className="text-orange-700">דיווח מהיר</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        );
    }

    // תצוגה למנהלים - מסודר לפי קטגוריות
    return (

        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6" dir="rtl">

            <div className="max-w-7xl mx-auto space-y-8">
                {/* כותרת ראשית */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-slate-900 mb-2">
                        ברוך הבא, {user?.full_name?.split(' ')[0] || 'מנהל'}! 🎯
                    </h1>
                    <p className="text-xl text-slate-600">מבט כולל על מצב המסעדה היום</p>
                </div>

                {/* 🤖 כלי עבודה חכמים - במקום הראשון */}
                <section>
                    <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                        🤖 כלי עבודה חכמים
                        <Badge className="bg-indigo-100 text-indigo-800">AI</Badge>
                    </h2>
                    <SmartToolsPanel />
                </section>

                {/* 📊 סטטיסטיקות מהירות */}
                <section>
                    <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                        📊 מבט מהיר
                    </h2>
                    <QuickStats />
                </section>

                {/* 📈 מכירות וממשקים */}
                 <section>
                     <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                         📈 מכירות וביצועים
                     </h2>
                     <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                              <div>
                                  <ActiveEmployeesWidget />
                              </div>
                              <div>
                                  <BriefReadersWidget />
                              </div>
                              <div>
                                  <DashboardViewersWidget />
                              </div>

                          </div>
                 </section>


            </div>
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