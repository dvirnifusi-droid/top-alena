import React, { useState, useEffect, useCallback } from 'react';
import { ShiftEndReport } from '@/entities/ShiftEndReport';
import { MarketingTask } from '@/entities/MarketingTask';
import { AiSuggestion } from '@/entities/AiSuggestion';
import { InvokeLLM } from '@/integrations/Core';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    TrendingUp, 
    Brain, 
    Calendar,
    Lightbulb,
    Plus,
    BarChart3,
    Target,
    Loader2,
    AlertCircle,
    CheckCircle,
    Play,
    Star
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, addWeeks, getDay, differenceInDays } from 'date-fns';
import { he } from 'date-fns/locale';

// Import the task detail components

export default function RevenueForecastingPage() {
    const [reports, setReports] = useState([]);
    const [forecast, setForecast] = useState(null);
    const [insights, setInsights] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [isAddHistoricalOpen, setIsAddHistoricalOpen] = useState(false);
    const [selectedOpportunity, setSelectedOpportunity] = useState(null);
    const [showTaskDialog, setShowTaskDialog] = useState(false);

    const [showAddOpportunityDialog, setShowAddOpportunityDialog] = useState(false);
    const [manualOpportunity, setManualOpportunity] = useState({
        title: '',
        description: '',
        category: 'revenue_strategy',
        priority: 'medium',
        estimated_impact: 'medium',
        implementation_notes: ''
    });

    const prepareMonthlyData = useCallback((reports) => {
        const monthlyStats = {};
        
        reports.forEach(report => {
            const reportDate = new Date(report.shift_date);
            const month = format(reportDate, 'yyyy-MM');
            
            if (!monthlyStats[month]) {
                monthlyStats[month] = {
                    month,
                    total_revenue: 0,
                    total_covers: 0,
                    shift_count: 0
                };
            }
            
            monthlyStats[month].total_revenue += report.total_revenue || 0;
            monthlyStats[month].total_covers += report.total_covers || 0;
            monthlyStats[month].shift_count += 1;
        });

        return Object.values(monthlyStats).map(stat => ({
            ...stat,
            avg_per_customer: stat.total_covers > 0 ? (stat.total_revenue / stat.total_covers).toFixed(0) : 0,
            avg_daily_revenue: stat.shift_count > 0 ? (stat.total_revenue / stat.shift_count).toFixed(0) : 0
        }));
    }, []);

    const analyzeByDayOfWeek = useCallback((reports) => {
        const dayNames = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        const dayStats = {};
        
        // Initialize all days
        for (let i = 0; i < 7; i++) {
            dayStats[i] = {
                dayName: dayNames[i],
                totalRevenue: 0,
                totalCovers: 0,
                shiftCount: 0,
                avgRevenue: 0,
                avgCovers: 0
            };
        }
        
        reports.forEach(report => {
            const dayOfWeek = getDay(new Date(report.shift_date));
            dayStats[dayOfWeek].totalRevenue += report.total_revenue || 0;
            dayStats[dayOfWeek].totalCovers += report.total_covers || 0;
            dayStats[dayOfWeek].shiftCount += 1;
        });
        
        // Calculate averages
        Object.keys(dayStats).forEach(day => {
            const stat = dayStats[day];
            if (stat.shiftCount > 0) {
                stat.avgRevenue = Math.round(stat.totalRevenue / stat.shiftCount);
                stat.avgCovers = Math.round(stat.totalCovers / stat.shiftCount);
            }
        });
        
        return dayStats;
    }, []);

    const analyzeRecentTrends = useCallback((reports) => {
        const lastMonth = reports.slice(0, 30);
        const prevMonth = reports.slice(30, 60);

        const calcAverage = (arr, field) => arr.length > 0 ? arr.reduce((sum, r) => sum + (r[field] || 0), 0) / arr.length : 0;
        
        return {
            recent_avg_revenue: calcAverage(lastMonth, 'total_revenue'),
            previous_avg_revenue: calcAverage(prevMonth, 'total_revenue'),
            recent_avg_covers: calcAverage(lastMonth, 'total_covers'),
            previous_avg_covers: calcAverage(prevMonth, 'total_covers'),
            total_recent_shifts: lastMonth.length,
            total_previous_shifts: prevMonth.length
        };
    }, []);

    const getCurrentMonthProgress = useCallback((reports) => {
        const now = new Date();
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);
        const daysPassed = differenceInDays(now, monthStart) + 1;
        const totalDaysInMonth = differenceInDays(monthEnd, monthStart) + 1;
        
        const currentMonthReports = reports.filter(r => {
            const reportDate = new Date(r.shift_date);
            return reportDate >= monthStart && reportDate <= now;
        });
        
        const currentRevenue = currentMonthReports.reduce((sum, r) => sum + (r.total_revenue || 0), 0);
        const currentCovers = currentMonthReports.reduce((sum, r) => sum + (r.total_covers || 0), 0);
        
        return {
            currentRevenue,
            currentCovers,
            daysPassed,
            totalDaysInMonth,
            daysRemaining: totalDaysInMonth - daysPassed,
            shiftsCount: currentMonthReports.length,
            avgDailyRevenue: currentMonthReports.length > 0 ? currentRevenue / currentMonthReports.length : 0
        };
    }, []);

    const getNextWeekDays = useCallback(() => {
        const now = new Date();
        const nextWeekStart = addWeeks(startOfWeek(now, { weekStartsOn: 0 }), 1); // weekStartsOn: 0 for Sunday
        const nextWeekEnd = endOfWeek(nextWeekStart, { weekStartsOn: 0 });
        
        return eachDayOfInterval({ start: nextWeekStart, end: nextWeekEnd });
    }, []);

    const generateForecastAndInsights = useCallback(async (reportsData) => {
        setGenerating(true);
        try {
            const monthlyData = prepareMonthlyData(reportsData);
            const recentTrends = analyzeRecentTrends(reportsData);
            const dayOfWeekStats = analyzeByDayOfWeek(reportsData);
            const currentMonthProgress = getCurrentMonthProgress(reportsData);
            const nextWeekDays = getNextWeekDays();

            const prompt = `
                אתה יועץ עסקי מומחה למסעדות. נתח את הנתונים הבאים ותן תחזיות מדויקות.

                **נתוני הכנסות חודשיים (לפי חודשים קלנדריים 1-31):**
                ${JSON.stringify(monthlyData, null, 2)}

                **מגמות אחרונות:**
                ${JSON.stringify(recentTrends, null, 2)}

                **ניתוח לפי ימים בשבוע (ממוצעים):**
                ${JSON.stringify(dayOfWeekStats, null, 2)}

                **התקדמות החודש הנוכחי:**
                ${JSON.stringify(currentMonthProgress, null, 2)}

                **ימי השבוע הבא:**
                ${nextWeekDays.map(d => format(d, 'EEEE dd/MM', { locale: he })).join(', ')}

                **המשימות שלך:**
                1. תחזית הכנסות **לסוף החודש הנוכחי** (בהתבסס על הימים שנותרו והדפוסים היומיים)
                2. תחזית הכנסות **לשבוע הבא** (התחשב באילו ימים זה יהיה - יום ה' חזק, שישי סגור וכו')
                3. תחזית הכנסות **לחודש הבא המלא** (חודש קלנדרי שלם)
                4. זהה 3-5 הזדמנויות מרכזיות להגדלת רווחים
                5. נתח מגמות בממוצע לסועד ובכמות הלקוחות
                
                **חשוב מאוד:**
                - שים לב שיום חמישי הוא בדרך כלל היום החזק ביותר
                - שישי המסעדה סגורה (אל תכלול ביום זה הכנסות)
                - כל יום בשבוע יש לו מאפיינים שונים - התבסס על הממוצעים לפי יום
                - תחשב בדיוק כמה ימים נשארו בחודש הנוכחי
                - לשבוע הבא - תן תחזית לפי הימים הספציפיים שיהיו בשבוע
            `;

            const aiResponse = await InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        current_month_end_forecast: {
                            type: "object",
                            properties: {
                                forecasted_revenue: { type: "number" },
                                confidence_level: { type: "number" },
                                days_remaining: { type: "integer" },
                                reasoning: { type: "string" }
                            }
                        },
                        next_week_forecast: {
                            type: "object",
                            properties: {
                                total_revenue: { type: "number" },
                                confidence_level: { type: "number" },
                                daily_breakdown: {
                                    type: "array",
                                    items: {
                                        type: "object",
                                        properties: {
                                            day_name: { type: "string" },
                                            date: { type: "string" },
                                            forecasted_revenue: { type: "number" },
                                            reasoning: { type: "string" }
                                        }
                                    }
                                }
                            }
                        },
                        next_month_revenue_forecast: {
                            type: "number",
                            description: "תחזית הכנסות לחודש הבא בשקלים (חודש קלנדרי מלא)"
                        },
                        confidence_level: {
                            type: "number",
                            minimum: 0,
                            maximum: 100,
                            description: "רמת ביטחון בתחזית החודש הבא המלא"
                        },
                        key_insights: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    impact: { type: "string", enum: ["high", "medium", "low"] },
                                    action_required: { type: "string" }
                                }
                            }
                        },
                        revenue_opportunities: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    opportunity: { type: "string" },
                                    potential_increase: { type: "string" },
                                    implementation_steps: { type: "array", items: { type: "string" } },
                                    effort_level: { type: "string", enum: ["low", "medium", "high"] },
                                    estimated_time: { type: "integer" },
                                    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] }
                                }
                            }
                        },
                        day_of_week_insights: {
                            type: "object",
                            properties: {
                                strongest_day: { type: "string" },
                                weakest_day: { type: "string" },
                                recommendations: { type: "array", items: { type: "string" } }
                            }
                        },
                        trends_analysis: {
                            type: "object",
                            properties: {
                                revenue_trend: { type: "string", enum: ["increasing", "decreasing", "stable"] },
                                average_per_customer_trend: { type: "string", enum: ["increasing", "decreasing", "stable"] },
                                customer_volume_trend: { type: "string", enum: ["increasing", "decreasing", "stable"] },
                                recommendations: { type: "array", items: { type: "string" } }
                            }
                        }
                    }
                }
            });

            setForecast(aiResponse);
            setInsights(aiResponse.key_insights || []);
        } catch (error) {
            console.error('Error generating forecast:', error);
        } finally {
            setGenerating(false);
        }
    }, [prepareMonthlyData, analyzeRecentTrends, analyzeByDayOfWeek, getCurrentMonthProgress, getNextWeekDays]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const reportsData = await ShiftEndReport.list('-shift_date');
            setReports(reportsData);
            
            if (reportsData.length > 0) {
                await generateForecastAndInsights(reportsData);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    }, [generateForecastAndInsights]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleOpportunityClick = async (opportunity) => {
        setSelectedOpportunity(opportunity);
        setShowTaskDialog(true);
    };

    const convertOpportunityToTask = useCallback(async (opportunity) => {
        setGenerating(true);
        try {
            const prompt = `
                אתה מדריך מפורט למסעדות. קח את ההזדמנות הבאה והפוך אותה למשימה מפורטת בצורה מטורפת.

                **ההזדמנות:** ${opportunity.opportunity}
                **השלבים הכלליים:** ${JSON.stringify(opportunity.implementation_steps)}

                **המשימה שלך:**
                צור משימה מפורטת עם שלבים קונקרטיים מאוד. כל שלב צריך להיות ברמה של:
                - איך בדיוק לפתוח את האפליקציה/אתר
                - מה בדיוק לכתוב (טקסט מוכן)
                - איפה בדיוק ללחוץ
                - איך להגדיר הגדרות ספציפיות
                - מה לבדוק אחרי כל צעד

                לדוגמה, במקום "צור פוסט באינסטגרם" תכתוב:
                1. פתח את אפליקציית Instagram בטלפון
                2. לחץ על סימן ה-+ בחלק התחתון
                3. בחר "פוסט" מהתפריט
                4. לחץ על "בחר תמונה מהגלריה"
                5. בחר תמונה של המנה המיוחדת היום
                6. לחץ "הבא" בפינה הימנית העליונה
                7. הוסף פילטר "Valencia" (מתאים למזון)
                8. לחץ "הבא"
                9. כתוב בדיוק את הטקסט הזה: "[טקסט מוכן]"
                10. הוסף האשטאגים: #מסעדה #תל_אביב #אוכל_טוב
                וכו'...

                תן משימה מפורטת שלא משאירה מקום לשאלות!
            `;

            const taskResponse = await InvokeLLM({
                prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        task_title: { type: "string" },
                        task_description: { type: "string" },
                        platform: { type: "string", enum: ["instagram", "facebook", "google", "whatsapp", "website", "multiple"] },
                        estimated_total_time: { type: "integer" },
                        detailed_steps: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    step_number: { type: "integer" },
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    specific_actions: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                action: { type: "string" },
                                                details: { type: "string" },
                                                what_to_click: { type: "string" },
                                                what_to_type: { type: "string" },
                                                where_to_find_it: { type: "string" },
                                                screenshot_hint: { type: "string" }
                                            }
                                        }
                                    },
                                    estimated_minutes: { type: "integer" },
                                    tools_needed: { type: "array", items: { type: "string" } },
                                    ready_content: { type: "string" },
                                    success_check: { type: "string" },
                                    common_mistakes: { type: "array", items: { type: "string" } },
                                    tips: { type: "array", items: { type: "string" } }
                                }
                            }
                        }
                    }
                }
            });

            // Create the task
            const newTask = await MarketingTask.create({
                title: taskResponse.task_title,
                description: taskResponse.task_description,
                task_type: "revenue_strategy",
                platform: taskResponse.platform,
                estimated_time: taskResponse.estimated_total_time,
                priority: opportunity.priority,
                due_date: new Date().toISOString().split('T')[0],
                status: 'pending',
                detailed_steps: taskResponse.detailed_steps,
                ai_reasoning: `נוצר מהזדמנות רווח: ${opportunity.opportunity}`,
                suggested_content: taskResponse.detailed_steps.map(step => step.ready_content).filter(Boolean).join('\n\n')
            });

            // Save to suggestions bank
            await AiSuggestion.create({
                suggestion_type: 'revenue_strategy',
                title: taskResponse.task_title,
                content: taskResponse.task_description,
                ai_context: `הזדמנות רווח שזוהתה על ידי ניתוח דוחות`,
                priority: opportunity.priority,
                category: taskResponse.platform,
                estimated_impact: opportunity.effort_level === 'low' ? 'high' : 'medium',
                estimated_effort: opportunity.effort_level,
                tags: ['הזדמנות רווח', 'אוטומטי', taskResponse.platform]
            });

            setShowTaskDialog(false);
            alert('המשימה נוצרה בהצלחה! תוכל למצוא אותה ביועץ השיווק החכם.');

            return newTask;
        } catch (error) {
            console.error('Error converting opportunity to task:', error);
            alert('שגיאה ביצירת המשימה. נסה שוב.');
            throw error;
        } finally {
            setGenerating(false);
        }
    }, []);

    const handleAddManualOpportunity = async () => {
        if (!manualOpportunity.title.trim()) {
            alert('נא להכניס כותרת להזדמנות');
            return;
        }

        try {
            await AiSuggestion.create({
                suggestion_type: manualOpportunity.category,
                title: manualOpportunity.title,
                content: manualOpportunity.description,
                ai_context: 'נוסף ידנית על ידי המשתמש מתוך עמוד תחזיות ותובנות',
                priority: manualOpportunity.priority,
                category: 'manual_insight',
                estimated_impact: manualOpportunity.estimated_impact,
                estimated_effort: 'medium', // Default for manual entries unless specified in UI
                tags: ['הזדמנות ידנית', 'תחזיות', 'אידיאה משלי'],
                notes: manualOpportunity.implementation_notes
            });

            // איפוס הטופס
            setManualOpportunity({
                title: '',
                description: '',
                category: 'revenue_strategy',
                priority: 'medium',
                estimated_impact: 'medium',
                implementation_notes: ''
            });
            
            setShowAddOpportunityDialog(false);
            alert('ההזדמנות נוספה בהצלחה למאגר! תוכל למצוא אותה ביועץ השיווק החכם.');
        } catch (error) {
            console.error('Error adding manual opportunity:', error);
            alert('שגיאה בהוספת ההזדמנות. נסה שוב.');
        }
    };

    const handleAddHistoricalReport = async (reportData) => {
        try {
            await ShiftEndReport.create(reportData);
            setIsAddHistoricalOpen(false);
            loadData(); // Refresh data and regenerate forecast
        } catch (error) {
            console.error('Error adding historical report:', error);
            alert('שגיאה בהוספת דוח. נסה שוב.');
        }
    };

    const [chartFilter, setChartFilter] = useState('last30');

    const CHART_FILTERS = [
        { label: 'שבוע אחרון', value: 'last7', days: 7 },
        { label: 'חודש נוכחי', value: 'current_month' },
        { label: '30 יום', value: 'last30', days: 30 },
        { label: 'חודש קודם', value: 'prev_month' },
        { label: 'הכל', value: 'all' },
    ];

    const filteredReports = reports.filter(r => {
        const d = r.shift_date;
        const today = new Date().toISOString().split('T')[0];
        if (chartFilter === 'last7') {
            const from = new Date(); from.setDate(from.getDate() - 6);
            return d >= from.toISOString().split('T')[0];
        }
        if (chartFilter === 'last30') {
            const from = new Date(); from.setDate(from.getDate() - 29);
            return d >= from.toISOString().split('T')[0];
        }
        if (chartFilter === 'current_month') {
            const start = new Date(); start.setDate(1);
            return d >= start.toISOString().split('T')[0];
        }
        if (chartFilter === 'prev_month') {
            const firstOfCurrent = new Date(); firstOfCurrent.setDate(1);
            const lastOfPrev = new Date(firstOfCurrent); lastOfPrev.setDate(0);
            const firstOfPrev = new Date(lastOfPrev); firstOfPrev.setDate(1);
            return d >= firstOfPrev.toISOString().split('T')[0] && d <= lastOfPrev.toISOString().split('T')[0];
        }
        return true; // all
    });

    const chartData = [...filteredReports].reverse().map(report => ({
        date: format(new Date(report.shift_date), 'dd/MM'),
        revenue: report.total_revenue || 0,
        covers: report.total_covers || 0,
        avgPerCustomer: report.total_covers > 0 ? Math.round(report.total_revenue / report.total_covers) : 0
    }));

    const handleSaveOpportunityToBank = async (opportunity) => {
        try {
            await AiSuggestion.create({
                suggestion_type: 'revenue_strategy',
                title: opportunity.opportunity,
                content: `הזדמנות רווח: ${opportunity.potential_increase}\n\nשלבי יישום:\n${opportunity.implementation_steps?.join('\n- ') || 'לא הוגדרו שלבים ספציפיים'}`,
                ai_context: 'נשמר מתוך תחזיות ותובנות AI - הזדמנות רווח שזוהתה על ידי הניתוח',
                priority: opportunity.priority || 'medium',
                category: 'revenue_opportunity',
                estimated_impact: opportunity.effort_level === 'low' ? 'high' : 'medium',
                estimated_effort: opportunity.effort_level || 'medium',
                tags: ['הזדמנות רווח', 'AI מומלץ', 'תחזיות'],
                notes: `משוך עצמי משלבי יישום: ${opportunity.implementation_steps?.join(', ') || ''}`
            });

            // הודעת הצלחה
            const notification = document.createElement('div');
            notification.innerHTML = `
                <div style="
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    z-index: 1000;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                ">
                    ⭐ הרעיון נשמר במאגר בהצלחה!
                </div>
            `;
            document.body.appendChild(notification);
            
            // הסרת ההודעה אחרי 3 שניות
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 3000);

        } catch (error) {
            console.error('Error saving opportunity to bank:', error);
            alert('שגיאה בשמירת הרעיון. נסה שוב.');
        }
    };


    if (loading) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-8">
                {/* Header */}
                <div className="text-center">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-3">
                        <Brain className="w-10 h-10 text-blue-600" />
                        תחזיות ותובנות AI 🎯
                    </h1>
                    <p className="text-gray-600 text-lg">ניתוח חכם של ביצועי המסעדה והמלצות להגדלת רווחים</p>
                    
                    {/* כפתור הוספת הזדמנות ידנית */}
                    <div className="mt-4">
                        <Button 
                            onClick={() => setShowAddOpportunityDialog(true)}
                            variant="outline"
                            className="bg-white hover:bg-gray-50 border-blue-300 text-blue-700"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            הוסף הזדמנות למאגר 💡
                        </Button>
                    </div>
                </div>

                {/* Main Stats */}
                {forecast && (
                    <>
                        {/* Current Month Progress */}
                        {forecast.current_month_end_forecast && (
                            <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-purple-100 text-sm">תחזית לסוף החודש הנוכחי</p>
                                            <p className="text-3xl font-bold">₪{forecast.current_month_end_forecast.forecasted_revenue?.toLocaleString()}</p>
                                            <p className="text-sm text-purple-200 mt-1">
                                                נותרו {forecast.current_month_end_forecast.days_remaining} ימים
                                            </p>
                                            <p className="text-xs text-purple-200 mt-2">
                                                {forecast.current_month_end_forecast.reasoning}
                                            </p>
                                        </div>
                                        <Calendar className="w-12 h-12 text-purple-200" />
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {/* Next Week Forecast */}
                        {forecast.next_week_forecast && (
                            <Card className="bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div>
                                            <p className="text-orange-100 text-sm">תחזית השבוע הבא</p>
                                            <p className="text-3xl font-bold">₪{forecast.next_week_forecast.total_revenue?.toLocaleString()}</p>
                                            <p className="text-sm text-orange-200">רמת ביטחון: {forecast.next_week_forecast.confidence_level}%</p>
                                        </div>
                                        <TrendingUp className="w-12 h-12 text-orange-200" />
                                    </div>
                                    
                                    {/* Daily Breakdown */}
                                    {forecast.next_week_forecast.daily_breakdown && (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                                            {forecast.next_week_forecast.daily_breakdown.map((day, idx) => (
                                                <div key={idx} className="bg-white/20 rounded-lg p-2">
                                                    <p className="text-xs text-orange-100">{day.day_name}</p>
                                                    <p className="text-sm font-bold">₪{day.forecasted_revenue?.toLocaleString()}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-green-100">תחזית חודש הבא המלא</p>
                                            <p className="text-3xl font-bold">₪{forecast.next_month_revenue_forecast?.toLocaleString()}</p>
                                            <p className="text-sm text-green-200">רמת ביטחון: {forecast.confidence_level}%</p>
                                        </div>
                                        <TrendingUp className="w-12 h-12 text-green-200" />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-blue-100">מגמת הכנסות</p>
                                            <p className="text-2xl font-bold">
                                                {forecast.trends_analysis?.revenue_trend === 'increasing' ? '📈 עולה' : 
                                                 forecast.trends_analysis?.revenue_trend === 'decreasing' ? '📉 יורדת' : '➡️ יציבה'}
                                            </p>
                                        </div>
                                        <BarChart3 className="w-12 h-12 text-blue-200" />
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white">
                                <CardContent className="p-6">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-indigo-100">הזדמנויות זוהו</p>
                                            <p className="text-3xl font-bold">{forecast.revenue_opportunities?.length || 0}</p>
                                        </div>
                                        <Target className="w-12 h-12 text-indigo-200" />
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Day of Week Insights */}
                        {forecast.day_of_week_insights && (
                            <Card className="shadow-xl">
                                <CardHeader>
                                    <CardTitle>תובנות לפי ימים בשבוע 📅</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="bg-green-50 p-4 rounded-lg">
                                            <h4 className="font-semibold text-green-900 mb-2">היום החזק ביותר:</h4>
                                            <p className="text-2xl font-bold text-green-700">{forecast.day_of_week_insights.strongest_day}</p>
                                        </div>
                                        <div className="bg-orange-50 p-4 rounded-lg">
                                            <h4 className="font-semibold text-orange-900 mb-2">היום החלש ביותר:</h4>
                                            <p className="text-2xl font-bold text-orange-700">{forecast.day_of_week_insights.weakest_day}</p>
                                        </div>
                                    </div>
                                    {forecast.day_of_week_insights.recommendations && (
                                        <div className="mt-4">
                                            <h4 className="font-semibold mb-2">המלצות:</h4>
                                            <ul className="space-y-2">
                                                {forecast.day_of_week_insights.recommendations.map((rec, idx) => (
                                                    <li key={idx} className="flex items-start gap-2">
                                                        <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                                                        <span>{rec}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </>
                )}

                {/* Charts */}
                <Card className="shadow-xl">
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <CardTitle>מגמות הכנסות</CardTitle>
                            <div className="flex flex-wrap gap-2">
                                {CHART_FILTERS.map(f => (
                                    <button
                                        key={f.value}
                                        onClick={() => setChartFilter(f.value)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                            chartFilter === f.value
                                                ? 'bg-blue-600 text-white shadow'
                                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-blue-50'
                                        }`}
                                    >
                                        {f.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis />
                                <Tooltip 
                                    formatter={(value, name) => [
                                        name === 'revenue' ? `₪${value.toLocaleString()}` : value,
                                        name === 'revenue' ? 'הכנסות' : name === 'covers' ? 'סועדים' : 'ממוצע לסועד'
                                    ]}
                                />
                                <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} name="revenue" />
                                <Line type="monotone" dataKey="avgPerCustomer" stroke="#f59e0b" strokeWidth={2} name="avgPerCustomer" />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Tabs defaultValue="opportunities" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="opportunities">🎯 הזדמנויות רווח</TabsTrigger>
                        <TabsTrigger value="insights">💡 תובנות מרכזיות</TabsTrigger>
                        <TabsTrigger value="historical">📊 הוספת נתונים</TabsTrigger>
                    </TabsList>

                    <TabsContent value="opportunities" className="space-y-4">
                        {forecast?.revenue_opportunities?.map((opp, index) => (
                            <Card 
                                key={index} 
                                className="shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer hover:scale-105 border-2 hover:border-purple-300"
                                onClick={() => handleOpportunityClick(opp)}
                            >
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-start gap-3 flex-1">
                                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-500 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                                {index + 1}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <CardTitle className="text-lg">{opp.opportunity}</CardTitle>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="p-1 hover:bg-yellow-100"
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // מונע את הלחיצה על הכרטיס
                                                            handleSaveOpportunityToBank(opp);
                                                        }}
                                                    >
                                                        <Star className="w-5 h-5 text-yellow-500 hover:fill-yellow-500 transition-all" />
                                                    </Button>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Badge className="bg-green-100 text-green-800">{opp.potential_increase}</Badge>
                                                    <Badge variant={opp.effort_level === 'low' ? 'default' : opp.effort_level === 'medium' ? 'secondary' : 'destructive'}>
                                                        {opp.effort_level === 'low' ? 'קל ליישום' : opp.effort_level === 'medium' ? 'בינוני' : 'דורש השקעה'}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex justify-between items-center">
                                        <p className="text-gray-600">לחץ כאן להפוך למשימה מפורטת עם שלבי ביצוע</p>
                                        <div className="flex items-center gap-2 text-purple-600">
                                            <Play className="w-4 h-4" />
                                            <span className="text-sm font-semibold">התחל עכשיו</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </TabsContent>

                    <TabsContent value="insights" className="space-y-4">
                        {insights.map((insight, index) => (
                            <Card key={index} className="shadow-lg">
                                <CardContent className="p-6">
                                    <div className="flex items-start gap-4">
                                        <div className={`p-2 rounded-full ${
                                            insight.impact === 'high' ? 'bg-red-100' : 
                                            insight.impact === 'medium' ? 'bg-yellow-100' : 'bg-blue-100'
                                        }`}>
                                            {insight.impact === 'high' ? <AlertCircle className="w-6 h-6 text-red-600" /> :
                                             insight.impact === 'medium' ? <TrendingUp className="w-6 h-6 text-yellow-600" /> :
                                             <Lightbulb className="w-6 h-6 text-blue-600" />}
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold mb-2">{insight.title}</h3>
                                            <p className="text-gray-700 mb-3">{insight.description}</p>
                                            <div className="bg-blue-50 p-3 rounded-lg">
                                                <h4 className="font-semibold text-blue-900 mb-1">פעולה נדרשת:</h4>
                                                <p className="text-blue-800 text-sm">{insight.action_required}</p>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </TabsContent>

                    <TabsContent value="historical" className="space-y-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>הוספת דוחות היסטוריים</CardTitle>
                                <p className="text-gray-600">הוסף דוחות משמרות מהעבר כדי לשפר את דיוק התחזיות</p>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <h3 className="font-semibold mb-3">נתונים זמינים:</h3>
                                        <div className="space-y-2">
                                            <p><strong>סה"כ דוחות:</strong> {reports.length}</p>
                                            <p><strong>התקופה:</strong> {reports.length > 0 ? 
                                                `${format(new Date(reports[reports.length - 1].shift_date), 'MMM yyyy', { locale: he })} - ${format(new Date(reports[0].shift_date), 'MMM yyyy', { locale: he })}` : 'אין נתונים'}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <Button 
                                            onClick={() => setIsAddHistoricalOpen(true)}
                                            className="w-full"
                                        >
                                            <Plus className="w-4 h-4 ml-2" />
                                            הוסף דוח היסטורי
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        {generating && (
                            <Card className="bg-blue-50">
                                <CardContent className="p-6 text-center">
                                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
                                    <p className="text-blue-800">AI מנתח את הנתונים ומכין תחזיות חדשות...</p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Opportunity Task Dialog */}
            <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="text-xl">
                            הזדמנת רווח: {selectedOpportunity?.opportunity}
                        </DialogTitle>
                    </DialogHeader>
                    
                    {selectedOpportunity && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <Card>
                                    <CardContent className="p-4">
                                        <h4 className="font-semibold mb-2">פוטנציאל רווח:</h4>
                                        <p className="text-green-600 font-bold text-lg">₪{selectedOpportunity.potential_increase}</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent className="p-4">
                                        <h4 className="font-semibold mb-2">רמת מאמץ:</h4>
                                        <Badge variant={selectedOpportunity.effort_level === 'low' ? 'default' : selectedOpportunity.effort_level === 'medium' ? 'secondary' : 'destructive'}>
                                            {selectedOpportunity.effort_level === 'low' ? 'קל ליישום' : selectedOpportunity.effort_level === 'medium' ? 'בינוני' : 'דורש השקעה'}
                                        </Badge>
                                    </CardContent>
                                </Card>
                            </div>

                            <Card>
                                <CardHeader>
                                    <CardTitle>צעדי יישום:</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ul className="space-y-2">
                                        {selectedOpportunity.implementation_steps?.map((step, index) => (
                                            <li key={index} className="flex items-start gap-2">
                                                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                                                <span className="text-sm">{step}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>

                            <div className="bg-blue-50 p-4 rounded-lg">
                                <h4 className="font-semibold text-blue-900 mb-2">🚀 מה יקרה כשתלחץ "צור משימה"?</h4>
                                <ul className="text-blue-800 text-sm space-y-1">
                                    <li>✅ תיווצר משימה מפורטת עם כל השלבים</li>
                                    <li>⭐ תוכל לסמן אותה בכוכב למועד מאוחר</li>
                                    <li>🤖 תקבל יעוץ AI בכל שלב</li>
                                    <li>📊 מעקב התקדמות עם אחוזים</li>
                                    <li>💾 ההצעה תישמר במאגר להתייחסות עתידית</li>
                                </ul>
                            </div>

                            <div className="flex justify-end gap-3">
                                <Button 
                                    variant="outline" 
                                    onClick={() => setShowTaskDialog(false)}
                                >
                                    ביטול
                                </Button>
                                <Button 
                                    onClick={() => convertOpportunityToTask(selectedOpportunity)}
                                    className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                                >
                                    <Target className="w-4 h-4 mr-2" />
                                    צור משימה מפורטת 🎯
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Dialog להוספת הזדמנות ידנית */}
            <Dialog open={showAddOpportunityDialog} onOpenChange={setShowAddOpportunityDialog}>
                <DialogContent className="max-w-2xl" dir="rtl">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            <Lightbulb className="w-6 h-6 text-yellow-500" />
                            הוסף הזדמנות חדשה למאגר
                        </DialogTitle>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4">
                        <div>
                            <Label htmlFor="opportunity-title">כותרת ההזדמנות *</Label>
                            <Input
                                id="opportunity-title"
                                value={manualOpportunity.title}
                                onChange={(e) => setManualOpportunity({...manualOpportunity, title: e.target.value})}
                                placeholder="למשל: יצירת תפריט מיוחד לימי רביעי"
                                className="mt-1"
                            />
                        </div>

                        <div>
                            <Label htmlFor="opportunity-description">תיאור מפורט</Label>
                            <Textarea
                                id="opportunity-description"
                                value={manualOpportunity.description}
                                onChange={(e) => setManualOpportunity({...manualOpportunity, description: e.target.value})}
                                placeholder="תאר את ההזדמנות בפירוט - מה הרעיון, איך זה יעבוד, למה זה יכול להצליח..."
                                className="mt-1 h-24"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>קטגוריה</Label>
                                <Select 
                                    value={manualOpportunity.category} 
                                    onValueChange={(value) => setManualOpportunity({...manualOpportunity, category: value})}
                                >
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="revenue_strategy">אסטרטגיית הכנסות</SelectItem>
                                        <SelectItem value="marketing_task">משימת שיווק</SelectItem>
                                        <SelectItem value="menu_optimization">שיפור תפריט</SelectItem>
                                        <SelectItem value="customer_retention">שמירת לקוחות</SelectItem>
                                        <SelectItem value="operational_improvement">שיפור תפעולי</SelectItem>
                                        <SelectItem value="general_business">עסקי כללי</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <Label>רמת חשיבות</Label>
                                <Select 
                                    value={manualOpportunity.priority} 
                                    onValueChange={(value) => setManualOpportunity({...manualOpportunity, priority: value})}
                                >
                                    <SelectTrigger className="mt-1">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="low">נמוכה</SelectItem>
                                        <SelectItem value="medium">בינונית</SelectItem>
                                        <SelectItem value="high">גבוהה</SelectItem>
                                        <SelectItem value="urgent">דחופה</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label>הערכת השפעה פוטנציאלית</Label>
                            <Select 
                                value={manualOpportunity.estimated_impact} 
                                onValueChange={(value) => setManualOpportunity({...manualOpportunity, estimated_impact: value})}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">השפעה נמוכה</SelectItem>
                                    <SelectItem value="medium">השפעה בינונית</SelectItem>
                                    <SelectItem value="high">השפעה גבוהה</SelectItem>
                                    <SelectItem value="game_changing">מהפכנית!</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="implementation-notes">הערות יישום</Label>
                            <Textarea
                                id="implementation-notes"
                                value={manualOpportunity.implementation_notes}
                                onChange={(e) => setManualOpportunity({...manualOpportunity, implementation_notes: e.target.value})}
                                placeholder="רעיונות ראשוניים איך ליישם את זה, משאבים נדרשים, או כל מחשבה נוספת..."
                                className="mt-1 h-20"
                            />
                        </div>

                        <div className="bg-blue-50 p-4 rounded-lg">
                            <h4 className="font-semibold text-blue-900 mb-2">💡 למה להוסיף למאגר?</h4>
                            <ul className="text-blue-800 text-sm space-y-1 list-disc list-inside">
                                <li>הרעיון יישמר ולא יאבד</li>
                                <li>תוכל לחזור אליו מתי שתרצה</li>
                                <li>ה-AI יוכל לעזור לפתח אותו למשימה מפורטת</li>
                                <li>ניתן לעדכן סטטוס ולעקוב אחרי התקדמות</li>
                            </ul>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button 
                            variant="outline" 
                            onClick={() => setShowAddOpportunityDialog(false)}
                        >
                            ביטול
                        </Button>
                        <Button 
                            onClick={handleAddManualOpportunity}
                            className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            שמור במאגר 💾
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Historical Report Dialog */}
            <AddHistoricalReportDialog 
                isOpen={isAddHistoricalOpen}
                onClose={() => setIsAddHistoricalOpen(false)}
                onSubmit={handleAddHistoricalReport}
            />
        </div>
    );
}

function AddHistoricalReportDialog({ isOpen, onClose, onSubmit }) {
    const [formData, setFormData] = useState({
        shift_date: '',
        shift_type: 'dinner',
        manager_name: '',
        total_revenue: '',
        total_covers: '',
        overall_rating: 4
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        
        const processedData = {
            ...formData,
            total_revenue: parseFloat(formData.total_revenue) || 0,
            total_covers: parseInt(formData.total_covers) || 0,
            overall_rating: parseInt(formData.overall_rating) || 4
        };
        
        onSubmit(processedData);
        setFormData({
            shift_date: '',
            shift_type: 'dinner',
            manager_name: '',
            total_revenue: '',
            total_covers: '',
            overall_rating: 4
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent dir="rtl" className="max-w-md">
                <DialogHeader>
                    <DialogTitle>הוספת דוח משמרת היסטורי</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                    <div>
                        <Label htmlFor="shift_date">תאריך המשמרת</Label>
                        <Input 
                            id="shift_date"
                            type="date" 
                            value={formData.shift_date}
                            onChange={(e) => setFormData({...formData, shift_date: e.target.value})}
                            required 
                        />
                    </div>
                    
                    <div>
                        <Label htmlFor="shift_type">סוג משמרת</Label>
                        <Select value={formData.shift_type} onValueChange={(value) => setFormData({...formData, shift_type: value})}>
                            <SelectTrigger id="shift_type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="lunch">צהריים</SelectItem>
                                <SelectItem value="dinner">ערב</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label htmlFor="manager_name">שם המנהל</Label>
                        <Input 
                            id="manager_name"
                            value={formData.manager_name}
                            onChange={(e) => setFormData({...formData, manager_name: e.target.value})}
                            required 
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="total_revenue">סה"כ הכנסות (₪)</Label>
                            <Input 
                                id="total_revenue"
                                type="number"
                                value={formData.total_revenue}
                                onChange={(e) => setFormData({...formData, total_revenue: e.target.value})}
                                required 
                            />
                        </div>
                        <div>
                            <Label htmlFor="total_covers">סה"כ סועדים</Label>
                            <Input 
                                id="total_covers"
                                type="number"
                                value={formData.total_covers}
                                onChange={(e) => setFormData({...formData, total_covers: e.target.value})}
                                required 
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
                        <Button type="submit">הוסף דוח</Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}