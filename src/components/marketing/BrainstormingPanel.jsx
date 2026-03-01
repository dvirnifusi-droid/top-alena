
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BrainstormSession } from "@/entities/BrainstormSession";
import { InvokeLLM } from "@/integrations/Core";
import { Zap, Rocket, Sparkles, Clock } from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";


export default function BrainstormingPanel({ sessions, onRefresh }) {
    const [newSession, setNewSession] = useState({
        title: '',
        challenge: '',
        prompt: ''
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [currentSuggestions, setCurrentSuggestions] = useState([]);

    const handleBrainstorm = async () => {
        if (!newSession.title || !newSession.challenge) {
            alert('אנא מלא כותרת ותיאור האתגר');
            return;
        }

        setIsGenerating(true);
        try {
            const brainstormPrompt = `
                אתה יועץ שיווק יצירתי ומומחה למסעדות. המטרה שלך היא לייצר רעיונות פרועים ויצירתיים שיכולים להכפיל מכירות.
                
                נושא הסיעור מוחות: ${newSession.title}
                האתגר: ${newSession.challenge}
                בקשה נוספת: ${newSession.prompt || 'תן לי רעיונות יצירתיים ומקוריים'}
                
                צור 8-12 רעיונות שונים ויצירתיים. עבור כל רעיון תן:
                - כותרת קצרה וקליטה
                - הסבר מפורט של איך זה עובד
                - למה זה יכול לעבוד במיוחד למסעדה
                - הערכת עלות (נמוך/בינוני/גבוה)
                - פוטנציאל השפעה (נמוך/בינוני/גבוה/מהפכני)
                
                תהיה יצירתי! חשוב מחוץ לקופסה. רעיונות פרועים מבורכים.
            `;

            const aiResponse = await InvokeLLM({
                prompt: brainstormPrompt,
                response_json_schema: {
                    type: "object",
                    properties: {
                        ideas: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    title: { type: "string" },
                                    description: { type: "string" },
                                    reasoning: { type: "string" },
                                    cost_level: { type: "string", enum: ["נמוך", "בינוני", "גבוה"] },
                                    impact_potential: { type: "string", enum: ["נמוך", "בינוני", "גבוה", "מהפכני"] }
                                }
                            }
                        },
                        implementation_tips: { type: "string" },
                        success_probability: { type: "number" }
                    }
                }
            });

            // שמירת הסשן
            await BrainstormSession.create({
                session_title: newSession.title,
                challenge: newSession.challenge,
                brainstorm_prompt: newSession.prompt,
                ai_suggestions: aiResponse.ideas,
                expected_impact: 'high',
                success_probability: aiResponse.success_probability || 75,
                session_date: new Date().toISOString(),
                implementation_plan: aiResponse.implementation_tips || ''
            });

            setCurrentSuggestions(aiResponse.ideas);
            setNewSession({ title: '', challenge: '', prompt: '' });
            onRefresh();

        } catch (error) {
            console.error('Error in brainstorming:', error);
            alert('שגיאה ביצירת רעיונות. נסה שוב.');
        } finally {
            setIsGenerating(false);
        }
    };

    const impactColors = {
        'נמוך': 'bg-blue-100 text-blue-800',
        'בינוני': 'bg-yellow-100 text-yellow-800',
        'גבוה': 'bg-orange-100 text-orange-800',
        'מהפכני': 'bg-red-100 text-red-800'
    };

    const costColors = {
        'נמוך': 'bg-green-100 text-green-800',
        'בינוני': 'bg-yellow-100 text-yellow-800',
        'גבוה': 'bg-red-100 text-red-800'
    };

    return (
        <div className="space-y-8">
            {/* New Brainstorm Session */}
            <Card className="shadow-xl bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-purple-800">
                        <Sparkles className="w-6 h-6" />
                        סיעור מוחות חדש
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">נושא הסיעור מוחות</label>
                        <Input
                            value={newSession.title}
                            onChange={(e) => setNewSession({...newSession, title: e.target.value})}
                            placeholder="למשל: איך להכפיל לקוחות בסוף השבוע"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">תיאור האתגר</label>
                        <Textarea
                            value={newSession.challenge}
                            onChange={(e) => setNewSession({...newSession, challenge: e.target.value})}
                            placeholder="תאר את האתגר או הבעיה שאתה רוצה לפתור..."
                            className="h-24"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">בקשה מיוחדת (אופציונלי)</label>
                        <Input
                            value={newSession.prompt}
                            onChange={(e) => setNewSession({...newSession, prompt: e.target.value})}
                            placeholder="למשל: תמקד ברעיונות דיגיטליים, או רעיונות לעונת החורף"
                        />
                    </div>
                    <Button
                        onClick={handleBrainstorm}
                        disabled={isGenerating}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                        size="lg"
                    >
                        {isGenerating ? (
                            <>
                                <Clock className="w-5 h-5 mr-2 animate-spin" />
                                AI חושב על רעיונות משוגעים...
                            </>
                        ) : (
                            <>
                                <Rocket className="w-5 h-5 mr-2" />
                                בוא נמציא משהו מטורף! 🚀
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Current AI Suggestions */}
            {currentSuggestions.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-purple-800 flex items-center gap-2">
                        <Zap className="w-5 h-5" />
                        רעיונות חמים מהתנור! 🔥
                    </h3>
                    <div className="grid gap-4">
                        {currentSuggestions.map((idea, index) => (
                            <Card key={index} className="shadow-md hover:shadow-lg transition-shadow bg-gradient-to-r from-white to-purple-50">
                                <CardContent className="p-6">
                                    <div className="flex justify-between items-start mb-3">
                                        <h4 className="text-lg font-bold text-purple-900">{idea.title}</h4>
                                        <div className="flex gap-2">
                                            {idea.impact_potential && <Badge className={impactColors[idea.impact_potential]}>
                                                {idea.impact_potential}
                                            </Badge>}
                                            {idea.cost_level && <Badge className={costColors[idea.cost_level]}>
                                                {idea.cost_level}
                                            </Badge>}
                                        </div>
                                    </div>
                                    <p className="text-gray-700 mb-3">{idea.description}</p>
                                    <p className="text-purple-700 text-sm italic">{idea.reasoning}</p>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            {/* Previous Sessions */}
            {sessions.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        סשנים קודמים
                    </h3>
                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {sessions.map((session) => (
                            <AccordionItem value={`item-${session.id}`} key={session.id} className="bg-white rounded-lg shadow-md">
                                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                                    <div className="flex justify-between items-center w-full">
                                        <div>
                                            <p className="font-semibold text-lg">{session.session_title}</p>
                                            <p className="text-sm text-gray-500">
                                                {new Date(session.session_date).toLocaleDateString('he-IL')}
                                            </p>
                                        </div>
                                        <Badge className="bg-blue-100 text-blue-800">
                                            {session.ai_suggestions?.length || 0} רעיונות
                                        </Badge>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent className="p-6 pt-0">
                                     <div className="space-y-4">
                                        {Array.isArray(session.ai_suggestions) && session.ai_suggestions.map((idea, index) => (
                                            <Card key={index} className="bg-gray-50">
                                                <CardContent className="p-4">
                                                    <h4 className="font-bold text-gray-800">{idea.title}</h4>
                                                    <p className="text-gray-600 mt-1">{idea.description}</p>
                                                    {idea.reasoning && <p className="text-purple-700 text-sm italic mt-2">{idea.reasoning}</p>}
                                                </CardContent>
                                            </Card>
                                        ))}
                                        {session.implementation_plan && (
                                             <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                                                <h4 className="font-semibold text-green-800">תוכנית ליישום</h4>
                                                <p className="text-green-700 whitespace-pre-wrap">{session.implementation_plan}</p>
                                            </div>
                                        )}
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            )}
        </div>
    );
}
