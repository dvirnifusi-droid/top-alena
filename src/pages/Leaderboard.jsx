import React, { useState, useEffect } from 'react';
import { Shift } from '@/entities/all';
import { InvokeLLM } from "@/integrations/Core";
import { Crown, Trophy, TrendingUp, Loader2, BrainCircuit, BarChart, Sparkles } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import ReactMarkdown from 'react-markdown';

export default function LeaderboardPage() {
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
            const allShifts = await Shift.list();
            
            const now = new Date();
            const filteredShifts = allShifts.filter(shift => {
                const shiftDate = new Date(shift.date);
                if (timeFrame === 'daily') {
                    return shiftDate.toDateString() === now.toDateString();
                }
                if (timeFrame === 'weekly') {
                    const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
                    return shiftDate >= weekStart;
                }
                if (timeFrame === 'monthly') {
                    return shiftDate.getMonth() === now.getMonth() && shiftDate.getFullYear() === now.getFullYear();
                }
                return true;
            });

            const employeeData = {};

            filteredShifts.forEach(shift => {
                if (!employeeData[shift.employee_id]) {
                    employeeData[shift.employee_id] = {
                        employee_name: shift.employee_name,
                        totalSales: 0,
                        totalHours: 0,
                        shifts: 0,
                        managerRatings: [],
                        customerServiceRatings: [],
                        targetMetCount: 0,
                    };
                }
                const emp = employeeData[shift.employee_id];
                emp.totalSales += shift.sales_amount || 0;
                emp.totalHours += shift.hours_worked || 0;
                emp.shifts++;
                if (shift.manager_rating) emp.managerRatings.push(shift.manager_rating);
                if (shift.customer_service_rating) emp.customerServiceRatings.push(shift.customer_service_rating);
                if ((shift.sales_amount || 0) >= (shift.sales_target || 0)) {
                    emp.targetMetCount++;
                }
            });

            const leaderboard = Object.entries(employeeData).map(([id, data]) => {
                const avgManagerRating = data.managerRatings.length ? (data.managerRatings.reduce((a, b) => a + b, 0) / data.managerRatings.length) : 0;
                const avgCustomerServiceRating = data.customerServiceRatings.length ? (data.customerServiceRatings.reduce((a, b) => a + b, 0) / data.customerServiceRatings.length) : 0;
                
                // Scoring formula: Sales + Ratings + Consistency
                const salesScore = data.totalSales * 0.05;
                const managerScore = avgManagerRating * 20;
                const customerScore = avgCustomerServiceRating;
                const consistencyScore = data.shifts * 10;
                
                const totalScore = Math.round(salesScore + managerScore + customerScore + consistencyScore);

                return {
                    id,
                    ...data,
                    avgManagerRating,
                    avgCustomerServiceRating,
                    totalScore
                };
            }).sort((a, b) => b.totalScore - a.totalScore);
            
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
            אתה יועץ ניהול מסעדות מומחה. נתח את ביצועי המלצר/ית הבאים לתקופה ה${timeFrame === 'daily' ? 'יומית' : timeFrame === 'weekly' ? 'שבועית' : 'חודשית'}:

            **שם:** ${employee.employee_name}

            **נתונים:**
            - **סך מכירות:** ${employee.totalSales.toLocaleString()} ₪
            - **מספר משמרות:** ${employee.shifts}
            - **דירוג מנהל ממוצע:** ${employee.avgManagerRating.toFixed(1)} / 5
            - **דירוג שירות לקוחות ממוצע:** ${employee.avgCustomerServiceRating.toFixed(1)}%
            - **אחוז עמידה ביעדים:** ${((employee.targetMetCount / employee.shifts) * 100).toFixed(0)}%

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
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 text-center">{getRankIcon(index)}</div>
                                            <div>
                                                <p className="text-xl font-semibold text-gray-800">{player.employee_name}</p>
                                                <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                                    <span>מכירות: ₪{player.totalSales.toLocaleString()}</span>
                                                    <span>דירוג מנהל: {player.avgManagerRating.toFixed(1)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                             <Button variant="outline" size="sm" onClick={() => handleGetAnalysis(player)}>
                                                <BrainCircuit className="w-4 h-4 ml-2" />
                                                ניתוח AI
                                            </Button>
                                            <div className="text-2xl font-bold text-orange-600">
                                                {player.totalScore.toLocaleString()} נק'
                                            </div>
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