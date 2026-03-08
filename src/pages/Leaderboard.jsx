import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageGuard from '../components/shared/PageGuard';
import { Crown, Trophy, TrendingUp, Loader2, BrainCircuit, BarChart, Sparkles, Clock, Star, Banknote, CheckSquare, GraduationCap, Heart, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { base44 as b44 } from '@/api/base44Client';
import ReactMarkdown from 'react-markdown';

function LeaderboardInner() {
    const [performanceData, setPerformanceData] = useState([]);
    const [timeFrame, setTimeFrame] = useState('monthly');
    const [loading, setLoading] = useState(true);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);

    useEffect(() => {
        const getPerformanceData = async () => {
            setLoading(true);
            const now = new Date();

            // חישוב תאריך התחלה לפי טווח
            const getStartDate = () => {
                const d = new Date(now);
                if (timeFrame === 'daily') { d.setHours(0,0,0,0); return d; }
                if (timeFrame === 'weekly') { d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; }
                if (timeFrame === 'monthly') { return new Date(d.getFullYear(), d.getMonth(), 1); }
                return null;
            };
            const startDate = getStartDate();
            const inRange = (dateStr) => !startDate || new Date(dateStr) >= startDate;

            // שליפת נתונים במקביל
            const [workShifts, tipReports, shiftEndReports, staffPerfs, trainingEnrollments, checklistExecs, employees] = await Promise.all([
                base44.entities.WorkShift.list('-date', 500),
                base44.entities.TipReport.list('-date', 200),
                base44.entities.ShiftEndReport.list('-shift_date', 200),
                base44.entities.StaffPerformance.list('-date', 500),
                base44.entities.TrainingEnrollment.list('-created_date', 500),
                base44.entities.ChecklistExecution.list('-execution_date', 500),
                base44.entities.Employee.filter({ status: 'active' }),
            ]);

            const empData = {}; // key = employee_name (כי אין ID אחיד בכל הדאטה)

            const getOrCreate = (name) => {
                if (!empData[name]) {
                    empData[name] = {
                        employee_name: name,
                        shifts: 0,
                        totalHours: 0,
                        tipPerHourSamples: [],
                        managerRatings: [],
                        compliments: 0,
                        trainingCompleted: 0,
                        checklistsDone: 0,
                    };
                }
                return empData[name];
            };

            // 1. משמרות + שעות מ-WorkShift
            workShifts.filter(ws => inRange(ws.date)).forEach(ws => {
                (ws.assigned_staff || []).forEach(s => {
                    if (!s.employee_name) return;
                    const emp = getOrCreate(s.employee_name);
                    emp.shifts++;
                    if (s.start_time && s.end_time) {
                        const [sh, sm] = s.start_time.split(':').map(Number);
                        const [eh, em] = s.end_time.split(':').map(Number);
                        let hours = (eh * 60 + em - sh * 60 - sm - (s.total_break_minutes || 0)) / 60;
                        if (hours < 0) hours += 24;
                        emp.totalHours += Math.max(0, hours);
                    }
                });
            });

            // 2. טיפ לשעה מ-TipReport
            tipReports.filter(tr => inRange(tr.date)).forEach(tr => {
                (tr.staff_details || []).forEach(s => {
                    if (!s.employee_name || !s.effective_hours || s.effective_hours <= 0) return;
                    const tipPerHour = (s.gross_tip || 0) / s.effective_hours;
                    const emp = getOrCreate(s.employee_name);
                    emp.tipPerHourSamples.push(tipPerHour);
                });
            });

            // 3. דירוג מנהל מ-ShiftEndReport
            shiftEndReports.filter(r => inRange(r.shift_date)).forEach(r => {
                (r.staff_performance || []).forEach(s => {
                    if (!s.employee_name || !s.performance_rating) return;
                    const emp = getOrCreate(s.employee_name);
                    emp.managerRatings.push(s.performance_rating);
                });
            });

            // 4. מחמאות מ-StaffPerformance
            staffPerfs.filter(sp => inRange(sp.date)).forEach(sp => {
                const emp = employees.find(e => e.id === sp.employee_id);
                if (!emp?.full_name) return;
                const d = getOrCreate(emp.full_name);
                d.compliments += sp.compliments_count || 0;
            });

            // 5. הכשרות שהושלמו
            trainingEnrollments.filter(e => e.status === 'completed' && inRange(e.created_date)).forEach(e => {
                const emp = employees.find(em => em.id === e.employee_id);
                if (!emp?.full_name) return;
                getOrCreate(emp.full_name).trainingCompleted++;
            });

            // 6. צ'קליסטים שהושלמו
            checklistExecs.filter(c => c.status === 'completed' && inRange(c.execution_date)).forEach(c => {
                if (!c.executed_by_name) return;
                getOrCreate(c.executed_by_name).checklistsDone++;
            });

            // חישוב ניקוד סופי
            const leaderboard = Object.values(empData).map(data => {
                const avgManagerRating = data.managerRatings.length
                    ? data.managerRatings.reduce((a, b) => a + b, 0) / data.managerRatings.length : 0;
                const avgTipPerHour = data.tipPerHourSamples.length
                    ? data.tipPerHourSamples.reduce((a, b) => a + b, 0) / data.tipPerHourSamples.length : 0;

                const shiftsScore      = data.shifts * 15;           // 15 נק' למשמרת
                const hoursScore       = Math.round(data.totalHours) * 5;  // 5 נק' לשעה
                const tipScore         = Math.round(avgTipPerHour) * 3;    // 3 נק' לכל ₪ טיפ/שעה
                const managerScore     = Math.round(avgManagerRating * 20); // עד 100 נק' (5*20)
                const complimentsScore = data.compliments * 10;       // 10 נק' למחמאה
                const trainingScore    = data.trainingCompleted * 25; // 25 נק' לקורס
                const checklistScore   = data.checklistsDone * 5;     // 5 נק' לצ'קליסט

                const totalScore = shiftsScore + hoursScore + tipScore + managerScore + complimentsScore + trainingScore + checklistScore;

                return {
                    ...data,
                    avgManagerRating,
                    avgTipPerHour,
                    shiftsScore, hoursScore, tipScore, managerScore, complimentsScore, trainingScore, checklistScore,
                    totalScore
                };
            }).filter(d => d.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore);

            setPerformanceData(leaderboard);
            setLoading(false);
        };

        getPerformanceData();
    }, [timeFrame]);

    const handleGetAnalysis = async (employee) => {
        setSelectedEmployee(employee);
        setIsAnalysisOpen(true);
        setAnalysisLoading(true);
        setAnalysisResult(null);

        const prompt = `
            אתה יועץ ניהול מסעדות מומחה. נתח את ביצועי העובד/ת הבאים לתקופה ה${timeFrame === 'daily' ? 'יומית' : timeFrame === 'weekly' ? 'שבועית' : 'חודשית'}:

            **שם:** ${employee.employee_name}

            **נתונים:**
            - **מספר משמרות:** ${employee.shifts} (${employee.shiftsScore} נק')
            - **סך שעות עבודה:** ${employee.totalHours.toFixed(1)} שעות (${employee.hoursScore} נק')
            - **ממוצע טיפ לשעה:** ₪${employee.avgTipPerHour.toFixed(1)} (${employee.tipScore} נק')
            - **דירוג מנהל ממוצע:** ${employee.avgManagerRating.toFixed(1)} / 5 (${employee.managerScore} נק')
            - **מחמאות לקוחות:** ${employee.compliments} (${employee.complimentsScore} נק')
            - **קורסי הכשרה שהושלמו:** ${employee.trainingCompleted} (${employee.trainingScore} נק')
            - **צ'קליסטים שהושלמו:** ${employee.checklistsDone} (${employee.checklistScore} נק')
            - **סך נקודות:** ${employee.totalScore}

            **המשימה שלך:**
            1.  **ניתוח קצר:** סכם את הביצועים, תוך הדגשת נקודות חוזק וחולשה.
            2.  **המלצות לשיפור:** ספק 3 המלצות ספציפיות, מעשיות וברורות, כיצד העובד/ת יכול/ה להשתפר. התמקד בתחומים החלשים ביותר.
            3.  **שבחים:** ציין נקודה חיובית אחת בולטת שכדאי לשבח.

            **פורמט הפלט (השתמש במרקדאון):**
            ### ניתוח ביצועים - ${employee.employee_name}

            **📊 סיכום ביצועים:**
            [סיכום קצר של החוזקות והחולשות]

            **🚀 המלצות לשיפור:**
            1.  **[כותרת המלצה 1]:** [פירוט ההמלצה]
            2.  **[כותרת המלצה 2]:** [פירוט ההמלצה]
            3.  **[כותרת המלצה 3]:** [פירוט ההמלצה]

            **⭐ נקודה לשימור וחיזוק:**
            [ציון נקודת החוזק הבולטת]
        `;

        try {
            const result = await InvokeLLM({ prompt });
            setAnalysisResult(result);
        } catch (error) {
            setAnalysisResult("שגיאה בניתוח הנתונים. נסה שוב.");
            console.error("AI analysis error:", error);
        } finally {
            setAnalysisLoading(false);
        }
    };
    
    const getRankIcon = (rank) => {
        if (rank === 0) return <Crown className="w-8 h-8 text-yellow-400" />;
        if (rank === 1) return <Trophy className="w-7 h-7 text-gray-400" />;
        if (rank === 2) return <Trophy className="w-6 h-6 text-yellow-600" />;
        return <span className="text-xl font-bold text-gray-500">{rank + 1}</span>;
    };

    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen" dir="rtl">
            <div className="max-w-4xl mx-auto">
                <Card className="bg-gradient-to-br from-orange-500 to-red-600 text-white shadow-2xl mb-8">
                    <CardHeader className="flex flex-row items-center gap-4">
                        <TrendingUp className="w-12 h-12" />
                        <div>
                            <CardTitle className="text-4xl font-bold">לוח המובילים</CardTitle>
                            <CardDescription className="text-orange-100 text-lg">טבלת המצטיינים של עלינא</CardDescription>
                        </div>
                    </CardHeader>
                </Card>

                <Tabs value={timeFrame} onValueChange={setTimeFrame} className="mb-6">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="daily">היום</TabsTrigger>
                        <TabsTrigger value="weekly">השבוע</TabsTrigger>
                        <TabsTrigger value="monthly">החודש</TabsTrigger>
                    </TabsList>
                </Tabs>

                {loading ? (
                    <div className="flex items-center justify-center p-12"><Loader2 className="w-12 h-12 animate-spin text-orange-500" /></div>
                ) : (
                    <div className="space-y-4">
                        {performanceData.length > 0 ? (
                            performanceData.map((player, index) => (
                                <Card key={player.id} className="shadow-md hover:shadow-lg transition-shadow duration-300">
                                    <CardContent className="p-4 flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                           <div className="w-10 text-center flex-shrink-0">{getRankIcon(index)}</div>
                                           <div className="min-w-0">
                                               <p className="text-base sm:text-lg font-bold text-gray-800">{player.employee_name}</p>
                                               <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                                                   <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3 text-blue-400"/>{player.shifts} משמרות</span>
                                                   <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-indigo-400"/>{player.totalHours.toFixed(0)} שעות</span>
                                                   <span className="flex items-center gap-1"><Banknote className="w-3 h-3 text-green-400"/>₪{player.avgTipPerHour.toFixed(0)}/שעה</span>
                                                   <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-400"/>{player.avgManagerRating.toFixed(1)}/5</span>
                                                   {player.compliments > 0 && <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-pink-400"/>{player.compliments} מחמאות</span>}
                                                   {player.trainingCompleted > 0 && <span className="flex items-center gap-1"><GraduationCap className="w-3 h-3 text-purple-400"/>{player.trainingCompleted} קורסים</span>}
                                               </div>
                                           </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                           <div className="text-xl sm:text-2xl font-bold text-orange-600">
                                               {player.totalScore.toLocaleString()} נק'
                                           </div>
                                           <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleGetAnalysis(player)}>
                                               <BrainCircuit className="w-3 h-3 ml-1" />
                                               ניתוח AI
                                           </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        ) : (
                            <Card>
                                <CardContent className="p-8 text-center text-gray-500">
                                    <BarChart className="w-12 h-12 mx-auto mb-4" />
                                    <p>אין נתונים להצגה עבור תקופת הזמן שנבחרה.</p>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}
            </div>

            <Dialog open={isAnalysisOpen} onOpenChange={setIsAnalysisOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-2xl">
                            <Sparkles className="w-6 h-6 text-orange-500" />
                            ניתוח ביצועי AI
                        </DialogTitle>
                        {selectedEmployee && <DialogDescription>עבור {selectedEmployee.employee_name}</DialogDescription>}
                    </DialogHeader>
                    <div className="py-4 max-h-[60vh] overflow-y-auto">
                        {analysisLoading ? (
                            <div className="flex flex-col items-center justify-center gap-3 p-8">
                                <Loader2 className="w-10 h-10 animate-spin text-orange-500" />
                                <p className="text-gray-600">המוח הדיגיטלי שלנו מנתח את הנתונים...</p>
                            </div>
                        ) : (
                            <div className="prose prose-sm max-w-none">
                                <ReactMarkdown>{analysisResult}</ReactMarkdown>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default function LeaderboardPage() {
    return (
        <PageGuard pageName="Leaderboard" pageTitle="לוח המובילים">
            <LeaderboardInner />
        </PageGuard>
    );
}