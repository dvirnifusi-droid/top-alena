
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffingPrediction, PredictionSettings } from '@/entities/StaffingPrediction';
import { EmployeeRiskAnalysis } from '@/entities/EmployeeRiskAnalysis';
import { MenuItemAnalysis } from '@/entities/MenuItemAnalysis';
import { DailySales } from '@/entities/DailySales';
import { Reservation } from '@/entities/Reservation';
import { Employee } from '@/entities/Employee';
import { Shift } from '@/entities/Shift';
import { MenuItem } from '@/entities/MenuItem';
import { InvokeLLM } from "@/integrations/Core";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
    Brain, TrendingUp, Users, CloudRain, Clock, 
    ChefHat, Utensils, AlertTriangle, Target, Sparkles,
    BarChart3, Settings, Zap, Sun, CloudSnow, UserMinus,
    ShoppingCart, Package
} from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';

export default function SmartPredictionPage() {
    const [predictions, setPredictions] = useState([]);
    const [settings, setSettings] = useState(null);
    const [employeeRisks, setEmployeeRisks] = useState([]);
    const [menuAnalysis, setMenuAnalysis] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedEndDate, setSelectedEndDate] = useState(format(addDays(new Date(), 2), 'yyyy-MM-dd'));
    const [historicalData, setHistoricalData] = useState([]);
    const [activeTab, setActiveTab] = useState('predictions');

    useEffect(() => {
        loadSettings();
        loadHistoricalData();
        loadPredictions();
        loadEmployeeRisks();
        loadMenuAnalysis();
    }, []);

    const loadSettings = async () => {
        try {
            const settingsData = await PredictionSettings.list();
            if (settingsData.length > 0) {
                setSettings(settingsData[0]);
            } else {
                // יצירת הגדרות ברירת מחדל
                const defaultSettings = await PredictionSettings.create({
                    restaurant_capacity: 120,
                    average_covers_per_waiter: 25,
                    kitchen_staff_ratio: 0.3,
                    weather_impact_positive: 1.2,
                    weather_impact_negative: 0.7,
                    holiday_impact: 1.5,
                    event_radius_km: 5,
                    historical_data_weight: 0.6,
                    external_factors_weight: 0.4,
                    // New default settings
                    average_spend_per_customer: 70, // Example value
                    deal_percentage: 15 // Example value
                });
                setSettings(defaultSettings);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    };

    const loadHistoricalData = async () => {
        try {
            // טעינת נתונים היסטוריים מ-30 יום אחורה
            const endDate = new Date();
            const startDate = subDays(endDate, 30);
            
            const salesData = await DailySales.list('-date');
            setHistoricalData(salesData.slice(0, 30)); // 30 רשומות אחרונות
        } catch (error) {
            console.error('Error loading historical data:', error);
        }
    };

    const loadPredictions = async () => {
        try {
            const predictionsData = await StaffingPrediction.list('-date');
            // Filter predictions to show future dates or today's date if it's new
            const today = new Date();
            const relevantPredictions = predictionsData.filter(p => new Date(p.date) >= subDays(today, 1));
            setPredictions(relevantPredictions.slice(0, 7)); // Show 7 most recent/future
        } catch (error) {
            console.error('Error loading predictions:', error);
        }
    };

    const loadEmployeeRisks = async () => {
        try {
            const risksData = await EmployeeRiskAnalysis.list('-risk_score');
            setEmployeeRisks(risksData.filter(r => r.risk_level === 'high' || r.risk_level === 'critical'));
        } catch (error) {
            console.error('Error loading employee risks:', error);
        }
    };

    const loadMenuAnalysis = async () => {
        try {
            const analysisData = await MenuItemAnalysis.list('-popularity_score');
            setMenuAnalysis(analysisData);
        } catch (error) {
            console.error('Error loading menu analysis:', error);
        }
    };

    const generateMultiDayPrediction = async (startDateStr, endDateStr) => {
        if (!settings) {
            alert('אנא הגדר תחילה את הגדרות המערכת');
            return;
        }

        setLoading(true);
        try {
            const start = new Date(startDateStr);
            const end = new Date(endDateStr);
            
            // Validate date range
            if (start > end) {
                alert('תאריך התחלה חייב להיות לפני או שווה לתאריך סיום.');
                setLoading(false);
                return;
            }

            const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            if (daysDiff > 7) {
                alert('ניתן לחזות עד 7 ימים קדימה בחיזוי רב-יומי.');
                setLoading(false);
                return;
            }

            // Prepare historical data for AI
            const historicalSummary = historicalData.map(day => ({
                date: day.date,
                covers: day.covers,
                revenue: day.total_revenue,
                weather: day.weather, // Assuming weather is string like 'sunny', 'rainy'
                day_type: new Date(day.date).getDay() // 0 for Sunday, 6 for Saturday
            }));

            // Collect reservations for the prediction period
            const reservationPromises = [];
            let current = new Date(start);
            while (current <= end) {
                reservationPromises.push(Reservation.filter({ date: format(current, 'yyyy-MM-dd') }));
                current = addDays(current, 1);
            }
            const allReservations = await Promise.all(reservationPromises);
            const reservedCoversByDate = {};
            allReservations.forEach((reservationsForDay, index) => {
                const date = format(addDays(start, index), 'yyyy-MM-dd');
                reservedCoversByDate[date] = reservationsForDay.reduce((sum, r) => sum + (r.party_size || 0), 0);
            });


            const prompt = `
אתה מומחה ניתוח נתונים למסעדות. נתח את הנתונים הבאים וספק חיזוי מפורט לטווח ${daysDiff} ימים החל מהתאריך ${format(start, 'dd/MM/yyyy')} ועד ${format(end, 'dd/MM/yyyy')}:

**נתונים היסטוריים (30 ימים אחרונים):**
${JSON.stringify(historicalSummary, null, 2)}

**הגדרות המסעדה:**
- קיבולת: ${settings.restaurant_capacity} מקומות
- ממוצע הוצאה לסועד: ₪${settings.average_spend_per_customer}
- אחוז לקוחות בדיל: ${settings.deal_percentage}%
- ממוצע סועדים למלצר: ${settings.average_covers_per_waiter}
- יחס צוות מטבח: ${settings.kitchen_staff_ratio}

**נתוני הזמנות קיימות לתקופה הנחזית:**
${JSON.stringify(reservedCoversByDate, null, 2)}

**משימתך:**
1. חזה את מספר ה**מזדמנים** הצפוי לכל יום, בנוסף להזמנות הקיימות. קח בחשבון את היום בשבוע, חגים, מזג אוויר, אירועים ותנועה באזור. ספק שדה ב-JSON בשם 'predicted_walk_ins'.
2. חזה את **סך הסועדים** הצפוי (הזמנות + מזדמנים). ספק שדה ב-JSON בשם 'total_predicted_covers'.
3. חשב **חיזוי הכנסות** מדויק על בסיס סך הסועדים, ממוצע הוצאה לסועד ואחוז הדילים.
4. המלץ על **כוח אדם נדרש** (מלצרים, מטבח, מארחים).
5. ספק **המלצות הכנה מוקדמת (Prep)** למטבח עם כמויות.
6. ספק **המלצות מלאי** להזמנה מספקים.
7. זהה **גורמי סיכון** ושעות שיא צפויות לכל יום.
8. ספק תובנות כלליות לגבי התקופה כולה.
9. תן עדיפות לדיוק החיזוי והמלצות מעשיות.
10. ספק תשובה בפורמט JSON Array.
            `;

            const aiResponse = await InvokeLLM({
                prompt: prompt,
                add_context_from_internet: true, // לקבלת מידע על מזג אוויר ואירועים עתידיים
                response_json_schema: {
                    type: "object",
                    properties: {
                        daily_predictions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    date: { type: "string", format: "date" },
                                    predicted_walk_ins: { type: "integer" }, // New field
                                    total_predicted_covers: { type: "integer" }, // Represents total covers (reservations + walk-ins)
                                    confidence_level: { type: "number" },
                                    weather_analysis: { type: "string" }, // Added to capture weather per day
                                    events_impact: { type: "string" }, // Added to capture events per day
                                    holiday_factor: { type: "string", enum: ["regular", "holiday"] }, // Added to capture holiday per day
                                    recommended_waiters: { type: "integer" },
                                    recommended_kitchen_staff: { type: "integer" },
                                    recommended_host_staff: { type: "integer" },
                                    peak_hours: { type: "array", items: { type: "string" } },
                                    revenue_prediction: { type: "number" },
                                    risk_factors: { type: "array", items: { type: "string" } },
                                    reasoning: { type: "string" } // Reasoning for this specific day's prediction
                                },
                                required: ["date", "predicted_walk_ins", "total_predicted_covers", "confidence_level", "recommended_waiters", "recommended_kitchen_staff", "recommended_host_staff", "revenue_prediction"]
                            }
                        },
                        prep_recommendations: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    item: { type: "string" },
                                    quantity: { type: "string" },
                                    prep_day: { type: "string", format: "date" },
                                    reasoning: { type: "string" }
                                },
                                required: ["item", "quantity", "prep_day"]
                            }
                        },
                        inventory_suggestions: {
                            type: "array", 
                            items: {
                                type: "object",
                                properties: {
                                    ingredient: { type: "string" },
                                    current_estimate: { type: "string" },
                                    suggested_order: { type: "string" },
                                    urgency: { type: "string", enum: ["low", "medium", "high", "critical"] }
                                },
                                required: ["ingredient", "suggested_order"]
                            }
                        },
                        overall_insights: { type: "string" }
                    },
                    required: ["daily_predictions", "prep_recommendations", "inventory_suggestions", "overall_insights"]
                }
            });

            // Clear existing predictions for the date range before saving new ones
            const existingPredictions = await StaffingPrediction.filter({ date__gte: startDateStr, date__lte: endDateStr });
            for (const existingPred of existingPredictions) {
                await StaffingPrediction.delete(existingPred.id);
            }

            // Group prep and inventory suggestions by date for each daily prediction
            const prepAndInventoryByDate = {};
            aiResponse.daily_predictions.forEach(dailyPred => {
                prepAndInventoryByDate[dailyPred.date] = {
                    prep_recommendations: [],
                    inventory_suggestions: [],
                    overall_insights: aiResponse.overall_insights
                };
            });

            aiResponse.prep_recommendations.forEach(prep => {
                if (prepAndInventoryByDate[prep.prep_day]) {
                    prepAndInventoryByDate[prep.prep_day].prep_recommendations.push(prep);
                }
            });

            // For inventory suggestions, it's usually for the whole period, but let's assign to the first day or all days for simplicity
            if (aiResponse.inventory_suggestions.length > 0 && aiResponse.daily_predictions.length > 0) {
                 const firstDay = aiResponse.daily_predictions[0].date;
                 if (prepAndInventoryByDate[firstDay]) {
                     prepAndInventoryByDate[firstDay].inventory_suggestions.push(...aiResponse.inventory_suggestions);
                 }
            }


            // Save each daily prediction with its specific prep/inventory notes
            for (const dailyPred of aiResponse.daily_predictions) {
                const predictionData = {
                    date: dailyPred.date,
                    predicted_covers: dailyPred.total_predicted_covers, // Map AI's total to existing field
                    confidence_level: dailyPred.confidence_level,
                    weather_factor: determineWeatherFactor(dailyPred.weather_analysis || ''),
                    events_factor: dailyPred.events_impact || '',
                    holiday_factor: dailyPred.holiday_factor || 'regular',
                    recommended_waiters: dailyPred.recommended_waiters,
                    recommended_kitchen_staff: dailyPred.recommended_kitchen_staff,
                    recommended_host_staff: dailyPred.recommended_host_staff,
                    peak_hours: dailyPred.peak_hours || [],
                    revenue_prediction: dailyPred.revenue_prediction,
                    risk_factors: dailyPred.risk_factors || [],
                    preparation_notes: JSON.stringify(prepAndInventoryByDate[dailyPred.date] || { insights: aiResponse.overall_insights })
                };
                await StaffingPrediction.create(predictionData);
            }

            loadPredictions();
            alert('חיזוי רב-יומי נוצר בהצלחה! 🎯');

        } catch (error) {
            console.error('Error generating multi-day prediction:', error);
            alert('שגיאה ביצירת החיזוי: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const determineWeatherFactor = (weatherAnalysis) => {
        const analysis = weatherAnalysis.toLowerCase();
        if (analysis.includes('גשום') || analysis.includes('סערה') || analysis.includes('קר') || analysis.includes('שלג')) {
            return 'negative';
        } else if (analysis.includes('שמש') || analysis.includes('בהיר') || analysis.includes('יפה') || analysis.includes('נעים')) {
            return 'positive';
        }
        return 'neutral';
    };

    const updateSettings = async (newSettings) => {
        try {
            if (settings.id) {
                await PredictionSettings.update(settings.id, newSettings);
            } else {
                const created = await PredictionSettings.create(newSettings);
                setSettings(created);
                return;
            }
            setSettings({ ...settings, ...newSettings });
            alert('הגדרות נשמרו בהצלחה! ✅');
        } catch (error) {
            console.error('Error updating settings:', error);
            alert('שגיאה בשמירת ההגדרות');
        }
    };

    const analyzeEmployeeRisks = async () => {
        setLoading(true);
        try {
            const [employees, shifts] = await Promise.all([
                Employee.list(),
                Shift.list('-date', 100) // Last 100 shifts
            ]);

            // Clear existing risks
            const existingRisks = await EmployeeRiskAnalysis.list();
            for (const risk of existingRisks) {
                await EmployeeRiskAnalysis.delete(risk.id);
            }
            
            const newEmployeeRisks = [];

            for (const employee of employees) {
                if (employee.status !== 'active') continue;

                const employeeShifts = shifts.filter(s => s.employee_id === employee.id);
                
                if (employeeShifts.length < 5) continue; // Skip if less than 5 shifts for meaningful analysis

                // Calculate performance metrics
                const recentShifts = employeeShifts.slice(0, 10).sort((a, b) => new Date(b.date) - new Date(a.date)); // Get latest 10 shifts
                const avgRating = recentShifts.length > 0 ? recentShifts.reduce((sum, s) => sum + (s.manager_rating || 3), 0) / recentShifts.length : 3;
                const avgServiceRating = recentShifts.length > 0 ? recentShifts.reduce((sum, s) => sum + (s.customer_service_rating || 50), 0) / recentShifts.length : 50;

                const prompt = `
נתח את הנתונים הבאים של העובד ${employee.full_name} וקבע את הסיכון לעזיבה (Attrition Risk):

**פרטי עובד:**
- תפקיד: ${employee.role}
- תאריך הצטרפות: ${employee.hire_date ? format(new Date(employee.hire_date), 'dd/MM/yyyy') : 'לא ידוע'}
- סטטוס: ${employee.status}

**נתוני ביצועים אחרונים (ממוצעים מ-${recentShifts.length} משמרות אחרונות):**
- דירוג מנהל ממוצע: ${avgRating.toFixed(1)}/5
- דירוג שירות לקוחות ממוצע: ${avgServiceRating.toFixed(1)}%
- מספר משמרות בתקופה: ${recentShifts.length}

**נתוני משמרות אחרונות (עד 10 האחרונות):**
${JSON.stringify(recentShifts.map(s => ({
    date: s.date,
    rating: s.manager_rating,
    service_rating: s.customer_service_rating,
    hours: s.hours_worked,
    notes: s.notes
})), null, 2)}

חזה את הסיכון לעזיבת העובד (low, medium, high, critical) וספק ציון סיכון (0-100). בנוסף, ספק גורמי סיכון עיקריים, מגמות ביצועים, אינדיקטורים לשביעות רצון (או חוסר שביעות רצון), פעולות מומלצות למנהל, נקודות לשיחה עם העובד ואסטרטגיית מוטיבציה.
                `;

                const aiResponse = await InvokeLLM({
                    prompt: prompt,
                    response_json_schema: {
                        type: "object",
                        properties: {
                            risk_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
                            risk_score: { type: "number" },
                            risk_factors: { type: "array", items: { type: "string" } },
                            performance_trend: { type: "string" },
                            satisfaction_indicators: { type: "array", items: { type: "string" } },
                            recommended_actions: { type: "array", items: { type: "string" } },
                            conversation_talking_points: { type: "array", items: { type: "string" } },
                            motivation_strategy: { type: "string" }
                        },
                        required: ["risk_level", "risk_score", "risk_factors", "performance_trend", "recommended_actions"]
                    }
                });

                // Save only high-risk employees
                if (aiResponse.risk_level === 'high' || aiResponse.risk_level === 'critical') {
                    const createdRisk = await EmployeeRiskAnalysis.create({
                        employee_id: employee.id,
                        employee_name: employee.full_name,
                        risk_level: aiResponse.risk_level,
                        risk_score: aiResponse.risk_score,
                        risk_factors: aiResponse.risk_factors,
                        performance_trend: aiResponse.performance_trend,
                        attendance_score: avgRating * 20, // Convert to 100 scale, approximation
                        satisfaction_indicators: aiResponse.satisfaction_indicators || [],
                        conversation_talking_points: aiResponse.conversation_talking_points || [],
                        motivation_strategy: aiResponse.motivation_strategy || '',
                        recommended_actions: aiResponse.recommended_actions,
                        last_analysis_date: new Date().toISOString()
                    });
                    newEmployeeRisks.push(createdRisk);
                }
            }

            setEmployeeRisks(newEmployeeRisks); // Update state with newly created risks
            alert('ניתוח סיכוני עזיבה הושלם! 📊');

        } catch (error) {
            console.error('Error analyzing employee risks:', error);
            alert('שגיאה בניתוח עובדים: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const analyzeMenuItems = async () => {
        setLoading(true);
        try {
            const [salesData, menuItems] = await Promise.all([
                DailySales.list('-date', 60), // Last 60 days of sales
                MenuItem.list()
            ]);

            // Clear existing menu analysis
            const existingAnalysis = await MenuItemAnalysis.list();
            for (const analysis of existingAnalysis) {
                await MenuItemAnalysis.delete(analysis.id);
            }

            const prompt = `
אתה מומחה ניתוח נתונים למסעדות. נתח את נתוני המכירות ופרטי התפריט הבאים כדי לספק המלצות אסטרטגיות:

**פריטי תפריט זמינים:**
${JSON.stringify(menuItems.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
    price: item.price,
    cost: item.cost_price,
    ingredients: item.ingredients // Assuming ingredients is a string or array
})), null, 2)}

**נתוני מכירות יומיים (60 ימים אחרונים):**
${JSON.stringify(salesData.map(sale => ({
    date: sale.date,
    total_revenue: sale.total_revenue,
    covers: sale.covers,
    item_sales: sale.menu_item_sales // Assuming this is like [{item_id: 'x', quantity: y, revenue: z}]
})), null, 2)}

**משימתך:**
1. זהה את פריטי התפריט הפופולריים ביותר והפחות פופולריים.
2. חשב את רמת הרווחיות של כל פריט תפריט.
3. ספק המלצות לשינויים בתפריט (הורדה, קידום, שינוי מחיר).
4. ספק המלצות לניהול מלאי בהתבסס על צריכת מרכיבים של פריטים פופולריים.
5. זהה מגמות עונתיות או ימיות במכירות פריטים.
6. ספק תובנות כלליות לשיפור ביצועי התפריט.
            `;

            const aiResponse = await InvokeLLM({
                prompt: prompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        menu_item_analysis: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    menu_item_id: { type: "string" },
                                    menu_item_name: { type: "string" },
                                    popularity_score: { type: "number" }, // 0-100
                                    profitability_score: { type: "number" }, // 0-100
                                    sales_trend: { type: "string" }, // e.g., "increasing", "stable", "decreasing"
                                    suggested_action: { type: "string" }, // e.g., "promote", "remove", "adjust price"
                                    reasoning: { type: "string" },
                                    key_ingredients_impact: { type: "array", items: { type: "string" } } // Ingredients heavily used by this item
                                },
                                required: ["menu_item_id", "menu_item_name", "popularity_score", "profitability_score"]
                            }
                        },
                        overall_menu_insights: { type: "string" },
                        inventory_management_suggestions: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    ingredient: { type: "string" },
                                    demand_forecast: { type: "string" }, // e.g., "high demand next week"
                                    recommended_order_quantity: { type: "string" },
                                    priority: { type: "string", enum: ["low", "medium", "high"] }
                                }
                            }
                        }
                    },
                    required: ["menu_item_analysis", "overall_menu_insights"]
                }
            });

            const newMenuAnalysis = [];
            for (const itemAnalysis of aiResponse.menu_item_analysis) {
                const createdAnalysis = await MenuItemAnalysis.create({
                    menu_item_id: itemAnalysis.menu_item_id,
                    menu_item_name: itemAnalysis.menu_item_name,
                    popularity_score: itemAnalysis.popularity_score,
                    profitability_score: itemAnalysis.profitability_score,
                    sales_trend: itemAnalysis.sales_trend,
                    suggested_action: itemAnalysis.suggested_action,
                    reasoning: itemAnalysis.reasoning,
                    key_ingredients_impact: itemAnalysis.key_ingredients_impact || [],
                    analysis_date: new Date().toISOString()
                });
                newMenuAnalysis.push(createdAnalysis);
            }
            setMenuAnalysis(newMenuAnalysis);
            alert('ניתוח תפריט ומלאי הושלם בהצלחה! 🍽️');

        } catch (error) {
            console.error('Error analyzing menu items:', error);
            alert('שגיאה בניתוח תפריט: ' + error.message);
        } finally {
            setLoading(false);
        }
    };


    const getWeatherIcon = (factor) => {
        switch (factor) {
            case 'positive':
            case 'very_positive':
                return <Sun className="w-5 h-5 text-yellow-500" />;
            case 'negative':
            case 'very_negative':
                return <CloudSnow className="w-5 h-5 text-[#44512C]" />; // Changed to Snow for more negative connotation
            default:
                return <CloudRain className="w-5 h-5 text-gray-500" />;
        }
    };

    const getConfidenceColor = (confidence) => {
        if (confidence >= 80) return 'text-green-600 bg-green-100';
        if (confidence >= 60) return 'text-yellow-600 bg-[#F4ECD8]';
        return 'text-red-600 bg-red-100';
    };

    if (!settings) {
        return <div className="flex items-center justify-center h-screen"><span>טוען הגדרות...</span></div>;
    }

    return (
        <div className="p-4 sm:p-8 bg-gray-50 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#A04A2E] to-[#44512C] rounded-lg flex items-center justify-center">
                            <Brain className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900">מערכת ביקוש חכם AI</h1>
                        <Sparkles className="w-6 h-6 text-[#A04A2E]" />
                    </div>
                    <p className="text-slate-600">חיזוי עומסים מתקדם המבוסס על בינה מלאכותית וניתוח נתונים</p>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
                    <TabsList className="flex w-full overflow-x-auto h-auto p-1 gap-1 bg-white shadow-sm md:grid md:grid-cols-5">
                        <TabsTrigger value="predictions" className="flex items-center gap-1.5 text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">
                            <Target className="w-4 h-4" />
                            חיזויים
                        </TabsTrigger>
                        <TabsTrigger value="analysis" className="flex items-center gap-1.5 text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">
                            <BarChart3 className="w-4 h-4" />
                            ניתוח נתונים
                        </TabsTrigger>
                        <TabsTrigger value="employees" className="flex items-center gap-1.5 text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">
                            <UserMinus className="w-4 h-4" />
                            חיזוי עזיבות
                        </TabsTrigger>
                        <TabsTrigger value="menu" className="flex items-center gap-1.5 text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">
                            <ChefHat className="w-4 h-4" />
                            ניתוח תפריט
                        </TabsTrigger>
                        <TabsTrigger value="settings" className="flex items-center gap-1.5 text-sm px-3 py-2 whitespace-nowrap flex-shrink-0">
                            <Settings className="w-4 h-4" />
                            הגדרות
                        </TabsTrigger>
                    </TabsList>

                    {/* תוצאות החיזויים */}
                    <TabsContent value="predictions" className="space-y-6">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Zap className="w-5 h-5 text-[#44512C]" />
                                    יצירת חיזוי מתקדם
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div>
                                        <Label htmlFor="start-date">תאריך התחלה</Label>
                                        <Input
                                            id="start-date"
                                            type="date"
                                            value={selectedDate}
                                            onChange={(e) => setSelectedDate(e.target.value)}
                                            min={format(new Date(), 'yyyy-MM-dd')}
                                            max={format(addDays(new Date(), 30), 'yyyy-MM-dd')}
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="end-date">תאריך סיום</Label>
                                        <Input
                                            id="end-date"
                                            type="date"
                                            value={selectedEndDate}
                                            onChange={(e) => setSelectedEndDate(e.target.value)}
                                            min={selectedDate}
                                            max={format(addDays(new Date(), 30), 'yyyy-MM-dd')}
                                        />
                                    </div>
                                    <Button 
                                        onClick={() => generateMultiDayPrediction(selectedDate, selectedEndDate)}
                                        disabled={loading}
                                        className="bg-[#A04A2E] hover:bg-[#7A3722]"
                                    >
                                        {loading ? (
                                            <>
                                                <Brain className="w-4 h-4 mr-2 animate-pulse" />
                                                מנתח...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-4 h-4 mr-2" />
                                                צור חיזוי AI
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* תצוגת החיזויים עם הוספת פרטי הכנה */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {predictions.map((prediction) => {
                                let prepData = {
                                    prep_recommendations: [],
                                    inventory_suggestions: [],
                                    overall_insights: ''
                                };
                                try {
                                    if (prediction.preparation_notes) {
                                        prepData = JSON.parse(prediction.preparation_notes);
                                    }
                                } catch (e) {
                                    prepData.overall_insights = prediction.preparation_notes || '';
                                }

                                return (
                                    <Card key={prediction.id} className="shadow-lg hover:shadow-xl transition-shadow">
                                        <CardHeader>
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <CardTitle className="text-lg">
                                                        {format(new Date(prediction.date), 'dd/MM/yyyy')}
                                                    </CardTitle>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {getWeatherIcon(prediction.weather_factor)}
                                                        <Badge className={getConfidenceColor(prediction.confidence_level)}>
                                                            ביטחון: {prediction.confidence_level}%
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-2xl font-bold text-[#44512C]">
                                                        {prediction.predicted_covers}
                                                    </div>
                                                    <div className="text-sm text-gray-500">סועדים</div>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                             <div>
                                                <div className="flex justify-between text-sm mb-1">
                                                    <span>תפוסה צפויה</span>
                                                    <span>{Math.round((prediction.predicted_covers / settings.restaurant_capacity) * 100)}%</span>
                                                </div>
                                                <Progress 
                                                    value={(prediction.predicted_covers / settings.restaurant_capacity) * 100} 
                                                    className="h-2" 
                                                />
                                            </div>

                                            {/* כוח אדם */}
                                            <div className="grid grid-cols-3 gap-2 text-sm">
                                                <div className="text-center p-2 bg-[#F4ECD8] rounded">
                                                    <Users className="w-4 h-4 mx-auto mb-1 text-[#44512C]" />
                                                    <div className="font-semibold">{prediction.recommended_waiters}</div>
                                                    <div className="text-xs text-gray-600">מלצרים</div>
                                                </div>
                                                <div className="text-center p-2 bg-orange-50 rounded">
                                                    <ChefHat className="w-4 h-4 mx-auto mb-1 text-orange-600" />
                                                    <div className="font-semibold">{prediction.recommended_kitchen_staff}</div>
                                                    <div className="text-xs text-gray-600">מטבח</div>
                                                </div>
                                                <div className="text-center p-2 bg-green-50 rounded">
                                                    <Utensils className="w-4 h-4 mx-auto mb-1 text-green-600" />
                                                    <div className="font-semibold">{prediction.recommended_host_staff}</div>
                                                    <div className="text-xs text-gray-600">מארחים</div>
                                                </div>
                                            </div>

                                            {prediction.peak_hours && prediction.peak_hours.length > 0 && (
                                                <div className="bg-[#FAF5E8] p-2 rounded">
                                                    <div className="flex items-center gap-1 text-sm font-semibold text-yellow-800 mb-1">
                                                        <Clock className="w-3 h-3" />
                                                        שעות שיא
                                                    </div>
                                                    <div className="text-xs text-yellow-700">
                                                        {prediction.peak_hours.join(', ')}
                                                    </div>
                                                </div>
                                            )}

                                            {prediction.risk_factors && prediction.risk_factors.length > 0 && (
                                                <div className="bg-red-50 p-2 rounded">
                                                    <div className="flex items-center gap-1 text-sm font-semibold text-red-800 mb-1">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        גורמי סיכון
                                                    </div>
                                                    <div className="text-xs text-red-700">
                                                        {prediction.risk_factors.join(', ')}
                                                    </div>
                                                </div>
                                            )}

                                            {/* המלצות הכנה */}
                                            {prepData.prep_recommendations && prepData.prep_recommendations.length > 0 && (
                                                <div className="bg-[#F4ECD8] p-3 rounded">
                                                    <div className="flex items-center gap-1 text-sm font-semibold text-[#2E3819] mb-2">
                                                        <ChefHat className="w-3 h-3" />
                                                        המלצות הכנה מוקדמת
                                                    </div>
                                                    <div className="text-xs text-[#44512C] space-y-1">
                                                        {prepData.prep_recommendations.slice(0, 3).map((prep, i) => (
                                                            <div key={i}>• {prep.item}: {prep.quantity}</div>
                                                        ))}
                                                        {prepData.prep_recommendations.length > 3 && <div className="text-xs text-[#44512C]">ועוד...</div>}
                                                    </div>
                                                </div>
                                            )}

                                            {/* המלצות מלאי */}
                                            {prepData.inventory_suggestions && prepData.inventory_suggestions.length > 0 && (
                                                <div className="bg-green-50 p-3 rounded">
                                                    <div className="flex items-center gap-1 text-sm font-semibold text-green-800 mb-2">
                                                        <Package className="w-3 h-3" />
                                                        חומרי גלם להזמנה
                                                    </div>
                                                    <div className="text-xs text-green-700 space-y-1">
                                                        {prepData.inventory_suggestions.slice(0, 3).map((inv, i) => (
                                                            <div key={i}>• {inv.ingredient}: {inv.suggested_order} ({inv.urgency || 'רגיל'})</div>
                                                        ))}
                                                        {prepData.inventory_suggestions.length > 3 && <div className="text-xs text-green-700">ועוד...</div>}
                                                    </div>
                                                </div>
                                            )}

                                            {prepData.overall_insights && (
                                                <div className="bg-gray-50 p-2 rounded">
                                                    <div className="text-sm font-semibold text-gray-800 mb-1">תובנות נוספות:</div>
                                                    <div className="text-xs text-gray-600 line-clamp-3">{prepData.overall_insights}</div>
                                                </div>
                                            )}

                                            {prediction.revenue_prediction && (
                                                <div className="border-t pt-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-sm text-gray-600">הכנסות צפויות:</span>
                                                        <span className="font-semibold text-green-600">
                                                            ₪{prediction.revenue_prediction.toLocaleString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>

                        {predictions.length === 0 && (
                            <Card className="text-center py-12">
                                <CardContent>
                                    <Brain className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                    <h3 className="text-lg font-semibold text-gray-600 mb-2">אין חיזויים עדיין</h3>
                                    <p className="text-gray-500 mb-4">צור את החיזוי הראשון שלך כדי לראות תחזיות חכמות</p>
                                </CardContent>
                            </Card>
                        )}
                    </TabsContent>

                    {/* ניתוח נתונים היסטוריים */}
                    <TabsContent value="analysis" className="space-y-6">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-[#44512C]" />
                                    ניתוח נתונים היסטוריים
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {historicalData.length > 0 ? (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div className="bg-[#F4ECD8] p-4 rounded-lg">
                                                <div className="text-2xl font-bold text-[#44512C]">
                                                    {Math.round(historicalData.reduce((sum, day) => sum + (day.covers || 0), 0) / historicalData.length)}
                                                </div>
                                                <div className="text-sm text-gray-600">ממוצע סועדים יומי</div>
                                            </div>
                                            <div className="bg-green-50 p-4 rounded-lg">
                                                <div className="text-2xl font-bold text-green-600">
                                                    ₪{Math.round(historicalData.reduce((sum, day) => sum + (day.total_revenue || 0), 0) / historicalData.length).toLocaleString()}
                                                </div>
                                                <div className="text-sm text-gray-600">ממוצע הכנסות</div>
                                            </div>
                                            <div className="bg-[#F4ECD8] p-4 rounded-lg">
                                                <div className="text-2xl font-bold text-[#A04A2E]">
                                                    {Math.max(...historicalData.map(day => day.covers || 0))}
                                                </div>
                                                <div className="text-sm text-gray-600">יום הכי עמוס</div>
                                            </div>
                                            <div className="bg-orange-50 p-4 rounded-lg">
                                                <div className="text-2xl font-bold text-orange-600">
                                                    {Math.round((historicalData.reduce((sum, day) => sum + (day.covers || 0), 0) / historicalData.length / settings.restaurant_capacity) * 100)}%
                                                </div>
                                                <div className="text-sm text-gray-600">ממוצע תפוסה</div>
                                            </div>
                                        </div>
                                        
                                        <div className="bg-gray-50 p-4 rounded-lg">
                                            <h4 className="font-semibold mb-2">ימי השבוע הפופולריים ביותר:</h4>
                                            <div className="text-sm text-gray-600">
                                                מבוסס על {historicalData.length} ימי מידע • הנתונים מעודכנים אוטומטית
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <BarChart3 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                        <p className="text-gray-600">אין מספיק נתונים היסטוריים עדיין</p>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* חיזוי עזיבת עובדים */}
                    <TabsContent value="employees" className="space-y-6">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle className="flex items-center gap-2">
                                        <UserMinus className="w-5 h-5 text-red-500" />
                                        ניתוח סיכוני עזיבת עובדים
                                    </CardTitle>
                                    <Button 
                                        onClick={analyzeEmployeeRisks}
                                        disabled={loading}
                                        className="bg-red-600 hover:bg-red-700"
                                    >
                                        {loading ? (
                                            <>
                                                <Brain className="w-4 h-4 mr-2 animate-pulse" />
                                                מנתח...
                                            </>
                                        ) : (
                                            <>
                                                <AlertTriangle className="w-4 h-4 mr-2" />
                                                בצע ניתוח
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardHeader>
                        </Card>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {employeeRisks.length > 0 ? employeeRisks.map((risk) => (
                                <Card key={risk.id} className={`shadow-lg ${risk.risk_level === 'critical' ? 'border-l-4 border-red-500' : 'border-l-4 border-orange-500'}`}>
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-lg">{risk.employee_name}</CardTitle>
                                                <Badge className={risk.risk_level === 'critical' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}>
                                                    {risk.risk_level === 'critical' ? 'סיכון גבוה מאוד' : 'סיכון גבוה'}
                                                </Badge>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-red-600">
                                                    {risk.risk_score}%
                                                </div>
                                                <div className="text-sm text-gray-500">ציון סיכון</div>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {/* גורמי סיכון */}
                                        <div className="bg-red-50 p-3 rounded">
                                            <div className="flex items-center gap-1 text-sm font-semibold text-red-800 mb-2">🚨 גורמי סיכון:</div>
                                            <div className="text-xs text-red-700">
                                                {risk.risk_factors?.join(', ')}
                                            </div>
                                        </div>

                                        {/* המלצות לפעולה */}
                                        <div className="bg-[#F4ECD8] p-3 rounded">
                                            <div className="flex items-center gap-1 text-sm font-semibold text-[#2E3819] mb-2">💡 פעולות מומלצות:</div>
                                            <div className="text-xs text-[#44512C] space-y-1">
                                                {risk.recommended_actions?.slice(0, 3).map((action, i) => (
                                                    <div key={i}>• {action}</div>
                                                ))}
                                                {risk.recommended_actions.length > 3 && <div className="text-xs text-[#44512C]">ועוד...</div>}
                                            </div>
                                        </div>

                                        {/* נקודות לשיחה */}
                                        <div className="bg-green-50 p-3 rounded">
                                            <div className="flex items-center gap-1 text-sm font-semibold text-green-800 mb-2">🗣️ נקודות לשיחה:</div>
                                            <div className="text-xs text-green-700 space-y-1">
                                                {risk.conversation_talking_points?.slice(0, 2).map((point, i) => (
                                                    <div key={i}>• {point}</div>
                                                ))}
                                                {risk.conversation_talking_points.length > 2 && <div className="text-xs text-green-700">ועוד...</div>}
                                            </div>
                                        </div>

                                        {/* אסטרטגיית מוטיבציה */}
                                        {risk.motivation_strategy && (
                                            <div className="bg-[#F4ECD8] p-3 rounded">
                                                <div className="flex items-center gap-1 text-sm font-semibold text-[#7A3722] mb-1">🎯 אסטרטגיית מוטיבציה:</div>
                                                <div className="text-xs text-[#7A3722]">{risk.motivation_strategy}</div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )) : (
                                <Card className="text-center py-12 md:col-span-2">
                                    <CardContent>
                                        <Users className="w-16 h-16 mx-auto mb-4 text-green-400" />
                                        <h3 className="text-lg font-semibold text-green-600 mb-2">מצב טוב!</h3>
                                        <p className="text-gray-500">אין עובדים בסיכון גבוה לעזיבה כרגע</p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </TabsContent>

                    {/* ניתוח תפריט */}
                    <TabsContent value="menu" className="space-y-6">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle className="flex items-center gap-2">
                                        <ChefHat className="w-5 h-5 text-orange-500" />
                                        ניתוח תפריט וניהול מלאי
                                    </CardTitle>
                                    <Button 
                                        onClick={analyzeMenuItems}
                                        disabled={loading}
                                        className="bg-orange-600 hover:bg-orange-700"
                                    >
                                        {loading ? (
                                            <>
                                                <Brain className="w-4 h-4 mr-2 animate-pulse" />
                                                מנתח...
                                            </>
                                        ) : (
                                            <>
                                                <BarChart3 className="w-4 h-4 mr-2" />
                                                בצע ניתוח
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardHeader>
                        </Card>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {menuAnalysis.length > 0 ? menuAnalysis.map((item) => (
                                <Card key={item.id} className="shadow-lg border-l-4 border-orange-400">
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-lg">{item.menu_item_name}</CardTitle>
                                                <Badge className={`
                                                    ${item.popularity_score >= 80 ? 'bg-green-100 text-green-800' :
                                                      item.popularity_score >= 50 ? 'bg-[#F4ECD8] text-yellow-800' : 'bg-red-100 text-red-800'}
                                                `}>פופולריות: {item.popularity_score}%</Badge>
                                                <Badge className={`ml-2 
                                                    ${item.profitability_score >= 80 ? 'bg-green-100 text-green-800' :
                                                      item.profitability_score >= 50 ? 'bg-[#F4ECD8] text-yellow-800' : 'bg-red-100 text-red-800'}
                                                `}>רווחיות: {item.profitability_score}%</Badge>
                                            </div>
                                            <div className="text-right">
                                                <Badge variant="outline" className="text-sm font-semibold">
                                                    {item.suggested_action}
                                                </Badge>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="bg-gray-50 p-2 rounded">
                                            <div className="text-sm font-semibold text-gray-800 mb-1">נימוק:</div>
                                            <div className="text-xs text-gray-700 line-clamp-2">{item.reasoning}</div>
                                        </div>

                                        {item.sales_trend && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">מגמת מכירות:</span>
                                                <span className="font-semibold text-[#44512C]">{item.sales_trend}</span>
                                            </div>
                                        )}

                                        {item.key_ingredients_impact && item.key_ingredients_impact.length > 0 && (
                                            <div className="bg-[#FAF5E8] p-2 rounded">
                                                <div className="flex items-center gap-1 text-sm font-semibold text-yellow-800 mb-1">
                                                    <ShoppingCart className="w-3 h-3" />
                                                    מרכיבים קריטיים
                                                </div>
                                                <div className="text-xs text-yellow-700">
                                                    {item.key_ingredients_impact.join(', ')}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )) : (
                                <Card className="text-center py-12 md:col-span-3">
                                    <CardContent>
                                        <ChefHat className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                        <h3 className="text-lg font-semibold text-gray-600 mb-2">אין ניתוח תפריט עדיין</h3>
                                        <p className="text-gray-500">בצע ניתוח כדי לקבל תובנות אסטרטגיות על התפריט שלך</p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </TabsContent>

                    {/* הגדרות המערכת */}
                    <TabsContent value="settings" className="space-y-6">
                        <Card className="shadow-lg">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-[#44512C]" />
                                    הגדרות מערכת החיזוי
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div>
                                            <Label htmlFor="capacity">קיבולת המסעדה</Label>
                                            <Input
                                                id="capacity"
                                                type="number"
                                                value={settings.restaurant_capacity}
                                                onChange={(e) => setSettings({...settings, restaurant_capacity: parseInt(e.target.value) || 0})}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="avg-spend">ממוצע הוצאה לסועד (₪)</Label>
                                            <Input
                                                id="avg-spend"
                                                type="number"
                                                value={settings.average_spend_per_customer}
                                                onChange={(e) => setSettings({...settings, average_spend_per_customer: parseFloat(e.target.value) || 0})}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="deal-percentage">אחוז לקוחות בדיל/הנחה (%)</Label>
                                            <Input
                                                id="deal-percentage"
                                                type="number"
                                                step="1"
                                                min="0"
                                                max="100"
                                                value={settings.deal_percentage}
                                                onChange={(e) => setSettings({...settings, deal_percentage: parseFloat(e.target.value) || 0})}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="waiter-ratio">ממוצע סועדים למלצר</Label>
                                            <Input
                                                id="waiter-ratio"
                                                type="number"
                                                value={settings.average_covers_per_waiter}
                                                onChange={(e) => setSettings({...settings, average_covers_per_waiter: parseInt(e.target.value) || 0})}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="kitchen-ratio">יחס צוות מטבח (0.1-1.0)</Label>
                                            <Input
                                                id="kitchen-ratio"
                                                type="number"
                                                step="0.1"
                                                min="0.1"
                                                max="1.0"
                                                value={settings.kitchen_staff_ratio}
                                                onChange={(e) => setSettings({...settings, kitchen_staff_ratio: parseFloat(e.target.value) || 0})}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <Label htmlFor="weather-positive">השפעה חיובית של מזג אוויר</Label>
                                            <Input
                                                id="weather-positive"
                                                type="number"
                                                step="0.1"
                                                value={settings.weather_impact_positive}
                                                onChange={(e) => setSettings({...settings, weather_impact_positive: parseFloat(e.target.value) || 0})}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="weather-negative">השפעה שלילית של מזג אוויר</Label>
                                            <Input
                                                id="weather-negative"
                                                type="number"
                                                step="0.1"
                                                value={settings.weather_impact_negative}
                                                onChange={(e) => setSettings({...settings, weather_impact_negative: parseFloat(e.target.value) || 0})}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="holiday-impact">השפעת חגים</Label>
                                            <Input
                                                id="holiday-impact"
                                                type="number"
                                                step="0.1"
                                                value={settings.holiday_impact}
                                                onChange={(e) => setSettings({...settings, holiday_impact: parseFloat(e.target.value) || 0})}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6">
                                    <Button 
                                        onClick={() => updateSettings(settings)}
                                        className="bg-[#44512C] hover:bg-[#44512C]"
                                    >
                                        שמור הגדרות
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
