import React, { useState, useEffect, useCallback } from 'react';
import { DailyBrief } from '@/entities/DailyBrief';
import { User } from '@/entities/User';
import { InvokeLLM } from '@/integrations/Core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Loader2, Sparkles, PlusCircle, Trash2, Save, CalendarIcon, Send, Eye, Users, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { MenuItem } from '@/entities/MenuItem'; // Import MenuItem
import { RestaurantProfile } from '@/entities/RestaurantProfile'; // Import RestaurantProfile

const fieldLabels = {
    item: 'פריט',
    target_description: 'תיאור יעד',
    target_value: 'ערך יעד',
    bonus_description: 'תיאור בונוס',
    employee_name: 'שם עובד',
    station_name: 'אזור/עמדה',
    assigned_to: 'אחראי',
    task_description: 'תיאור משימה',
};

// Helper component for dynamic lists (reusable for shortages, targets, etc.)
const DynamicListEditor = ({ title, items, setItems, itemStructure, placeholder }) => {
    const handleAddItem = () => {
        setItems([...items, { ...itemStructure, id: Date.now() }]);
    };
    const handleItemChange = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        setItems(newItems);
    };
    const handleRemoveItem = (index) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const keys = Object.keys(itemStructure);

    return (
        <div className="space-y-3 p-4 border rounded-xl bg-slate-50">
            <h4 className="font-bold text-slate-700 text-base">{title}</h4>
            {items.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">אין פריטים עדיין</p>
            )}
            {items.map((item, index) => (
                <div key={item.id || index} className="p-3 border rounded-lg bg-white shadow-sm space-y-2">
                    <div className={`grid gap-2 ${keys.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                        {keys.map(key => (
                            <div key={key} className="flex flex-col gap-1">
                                <Label className="text-xs font-semibold text-slate-500">
                                    {fieldLabels[key] || key.replace(/_/g, ' ')}
                                </Label>
                                <Input
                                    value={item[key]}
                                    onChange={(e) => handleItemChange(index, key, e.target.value)}
                                    placeholder={placeholder[key]}
                                    type={key === 'target_value' ? 'number' : 'text'}
                                    className="h-9 text-sm"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(index)} className="text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-3 text-xs">
                            <Trash2 className="w-3 h-3 ml-1" /> הסר
                        </Button>
                    </div>
                </div>
            ))}
            <Button variant="outline" size="sm" onClick={handleAddItem} className="w-full border-dashed border-slate-300 text-slate-600 hover:bg-slate-100 h-9">
                <PlusCircle className="w-4 h-4 ml-2" /> הוסף פריט
            </Button>
        </div>
    );
};

// Main Component
export default function BriefingManagement() {
    const [briefs, setBriefs] = useState([]);
    const [currentBriefData, setCurrentBriefData] = useState(null);
    const [date, setDate] = useState(new Date());
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('activeBrief');
    
    // State for archive
    const [archiveBriefs, setArchiveBriefs] = useState([]);
    const [archiveMonth, setArchiveMonth] = useState(new Date());

    const loadBriefs = useCallback(async (selectedDate) => {
        setIsLoading(true);
        try {
            const dateString = format(selectedDate, 'yyyy-MM-dd');
            const fetchedBriefs = await DailyBrief.filter({ date: dateString });
            setBriefs(fetchedBriefs);
            setCurrentBriefData(null);
        } catch (error) {
            toast.error('שגיאה בטעינת תדריכים');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const loadArchive = useCallback(async (monthDate) => {
        setIsLoading(true);
        try {
            // A real implementation would filter by month on the backend.
            // Here, we fetch recent briefs and filter client-side as a simulation.
            const allBriefs = await DailyBrief.list('-date', 100);
            const filtered = allBriefs.filter(b => format(new Date(b.date), 'yyyy-MM') === format(monthDate, 'yyyy-MM'));
            setArchiveBriefs(filtered);
        } catch (error) {
            toast.error('שגיאה בטעינת ארכיון');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const loadInitialUser = async () => {
            try {
                const currentUser = await User.me();
                setUser(currentUser);
            } catch (error) {
                toast.error('שגיאה בטעינת נתוני משתמש');
            }
        };
        loadInitialUser();
    }, []);

    useEffect(() => {
        if (activeTab === 'activeBrief') {
            loadBriefs(date);
        } else if (activeTab === 'archive') {
            loadArchive(archiveMonth);
        }
    }, [date, activeTab, archiveMonth, loadBriefs, loadArchive]);

    const handleDateChange = (newDate) => {
        if (newDate) setDate(newDate);
    };

    const handleCreateNewBrief = (shiftType) => {
        const newBrief = {
            date: format(date, 'yyyy-MM-dd'),
            shift_type: shiftType,
            created_by_name: user.full_name,
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
        };
        setCurrentBriefData(newBrief);
    };

    const handleGenerateWithAI = async (fieldName, shiftType) => {
        setIsAiLoading(true);
        try {
            // 1. Fetch restaurant profile and menu
            const profiles = await RestaurantProfile.list();
            const restaurantProfile = profiles.length > 0 ? profiles[0] : null;
            const menuItems = await MenuItem.list();

            // 2. Build a rich context for the AI
            let promptContext = `אתה מנהל מסעדה מנוסה בשם 'עלינא'. המשימה שלך היא לכתוב טקסט עבור תדריך יומי לעובדים.`;
            if (restaurantProfile) {
                promptContext += `\nפרופיל המסעדה: סגנון ${restaurantProfile.cuisine_style}, קהל יעד - ${restaurantProfile.target_audience}. נקודות חוזק: ${restaurantProfile.unique_selling_points?.join(', ')}.`;
            }
            if (menuItems.length > 0) {
                const popularItems = menuItems.filter(item => item.is_recommended).map(item => item.name).join(', ');
                if (popularItems) {
                    promptContext += `\nמנות מומלצות לדחיפה: ${popularItems}.`;
                }
            }
            promptContext += `\nהיום ${format(date, 'eeee', { locale: he })}. המשמרת היא משמרת ${shiftType === 'lunch' ? 'צהריים' : 'ערב'}.`;

            let specificPrompt = '';
            if (fieldName === 'story_of_the_day') {
                specificPrompt = `כתוב "סיפור משמרת" קצר, מעורר השראה או מצחיק, שקשור לעולם המסעדנות ומעביר מסר חיובי לצוות. התאם את הסיפור לאווירה של משמרת ${shiftType === 'lunch' ? 'עסקית ומהירה' : 'רגועה ובילוי'}.`;
            } else if (fieldName === 'sales_focus') {
                specificPrompt = `הצע דגש מכירות אחד, ממוקד ובר-ביצוע למשמרת זו. התבסס על פרופיל המסעדה והתפריט. לדוגמה, למשמרת צהריים הצע למכור תוספת למנה עסקית, ולערב הצע לקדם קוקטייל ספציפי או קינוח.`;
            } else if (fieldName === 'service_focus') {
                specificPrompt = `הצע דגש שירות אחד שמתאים למשמרת. לדוגמה, במשמרת צהריים הדגש יהיה על מהירות ויעילות, ובערב על יצירת חוויה אישית וקשר עם האורחים.`;
            } else if (fieldName === 'operational_focus') {
                specificPrompt = `הצע דגש תפעולי אחד למשמרת זו. התמקד בפרקטיקות יומיומיות שיכולות לשפר את זרימת העבודה או למנוע בעיות. לדוגמה, בדיקת מלאי, סדר וניקיון או תיאום בין עמדות.`;
            }


            const fullPrompt = `${promptContext}\n\nהמשימה שלך: ${specificPrompt}`;

            const response = await InvokeLLM({ prompt: fullPrompt });
            
            setCurrentBriefData(prev => ({ ...prev, [fieldName]: response }));
            toast.success(`הצעה נוצרה על ידי AI עבור '${fieldName.replace('_', ' ')}'`);

        } catch (error) {
            console.error('Error with AI generation:', error);
            toast.error('שגיאה ביצירת הצעה עם AI');
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleSaveBrief = async (publish = false) => {
        if (!currentBriefData) return;
        setIsLoading(true);
        try {
            let savedBrief;
            const finalData = { ...currentBriefData };
            if (publish) finalData.status = 'published';

            // Clean and validate data before saving
            // Convert empty strings to null/0 for numeric fields
            if (finalData.sales_targets) {
                finalData.sales_targets = finalData.sales_targets.map(target => ({
                    ...target,
                    target_value: target.target_value === '' || target.target_value === null ? 0 : parseFloat(target.target_value) || 0,
                }));
            }

            // Generate AI summary before saving
            const summaryPrompt = `Summarize the following restaurant brief in one short, informative sentence in Hebrew: ${JSON.stringify(finalData)}`;
            const summaryResponse = await InvokeLLM({ prompt: summaryPrompt });
            finalData.ai_summary = summaryResponse;

            if (finalData.id) {
                savedBrief = await DailyBrief.update(finalData.id, finalData);
                toast.success('התדריך עודכן בהצלחה!');
            } else {
                savedBrief = await DailyBrief.create(finalData);
                toast.success('תדריך חדש נשמר!');
            }
            
            await loadBriefs(date); // Reload to show changes
            setCurrentBriefData(savedBrief); // Keep the editor open with the saved data
            
        } catch (error) {
            console.error('Error saving brief:', error);
            toast.error('שגיאה בשמירת התדריך: ' + (error.message || 'נסה שוב'));
        } finally {
            setIsLoading(false);
        }
    };
    
    // Updated AiButton component to use shiftType
    const AiButton = ({ fieldName, shiftType }) => (
        <Button size="icon" variant="ghost" onClick={() => handleGenerateWithAI(fieldName, shiftType)} disabled={isAiLoading} className="text-purple-500 hover:text-purple-700">
            <Sparkles className="w-4 h-4" />
        </Button>
    );

    const BriefEditor = () => (
        <Card className="relative shadow-lg">
            {isAiLoading && <div className="absolute inset-0 bg-white/70 backdrop-blur-sm flex justify-center items-center z-10"><Loader2 className="w-8 h-8 animate-spin text-purple-600"/></div>}
            <CardHeader>
                <CardTitle>
                    {currentBriefData.id ? 'עריכת' : 'יצירת'} תדריך {currentBriefData.shift_type === 'lunch' ? 'צהריים' : 'ערב'}
                </CardTitle>
                <CardDescription>תאריך: {format(new Date(currentBriefData.date), 'PPP', { locale: he })}</CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="general">
                    <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
                        <TabsTrigger value="general">🎯 דגשים</TabsTrigger>
                        <TabsTrigger value="operations">🔧 תפעול</TabsTrigger>
                        <TabsTrigger value="goals">🏆 יעדים</TabsTrigger>
                        <TabsTrigger value="assignments">👤 איוש</TabsTrigger>
                    </TabsList>
                    
                    <div className="mt-4 p-2 sm:p-4 border rounded-lg bg-gray-50/50 space-y-6">
                        <TabsContent value="general" className="space-y-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="story_of_the_day">סיפור המשמרת</Label>
                                    <AiButton fieldName="story_of_the_day" shiftType={currentBriefData.shift_type} />
                                </div>
                                <Textarea id="story_of_the_day" value={currentBriefData.story_of_the_day} onChange={e => setCurrentBriefData(p => ({ ...p, story_of_the_day: e.target.value }))} placeholder="ספר משהו שיכניס את הצוות לאווירה הנכונה..."/>
                            </div>
                             <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="service_focus">דגש שירות</Label>
                                    <AiButton fieldName="service_focus" shiftType={currentBriefData.shift_type} />
                                </div>
                                <Textarea id="service_focus" value={currentBriefData.service_focus} onChange={e => setCurrentBriefData(p => ({ ...p, service_focus: e.target.value }))} placeholder="על מה מתמקדים בשירות היום?"/>
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="sales_focus">דגש מכירות</Label>
                                    <AiButton fieldName="sales_focus" shiftType={currentBriefData.shift_type} />
                                </div>
                                <Textarea id="sales_focus" value={currentBriefData.sales_focus} onChange={e => setCurrentBriefData(p => ({ ...p, sales_focus: e.target.value }))} placeholder="אילו פריטים אנחנו רוצים לקדם במיוחד?"/>
                            </div>
                        </TabsContent>

                        <TabsContent value="operations" className="space-y-4">
                             <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="operational_focus">דגשים בתפעול</Label>
                                    <AiButton fieldName="operational_focus" shiftType={currentBriefData.shift_type} />
                                </div>
                                <Textarea id="operational_focus" value={currentBriefData.operational_focus} onChange={e => setCurrentBriefData(p => ({ ...p, operational_focus: e.target.value }))} placeholder="דברים מיוחדים שצריך לשים לב אליהם תפעולית..."/>
                            </div>
                            <DynamicListEditor title="חוסרים במטבח" items={currentBriefData.kitchen_shortages.map(s=>({item:s}))} setItems={v => setCurrentBriefData(p=>({...p, kitchen_shortages: v.map(i=>i.item)}))} itemStructure={{item:''}} placeholder={{item:'למשל: נגמר הטריאקי'}} />
                            <DynamicListEditor title="חוסרים בבר" items={currentBriefData.bar_shortages.map(s=>({item:s}))} setItems={v => setCurrentBriefData(p=>({...p, bar_shortages: v.map(i=>i.item)}))} itemStructure={{item:''}} placeholder={{item:'למשל: נגמר מונסטר לבן'}} />
                        </TabsContent>

                        <TabsContent value="goals" className="space-y-4">
                            <DynamicListEditor title="יעדי מכירות" items={currentBriefData.sales_targets} setItems={v => setCurrentBriefData(p => ({...p, sales_targets: v}))} itemStructure={{ target_description: '', target_value: '' /* changed to '' for easier input */, bonus_description: ''}} placeholder={{ target_description: 'למכור 40 צייסרים', target_value: '40', bonus_description: 'בונוס 5 שח לשעה' }} />
                            <DynamicListEditor title="יעדי שירות" items={currentBriefData.service_targets} setItems={v => setCurrentBriefData(p => ({...p, service_targets: v}))} itemStructure={{ target_description: ''}} placeholder={{target_description: 'כל שולחן מקבל מים תוך דקה'}} />
                        </TabsContent>

                        <TabsContent value="assignments" className="space-y-4">
                            <DynamicListEditor title="חלוקה לאזורים (פיק)" items={currentBriefData.station_assignments} setItems={v => setCurrentBriefData(p => ({...p, station_assignments: v}))} itemStructure={{ employee_name: '', station_name: ''}} placeholder={{ employee_name: 'שם עובד/ת', station_name: 'אזור שירות' }} />
                            <DynamicListEditor title="משימות סגירה" items={currentBriefData.closing_tasks} setItems={v => setCurrentBriefData(p => ({...p, closing_tasks: v}))} itemStructure={{ assigned_to: '', task_description: ''}} placeholder={{ assigned_to: 'שם עובד/ת', task_description: 'משימה' }} />
                        </TabsContent>
                    </div>
                </Tabs>
                <div className="flex flex-col sm:flex-row justify-between gap-3 mt-6 pt-4 border-t">
                    <Button variant="outline" onClick={() => setCurrentBriefData(null)} className="order-last sm:order-first">ביטול</Button>
                    <div className="flex gap-2 flex-col sm:flex-row">
                        <Button onClick={() => handleSaveBrief(false)} disabled={isLoading} variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50">
                            {isLoading ? <Loader2 className="w-4 h-4 ml-2 animate-spin"/> : <Save className="w-4 h-4 ml-2"/>}
                            שמור טיוטה
                        </Button>
                        <Button onClick={() => handleSaveBrief(true)} className="bg-green-600 hover:bg-green-700 text-white" disabled={isLoading}>
                            {isLoading ? <Loader2 className="w-4 h-4 ml-2 animate-spin"/> : <Send className="w-4 h-4 ml-2"/>}
                            פרסם לצוות
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    const ArchiveView = () => (
        <div className="space-y-4">
            <div className="flex justify-between items-center bg-white p-3 rounded-lg shadow-sm">
                <Button variant="ghost" size="icon" onClick={() => setArchiveMonth(prev => new Date(prev.setMonth(prev.getMonth() - 1)))}>
                    <ChevronRight />
                </Button>
                <span className="font-bold text-lg">{format(archiveMonth, 'MMMM yyyy', { locale: he })}</span>
                <Button variant="ghost" size="icon" onClick={() => setArchiveMonth(prev => new Date(prev.setMonth(prev.getMonth() + 1)))}>
                    <ChevronLeft />
                </Button>
            </div>
            {isLoading && <Loader2 className="animate-spin mx-auto"/>}
            {!isLoading && archiveBriefs.length === 0 && <p className="text-center text-gray-500">לא נמצאו תדריכים לחודש זה.</p>}
            <div className="grid gap-4">
                {archiveBriefs.map(brief => (
                    <Card key={brief.id}>
                         <CardHeader>
                            <CardTitle>{format(new Date(brief.date), 'd/M/yy')} - {brief.shift_type === 'lunch' ? 'צהריים' : 'ערב'}</CardTitle>
                            <CardDescription>נוצר ע"י: {brief.created_by_name}</CardDescription>
                         </CardHeader>
                         <CardContent>
                            <p className="font-semibold text-gray-700">תקציר AI:</p>
                            <p className="text-gray-600">{brief.ai_summary || 'אין תקציר זמין.'}</p>
                         </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-cyan-50 to-blue-100 p-2 sm:p-4 md:p-8" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {/* Header מושלם */}
                <div className="text-center mb-8 sm:mb-12 relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 via-cyan-400/20 to-blue-400/20 rounded-3xl -rotate-1 hidden sm:block"></div>
                    <div className="relative bg-white/70 backdrop-blur-sm rounded-3xl p-4 sm:p-8 shadow-lg border border-white/50">
                        <h1 className="text-3xl sm:text-5xl font-black text-transparent bg-gradient-to-r from-emerald-600 via-cyan-600 to-blue-600 bg-clip-text mb-2 sm:mb-4 flex items-center justify-center gap-2 sm:gap-4">
                            <div className="w-10 h-10 sm:w-16 sm:h-16 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-xl rotate-3 hover:rotate-0 transition-transform duration-500">
                                <FileText className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
                            </div>
                            ניהול תדריכים יומיים
                            <div className="w-10 h-10 sm:w-16 sm:h-16 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-xl -rotate-3 hover:rotate-0 transition-transform duration-500">
                                <Sparkles className="w-5 h-5 sm:w-8 sm:h-8 text-white" />
                            </div>
                        </h1>
                        <p className="text-lg sm:text-xl text-gray-600 font-medium">יצירת תדריכים מקצועיים לצוות המסעדה ✨</p>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-4 sm:space-y-8">
                    {/* טאבים מעוצבים */}
                    <TabsList className="grid w-full grid-cols-2 sm:max-w-lg sm:mx-auto bg-white/80 backdrop-blur-xl p-1.5 sm:p-2 h-14 sm:h-16 rounded-3xl border border-white/30 shadow-xl">
                        <TabsTrigger 
                            value="activeBrief" 
                            className="py-2 sm:py-3 px-3 sm:px-6 text-xs sm:text-sm font-bold rounded-2xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300 hover:scale-105"
                        >
                            🎯 ניהול תדריך יומי
                        </TabsTrigger>
                        <TabsTrigger 
                            value="archive" 
                            className="py-2 sm:py-3 px-3 sm:px-6 text-xs sm:text-sm font-bold rounded-2xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:shadow-lg transition-all duration-300 hover:scale-105"
                        >
                            🗂️ ארכיון תדריכים
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="activeBrief">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
                            <div className="lg:col-span-1 space-y-4 sm:space-y-6">
                                <Card className="shadow-xl border-0 bg-gradient-to-br from-white via-emerald-50 to-cyan-50 backdrop-blur-sm overflow-hidden">
                                    <CardHeader className="bg-gradient-to-r from-emerald-600 via-cyan-600 to-blue-600 text-white rounded-t-lg relative overflow-hidden p-4">
                                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/20 via-cyan-400/20 to-blue-400/20"></div>
                                        <CardTitle className="text-xl sm:text-2xl flex items-center gap-3 font-black relative">
                                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                                <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                                            </div>
                                            בחירת תאריך
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-2 sm:p-6 flex justify-center">
                                        <Calendar mode="single" selected={date} onSelect={handleDateChange} className="p-0 scale-90 sm:scale-100"/>
                                    </CardContent>
                                </Card>

                                <Card className="shadow-xl border-0 bg-gradient-to-br from-white via-blue-50 to-indigo-50 backdrop-blur-sm overflow-hidden">
                                    <CardHeader className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-t-lg relative overflow-hidden p-4">
                                        <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 via-indigo-400/20 to-purple-400/20"></div>
                                        <CardTitle className="text-lg sm:text-xl flex items-center gap-3 font-black relative">
                                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                                                <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                                            </div>
                                            תדריכים ליום {format(date, 'd/M', { locale: he })}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="p-2 sm:p-6 space-y-3 sm:space-y-4">
                                        {isLoading && <Loader2 className="animate-spin mx-auto" />}
                                        {!isLoading && ['lunch', 'dinner'].map(shiftType => {
                                            const brief = briefs.find(b => b.shift_type === shiftType);
                                            return brief ? (
                                                <div key={brief.id} className="p-3 sm:p-4 rounded-xl border-2 border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 bg-gradient-to-r from-gray-50 to-white hover:shadow-lg transition-all duration-300 hover:scale-105">
                                                    <div>
                                                        <p className="font-bold text-md sm:text-lg text-gray-800">{shiftType === 'lunch' ? 'צהריים ☀️' : 'ערב 🌙'}</p>
                                                        <Badge 
                                                            variant={brief.status === 'published' ? 'default' : 'secondary'}
                                                            className={`${brief.status === 'published' ? 'bg-green-500' : 'bg-gray-400'} text-white text-xs px-2 py-0.5`}
                                                        >
                                                            {brief.status === 'published' ? '✅ פורסם' : '📝 טיוטה'}
                                                        </Badge>
                                                        <div className="text-xs sm:text-sm text-gray-600 flex items-center gap-2 mt-2">
                                                            <Users className="w-3 h-3 sm:w-4 sm:h-4" /> 
                                                            <span className="font-medium">{brief.read_by?.length || 0} קראו</span>
                                                        </div>
                                                    </div>
                                                    <Button size="sm" variant="outline" onClick={() => setCurrentBriefData(brief)} className="bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0 hover:from-blue-600 hover:to-purple-600 self-end sm:self-center w-full sm:w-auto mt-2 sm:mt-0">
                                                        <Eye className="w-4 h-4 ml-1 sm:mr-2" /> צפה/ערוך
                                                    </Button>
                                                </div>
                                            ) : (
                                                user && <div key={shiftType} className="p-3 sm:p-4 rounded-xl border-2 border-dashed border-gray-300 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all duration-300">
                                                    <p className="font-bold text-md sm:text-lg text-gray-600">{shiftType === 'lunch' ? 'צהריים ☀️' : 'ערב 🌙'}</p>
                                                    <Button size="sm" onClick={() => handleCreateNewBrief(shiftType)} className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600 text-white border-0 shadow-lg w-full sm:w-auto mt-2 sm:mt-0">
                                                        <PlusCircle className="w-4 h-4 ml-1 sm:mr-2" /> צור תדריך ✨
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </CardContent>
                                </Card>
                            </div>

                            <div className="lg:col-span-2">
                                {currentBriefData ? <BriefEditor /> : (
                                    <div className="flex flex-col items-center justify-center h-full text-center p-6 sm:p-12 bg-gradient-to-br from-white via-gray-50 to-blue-50 rounded-3xl border-2 border-dashed border-gray-300 shadow-xl">
                                        <div className="w-16 h-16 sm:w-24 sm:h-24 bg-gradient-to-r from-gray-200 to-gray-300 rounded-3xl flex items-center justify-center mb-4 sm:mb-6 shadow-lg">
                                            <FileText className="w-8 h-8 sm:w-12 sm:h-12 text-gray-500" />
                                        </div>
                                        <h3 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2 sm:mb-3">בחר תדריך לעריכה או צור אחד חדש</h3>
                                        <p className="text-gray-600 text-md sm:text-lg">התחל בבחירת תאריך ולאחר מכן בחר משמרת מהרשימה בצד שמאל.</p>
                                        <div className="mt-4 sm:mt-6 flex gap-3">
                                            <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse"></div>
                                            <div className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse delay-100"></div>
                                            <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse delay-200"></div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </TabsContent>
                    
                    <TabsContent value="archive">
                        <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/50">
                            <ArchiveView />
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}