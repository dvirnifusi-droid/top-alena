import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InvokeLLM } from "@/integrations/Core";
import { BrainCircuit, Send, X, Minimize2, Maximize2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function GeneralAiHelperWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [messages, setMessages] = useState([
        {
            id: 1,
            type: 'ai',
            content: 'היי, אני העוזר החכם שלך למסעדה. שאל אותי שאלות אסטרטגיות על שיווק, ניהול, תפריטים, או כל אתגר אחר, ואתן לך תשובות מבוססות נתונים ואינטרנט. 🧠',
            timestamp: new Date(),
        }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatContainerRef = useRef(null);

    useEffect(() => {
        if (isOpen && chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    const handleSendMessage = async () => {
        if (!inputValue.trim() || isLoading) return;

        const userMessage = {
            id: Date.now(),
            type: 'user',
            content: inputValue,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        const currentInput = inputValue;
        setInputValue('');
        setIsLoading(true);

        try {
            const restaurantContextPrompt = "As a restaurant business consultant and marketing expert, answer the following question with actionable advice, data, and strategic insights. Your response should be in Hebrew. Question: ";
            
            const externalAnswer = await InvokeLLM({
                prompt: restaurantContextPrompt + currentInput,
                add_context_from_internet: true
            });

            const aiMessage = {
                id: Date.now() + 1,
                type: 'ai',
                content: externalAnswer || "לא הצלחתי למצוא תשובה, נסה לנסח את השאלה אחרת.",
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, aiMessage]);

        } catch (error) {
            console.error('Error sending message:', error);
            const errorMessage = {
                id: Date.now() + 1,
                type: 'ai',
                content: 'אופס, משהו השתבש. נסה שוב מאוחר יותר.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <div className="relative">
                <Button
                    onClick={() => setIsOpen(true)}
                    className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                    <BrainCircuit className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </Button>
            </div>
        );
    }

    return (
        <div className="relative">
            <Card className={`w-[20rem] sm:w-[26rem] lg:w-[28rem] shadow-2xl border-0 bg-white/95 backdrop-blur-sm ${isMinimized ? 'h-16' : 'h-[450px] sm:h-[550px] lg:h-[600px]'}`}>
                <CardHeader className="flex flex-row items-center justify-between bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-3 sm:p-4 rounded-t-lg">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4 sm:h-5 sm:w-5" />
                        <CardTitle className="text-xs sm:text-sm">עוזר חכם למסעדה</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                         <Button variant="ghost" size="sm" onClick={() => setIsMinimized(!isMinimized)} className="text-white hover:bg-white/20 h-6 w-6 sm:h-8 sm:w-8 p-0">
                            {isMinimized ? <Maximize2 className="h-3 w-3 sm:h-4 sm:w-4" /> : <Minimize2 className="h-3 w-3 sm:h-4 sm:w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="text-white hover:bg-white/20 h-6 w-6 sm:h-8 sm:w-8 p-0">
                            <X className="h-3 w-3 sm:h-4 sm:w-4" />
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
                                        ? 'bg-blue-600 text-white rounded-br-none' 
                                        : 'bg-slate-200 text-slate-800 rounded-bl-none'
                                    }`}>
                                        <ReactMarkdown className="prose prose-sm max-w-none text-right w-full">{message.content}</ReactMarkdown>
                                        {message.timestamp && <p className="text-xs opacity-70 mt-2 text-right">{new Date(message.timestamp).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</p>}
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
                                    placeholder="שאל כל דבר..."
                                    className="flex-1 text-sm sm:text-base"
                                    disabled={isLoading}
                                />
                                <Button type="submit" disabled={isLoading || !inputValue.trim()} size="icon" className="bg-blue-600 hover:bg-blue-700 h-8 w-8 sm:h-10 sm:w-10">
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