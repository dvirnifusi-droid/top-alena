import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InvokeLLM, UploadFile } from "@/integrations/Core";
import { SeatingLayout } from "@/entities/SeatingLayout";
import { TableSession } from "@/entities/TableSession";
import { Reservation } from "@/entities/Reservation";
import { BrainCircuit, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenantBranding } from '@/hooks/useTenantBranding';

export default function SeatingAiHelper() {
    const _branding = useTenantBranding();
    const brandName = _branding?.name || 'המסעדה';
    const [partyInfo, setPartyInfo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [aiResponse, setAiResponse] = useState('');
    const [error, setError] = useState('');
    const [layoutExists, setLayoutExists] = useState(false);
    const [mode, setMode] = useState('live');
    const [file, setFile] = useState(null);

    useEffect(() => {
        checkLayoutExists();
    }, []);

    const checkLayoutExists = async () => {
        try {
            const layouts = await SeatingLayout.list();
            if (layouts.length > 0 && layouts[0]?.tables?.length > 0) {
                setLayoutExists(true);
            } else {
                setLayoutExists(false);
            }
        } catch {
            setLayoutExists(false);
        }
    };
    
    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleAnalyze = async () => {
        if (mode === 'live') {
            await handleAnalyzeLive();
        } else {
            await handleAnalyzePhoto();
        }
    };

    const handleAnalyzePhoto = async () => {
        if (!partyInfo || !file) {
            setError('אנא פרט את הבקשה והעלה תמונה.');
            return;
        }
        setIsLoading(true);
        setAiResponse('');
        setError('');
        try {
            const { file_url } = await UploadFile({ file });
            const prompt = `
                You are an expert restaurant host AI. Analyze the attached image which is a seating map of a restaurant.
                Based on the image and the user's request, provide the best seating solution.

                **User Request:**
                "${partyInfo}"

                Your Task:
                Analyze the image to understand the table layout, capacities, and which tables are occupied.
                Provide the best and most efficient seating solutions based on the request.
                Your response must be in Hebrew and in clear, readable Markdown format.
            `;
            
            const response = await InvokeLLM({ prompt, file_urls: [file_url] });
            setAiResponse(response);

        } catch (err) {
            setError('אופס, קרתה שגיאה בניתוח התמונה. נסה שוב.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    }

    const handleAnalyzeLive = async () => {
        if (!partyInfo) {
            setError('אנא פרט את הבקשה.');
            return;
        }

        setIsLoading(true);
        setAiResponse('');
        setError('');

        try {
            // 1. Fetch all necessary data
            const layouts = await SeatingLayout.list();
            const activeSessions = await TableSession.filter({ status: 'active' });
            const todayReservations = await Reservation.filter({ 
                date: format(new Date(), 'yyyy-MM-dd'),
                status: 'confirmed' 
            });

            if (layouts.length === 0 || layouts[0].tables.length === 0) {
                setError("יש להגדיר מפת הושבה בעמוד 'הגדרות הושבה' תחילה.");
                setIsLoading(false);
                return;
            }
            const layout = layouts[0];

            // 2. Format data for the prompt with enhanced table information
            const indoorTables = layout.tables.filter(t => t.location === 'indoor');
            const outdoorTables = layout.tables.filter(t => t.location === 'outdoor');

            const formatTables = (tables, area) => {
                return tables.map(t => {
                    const capacity = t.min_capacity === t.max_capacity 
                        ? `${t.min_capacity} מקומות` 
                        : `${t.min_capacity}-${t.max_capacity} מקומות`;
                    
                    const combinable = t.combinable_with?.length > 0 
                        ? ` (ניתן לחיבור עם: ${t.combinable_with.join(', ')})` 
                        : '';
                    
                    return `- שולחן ${t.table_number} ב${area}: ${capacity}${combinable}`;
                }).join('\n');
            };

            const allTablesInfo = [
                "**🏠 שולחנות פנים:**",
                formatTables(indoorTables, 'פנים'),
                "",
                "**🌿 שולחנות חוץ:**", 
                formatTables(outdoorTables, 'חוץ')
            ].join('\n');

            const occupiedTables = activeSessions.map(s => `שולחן ${s.table_number}`).join(', ') || 'אין';
            const reservedTables = todayReservations.map(r => 
                `שולחן ${r.assigned_table} שמור ל-${r.party_size} אנשים בשעה ${r.time}`
            ).join('\n') || 'אין';

            const prompt = `
                אתה מומחה הושבה במסעדת ${brandName}. המטרה שלך למצוא את הפתרון הטוב ביותר לבקשת הלקוח.

                **בקשת הלקוח:**
                "${partyInfo}"

                **מפת שולחנות המסעדה:**
                ${allTablesInfo}

                **מצב נוכחי:**
                - שולחנות תפוסים: ${occupiedTables}
                - הזמנות קרובות להיום:
                ${reservedTables}

                **המשימה שלך:**
                בהתבסס על כל הנתונים לעיל, הצע את פתרונות ההושבה הטובים ביותר. שקול:

                1. **שולחן יחיד** שמתאים בדיוק לגודל הקבוצה
                2. **חיבור שולחנות** (רק אם הם מוגדרים כניתנים לחיבור)
                3. **פיצול לשולחנות נפרדים** אם אין מקום מתאים לקבוצה גדולה
                4. **הצעת זמן המתנה** אם שולחן מתאים יתפנה בקרוב
                5. **העדפת פנים/חוץ** בהתאם לעונה ובקשת הלקוח

                **חשוב:** 
                - הצג מספר אלטרנטיבות (2-3)
                - הסבר את הרציונל מאחורי כל הצעה
                - ציין יתרונות וחסרונות של כל אפשרות
                - השתמש בטבלאות ורשימות לבהירות

                התשובה שלך חייבת להיות בעברית ובפורמט Markdown ברור.
            `;

            const response = await InvokeLLM({ prompt });
            setAiResponse(response);

        } catch (err) {
            setError('אופס, קרתה שגיאה בניתוח. נסה שוב.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const isButtonDisabled = () => {
        if (isLoading) return true;
        if (mode === 'live' && !layoutExists) return true;
        if (mode === 'photo' && (!file || !partyInfo)) return true;
        if (mode === 'live' && !partyInfo) return true;
        return false;
    }

    return (
        <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-[#F4ECD8]/30">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-[#44512C] to-[#A04A2E] rounded-lg flex items-center justify-center">
                        <BrainCircuit className="w-5 h-5 text-white" />
                    </div>
                    <CardTitle className="text-lg text-slate-800">עוזר הושבה חכם</CardTitle>
                </div>
                <CardDescription>קבל המלצות הושבה מבוסס נתונים או ניתוח תמונה עם כל השולחנות שלך.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                     <Label htmlFor="party-info" className="text-sm font-medium text-slate-700 block mb-2">מה הבקשה?</Label>
                    <Textarea 
                        id="party-info"
                        value={partyInfo}
                        onChange={(e) => setPartyInfo(e.target.value)}
                        placeholder="לדוגמה: שולחן ל-8 אנשים, מועדפים בחוץ, עם נוף יפה"
                        className="h-20"
                    />
                </div>
                
                <Tabs value={mode} onValueChange={setMode} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="live">עזרה לפי נתונים חיים</TabsTrigger>
                        <TabsTrigger value="photo">ניתוח תמונה</TabsTrigger>
                    </TabsList>
                    <TabsContent value="live" className="pt-4">
                        {!layoutExists && (
                            <div className="p-3 bg-[#FAF5E8] border border-[#D9BD83] rounded-lg text-sm text-yellow-800 flex items-center gap-2">
                                <AlertCircle className="w-5 h-5" />
                                <span>כדי להשתמש במצב זה, יש להגדיר מפת הושבה בעמוד 'הגדרות הושבה'.</span>
                            </div>
                        )}
                        {layoutExists && (
                            <div className="p-3 bg-green-50 border border-green-300 rounded-lg text-sm text-green-800">
                                ✅ מפת השולחנות מוכנה! המערכת תציע פתרונות על בסיס כל השולחנות במסעדה.
                            </div>
                        )}
                    </TabsContent>
                    <TabsContent value="photo" className="pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="picture-upload">העלה תמונה של מפת ההושבה</Label>
                            <Input id="picture-upload" type="file" onChange={handleFileChange} accept="image/*" />
                            {file && <p className="text-xs text-gray-500">נבחר קובץ: {file.name}</p>}
                        </div>
                    </TabsContent>
                </Tabs>

                <Button onClick={handleAnalyze} disabled={isButtonDisabled()} className="w-full bg-[#44512C] hover:bg-[#44512C]">
                    {isLoading ? (
                        <>
                            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                            מנתח...
                        </>
                    ) : (
                         <>
                            <Sparkles className="w-4 h-4 ml-2" />
                            קבל הצעת הושבה חכמה
                        </>
                    )}
                </Button>

                {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                
                {aiResponse && (
                    <div className="p-4 bg-[#F4ECD8]/70 border border-[#E8D9B5] rounded-lg mt-4 text-sm max-h-96 overflow-y-auto">
                        <ReactMarkdown className="prose prose-sm max-w-none text-slate-800">{aiResponse}</ReactMarkdown>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}