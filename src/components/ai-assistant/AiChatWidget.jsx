import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KnowledgeBase, StaffQuestion, PendingQuestion } from "@/entities/all";
import { User } from "@/entities/User";
import { Send, ThumbsUp, ThumbsDown, X, Minimize2, Maximize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { askGemini } from "@/functions/askGemini";

const DVIR_ICON_URL = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68ac71d972dff18b98e30a21/5d2c4834a_17.png";

export default function AiChatWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([
        {
            id: 1,
            type: 'ai',
            content: 'היי, כאן דביר! 🧠\nשאל אותי כל דבר, ואתן לך תשובה ישר מהמוח הדיגיטלי שלי. אפשר גם לבחור באחת מהאפשרויות הנפוצות:',
            timestamp: new Date(),
            options: [
                { label: 'אילו קוקטיילים יש?', value: 'אילו קוקטיילים יש' },
                { label: 'נוהל סגירת משמרת', value: 'נוהל סגירת משמרת' },
                { label: 'עזרה עם הקופה', value: 'יש לי בעיה עם הקופה' }
            ]
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [user, setUser] = useState(null);
    const [feedbackGiven, setFeedbackGiven] = useState({});

    const chatContainerRef = useRef(null);

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

    const handleOptionClick = (option, messageId) => {
        setMessages(prev => prev.map(m => 
            m.id === messageId ? { ...m, options: undefined } : m
        ));
        handleSendMessage(option.value);
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
            const knowledgeBase = await KnowledgeBase.list();
            
            const multiOptionTriggers = {
                menu: ['קוקטייל', 'קוקטיילים', 'איזה קוקטיילים יש', 'מה המבצעים', 'תפריט', 'מה לאכול'],
                procedures: ['סגירת משמרת', 'פתיחת קופה', 'נוהל'],
            };

            let triggeredCategory = null;
            const normalizedInput = currentInput.toLowerCase();
            for (const category in multiOptionTriggers) {
                if (multiOptionTriggers[category].some(phrase => normalizedInput.includes(phrase.toLowerCase()))) {
                    triggeredCategory = category;
                    break;
                }
            }

            if (triggeredCategory) {
                const categoryItems = knowledgeBase.filter(item => item.category?.toLowerCase() === triggeredCategory.toLowerCase());
                const options = categoryItems.slice(0, 3).map(item => ({
                    label: item.title,
                    value: item.title
                }));

                // יש פריטים בבסיס הידע - הצג כפתורים
                if (options.length > 0) {
                    const aiMessage = {
                        id: Date.now() + 1,
                        type: 'ai',
                        content: `בטח, מצאתי כמה דברים רלוונטיים בקטגוריית "${triggeredCategory}". בחר אחת מהאפשרויות:`,
                        timestamp: new Date(),
                        options
                    };
                    setMessages(prev => [...prev, aiMessage]);
                    setIsLoading(false);
                    return;
                }
                // אין פריטים - תמשיך ל-Gemini (אל תחזור)
            }
            
            const relevantKnowledge = searchInternalKnowledge(currentInput, knowledgeBase);
            let aiResponseContent = '';
            let confidenceScore = 0;

            if (relevantKnowledge.length > 0) {
                const topResult = relevantKnowledge[0].item;
                confidenceScore = relevantKnowledge[0].relevanceScore;
                aiResponseContent = `**${topResult.title}**\n\n${topResult.content}`;
            } else {
                // הדרך האמינה והסופית: שמירת השאלה במערכת לטיפול במרכז הבקרה
                // נסה Gemini
                try {
                    const conversationHistory = messages
                        .filter(m => m.type === 'user' || m.type === 'ai')
                        .slice(-6)
                        .map(m => ({ role: m.type === 'ai' ? 'assistant' : 'user', content: m.content }));

                    const systemPrompt = `אתה דביר - עוזר AI פנימי של מסעדת TOP ALENA.
אתה עונה בעברית בלבד, בצורה קצרה וידידותית.
אתה עוזר לעובדים עם שאלות על נהלי עבודה, תפקידים, לוגיסטיקה, תפריט, ושאלות כלליות.

יש לך גישה לקבצי התפריט של המסעדה (תפריט ערב, תפריט שתייה וכו').
השתמש בהם כדי לענות על שאלות לגבי מנות, קוקטיילים, יינות, מחירים ורכיבים.
אם המידע לא מופיע בקבצים שקיבלת, ענה: "לא מצאתי את זה בתפריט - בדוק עם המנהל."
אל תמציא מידע שלא קיים בקבצים.`;

                    const geminiRes = await askGemini({
                        message: currentInput,
                        history: conversationHistory,
                        systemPrompt
                    });
                    aiResponseContent = geminiRes.data?.reply || 'אופס, לא הצלחתי לקבל תשובה מ-Gemini.';
                } catch (geminiErr) {
                    console.error('Gemini error:', geminiErr);
                    // שמור שאלה לטיפול ידני
                    try {
                        await PendingQuestion.create({
                            question: currentInput,
                            asked_by: user?.email || 'unknown',
                            context: `שאלה נשאלה ב-${new Date().toLocaleString('he-IL')}`
                        });
                    } catch (e) {}
                    aiResponseContent = `אופס, אני לא מכיר את התשובה לשאלה הזו 😅\n\nהשאלה שלך נשמרה, והמנהל יוכל ללמד אותי את התשובה דרך **מרכז בקרת AI** בתפריט.`;
                }
            }

            const aiMessage = {
                id: Date.now() + 1,
                type: 'ai',
                content: aiResponseContent,
                timestamp: new Date(),
                showFeedback: confidenceScore > 0,
            };

            setMessages(prev => [...prev, aiMessage]);
            
            if(confidenceScore > 0) {
                try {
                    await StaffQuestion.create({
                        question: currentInput,
                        answer: aiResponseContent,
                        category: relevantKnowledge[0].item.category,
                        asked_by: user?.email || 'unknown',
                    });
                } catch (e) {
                    console.log('Could not save staff question:', e);
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
                         <Button variant="ghost" size="sm" onClick={() => setIsMinimized(!isMinimized)} className="bg-white/30 hover:bg-white/50 text-white h-8 w-8 sm:h-8 sm:w-8 p-0 rounded-full">
                            {isMinimized ? <Maximize2 className="h-4 w-4 sm:h-4 sm:w-4" /> : <Minimize2 className="h-4 w-4 sm:h-4 sm:w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="bg-white/30 hover:bg-white/50 text-white h-8 w-8 sm:h-8 sm:w-8 p-0 rounded-full">
                            <X className="h-4 w-4 sm:h-4 sm:w-4" />
                        </Button>
                    </div>
                </CardHeader>

                {!isMinimized && (
                    <CardContent className="p-0 flex flex-col h-full">
                        <div ref={chatContainerRef} className="flex-1 p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto max-h-[350px] sm:max-h-[430px] lg:max-h-[470px]">
                            {messages.map((message) => (
                                <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] sm:max-w-md lg:max-w-lg p-2 sm:p-3 rounded-2xl text-sm sm:text-base ${
                                        message.type === 'user' 
                                        ? 'bg-orange-600 text-white rounded-br-none' 
                                        : 'bg-slate-200 text-slate-800 rounded-bl-none'
                                    }`}>
                                        <ReactMarkdown className="prose prose-sm max-w-none text-right w-full">{message.content}</ReactMarkdown>
                                        
                                        {message.timestamp && <p className="text-xs opacity-70 mt-2 text-right">{new Date(message.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</p>}
                                        
                                        {message.options && message.options.length > 0 && (
                                            <div className="mt-3 space-y-2">
                                                {message.options.map((option, index) => (
                                                    <Button 
                                                        key={index}
                                                        variant="outline"
                                                        size="sm"
                                                        className="w-full justify-center bg-white/50 hover:bg-white text-orange-700 hover:text-orange-800 border-orange-300 text-xs"
                                                        onClick={() => handleOptionClick(option, message.id)}
                                                        disabled={isLoading}
                                                    >
                                                        {option.label}
                                                    </Button>
                                                ))}
                                            </div>
                                        )}

                                        {message.type === 'ai' && message.showFeedback && !feedbackGiven[message.id] && (
                                            <div className="flex justify-end gap-2 mt-2">
                                                <button onClick={() => handleFeedback(message.id, true)} className="p-1 rounded-full hover:bg-slate-300 transition-colors"><ThumbsUp className="h-3 w-3 sm:h-4 sm:w-4 text-slate-600"/></button>
                                                <button onClick={() => handleFeedback(message.id, false)} className="p-1 rounded-full hover:bg-slate-300 transition-colors"><ThumbsDown className="h-3 w-3 sm:h-4 sm:w-4 text-slate-600"/></button>
                                            </div>
                                        )}
                                    </div>
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
                                    placeholder="שאל את דביר..."
                                    className="flex-1 text-sm sm:text-base"
                                    disabled={isLoading}
                                />
                                <Button type="submit" disabled={isLoading || !inputValue.trim()} size="icon" className="bg-orange-600 hover:bg-orange-700 h-8 w-8 sm:h-10 sm:w-10">
                                    <Send className="h-3 w-3 sm:h-4 sm:w-4" />
                                </Button>
                            </form>
                        </div>
                    </CardContent>
                )}
            </Card>
        </div>
    );
}