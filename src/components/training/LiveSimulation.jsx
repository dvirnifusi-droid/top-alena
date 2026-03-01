
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { InvokeLLM } from "@/integrations/Core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bot, User, Send, RotateCw, Trophy, BarChart3, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { User as UserEntity } from '@/entities/User';
import { EmployeePerformance } from '@/entities/EmployeePerformance';
import { Achievement } from '@/entities/Achievement';
import { UserAchievement } from '@/entities/UserAchievement';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MenuItem, RestaurantInfo } from '@/entities/all'; // Import MenuItem and RestaurantInfo

export default function LiveSimulation({ onComplete }) {
    const [conversation, setConversation] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [simulationActive, setSimulationActive] = useState(false);
    const [simulationComplete, setSimulationComplete] = useState(false);
    const [analysis, setAnalysis] = useState(null);
    const [customerPersonality, setCustomerPersonality] = useState('');
    const [partySize, setPartySize] = useState(2); // New state for party size

    // Voice functionality state
    const [voiceMode, setVoiceMode] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const speechRecognitionRef = useRef(null);

    // New state for menu context
    const [menuContext, setMenuContext] = useState('');
    const [restaurantInfoContext, setRestaurantInfoContext] = useState(''); // New state for restaurant info

    // Function to speak text
    const speak = useCallback((text) => {
        if (!voiceMode || !window.speechSynthesis) return;
        
        try {
            // Remove markdown for cleaner speech
            const cleanText = text.replace(/[*_`]/g, '');
            
            const utterance = new SpeechSynthesisUtterance(cleanText);
            utterance.lang = 'he-IL';
            
            // Find a Hebrew voice if available
            const voices = window.speechSynthesis.getVoices();
            const hebrewVoice = voices.find(v => v.lang === 'he-IL' || v.lang.startsWith('he'));
            if (hebrewVoice) {
                utterance.voice = hebrewVoice;
            }
            
            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event.error);
            };
            
            window.speechSynthesis.speak(utterance);
        } catch (error) {
            console.error('Error in speech synthesis:', error);
        }
    }, [voiceMode]);

    const updateUserPerformance = useCallback(async (score) => {
        try {
            const user = await UserEntity.me();
            if (!user) return;

            let [performance] = await EmployeePerformance.filter({ employee_id: user.id });
            let newTotalPoints = score;
            if (performance) {
                newTotalPoints = (performance.total_points || 0) + score;
                await EmployeePerformance.update(performance.id, { total_points: newTotalPoints });
            } else {
                performance = await EmployeePerformance.create({ 
                    employee_id: user.id, 
                    employee_name: user.full_name,
                    total_points: score 
                });
            }

            const allAchievements = await Achievement.list();
            const userAchievements = await UserAchievement.filter({ employee_id: user.id });
            const userAchievementIds = userAchievements.map(ua => ua.achievement_id);

            for (const ach of allAchievements) {
                if (userAchievementIds.includes(ach.id)) continue;

                let earned = false;
                if (ach.type === 'simulation_score' && score >= ach.threshold_score) {
                    earned = true;
                }
                if (ach.type === 'total_points' && newTotalPoints >= ach.threshold_score) {
                    earned = true;
                }

                if (earned) {
                    await UserAchievement.create({
                        employee_id: user.id,
                        achievement_id: ach.id,
                        achievement_name: ach.name,
                        achievement_icon: ach.icon
                    });
                    console.log(`New achievement unlocked: ${ach.name}`);
                }
            }
        } catch (error) {
            console.error("Error updating user performance:", error);
        }
    }, []);

    // הגדרת analyzeConversation לפני השימוש בה
    const analyzeConversation = useCallback(async (fullConversation) => {
        setLoading(true);
        
        try {
            const conversationText = fullConversation.map(msg => 
                `${msg.type === 'user' ? 'מלצר' : 'לקוח'}: ${msg.content}`
            ).join('\n');
            
            const currentHour = new Date().getHours();
            const isHappyHourTime = currentHour >= 12 && currentHour < 20;
            
            const expectedDishesMin = Math.floor(partySize * 2);
            const expectedDishesMax = Math.ceil(partySize * 2.5);

            const happyHourCritera = isHappyHourTime 
                ? `- **אלכוהול (Happy Hour!):** האם הוזכר ה-Happy Hour (40% הנחה)? = 10 נק'.`
                : `- **אלכוהול:** האם הייתה מכירת אלכוהול יעילה? = 10 נק'.`;
            
            const analysisPrompt = `נתח את השיחה הבאה בין מלצר ללקוח במסעדת עלינא, ותן ציון מדויק מ-1 עד 100.

**מידע חשוב למנתח:**
${menuContext}

${restaurantInfoContext}

**השיחה:**
${conversationText}

**איך לקבל ציון 100 מושלם:**

🎯 **יעדים עסקיים (40 נקודות):**
   - **מנות (20 נק'):** האם המלצר המליץ על המנות הנכונות מהתפריט המומלץ? האם נמכרו ${expectedDishesMin}-${expectedDishesMax} מנות עבור ${partySize} אנשים?
   ${happyHourCritera}
   - **ממוצע לסועד (10 נק'):** האם ההזמנה מגיעה ל-180₪ לסועד (בהתבסס על מחירי התפריט)?

🎭 **מיומנויות מקצועיות (60 נקודות):**
   - **פתיחה וקביעת עוגן (15 נק'):** שאלה על גודל קבוצה + הצגת יעד ברור.
   - **ידע והמלצות (15 נק'):** שימוש ב"נקודות לשיחה" שהוגדרו למנות המומלצות. התאמה ללקוח.
   - **טיפול בשאלות (10 נק'):** מענה חכם לשאלות ללא חקירה מיותרת.
   - **מכירה יעילה (10 נק'):** שכנוע טבעי, לא לחצני.
   - **חווית לקוח (10 נק'):** יצירת אווירה נעימה ומקצועית.

**📋 מידע נוסף שחשוב לבדוק:**
- האם המלצר השתמש במידע הנכון על המסעדה כשנשאל?
- האם הוא טיפל נכון בשאלות על כשרות, מיקום, שעות פעילות וכו'?

**פורמט הפלט:**
**ציון כללי:** [ציון מספרי מ-1 עד 100]

**💰 ניתוח יעדים עסקיים ([X]/40 נקודות):**
- **מנות:** [ניתוח + נקודות]
- **אלכוהול:** [ניתוח + נקודות] 
- **עלות משוערת:** [הערכה + נקודות]

**🎯 ניתוח מיומנויות ([X]/60 נקודות):**
- **פתיחה:** [ניתוח + נקודות]
- **ידע והמלצות:** [ניתוח + נקודות]
- **טיפול בשאלות:** [ניתוח + נקודות]
- **מכירה:** [ניתוח + נקודות] 
- **חווית לקוח:** [ניתוח + נקודות]

**🔧 דרכים לשיפור (רק אם הציון מתחת ל-85):**
[נקודות ספציפיות לשיפור]`;

            const analysisResponse = await InvokeLLM({ prompt: analysisPrompt });
            setAnalysis(analysisResponse);
            
            const scoreMatch = analysisResponse.match(/ציון כללי:\s*(\d+)/);
            if (scoreMatch) {
                const score = parseInt(scoreMatch[1], 10);
                onComplete(score);
                await updateUserPerformance(score);
            }

            setSimulationComplete(true);
            setSimulationActive(false);
            
        } catch (error) {
            console.error('Error analyzing conversation:', error);
            setSimulationComplete(true);
            setSimulationActive(false);
        }
        
        setLoading(false);
    }, [partySize, onComplete, updateUserPerformance, menuContext, restaurantInfoContext]);

    const startSimulation = useCallback(async () => {
        setSimulationActive(true);
        setSimulationComplete(false);
        setConversation([]);
        setAnalysis(null);
        
        const personalities = [
            { text: 'זוג צמחוני נחמד שרוצה לבלות, מעוניינים בהמלצות ופתוחים לנסות דברים חדשים.', partySize: 2 },
            { text: 'משפחה רגילה שמחפשת ארוחה טובה.', partySize: 4 },
            { text: 'זוג בדייט שרוצים להתרשם. מתעניינים ביין וקוקטיילים, פתוחים לעצות ורוצים "החוויה המלאה".', partySize: 2 },
            { text: 'קבוצת חברים שמחה שבאה לאכול. אוהבים בשר, בירה וצ\'ייסרים.', partySize: 5 },
            { text: 'זוג שהכיר את המקום לפני חודש ורוצה לנסות מנות חדשות. מעוניינים בהמלצות ופתוחים לשדרוגים.', partySize: 2 },
            { text: 'לקוחות VIP שמגיעים לחגוג משהו מיוחד. רוצים שהמלצר יטפל בהם ויציע את הטוב ביותר.', partySize: 3 },
            { text: 'זוג צעיר וחברותי שמחפש ארוחה כיפית. אוהבים לנסות דברים חדשים ופתוחים לכל ההצעות.', partySize: 2 },
            { text: 'משפחה מורחבת שמגיעה לחגוג יום הולדת. רוצים הרבה מנות לשיתוף ואלכוהול לחגיגה.', partySize: 6 }
        ];
        
        const selectedPersonality = personalities[Math.floor(Math.random() * personalities.length)];
        setCustomerPersonality(selectedPersonality.text);
        setPartySize(selectedPersonality.partySize);
        
        // Fetch menu and restaurant info
        try {
            const [allItems, restaurantInfoItems] = await Promise.all([
                MenuItem.list(),
                RestaurantInfo.filter({ is_active: true })
            ]);
            
            const recommendedItems = allItems.filter(item => item.is_recommended);
            
            let menuContext = "**תפריט המנות המומלצות להיום:**\n";
            if (recommendedItems.length > 0) {
                recommendedItems.forEach(item => {
                    menuContext += `- **${item.name}** (מחיר: ₪${item.price}) - ${item.talking_points || item.description}\n`;
                });
            } else {
                menuContext = "**אין מנות מומלצות מוגדרות להיום.**\n";
            }
            setMenuContext(menuContext);

            // Build restaurant info context
            let infoContext = "**מידע חשוב על המסעדה:**\n";
            if (restaurantInfoItems.length > 0) {
                const criticalInfo = restaurantInfoItems.filter(item => item.priority === 'critical');
                const highInfo = restaurantInfoItems.filter(item => item.priority === 'high');
                const mediumInfo = restaurantInfoItems.filter(item => item.priority === 'medium');
                const lowInfo = restaurantInfoItems.filter(item => item.priority === 'low');
                
                // Prioritize by critical, then high, then medium, then low
                [...criticalInfo, ...highInfo, ...mediumInfo, ...lowInfo].forEach(item => {
                    infoContext += `- **${item.title}:** ${item.content}\n`;
                });
            } else {
                infoContext += "אין מידע נוסף זמין על המסעדה.\n";
            }
            setRestaurantInfoContext(infoContext);

        } catch (e) {
            console.error("Could not load menu/info for simulation", e);
            setMenuContext("**שגיאה בטעינת התפריט.**\n");
            setRestaurantInfoContext("**שגיאה בטעינת מידע המסעדה.**\n");
        }

        const aiMessage = {
            type: 'ai',
            content: 'שלום! אנחנו יושבים בשולחן וקראנו לך.',
            timestamp: new Date()
        };
        setConversation([aiMessage]);
        speak(aiMessage.content); // Call speak here for initial AI message
    }, [setSimulationActive, setSimulationComplete, setConversation, setAnalysis, setCustomerPersonality, setPartySize, setMenuContext, setRestaurantInfoContext, speak]);

    const sendMessage = useCallback(async (messageContent) => {
        const textToSend = messageContent || userInput;
        if (!textToSend.trim() || loading) return;

        const userMessage = {
            type: 'user', 
            content: textToSend,
            timestamp: new Date()
        };
        
        const newConversation = [...conversation, userMessage];
        setConversation(newConversation);
        setUserInput('');
        setLoading(true);

        try {
            const conversationHistory = newConversation.map(msg => 
                `${msg.type === 'user' ? 'מלצר' : 'לקוח'}: ${msg.content}`
            ).join('\n');
            
            const explicitEnd = textToSend.toLowerCase().includes('תודה רבה') || 
                               textToSend.toLowerCase().includes('זה כל ההזמנה') ||
                               textToSend.toLowerCase().includes('אני שולח להכנה');
            
            const shouldEnd = (newConversation.length >= 20 && explicitEnd) || newConversation.length >= 24;

            if (shouldEnd) {
                await analyzeConversation(newConversation);
                return;
            }
            
            const response = await InvokeLLM({
                prompt: `אתה לקוח במסעדת עלינא - מסעדה מזרח תיכונית עם תנור טאבון, חמארה בשרית כשרה.

**הדמות שלך:** ${customerPersonality}. אתם ${partySize} אנשים.

${menuContext}

${restaurantInfoContext}

**איך לשחק את התפקיד בצורה אותנטית:**
🎭 **אופי האדם:** תתנהג כמו אדם אמיתי - יש לך מצב רוח, העדפות, תחושות. לפעמים אתה מהסס, לפעמים מחליט מהר.
🗣️ **שפה טבעית:** דבר בעברית יומיומית, לא פורמלית. "אוקיי", "נשמע טוב", "אממ...", "בטח".
🤔 **סקרנות בריאה:** תשאל שאלה או שתיים על המנות המומלצות.
✨ **זרימה:** המטרה שלך לבזבז זמן נחמד עם המלצר ולהזמין ארוחה טובה. תהיה חיובי ושיתופי.

**דברים חשובים:**
- אל תשאל על כשרות אלא אם זה באמת חשוב לך (10% סיכוי)
- תהיה פתוח להצעות המלצר אבל לא תסכים לכל דבר אוטומטית
- לפעמים תהסס בין שתי אפשרויות
- תתאמן לגודל הקבוצה (${partySize} אנשים)
- תזכור שאתה רוצה לבלות, לא לחקור את המלצר

**היסטוריית השיחה:**
${conversationHistory}
המלצר אמר: "${textToSend}"

**עכשיו תגיב כלקוח אמיתי** (1-2 משפטים קצרים וטבעיים):`,
                response_json_schema: {
                    type: "object",
                    properties: {
                        response: { type: "string", description: "תגובת הלקוח הטבעית" },
                        mood: { type: "string", description: "מצב רוח כללי" },
                        interest_level: { type: "string", enum: ["low", "medium", "high"], description: "רמת העניין ברגע זה" }
                    }
                }
            });
            
            const aiMessage = {
                type: 'ai',
                content: response.response.trim(),
                timestamp: new Date()
            };
            
            setConversation(prev => [...prev, aiMessage]);
            speak(aiMessage.content);
            
        } catch (error) {
            console.error('Error in AI simulation:', error);
            const errorMessage = {
                type: 'ai',
                content: 'סליחה, אני קצת מבולבל... מה אמרת?',
                timestamp: new Date()
            };
            setConversation(prev => [...prev, errorMessage]);
            speak(errorMessage.content);
        }
        
        setLoading(false);
    }, [userInput, loading, conversation, customerPersonality, analyzeConversation, partySize, speak, menuContext, restaurantInfoContext]);
    
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            speechRecognitionRef.current = new SpeechRecognition();
            speechRecognitionRef.current.continuous = false;
            speechRecognitionRef.current.interimResults = false;
            speechRecognitionRef.current.lang = 'he-IL';

            speechRecognitionRef.current.onstart = () => {
                console.log('Speech recognition started');
                setIsRecording(true);
            };
            
            speechRecognitionRef.current.onend = () => {
                console.log('Speech recognition ended');
                setIsRecording(false);
            };
            
            speechRecognitionRef.current.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                setIsRecording(false);
                
                // טיפול בשגיאות שונות
                let errorMessage = '';
                switch (event.error) {
                    case 'audio-capture':
                        errorMessage = 'לא ניתן לגשת למיקרופון. אנא ודא שהמיקרופון מחובר והרשאות ניתנו.';
                        break;
                    case 'not-allowed':
                        errorMessage = 'הגישה למיקרופון נדחתה. אנא אפשר גישה למיקרופון בהגדרות הדפדפן.';
                        break;
                    case 'no-speech':
                        errorMessage = 'לא זוהה דיבור. נסה שוב.';
                        break;
                    case 'network':
                        errorMessage = 'בעיית רשת. בדוק את החיבור לאינטרנט.';
                        break;
                    default:
                        errorMessage = `שגיאה בזיהוי דיבור: ${event.error}`;
                }
                
                // הצג הודעת שגיאה למשתמש (אופציונלי)
                console.warn(errorMessage);
                
                // במקרה של שגיאה, כבה את מצב הקול אוטומטית
                if (event.error === 'audio-capture' || event.error === 'not-allowed') {
                    setVoiceMode(false);
                }
            };
            
            speechRecognitionRef.current.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                console.log('Speech recognized:', transcript);
                setUserInput(transcript);
                // Automatically send message after successful speech recognition
                sendMessage(transcript);
            };
        } else {
            console.warn('Speech recognition not supported in this browser');
        }
    }, [sendMessage]);

    // Effect to speak AI messages
    useEffect(() => {
        // This useEffect is no longer strictly necessary for speaking AI messages
        // because `speak` is now called directly within `sendMessage` after the AI response.
        // Keeping it might cause double-speaking if not careful, but if it only triggers
        // on changes to `conversation` and `voiceMode`, it *could* be fine as a fallback
        // or for other future logic.
        // For this specific change, the outline implies moving the speak call to sendMessage.
        // If the outline didn't specify, I might keep this for other cases.
        // But for now, as speak is called in sendMessage right after setting the AI message,
        // this useEffect would react to the *same* message again.
        // So, I'll keep the useEffect structure but rely on `sendMessage`'s direct `speak` call.
    }, [conversation, voiceMode, speak]);


    const handleVoiceInput = async () => {
        if (!speechRecognitionRef.current) {
            console.warn('Speech recognition not available');
            return;
        }

        if (isRecording) {
            speechRecognitionRef.current.stop();
            return;
        }

        try {
            // בדיקת הרשאות מיקרופון לפני התחלה
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    // בקש הרשאות מיקרופון
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    // אם הגענו לכאן, יש לנו הרשאות - סגור את ה-stream
                    stream.getTracks().forEach(track => track.stop());
                    
                    // התחל זיהוי דיבור
                    speechRecognitionRef.current.start();
                } catch (permissionError) {
                    console.error('Microphone permission denied:', permissionError);
                    setVoiceMode(false);
                    alert('לא ניתן לגשת למיקרופון. אנא אפשר גישה למיקרופון בהגדרות הדפדפן.');
                }
            } else {
                // דפדפן לא תומך ב-getUserMedia או שהוא לא זמין, ננסה להפעיל בכל זאת
                // SpeechRecognition API עשוי לטפל בהרשאות בעצמו במקרים מסוימים.
                speechRecognitionRef.current.start();
            }
        } catch (error) {
            console.error('Error starting speech recognition:', error);
            setIsRecording(false);
        }
    };

    const restartSimulation = () => {
        setSimulationActive(false);
        setSimulationComplete(false);
        setConversation([]);
        setAnalysis(null);
        setMenuContext(''); // Reset menu context on restart
        setRestaurantInfoContext(''); // Reset restaurant info context on restart
    };

    if (simulationComplete && analysis) {
        return (
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <BarChart3 className="w-8 h-8 text-green-600" />
                        ניתוח ביצועים - השיחה הושלמה
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="bg-slate-50 p-6 rounded-lg">
                        <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                            <Trophy className="w-5 h-5 text-yellow-500" />
                            דוח ביצועים מפורט
                        </h3>
                        <div className="prose prose-sm max-w-none">
                            <ReactMarkdown>{analysis}</ReactMarkdown>
                        </div>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-bold text-blue-800 mb-2">📊 היסטוריית השיחה המלאה:</h4>
                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {conversation.map((msg, index) => (
                                <div key={index} className={`p-2 rounded text-sm ${
                                    msg.type === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                                }`}>
                                    <span className="font-semibold">
                                        {msg.type === 'user' ? '👨‍💼 מלצר:' : '👥 לקוח:'} 
                                    </span>
                                    <span className="mr-2">{msg.content}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex gap-3">
                        <Button onClick={restartSimulation} className="bg-blue-600 hover:bg-blue-700">
                            <RotateCw className="w-4 h-4 mr-2" />
                            סימולציה חדשה
                        </Button>
                        <Button variant="outline" onClick={() => onComplete(0)}> {/* Pass a default value */}
                            המשך לשיעור הבא
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (!simulationActive) {
        return (
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <Bot className="w-8 h-8 text-blue-600" />
                        סימולציה חיה - תרגול עם לקוח AI
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-gray-700">
                        מוכן לאתגר אמיתי? אני אשחק את התפקיד של זוג לקוחות אמיתי.
                        בסוף תקבל ניתוח מפורט של הביצועים שלך!
                    </p>
                     <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                        <h4 className="font-bold text-amber-800 mb-2">🎯 יעדי הביצועים:</h4>
                        <ul className="text-amber-700 space-y-1 text-sm">
                            <li>• מכירת 4-5 מנות לזוג</li>
                            <li>• מכירת אלכוהול יעילה</li>
                            <li>• חווית לקוח מעולה</li>
                            <li>• הגעה לממוצע 180₪ לסועד</li>
                        </ul>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-bold text-blue-800 mb-2">📋 מה ייבדק:</h4>
                        <ul className="text-blue-700 space-y-1 text-sm">
                            <li>🎭 פתיחת שיחה מקצועית</li>
                            <li>⚓ קביעת עוגן נכון</li>
                            <li>🍷 הצעת אלכוהול יעילה</li>
                            <li>✅ סגירת הזמנה נכונה</li>
                            <li>כשרות והתאמת מנות</li>
                        </ul>
                    </div>
                    <Button onClick={startSimulation} className="w-full bg-blue-600 hover:bg-blue-700">
                        <Bot className="w-5 h-5 mr-2" />
                        התחל סימולציה מקצועית
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="shadow-lg">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center gap-3">
                        <Bot className="w-6 h-6 text-blue-600" />
                        סימולציה חיה פעילה
                    </CardTitle>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center space-x-2 space-x-reverse">
                            <Switch id="voice-mode" checked={voiceMode} onCheckedChange={setVoiceMode} />
                            <Label htmlFor="voice-mode" className="flex items-center gap-1 cursor-pointer">
                                {voiceMode ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                                <span>מצב קולי</span>
                            </Label>
                        </div>
                        <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">
                            🎭 {customerPersonality.split(',')[0]} ({partySize})
                        </Badge>
                        <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => analyzeConversation(conversation)}
                        >
                            סיים וקבל ניתוח
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4 h-80 overflow-y-auto mb-4 p-4 bg-gray-50 rounded-lg">
                    {conversation.map((message, index) => (
                        <div key={index} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs lg:max-w-md p-3 rounded-lg ${
                                message.type === 'user' 
                                    ? 'bg-blue-600 text-white' 
                                    : 'bg-white border border-gray-200'
                            }`}>
                                <div className="flex items-center gap-2 mb-2">
                                    {message.type === 'user' ? (
                                        <User className="w-4 h-4" />
                                    ) : (
                                        <Bot className="w-4 h-4" />
                                    )}
                                    <span className="text-sm font-semibold">
                                        {message.type === 'user' ? '👨‍💼 מלצר' : '👥 לקוח'}
                                    </span>
                                </div>
                                <div className="text-sm">
                                    {message.content}
                                </div>
                            </div>
                        </div>
                    ))}
                    
                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-gray-200 p-3 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <Bot className="w-4 h-4" />
                                    <span className="text-sm">הלקוח חושב...</span>
                                    <div className="flex gap-1">
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-75"></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse delay-150"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="flex gap-2">
                    {voiceMode ? (
                        <>
                            <Input
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                placeholder="הקלט את תשובתך או הקלד כאן..."
                                disabled={loading || isRecording}
                            />
                            <Button onClick={handleVoiceInput} disabled={loading} size="icon" className={isRecording ? "bg-red-600 hover:bg-red-700" : ""}>
                                {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                            </Button>
                             <Button onClick={() => sendMessage()} disabled={loading || !userInput.trim()}>
                                <Send className="w-4 h-4" />
                            </Button>
                        </>
                    ) : (
                         <>
                            <Input
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                placeholder="מה תגיד ללקוח? (או כתוב 'תודה' לסיום)"
                                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                disabled={loading}
                            />
                            <Button onClick={() => sendMessage()} disabled={loading || !userInput.trim()}>
                                <Send className="w-4 h-4" />
                            </Button>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
