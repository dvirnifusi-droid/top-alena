import React, { useState, useEffect, useRef } from 'react';
import { User } from '@/entities/User';
import { DailyBrief } from '@/entities/DailyBrief';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, GraduationCap, CheckSquare, AlertTriangle, Calendar, CalendarDays, Utensils, Brain, Sparkles, FileText, Megaphone, Briefcase, MessageCircle, Camera } from 'lucide-react';
import ShiftNotificationBell from '../components/shared/ShiftNotificationBell';
import { Employee } from '@/entities/Employee';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from 'date-fns';

import InvoiceScanner from '../components/dashboard/InvoiceScanner';
import ManualSurveyTool from '../components/dashboard/ManualSurveyTool';
import SeatingAiHelper from '../components/dashboard/SeatingAiHelper';
import AiQuickAdd from '../components/dashboard/AiQuickAdd';
import DailyBriefView from '../components/briefing/DailyBriefView';
import ShiftClockWidget from '../components/shift/ShiftClockWidget';
import WeeklyScheduleSummary from '../components/employee/WeeklyScheduleSummary';
import CoinWidget from '../components/gamification/CoinWidget';
import DailyChallengeCard from '../components/gamification/DailyChallengeCard';
import ConfettiEffect from '../components/gamification/ConfettiEffect';

