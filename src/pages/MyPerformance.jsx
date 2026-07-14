
import React, { useState, useEffect, useMemo } from 'react';
import { User, Employee, Shift } from '@/entities/all';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { Calendar, Clock, DollarSign, Star, Target, AlertCircle, RefreshCw } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/PageHeader';

export default function MyPerformance() {
    const [user, setUser] = useState(null);
    const [employee, setEmployee] = useState(null);
    const [shifts, setShifts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        try {
            // Get current user details
            const currentUser = await User.me();
            setUser(currentUser);

            // Normalize the user's email to lowercase for matching
            if (!currentUser.email) {
                console.log('משתמש ללא אימייל');
                setIsLoading(false);
                return;
            }

            const userEmail = currentUser.email.toLowerCase();

            // Find the employee by the normalized email
            const employees = await Employee.filter({ email: userEmail });
            
            if (employees.length > 0) {
                const employeeRecord = employees[0];
                setEmployee(employeeRecord);
                
                // Load employee's shifts
                const employeeShifts = await Shift.filter({ employee_id: employeeRecord.id }, '-date');
                setShifts(employeeShifts);
            } else {
                console.log('לא נמצא עובד עם המייל:', currentUser.email);
            }
        } catch (error) {
            console.error('שגיאה בטעינת נתונים:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateEmployee = async () => {
        if (!user) return;
        
        setIsCreating(true);
        try {
            const newEmployee = await Employee.create({
                full_name: user.full_name,
                email: user.email.toLowerCase(), // Ensure email is saved in lowercase
                role: 'עובד חדש',
                status: 'active'
            });
            
            setEmployee(newEmployee);
            alert('פרופיל עובד נוצר בהצלחה!');
        } catch (error) {
            console.error('שגיאה ביצירת פרופיל עובד:', error);
            alert('שגיאה ביצירת פרופיל עובד. נסה שוב.');
        } finally {
            setIsCreating(false);
        }
    };

    const monthlyStats = useMemo(() => {
        if (shifts.length === 0) {
            return { 
                totalSales: 0, 
                totalHours: 0, 
                avgManagerRating: 0, 
                avgServiceRating: 0,
                shiftsThisMonth: 0,
                targetAchievementRate: 0
            };
        }

        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const relevantShifts = shifts.filter(s => {
            const shiftDate = new Date(s.date);
            return shiftDate.getMonth() === currentMonth && shiftDate.getFullYear() === currentYear;
        });

        const totalSales = relevantShifts.reduce((sum, s) => sum + (s.sales_amount || 0), 0);
        const totalHours = relevantShifts.reduce((sum, s) => sum + (s.hours_worked || 0), 0);
        
        const managerRatings = relevantShifts.map(s => s.manager_rating).filter(Boolean);
        const avgManagerRating = managerRatings.length > 0 ? (managerRatings.reduce((a, b) => a + b, 0) / managerRatings.length) : 0;

        const serviceRatings = relevantShifts.map(s => s.customer_service_rating).filter(Boolean);
        const avgServiceRating = serviceRatings.length > 0 ? (serviceRatings.reduce((a, b) => a + b, 0) / serviceRatings.length) : 0;

        // חישוב אחוז עמידה ביעדים
        const shiftsWithTargets = relevantShifts.filter(s => s.sales_target && s.sales_amount);
        const targetAchievements = shiftsWithTargets.map(s => (s.sales_amount / s.sales_target) * 100);
        const targetAchievementRate = targetAchievements.length > 0 ? 
            (targetAchievements.reduce((a, b) => a + b, 0) / targetAchievements.length) : 0;

        return { 
            totalSales, 
            totalHours, 
            avgManagerRating: avgManagerRating.toFixed(1), 
            avgServiceRating: avgServiceRating.toFixed(0),
            shiftsThisMonth: relevantShifts.length,
            targetAchievementRate: targetAchievementRate.toFixed(0)
        };
    }, [shifts]);

    if (isLoading) {
        return (
            <div className="p-4 md:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-8">
                        <Skeleton className="h-10 w-64 mb-2" />
                        <Skeleton className="h-4 w-96" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <Card key={i}>
                                <CardHeader className="pb-3">
                                    <Skeleton className="h-4 w-24" />
                                </CardHeader>
                                <CardContent>
                                    <Skeleton className="h-8 w-16 mb-2" />
                                    <Skeleton className="h-3 w-20" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (!employee) {
        return (
            <div className="p-4 md:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
                <div className="max-w-6xl mx-auto">
                    <Card className="text-center p-8 border-2 border-orange-200 bg-orange-50">
                        <AlertCircle className="w-16 h-16 mx-auto text-orange-500 mb-4" />
                        <h2 className="text-2xl font-bold text-orange-700 mb-2">פרופיל עובד לא נמצא</h2>
                        <div className="space-y-4">
                            <p className="text-orange-600 mb-4">
                                לא נמצא עובד עם המייל: <span className="font-mono bg-white px-2 py-1 rounded text-sm">{user?.email || 'לא זמין'}</span>
                            </p>
                            
                            <div className="bg-white p-4 rounded-lg border border-orange-200 text-right space-y-3">
                                <h3 className="text-lg font-semibold text-gray-800">פתרונות אפשריים:</h3>
                                
                                <div className="space-y-3">
                                    <div className="border-r-4 border-blue-400 pr-3">
                                        <h4 className="font-semibold text-[#44512C]">פתרון מהיר - צור פרופיל אוטומטי</h4>
                                        <p className="text-sm text-gray-600 mb-2">
                                            נוכל ליצור עבורך פרופיל עובד אוטומטי עם הפרטים מחשבון הGoogle שלך
                                        </p>
                                        <Button 
                                            onClick={handleCreateEmployee}
                                            disabled={isCreating || !user?.email}
                                            className="bg-[#44512C] hover:bg-[#44512C]"
                                        >
                                            {isCreating ? (
                                                <>
                                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                                    יוצר פרופיל...
                                                </>
                                            ) : (
                                                'צור פרופיל עובד עבורי'
                                            )}
                                        </Button>
                                    </div>

                                    <div className="border-r-4 border-green-400 pr-3">
                                        <h4 className="font-semibold text-green-700">פנה למנהל המערכת</h4>
                                        <p className="text-sm text-gray-600">
                                            בקש מהמנהל להוסיף אותך לרשימת העובדים עם המייל: <br/>
                                            <code className="bg-gray-100 px-1 rounded text-xs">{user?.email || 'לא זמין'}</code>
                                        </p>
                                    </div>

                                    <div className="border-r-4 border-purple-400 pr-3">
                                        <h4 className="font-semibold text-[#7A3722]">בדוק במחלקת עובדים</h4>
                                        <p className="text-sm text-gray-600">
                                            יתכן שהמייל שלך רשום שונה במערכת העובדים
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
            <div className="max-w-6xl mx-auto">
                <PageHeader
                    title="הביצועים שלי"
                    subtitle={`${employee.full_name} | ${employee.role}`}
                    icon={Star}
                />

                {/* Monthly Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <Card className="bg-gradient-to-br from-green-50 to-emerald-100 border-green-200">
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <CardTitle className="text-sm font-medium text-green-800">מכירות החודש</CardTitle>
                            <DollarSign className="w-5 h-5 text-green-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-900">₪{monthlyStats.totalSales.toLocaleString()}</div>
                            <p className="text-xs text-green-700">{monthlyStats.shiftsThisMonth} משמרות</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8] border-[#E8D9B5]">
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <CardTitle className="text-sm font-medium text-[#2E3819]">שעות עבודה</CardTitle>
                            <Clock className="w-5 h-5 text-[#44512C]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-blue-900">{monthlyStats.totalHours}</div>
                            <p className="text-xs text-[#44512C]">שעות החודש</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-[#FAF5E8] to-amber-100 border-yellow-200">
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <CardTitle className="text-sm font-medium text-yellow-800">דירוג מנהל</CardTitle>
                            <Star className="w-5 h-5 text-yellow-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-yellow-900">{monthlyStats.avgManagerRating} / 5</div>
                            <p className="text-xs text-yellow-700">ממוצע חודשי</p>
                        </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-[#F4ECD8] to-[#F4ECD8] border-purple-200">
                        <CardHeader className="flex flex-row items-center justify-between pb-3">
                            <CardTitle className="text-sm font-medium text-[#7A3722]">עמידה ביעדים</CardTitle>
                            <Target className="w-5 h-5 text-[#A04A2E]" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-purple-900">{monthlyStats.targetAchievementRate}%</div>
                            <Progress value={parseFloat(monthlyStats.targetAchievementRate)} className="mt-2" />
                        </CardContent>
                    </Card>
                </div>

                {/* Recent Shifts */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="w-5 h-5" />
                            משמרות אחרונות
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {shifts.length > 0 ? (
                            <div className="space-y-4">
                                {shifts.slice(0, 10).map(shift => (
                                    <div key={shift.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <p className="font-semibold">{new Date(shift.date).toLocaleDateString('he-IL')}</p>
                                                <p className="text-sm text-gray-600">{shift.area || 'אזור לא צוין'}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-lg font-bold text-green-600">₪{shift.sales_amount?.toLocaleString() || 0}</p>
                                                <p className="text-sm text-gray-500">{shift.hours_worked} שעות</p>
                                            </div>
                                        </div>
                                        
                                        {shift.sales_target && (
                                            <div className="mt-2">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-sm">עמידה ביעד</span>
                                                    <span className="text-sm font-bold">
                                                        {Math.round((shift.sales_amount / shift.sales_target) * 100)}%
                                                    </span>
                                                </div>
                                                <Progress value={(shift.sales_amount / shift.sales_target) * 100} />
                                            </div>
                                        )}
                                        
                                        <div className="flex gap-4 mt-2">
                                            {shift.manager_rating && (
                                                <Badge variant="outline">דירוג מנהל: {shift.manager_rating}/5</Badge>
                                            )}
                                            {shift.customer_service_rating && (
                                                <Badge variant="outline">שירות: {shift.customer_service_rating}%</Badge>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 py-8">אין משמרות רשומות עדיין</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
