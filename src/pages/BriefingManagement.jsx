import React, { useState, useEffect, useCallback } from 'react';
import { DailyBrief } from '@/entities/DailyBrief';
import { User } from '@/entities/User';
import { InvokeLLM } from '@/integrations/Core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Loader2, PlusCircle, CalendarIcon, Eye, Users, FileText, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { MenuItem } from '@/entities/MenuItem';
import { RestaurantProfile } from '@/entities/RestaurantProfile';
import BriefEditor from '../components/briefing/BriefEditor';
import BriefingAiGenerator from '@/components/ai/BriefingAiGenerator';

export default function BriefingManagement() {
    const [briefs, setBriefs] = useState([]);
    const [currentBriefData, setCurrentBriefData] = useState(null);
    const [date, setDate] = useState(new Date());
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('activeBrief');
    const [archiveBriefs, setArchiveBriefs] = useState([]);
    const [archiveMonth, setArchiveMonth] = useState(new Date());

    const loadBriefs = useCallback(async (selectedDate) => {
        setIsLoading(true);
        try {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            const fetchedBriefs = await DailyBrief.filter({ date: dateString });
            setBriefs(fetchedBriefs);
            setCurrentBriefData(null);
        } catch {
            toast.error('שגיאה בטעינת תדריכים');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadArchive = useCallback(async (monthDate) => {
        setIsLoading(true);
        try {
            const allBriefs = await DailyBrief.list('-date', 100);
            const filtered = allBriefs.filter(b => format(new Date(b.date), 'yyyy-MM') === format(monthDate, 'yyyy-MM'));
            setArchiveBriefs(filtered);
        } catch {
            toast.error('שגיאה בטעינת ארכיון');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const currentUser = await User.me();
                setUser(currentUser);
            } catch {
                toast.error('שגיאה בטעינת נתוני משתמש');
            }
        };
        loadUser();
    }, []);

    useEffect(() => {
        if (activeTab === 'activeBrief') loadBriefs(date);
        else if (activeTab === 'archive') loadArchive(archiveMonth);
    }, [date, activeTab, archiveMonth, loadBriefs, loadArchive]);

    const handleCreateNewBrief = (shiftType) => {
        setCurrentBriefData({
            date: format(date, 'yyyy-MM-dd'),
            shift_type: shiftType,
            created_by_name: user?.full_name,
            status: 'draft',
            sales_focus: '',
            service_focus: '',
            operational_focus: '',
            story_of_the_day: '',
            kitchen_shortages: [],
            bar_shortages: [],
            sales_targets: [],
            service_targets: [],
            station_assignments: [],
            closing_tasks: [],
            read_by: [],
            ai_summary: '',
        });
    };

    const handleBriefFieldChange = (field, value) => {
        setCurrentBriefData(prev => ({ ...prev, [field]: value }));
    };

    const handleGenerateWithAI = async (fieldName, shiftType) => {
        setIsAiLoading(true);
        try {
            const profiles = await RestaurantProfile.list();
            const restaurantProfile = profiles.length > 0 ? profiles[0] : null;
            const menuItems = await MenuItem.list();

            let promptContext = `אתה מנהל מסעדה מנוסה בשם 'עלינא'. המשימה שלך היא לכתוב טקסט עבור תדריך יומי לעובדים.`;
            if (restaurantProfile) {
                promptContext += `\nפרופיל המסעדה: סגנון ${restaurantProfile.cuisine_style}, קהל יעד - ${restaurantProfile.target_audience}. נקודות חוזק: ${restaurantProfile.unique_selling_points?.join(', ')}.`;
            }
            if (menuItems.length > 0) {
                const popularItems = menuItems.filter(item => item.is_recommended).map(item => item.name).join(', ');
                if (popularItems) promptContext += `\nמנות מומלצות לדחיפה: ${popularItems}.`;
            }
            promptContext += `\nהיום ${format(date, 'eeee', { locale: he })}. המשמרת היא משמרת ${shiftType === 'lunch' ? 'צהריים' : 'ערב'}.`;

            const prompts = {
                story_of_the_day: `כתוב "סיפור משמרת" קצר, מעורר השראה או מצחיק, שקשור לעולם המסעדנות ומעביר מסר חיובי לצוות.`,
                sales_focus: `הצע דגש מכירות אחד, ממוקד ובר-ביצוע למשמרת זו. התבסס על פרופיל המסעדה והתפריט.`,
                service_focus: `הצע דגש שירות אחד שמתאים למשמרת. לדוגמה, במשמרת צהריים הדגש על מהירות, ובערב על יצירת חוויה אישית.`,
                operational_focus: `הצע דגש תפעולי אחד למשמרת זו. התמקד בפרקטיקות יומיומיות שיכולות לשפר את זרימת העבודה.`,
            };

            const response = await InvokeLLM({ prompt: `${promptContext}\n\nהמשימה שלך: ${prompts[fieldName]}` });
            setCurrentBriefData(prev => ({ ...prev, [fieldName]: response }));
            toast.success('הצעה נוצרה בהצלחה!');
        } catch {
            toast.error('שגיאה ביצירת הצעה עם AI');
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleSaveBrief = async (publish = false) => {
        if (!currentBriefData) return;
        setIsLoading(true);
        try {
            const finalData = { ...currentBriefData };
            if (publish) finalData.status = 'published';

            if (finalData.sales_targets) {
                finalData.sales_targets = finalData.sales_targets.map(t => ({
                    ...t,
                    target_value: t.target_value === '' || t.target_value === null ? 0 : parseFloat(t.target_value) || 0,
                }));
            }

            const summaryResponse = await InvokeLLM({
                prompt: `Summarize the following restaurant brief in one short, informative sentence in Hebrew: ${JSON.stringify(finalData)}`
            });
            finalData.ai_summary = summaryResponse;

            let savedBrief;
            if (finalData.id) {
                savedBrief = await DailyBrief.update(finalData.id, finalData);
                toast.success('התדריך עודכן בהצלחה!');
            } else {
                savedBrief = await DailyBrief.create(finalData);
                toast.success('תדריך חדש נשמר!');
            }

            await loadBriefs(date);
            setCurrentBriefData(savedBrief);
        } catch (error) {
            toast.error('שגיאה בשמירת התדריך: ' + (error.message || 'נסה שוב'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 p-3 sm:p-6" dir="rtl">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="bg-white rounded-2xl border p-5 shadow-sm flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-cyan-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md">
                        <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">ניהול תדריכים יומיים</h1>
                        <p className="text-sm text-gray-500">יצירת תדריכים מקצועיים לצוות המסעדה</p>
                    </div>
                </div>

                {/* Main Tabs */}
                <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setCurrentBriefData(null); }}>
                    <TabsList className="w-full sm:w-auto grid grid-cols-2 h-11">
                        <TabsTrigger value="activeBrief" className="text-sm font-semibold">🎯 תדריך יומי</TabsTrigger>
                        <TabsTrigger value="archive" className="text-sm font-semibold">🗂️ ארכיון</TabsTrigger>
                    </TabsList>

                    <TabsContent value="activeBrief" className="mt-4">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                            {/* Sidebar - date + shift selection */}
                            <div className="space-y-4">
                                {/* Calendar */}
                                <Card className="shadow-sm">
                                    <CardHeader className="pb-2 pt-4 px-4">
                                        <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                            <CalendarIcon className="w-4 h-4 text-emerald-600" />
                                            בחירת תאריך
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="flex justify-center p-2">
                                        <Calendar
                                            mode="single"
                                            selected={date}
                                            onSelect={d => d && setDate(d)}
                                            className="p-0"
                                        />
                                    </CardContent>
                                </Card>

                                {/* Shift cards */}
                                <Card className="shadow-sm">
                                    <CardHeader className="pb-2 pt-4 px-4">
                                        <CardTitle className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-blue-600" />
                                            תדריכים ל-{format(date, 'd/M', { locale: he })}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-3 space-y-3">
                                        {isLoading ? (
                                            <div className="flex justify-center py-4">
                                                <Loader2 className="animate-spin w-5 h-5 text-gray-400" />
                                            </div>
                                        ) : (
                                            ['lunch', 'dinner'].map(shiftType => {
                                                const brief = briefs.find(b => b.shift_type === shiftType);
                                                const label = shiftType === 'lunch' ? '☀️ צהריים' : '🌙 ערב';

                                                if (brief) {
                                                    return (
                                                        <div key={brief.id} className="p-3 rounded-xl border bg-white shadow-sm">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="font-bold text-gray-800">{label}</span>
                                                                <Badge className={`text-xs ${brief.status === 'published' ? 'bg-green-500' : 'bg-gray-400'} text-white`}>
                                                                    {brief.status === 'published' ? '✅ פורסם' : '📝 טיוטה'}
                                                                </Badge>
                                                            </div>
                                                            <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                                                                <Users className="w-3 h-3" />
                                                                <span>{brief.read_by?.length || 0} קראו</span>
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => setCurrentBriefData(brief)}
                                                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-8"
                                                            >
                                                                <Eye className="w-3 h-3 ml-1" /> צפה / ערוך
                                                            </Button>
                                                        </div>
                                                    );
                                                }

                                                return user ? (
                                                    <div key={shiftType} className="p-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors">
                                                        <p className="font-bold text-gray-600 mb-2">{label}</p>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleCreateNewBrief(shiftType)}
                                                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                                                        >
                                                            <PlusCircle className="w-3 h-3 ml-1" /> צור תדריך
                                                        </Button>
                                                    </div>
                                                ) : null;
                                            })
                                        )}
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Editor area */}
                            <div className="lg:col-span-2">
                                {!currentBriefData && (
                                   <div className="mb-4">
                                       <BriefingAiGenerator
                                           shiftType="dinner"
                                           onInsert={(text) => handleCreateNewBrief('dinner') || setCurrentBriefData(prev => prev ? {...prev, sales_focus: text} : null)}
                                       />
                                   </div>
                                )}
                                {currentBriefData ? (
                                   <BriefEditor
                                        briefData={currentBriefData}
                                        onChange={handleBriefFieldChange}
                                        onSave={handleSaveBrief}
                                        onCancel={() => setCurrentBriefData(null)}
                                        isLoading={isLoading}
                                        isAiLoading={isAiLoading}
                                        onGenerateWithAI={handleGenerateWithAI}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 bg-white rounded-2xl border-2 border-dashed border-gray-200 shadow-sm">
                                        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                                            <FileText className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-lg font-bold text-gray-700 mb-2">בחר תדריך לעריכה</h3>
                                        <p className="text-sm text-gray-500 max-w-xs">בחר תאריך ולחץ על "צור תדריך" או "צפה / ערוך" כדי להתחיל.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    <TabsContent value="archive" className="mt-4">
                        <Card className="shadow-sm">
                            <CardHeader className="border-b">
                                <div className="flex items-center justify-between">
                                    <Button variant="ghost" size="icon" onClick={() => setArchiveMonth(prev => {
                                        const d = new Date(prev);
                                        d.setMonth(d.getMonth() - 1);
                                        return d;
                                    })}>
                                        <ChevronRight className="w-5 h-5" />
                                    </Button>
                                    <span className="font-bold text-lg">{format(archiveMonth, 'MMMM yyyy', { locale: he })}</span>
                                    <Button variant="ghost" size="icon" onClick={() => setArchiveMonth(prev => {
                                        const d = new Date(prev);
                                        d.setMonth(d.getMonth() + 1);
                                        return d;
                                    })}>
                                        <ChevronLeft className="w-5 h-5" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4">
                                {isLoading && <div className="flex justify-center py-8"><Loader2 className="animate-spin w-6 h-6 text-gray-400" /></div>}
                                {!isLoading && archiveBriefs.length === 0 && (
                                    <p className="text-center text-gray-500 py-8">לא נמצאו תדריכים לחודש זה.</p>
                                )}
                                <div className="grid gap-3">
                                    {archiveBriefs.map(brief => (
                                        <div key={brief.id} className="p-4 rounded-xl border bg-white shadow-sm">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-bold text-gray-800">
                                                    {format(new Date(brief.date), 'd/M/yy')} — {brief.shift_type === 'lunch' ? '☀️ צהריים' : '🌙 ערב'}
                                                </span>
                                                <Badge className={`text-xs ${brief.status === 'published' ? 'bg-green-500' : 'bg-gray-400'} text-white`}>
                                                    {brief.status === 'published' ? 'פורסם' : 'טיוטה'}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-2">נוצר ע"י: {brief.created_by_name}</p>
                                            {brief.ai_summary && (
                                                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-2 flex items-start gap-1.5">
                                                    <Sparkles className="w-3 h-3 text-purple-500 mt-0.5 flex-shrink-0" />
                                                    {brief.ai_summary}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}