export default function EmployeeHome() {
    const [user, setUser] = useState(null);
    const [currentEmployee, setCurrentEmployee] = useState(null);
    const [showSmartTools, setShowSmartTools] = useState(false);
    const [todayBriefs, setTodayBriefs] = useState([]);
    const [selectedBrief, setSelectedBrief] = useState(null);
    const [todayPosition, setTodayPosition] = useState(null);
    const [showConfetti, setShowConfetti] = useState(false);
    const [confettiMsg, setConfettiMsg] = useState('');
    const fileInputRef = useRef();

    useEffect(() => {
        User.me().then(async u => {
            setUser(u);
            loadTodayBriefs();
            loadTodayPosition();
            const emps = await Employee.filter({ status: 'active' });
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
                if (assignment) {
                    setTodayPosition(assignment.position);
                    return;
                }
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
        {
            component: InvoiceScanner,
            title: "סריקת חשבוניות ספק",
            description: "סרוק חשבונית ועדכן מלאי אוטומטית",
            icon: FileText,
            color: "from-blue-500 to-indigo-600"
        },
        {
            component: ManualSurveyTool,
            title: "שליחת סקר ללקוח",
            description: "שלח סקר שביעות רצון בוואטסאפ",
            icon: Star,
            color: "from-green-500 to-emerald-600"
        },
        {
            component: SeatingAiHelper,
            title: "עוזר הושבה חכם",
            description: "קבל המלצות הושבה מבוסס AI",
            icon: Brain,
            color: "from-blue-500 to-indigo-600"
        },
        {
            component: AiQuickAdd,
            title: "הוספת ידע לעוזר AI",
            description: "הכנס מתכונים, נהלים ומידע חדש",
            icon: Sparkles,
            color: "from-purple-500 to-blue-600"
        }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {/* כותרת עם אוואטר */}
                <div className="mb-8">
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                            {currentEmployee?.avatar_url && (
                                <img 
                                    src={currentEmployee.avatar_url} 
                                    alt="avatar" 
                                    className="w-16 h-16 rounded-full object-cover border-2 border-indigo-500 shadow-lg flex-shrink-0"
                                />
                            )}
                            <div>
                                <h1 className="text-3xl font-bold text-slate-900 mb-2">
                                    שלום {user?.full_name?.split(' ')[0] || 'עובד'}! 👋
                                </h1>
                                <div className="flex items-center gap-3">
                                    <p className="text-slate-600">הכלים שלך למשמרת היום</p>
                                    {todayPosition && (
                                        <Badge className="bg-indigo-600 text-white flex items-center gap-1">
                                            <Briefcase className="w-4 h-4" />
                                            {todayPosition}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            {currentEmployee && <CoinWidget employeeId={currentEmployee.id} employeeName={currentEmployee.full_name} />}
                            <ShiftNotificationBell currentEmployee={currentEmployee} isManager={false} />
                        </div>
                    </div>
                </div>

                <ConfettiEffect trigger={showConfetti} message={confettiMsg} emoji="🎉" onDone={() => setShowConfetti(false)} />

                {/* אתגר יומי */}
                {currentEmployee && (
                    <div className="mb-4">
                        <DailyChallengeCard
                            employeeId={currentEmployee.id}
                            employeeName={currentEmployee.full_name}
                            onCoinsEarned={(amount, msg) => { setConfettiMsg(msg); setShowConfetti(true); }}
                        />
                    </div>
                )}

                {/* שעון משמרת */}
                <ShiftClockWidget />

                {/* סידור עבודה שבועי */}
                {user && <WeeklyScheduleSummary userId={user.id} currentEmployee={currentEmployee} />}

                {/* תדריכי היום */}
                {todayBriefs.length > 0 && (
                    <div className="mb-6 space-y-3">
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
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
                                            {isRead ? (
                                                <Badge className="bg-green-500 text-white text-xs">✅ קראתי</Badge>
                                            ) : (
                                                <Badge className="bg-orange-500 text-white text-xs animate-bounce">📣 חדש!</Badge>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {/* כרטיס כלי עבודה חכמים */}
                <div className="mb-8">
                    <Card 
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                        onClick={() => setShowSmartTools(true)}
                    >
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                                        <Brain className="w-6 h-6" />
                                        🤖 כלי עבודה חכמים
                                    </h3>
                                    <p className="text-indigo-100 mb-4">
                                        כלים מבוססי AI לחיסכון בזמן ושיפור היעילות
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary" className="bg-white/20 text-white">
                                            {smartTools.length} כלים
                                        </Badge>
                                        <Badge variant="secondary" className="bg-white/20 text-white">
                                            זמין עבורך!
                                        </Badge>
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

                {/* כפתור צלם פתק */}
                <div className="mb-6">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                        if (e.target.files?.[0]) {
                            window.location.href = createPageUrl("Deliveries");
                        }
                    }} />
                    <Link to={createPageUrl("Deliveries")}>
                        <button className="w-full bg-primary text-primary-foreground rounded-2xl py-5 flex flex-col items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform hover:opacity-90">
                            <Camera className="w-10 h-10" />
                            <span className="text-xl font-bold">צלם פתק</span>
                            <span className="text-sm opacity-80">לחץ לסריקה מהירה</span>
                        </button>
                    </Link>
                </div>

                {/* כרטיסי גישה מהירה */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Link to={createPageUrl("Training")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-3">
                                        <GraduationCap className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">הכשרות ואימונים</h3>
                                    <p className="text-sm text-gray-600">קורסים ומשחקים לשיפור הביצועים</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("Checklists")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mb-3">
                                        <CheckSquare className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">צ'קליסטים</h3>
                                    <p className="text-sm text-gray-600">בדיקות יומיות ומשימות</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("Incidents")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center mb-3">
                                        <AlertTriangle className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">דיווח תקריות</h3>
                                    <p className="text-sm text-gray-600">דיווח מהיר על בעיות</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("Leaderboard")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-3">
                                        <Star className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">לוח מובילים</h3>
                                    <p className="text-sm text-gray-600">הישגים ונקודות</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("WorkScheduling")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center mb-3">
                                        <Calendar className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">סידור העבודה</h3>
                                    <p className="text-sm text-gray-600">המשמרות שלך השבוע</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("WaiterTables")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-pink-600 rounded-lg flex items-center justify-center mb-3">
                                        <Utensils className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">השולחנות שלי</h3>
                                    <p className="text-sm text-gray-600">ניהול שולחנות במשמרת</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("MyPerformance")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-lg flex items-center justify-center mb-3">
                                        <Star className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">הביצועים שלי</h3>
                                    <p className="text-sm text-gray-600">נתונים ודירוגים</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("ShiftEndReport")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center mb-3">
                                        <CheckSquare className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">דוח סיום משמרת</h3>
                                    <p className="text-sm text-gray-600">סיכום המשמרת</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("EmployeeReports")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg flex items-center justify-center mb-3">
                                        <FileText className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">דוחות עובדים</h3>
                                    <p className="text-sm text-gray-600">שעות, טיפים וביצועים</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("LeaveRequests")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center mb-3">
                                        <CalendarDays className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">בקשות חופשה</h3>
                                    <p className="text-sm text-gray-600">הגש בקשת חופשה או מחלה</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link to={createPageUrl("ShiftChat")}>
                        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                            <CardContent className="p-6">
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg flex items-center justify-center mb-3">
                                        <MessageCircle className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-semibold text-lg mb-2">צ'אט משמרת</h3>
                                    <p className="text-sm text-gray-600">תקשורת פנימית לצוות</p>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
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

            {/* דיאלוג כלי עבודה חכמים */}
            <Dialog open={showSmartTools} onOpenChange={setShowSmartTools}>
                <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="text-2xl text-center mb-4">
                            🤖 כלי עבודה חכמים - פתרונות AI למסעדה
                        </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
                        {smartTools.map((tool, index) => {
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
        </div>
    );
}