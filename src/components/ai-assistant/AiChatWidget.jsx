import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KnowledgeBase, StaffQuestion, PendingQuestion } from "@/entities/all";
import { User } from "@/entities/User";
import { Send, ThumbsUp, ThumbsDown, X, Minimize2, Maximize2, Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { askGemini } from "@/functions/askGemini";
import { elevenLabsTts } from "@/functions/elevenLabsTts";
import { pushoverOnMenuTrainingComplete } from "@/functions/pushoverOnMenuTrainingComplete";
import { base44 } from "@/api/base44Client";
import { MenuTrainingResult } from "@/entities/all";

const DVIR_ICON_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68ac71d972dff18b98e30a21/5d2c4834a_17.png";

export default function AiChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const STORAGE_KEY = 'dvir_chat_history';

    const getInitialMessages = () => [{
        id: 1,
        type: 'ai',
        content: 'היי, כאן דביר! 🧠\nשאל אותי כל דבר, ואתן לך תשובה ישר מהמוח הדיגיטלי שלי.',
        timestamp: new Date(),
    }];

    const [messages, setMessages] = useState(getInitialMessages);
    const [showResumePrompt, setShowResumePrompt] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [user, setUser] = useState(null);
    const trainingStartRef = useRef(Date.now());
    const [feedbackGiven, setFeedbackGiven] = useState({});
    const [isListening, setIsListening] = useState(false);
    const [ttsEnabled, setTtsEnabled] = useState(true);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [loadingAudioId, setLoadingAudioId] = useState(null);
    const [audioCountdown, setAudioCountdown] = useState(0);
    const audioTimerRef = useRef(null);
    const [trainingMode, setTrainingMode] = useState(false);
    const [coveredDishes, setCoveredDishes] = useState([]);
    const [showProgress, setShowProgress] = useState(false);

    const chatContainerRef = useRef(null);
    const recognitionRef = useRef(null);
    const currentAudioRef = useRef(null);
    const audioCacheRef = useRef({}); // messageId -> objectURL
    const cleanForTts = (text) => text
        .replace(/[*_#`~\[\]]/g, '')
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, '')
        .replace(/[^\u0020-\u007E\u0590-\u05FF\s.,?!:;()\-]/g, '')
        .replace(/\n+/g, '. ')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 2500);

    const base64ToObjUrl = (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/mpeg' });
        return URL.createObjectURL(blob);
    };

    const prefetchAudio = async (messageId, text) => {
        if (audioCacheRef.current[messageId]) return;
        const clean = cleanForTts(text);
        if (!clean) return;
        try {
            const res = await elevenLabsTts({ text: clean });
            const base64 = res?.data?.audio_base64 || res?.audio_base64;
            if (base64) audioCacheRef.current[messageId] = base64ToObjUrl(base64);
        } catch (e) { console.error('Prefetch error:', e); }
    };

    const speak = async (text, messageId) => {
        if (!ttsEnabled) return;
        stopSpeaking();

        const clean = cleanForTts(text);
        if (!clean) return;

        setLoadingAudioId(messageId || null);
        const estimatedSeconds = Math.max(3, Math.round(clean.length / 100));
        setAudioCountdown(estimatedSeconds);
        if (audioTimerRef.current) clearInterval(audioTimerRef.current);
        audioTimerRef.current = setInterval(() => {
            setAudioCountdown(prev => prev <= 1 ? 0 : prev - 1);
        }, 1000);

        try {
            let objUrl = messageId && audioCacheRef.current[messageId];
            if (!objUrl) {
                const res = await elevenLabsTts({ text: clean });
                console.log('TTS Response:', res);
                const base64 = res?.data?.audio_base64 || res?.audio_base64;
                console.log('Base64 extracted:', !!base64);
                if (!base64) throw new Error('No audio in response: ' + JSON.stringify(res));
                objUrl = base64ToObjUrl(base64);
                if (messageId) audioCacheRef.current[messageId] = objUrl;
            }
            clearInterval(audioTimerRef.current);
            setLoadingAudioId(null);
            setAudioCountdown(0);
            setIsSpeaking(true);
            const audio = new Audio(objUrl);
            currentAudioRef.current = audio;
            audio.onended = () => { setIsSpeaking(false); };
            audio.onerror = (err) => { 
                console.error('Audio error:', err);
                setIsSpeaking(false); 
            };
            audio.play().catch(err => {
                console.error('Play error:', err);
                setIsSpeaking(false);
            });
        } catch (e) {
            console.error('TTS error:', e);
            clearInterval(audioTimerRef.current);
            setLoadingAudioId(null);
            setAudioCountdown(0);
            setIsSpeaking(false);
        }
    };

    const stopSpeaking = () => {
        if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
        }
        setIsSpeaking(false);
    };

    const startListening = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('הדפדפן שלך לא תומך בזיהוי קול. נסה Chrome.');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'he-IL';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            setInputValue(transcript);
            setIsListening(false);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    const stopListening = () => {
        recognitionRef.current?.stop();
        setIsListening(false);
    };

    // שמור היסטוריה ב-localStorage בכל שינוי
    useEffect(() => {
        if (messages.length > 1) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
        }
    }, [messages]);

    // בפתיחת הצ'אט — בדוק אם יש היסטוריה קודמת
    useEffect(() => {
        if (isOpen) {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.length > 1) {
                        setShowResumePrompt(true);
                    }
                } catch {}
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    useEffect(() => {
        User.me().then(setUser).catch(() => setUser(null));
    }, []);

    const searchInternalKnowledge = (question, knowledgeBase) => {
        if (!knowledgeBase || knowledgeBase.length === 0) {
            console.log("No knowledge base found");
            return [];
        }
        
        const questionLower = question.toLowerCase().replace(/[?!.,]/g, '').trim();
        const questionWords = new Set(questionLower.split(' ').filter(w => w.length > 2));

        const results = knowledgeBase.map(item => {
            const titleLower = item.title.toLowerCase();
            const contentLower = item.content.toLowerCase();
            const keywordsLower = item.keywords?.map(k => k.toLowerCase()) || [];

            let score = 0;

            // Bonus for exact phrase match in title
            if (titleLower.includes(questionLower)) {
                score += 100;
            }

            questionWords.forEach(qWord => {
                if (titleLower.includes(qWord)) {
                    score += 30; // High score for words in title
                }
                if (contentLower.includes(qWord)) {
                    score += 5;  // Lower score for words in content
                }
                if (keywordsLower.some(k => k.includes(qWord))) {
                    score += 25; // High score for words in keywords
                }
            });

            // Bonus for finding a high percentage of words from the question
            let foundWords = 0;
            questionWords.forEach(qWord => {
                if (titleLower.includes(qWord) || contentLower.includes(qWord) || keywordsLower.some(k => k.includes(qWord))) {
                    foundWords++;
                }
            });

            if (questionWords.size > 0) {
                const matchPercentage = (foundWords / questionWords.size) * 100;
                if (matchPercentage > 70) {
                    score += 40; // Significant bonus for high match rate
                }
            }

            console.log(`[AI Search V2] Item: "${item.title}", Score: ${score}`);
            return { item, relevanceScore: score };
        });

        // Filter results with a confidence threshold and sort by score
        return results.filter(r => r.relevanceScore > 60).sort((a, b) => b.relevanceScore - a.relevanceScore);
    };

    const handleSendMessage = async (messageText) => {
        const currentInput = messageText || inputValue;
        if (!currentInput.trim() || isLoading) return;

        const userMessage = {
            id: Date.now(),
            type: 'user',
            content: currentInput,
            timestamp: new Date()
        };

        setMessages(prev => {
            const updatedHistory = prev.map(m => ({...m, options: undefined}));
            return [...updatedHistory, userMessage];
        });
        
        if (!messageText) {
            setInputValue('');
        }
        setIsLoading(true);

        try {
            // שלב 1: קודם Gemini עם קבצי Drive
            let aiResponseContent = '';
            let usedKnowledgeBase = false;

            try {
                const conversationHistory = messages
                    .filter(m => m.type === 'user' || m.type === 'ai' || m.type === 'training_summary')
                    .slice(-30)
                    .map(m => ({ role: (m.type === 'ai' || m.type === 'training_summary') ? 'assistant' : 'user', content: m.content }));

                const systemPrompt = `אתה דביר - עוזר AI פנימי ומאמן מלצרים בכיר של מסעדת TOP ALENA.
אתה עונה בעברית בלבד, בצורה חמה, מעודדת ומלהיבה.
יש לך גישה לכל קבצי התפריט של המסעדה (תפריט אוכל, תפריט שתייה ואלכוהול, ספר מתכונים).

===== מצב רגיל =====
עוזר לעובדים עם שאלות על נהלי עבודה, תפקידים, לוגיסטיקה, תפריט, ושאלות כלליות.
השתמש אך ורק במידע מהקבצים. אל תמציא.

===== מצב לימוד תפריט =====
כאשר המשתמש כותב "לימוד תפריט", "רוצה ללמוד תפריט", "הדרכה", "למד אותי", "תלמד אותי" או כל ביטוי דומה — עבור למצב מאמן פעיל ועקוב אחר השלבים הבאים:

שלב 1 - פתיחה וחזון:
- ברך את המלצר בחום ובהתלהבות.
- הצג בקצרה את המסעדה: הקונספט, הערכים, מה אנחנו מוכרים ומה מייחד אותנו.
- הסבר לו איך התהליך יעבוד (4 שלבים: סקירה כללית → לימוד מנה מנה → קוויז → אלכוהול).
- שאל אותו את שמו כדי להתאים אישית את הלמידה.

שלב 2 - לימוד תפריט אוכל מנה מנה:
- תאר את מבנה התפריט (קטגוריות: ראשונות, עיקריות, קינוחים וכו').
- עבור על כל מנה בנפרד: שם המנה, תיאור, מרכיבים מדויקים, גודל המנה, שיטת הכנה, שאלות נפוצות של לקוחות (חריף? אפשר בלי X? מתאים לצמחוני/טבעוני/גלוטן פרי?).
- **לאחר כל מנה בודדת שהסברת — שאל מיד שאלה קצרה לבדיקת הבנה**, לדוגמה: "מה המרכיב העיקרי של המנה שהרגע למדנו?" או "אם לקוח שואל אם המנה מכילה גלוטן, מה תענה?" — המשך רק לאחר תשובה.
- אחרי כל 3-4 מנות עצור ושאל: "האם אתה מוכן להמשיך?" — המתן לאישור.
- מדי פעם שחק "לקוח קשה" ואתגר את המלצר: "אני רגיש לגלוטן, מה אתה מציע לי?"

שלב 3 - קוויז אחרי כל קטגוריה:
- בסיום כל קטגוריה שאל 4-5 שאלות ממוקדות מגוונות, כולל:
  * שאלות על רכיבי המנה ("מה מרכיבי המנה X?", "מה הרוטב של מנה Y?")
  * שאלות על אלרגנים ורכיבים שניתן להוציא ("האם מנה X מכילה גלוטן?")
  * שאלות על תיאור המנה וצורת ההגשה
  * שאלות שאלקוח יכול לשאול ("לקוח שואל אם המנה חריפה — מה תענה?")
- אם המלצר טועה: אל תמשיך הלאה. הסבר בנעימות את הטעות על בסיס המקורות, חזור על ההסבר, ושאל שוב שאלה דומה.
- אם ענה נכון: מחא לו כפיים 🎉 ועבור קדימה.

שלב 4 - תפריט אלכוהול ושתייה:
- רק לאחר שהמלצר עבר בהצלחה את תפריט האוכל.
- למד אותו על קוקטיילים, יינות, משקאות חריפים, שתיות ומשקאות קרים.
- הסבר התאמות מומלצות בין משקאות למנות האוכל.
- סיים בקוויז גם על תפריט השתייה.

בסוף כל תהליך לימוד מלא (כולל אלכוהול) כתוב שני בלוקים נפרדים:

**בלוק 1 — סיכום אישי למלצר** (מוצג בשיחה):
כתוב סיכום מפורט ואישי למלצר בעברית:
- מה הוא שולט בו היטב ✅
- על אילו מנות / נושאים הוא חייב לחזור ⚠️
- טיפים מעשיים לשיפור
- ציון סיכום ידידותי

**בלוק 2 — נתוני מערכת** (בשורה אחת, חיוני לשמירה אוטומטית):
🎓 TRAINING_COMPLETE | שם: [שם המלצר] | ציון אוכל: [0-100] | ציון שתייה: [0-100] | ציון כולל: [0-100] | רמה: [beginner/intermediate/advanced/expert] | חלשים: [מנה1, מנה2] | חזקים: [מנה1, מנה2] | סיכום מנהל: [משפט קצר לדוח מנהל] | הערות: [משפט קצר]

רמות ידע:
- expert: ציון 90+
- advanced: ציון 75-89
- intermediate: ציון 60-74
- beginner: מתחת ל-60

===== מצב לימוד ממוקד (מנה/ות ספציפיות) =====
כאשר המשתמש מבקש ללמוד על מנה אחת או מספר מנות ספציפיות (לדוגמה: "תלמד אותי רק על כרוב שרוף", "רוצה ללמוד על הסלמון והסטייק") — אל תרוץ על כל תהליך הלימוד המלא. במקום זאת:
1. למד אותו רק על אותן מנות שביקש — תיאור, רכיבים, אלרגנים, שאלות נפוצות.
2. שאל שאלת בדיקה על כל מנה שלמדת.
3. סיים בסיכום קצר של מה שנלמד — בלי TRAINING_COMPLETE ובלי ציונות מלאות.
אל תמשיך לתפריט המלא אלא אם המשתמש מבקש זאת במפורש.

עקרונות חשובים:
- השתמש אך ורק במידע מהקבצים. אם חסר מידע — ציין זאת.
- שפה מעודדת, מלהיבה ומכירתית. לדוגמה: "המנה הזו היא הלהיט שלנו! 🔥"
- אל תציף את המלצר. חלק לגושים קטנים וברורים.
- שמור על רצף השיחה — אל תתחיל שלב חדש לפני שהשלמת את הקודם.`;

                // אפס שעון לימוד כשמתחיל תהליך לימוד תפריט
                if (/לימוד תפריט|למד אותי|תלמד אותי|הדרכה|רוצה ללמוד/i.test(currentInput)) {
                    trainingStartRef.current = Date.now();
                    setTrainingMode(true);
                    setCoveredDishes([]);
                    setShowProgress(true);
                }

                const geminiRes = await askGemini({
                    message: currentInput,
                    history: conversationHistory,
                    systemPrompt
                });
                aiResponseContent = geminiRes.data?.reply || '';
            } catch (geminiErr) {
                console.error('Gemini error:', geminiErr);
                const errMsg = geminiErr?.response?.data?.error || geminiErr?.message || '';
                if (errMsg.includes('quota') || errMsg.includes('429')) {
                    aiResponseContent = `אני קצת עמוס כרגע 😅 נסה שוב בעוד כמה שניות.`;
                }
            }

            // שלב 2: אם Gemini לא החזיר תשובה - חפש ב-KnowledgeBase
            if (!aiResponseContent) {
                const knowledgeBase = await KnowledgeBase.list();
                const relevantKnowledge = searchInternalKnowledge(currentInput, knowledgeBase);
                if (relevantKnowledge.length > 0) {
                    const topResult = relevantKnowledge[0].item;
                    aiResponseContent = `**${topResult.title}**\n\n${topResult.content}`;
                    usedKnowledgeBase = true;

                    try {
                        await StaffQuestion.create({
                            question: currentInput,
                            answer: aiResponseContent,
                            category: topResult.category,
                            asked_by: user?.email || 'unknown',
                        });
                    } catch (e) {
                        console.log('Could not save staff question:', e);
                    }
                } else {
                    aiResponseContent = `יש לי תקלה טכנית כרגע. נסה שוב בעוד רגע.`;
                }
            }

            // עדכן מנות שנלמדו מתוך תגובת ה-AI
            if (trainingMode && aiResponseContent) {
                // זיהוי שמות מנות: שורות שמתחילות ב-** או כוללות "מנה:" או "📌"
                const dishMatches = [...aiResponseContent.matchAll(/\*\*([^*]{3,40})\*\*/g)]
                    .map(m => m[1].trim())
                    .filter(d => !d.includes('בלוק') && !d.includes('שלב') && !d.includes('סיכום') && !d.includes('חשוב'));
                if (dishMatches.length > 0) {
                    setCoveredDishes(prev => {
                        const updated = [...prev];
                        dishMatches.forEach(d => { if (!updated.includes(d)) updated.push(d); });
                        return updated;
                    });
                }
            }

            // הסר את שורת TRAINING_COMPLETE מהתצוגה — רק הסיכום האישי מוצג
            const displayContent = aiResponseContent.includes('TRAINING_COMPLETE')
                ? aiResponseContent.replace(/🎓 TRAINING_COMPLETE\s*\|[^\n]*/g, '').trim()
                : aiResponseContent;

            const isTrainingEnd = aiResponseContent.includes('TRAINING_COMPLETE');

            const aiMessage = {
                id: Date.now() + 1,
                type: isTrainingEnd ? 'training_summary' : 'ai',
                content: displayContent,
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, aiMessage]);

            // זיהוי סיום לימוד תפריט ושמירה במערכת
            if (aiResponseContent.includes('TRAINING_COMPLETE')) {
                const nameMatch = aiResponseContent.match(/שם:\s*([^\|]+)/);
                const scoreFoodMatch = aiResponseContent.match(/ציון אוכל:\s*(\d+)/);
                const scoreDrinksMatch = aiResponseContent.match(/ציון שתייה:\s*(\d+)/);
                const scoreOverallMatch = aiResponseContent.match(/ציון כולל:\s*(\d+)/);
                const levelMatch = aiResponseContent.match(/רמה:\s*(beginner|intermediate|advanced|expert)/);
                const weakMatch = aiResponseContent.match(/חלשים:\s*([^\|]+)/);
                const strongMatch = aiResponseContent.match(/חזקים:\s*([^\|]+)/);
                const managerSummaryMatch = aiResponseContent.match(/סיכום מנהל:\s*([^\|]+)/);
                const notesMatch = aiResponseContent.match(/הערות:\s*([^\n]+)/);

                const employeeName = nameMatch?.[1]?.trim() || user?.full_name || 'עובד';
                const scoreFood = parseInt(scoreFoodMatch?.[1] || '0');
                const scoreDrinks = parseInt(scoreDrinksMatch?.[1] || '0');
                const scoreOverall = parseInt(scoreOverallMatch?.[1] || '0');
                const level = levelMatch?.[1] || 'intermediate';
                const weakAreas = weakMatch?.[1]?.trim().split(',').map(s => s.trim()).filter(Boolean) || [];
                const strongAreas = strongMatch?.[1]?.trim().split(',').map(s => s.trim()).filter(Boolean) || [];
                const managerSummary = managerSummaryMatch?.[1]?.trim() || '';
                const notes = notesMatch?.[1]?.trim() || '';
                const durationMinutes = Math.round((Date.now() - trainingStartRef.current) / 60000);

                try {
                    await MenuTrainingResult.create({
                        employee_name: employeeName,
                        employee_email: user?.email || '',
                        score_food: scoreFood,
                        score_drinks: scoreDrinks,
                        score_overall: scoreOverall,
                        knowledge_level: level,
                        completed_food: true,
                        completed_drinks: true,
                        completed_full: true,
                        training_date: new Date().toISOString().split('T')[0],
                        total_duration_minutes: durationMinutes,
                        weak_areas: weakAreas,
                        strong_areas: strongAreas,
                        manager_summary: managerSummary,
                        notes
                    });

                    await pushoverOnMenuTrainingComplete({
                        employee_name: employeeName,
                        score_food: scoreFood,
                        score_drinks: scoreDrinks,
                        score_overall: scoreOverall,
                        knowledge_level: level,
                        total_duration_minutes: durationMinutes,
                        weak_areas: weakAreas,
                        strong_areas: strongAreas,
                        manager_summary: managerSummary
                    });
                } catch (e) {
                    console.error('Failed to save training result:', e);
                }
            }

        } catch (error) {
            console.error('Error in handleSendMessage:', error);
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                type: 'ai',
                content: `אופס, יש לי בעיה טכנית: ${error.message}`,
                timestamp: new Date()
            }]);
        }

        setIsLoading(false);
    };
    
    const handleFeedback = (messageId, wasHelpful) => {
        setFeedbackGiven(prev => ({...prev, [messageId]: true }));
        const message = messages.find(m => m.id === messageId);
        if(message){
            // Find the original StaffQuestion entry created for this message to update its helpfulness
            // Note: This logic assumes 'message.content' directly corresponds to the 'question' field in StaffQuestion.
            // A more robust solution might involve storing the StaffQuestion ID with the AI message.
            StaffQuestion.filter({ question: message.content }).then(questions => {
                if (questions.length > 0) {
                    // Update the first matching question found
                    StaffQuestion.update(questions[0].id, { was_helpful: wasHelpful });
                }
            }).catch(console.error); // Catch potential errors during DB operation
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="w-full flex items-center gap-4 bg-gradient-to-l from-red-900 to-amber-800 text-white rounded-2xl px-5 py-3 shadow-2xl hover:brightness-110 transition-all duration-300 cursor-pointer border-0"
                dir="rtl"
            >
                <img 
                    src={DVIR_ICON_URL} 
                    alt="דביר AI" 
                    className="h-12 w-12 object-contain flex-shrink-0" 
                />
                <div className="flex-1 text-right min-w-0">
                    <div className="flex items-center gap-2 justify-end mb-0.5">
                        <span className="font-bold text-base">דביר AI 🧠</span>
                    </div>
                    <p className="text-amber-200 text-xs">שאל אותי הכל ואענה לך מהמוח הדיגיטלי שלי</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="bg-white/20 text-white text-xs px-2 py-1 rounded-full whitespace-nowrap">4 כלים</span>
                    <span className="bg-orange-400 text-white text-xs px-3 py-1 rounded-full font-bold whitespace-nowrap">לחץ לפתיחה!</span>
                </div>
            </button>
        );
    }

    return (
        <div className="w-full">
            <Card className={`w-full shadow-2xl border-0 bg-white/95 backdrop-blur-sm ${isMinimized ? 'h-16' : 'h-[500px]'}`}>
                <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-orange-600 to-red-600 text-white p-3 sm:p-4 rounded-t-lg">
                    <div className="flex items-center gap-2">
                        <img 
                            src={DVIR_ICON_URL} 
                            alt="דביר AI" 
                            className="h-8 w-8 sm:h-10 sm:w-10 object-contain" 
                        />
                        <CardTitle className="text-xs sm:text-sm">דביר - עוזר פנימי</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => { setTtsEnabled(p => { if (p) stopSpeaking(); return !p; }); }} className="bg-white/30 hover:bg-white/50 text-white h-8 w-8 p-0 rounded-full" title={ttsEnabled ? 'השתק קול' : 'הפעל קול'}>
                            {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setIsMinimized(!isMinimized)} className="bg-white/30 hover:bg-white/50 text-white h-8 w-8 p-0 rounded-full">
                            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => { setIsOpen(false); stopSpeaking(); }} className="bg-white/30 hover:bg-white/50 text-white h-8 w-8 p-0 rounded-full">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </CardHeader>

                {showResumePrompt && !isMinimized && (
                    <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center rounded-lg">
                        <div className="bg-white rounded-2xl p-5 mx-4 shadow-2xl text-right" dir="rtl">
                            <p className="font-bold text-slate-800 mb-1">👋 ברוך השב!</p>
                            <p className="text-sm text-slate-600 mb-4">יש לי שיחה קודמת שלנו שמורה.<br/>מה תעדיף?</p>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => {
                                        const saved = localStorage.getItem(STORAGE_KEY);
                                        if (saved) setMessages(JSON.parse(saved));
                                        setShowResumePrompt(false);
                                    }}
                                    className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-4 py-2 text-sm font-bold"
                                >
                                    ↩️ המשך את השיחה הקודמת
                                </button>
                                <button
                                    onClick={() => {
                                        localStorage.removeItem(STORAGE_KEY);
                                        setMessages(getInitialMessages());
                                        setTrainingMode(false);
                                        setCoveredDishes([]);
                                        setShowProgress(false);
                                        setShowResumePrompt(false);
                                    }}
                                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl px-4 py-2 text-sm font-bold"
                                >
                                     🆕 התחל שיחה חדשה
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {!isMinimized && (
                    <CardContent className="p-0 flex flex-col h-full relative">

                        {/* מד התקדמות לימוד תפריט */}
                        {showProgress && trainingMode && (
                            <div className="px-3 pt-2 pb-1 bg-amber-50 border-b border-amber-200" dir="rtl">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-bold text-amber-800">📚 מנות שנלמדו: {coveredDishes.length}</span>
                                    <button onClick={() => setShowProgress(false)} className="text-xs text-amber-500 hover:text-amber-700">הסתר</button>
                                </div>
                                {coveredDishes.length === 0 ? (
                                    <p className="text-xs text-amber-600">הלימוד עוד לא התחיל...</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                                        {coveredDishes.map((dish, i) => (
                                            <span key={i} className="bg-amber-200 text-amber-900 text-xs px-2 py-0.5 rounded-full font-medium">✅ {dish}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {!showProgress && trainingMode && (
                            <button onClick={() => setShowProgress(true)} className="text-xs text-amber-600 bg-amber-50 border-b border-amber-100 px-3 py-1 text-right w-full hover:bg-amber-100" dir="rtl">
                                📚 הצג התקדמות ({coveredDishes.length} מנות)
                            </button>
                        )}

                        <div ref={chatContainerRef} className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto max-h-[350px] sm:max-h-[430px] lg:max-h-[470px]">
                            {messages.map((message) => (
                                <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {message.type === 'training_summary' ? (
                                        <div className="w-full rounded-2xl overflow-hidden border-2 border-amber-400 shadow-lg text-right" dir="rtl">
                                            <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 flex items-center gap-2">
                                                <span className="text-white font-bold text-sm">🎓 סיכום אישי — סיום לימוד תפריט</span>
                                            </div>
                                            <div className="bg-amber-50 p-3 text-slate-800 text-sm">
                                                <ReactMarkdown className="prose prose-sm max-w-none text-right w-full">{message.content}</ReactMarkdown>
                                            </div>
                                            <div className="bg-amber-100 px-4 py-2 text-xs text-amber-700 text-right">
                                                ✅ הסיכום נשמר ונשלח למנהל
                                            </div>
                                        </div>
                                    ) : (
                                    <div className={`max-w-[85%] sm:max-w-md lg:max-w-lg p-2 sm:p-3 rounded-2xl text-sm sm:text-base ${
                                        message.type === 'user' 
                                        ? 'bg-orange-600 text-white rounded-br-none' 
                                        : 'bg-slate-200 text-slate-800 rounded-bl-none'
                                    }`}>
                                        <ReactMarkdown className="prose prose-sm max-w-none text-right w-full">{message.content}</ReactMarkdown>
                                        
                                        {message.timestamp && <p className="text-xs opacity-70 mt-2 text-right">{new Date(message.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</p>}
                                        
                                        {message.type === 'ai' && (
                                            <div className="flex justify-end gap-2 mt-2">
                                                <button
                                                    onClick={() => speak(message.content, message.id)}
                                                    className="p-1 rounded-full hover:bg-slate-300 transition-colors"
                                                    title="השמע"
                                                    disabled={loadingAudioId === message.id}
                                                >
                                                    {loadingAudioId === message.id ? (
                                                       <div className="flex items-center gap-1">
                                                           <div className="h-3 w-3 sm:h-4 sm:w-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                                                           {audioCountdown > 0 && <span className="text-xs text-orange-500 font-bold">{audioCountdown}ש'</span>}
                                                       </div>
                                                    ) : (
                                                        <Volume2 className="h-3 w-3 sm:h-4 sm:w-4 text-orange-500"/>
                                                    )}
                                                </button>
                                                {!feedbackGiven[message.id] && <>
                                                    <button onClick={() => handleFeedback(message.id, true)} className="p-1 rounded-full hover:bg-slate-300 transition-colors"><ThumbsUp className="h-3 w-3 sm:h-4 sm:w-4 text-slate-600"/></button>
                                                    <button onClick={() => handleFeedback(message.id, false)} className="p-1 rounded-full hover:bg-slate-300 transition-colors"><ThumbsDown className="h-3 w-3 sm:h-4 sm:w-4 text-slate-600"/></button>
                                                </>}
                                            </div>
                                        )}
                                    </div>
                                    )}
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="p-2 sm:p-3 rounded-2xl bg-slate-200 rounded-bl-none">
                                        <div className="flex items-center gap-2 text-slate-600">
                                            <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse"></div>
                                            <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse delay-75"></div>
                                            <div className="w-2 h-2 bg-slate-500 rounded-full animate-pulse delay-150"></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-3 sm:p-4 border-t bg-white/70">
                            <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center gap-2">
                                <Input 
                                    value={inputValue} 
                                    onChange={(e) => setInputValue(e.target.value)}
                                    placeholder={isListening ? '🎤 מקשיב...' : 'שאל את דביר...'}
                                    className={`flex-1 text-sm sm:text-base ${isListening ? 'border-red-400 bg-red-50' : ''}`}
                                    disabled={isLoading}
                                />
                                <Button
                                    type="button"
                                    size="icon"
                                    onClick={isListening ? stopListening : startListening}
                                    className={`h-8 w-8 sm:h-10 sm:w-10 ${isListening ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-slate-500 hover:bg-slate-600'}`}
                                    title={isListening ? 'עצור הקלטה' : 'דבר למיקרופון'}
                                >
                                    {isListening ? <MicOff className="h-3 w-3 sm:h-4 sm:w-4" /> : <Mic className="h-3 w-3 sm:h-4 sm:w-4" />}
                                </Button>
                                <Button type="submit" disabled={isLoading || !inputValue.trim()} size="icon" className="bg-orange-600 hover:bg-orange-700 h-8 w-8 sm:h-10 sm:w-10">
                                    <Send className="h-3 w-3 sm:h-4 sm:w-4" />
                                </Button>
                            </form>
                            {loadingAudioId && (
                                <div className="flex items-center gap-2 mt-2 text-xs text-amber-600">
                                    <div className="h-3 w-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                                    <span>טוען קול... {audioCountdown > 0 ? `עוד ~${audioCountdown} שניות` : 'כמעט מוכן...'}</span>
                                </div>
                            )}
                            {isSpeaking && (
                                <div className="flex items-center gap-2 mt-2 text-xs text-orange-600">
                                    <Volume2 className="h-3 w-3 animate-pulse" />
                                    <span>דביר מדבר...</span>
                                    <button onClick={stopSpeaking} className="underline">עצור</button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                )}
            </Card>
        </div>
    );
}