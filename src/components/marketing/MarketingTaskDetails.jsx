
import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { InvokeLLM } from "@/integrations/Core";
import { 
    CheckCircle2, 
    Clock, 
    MessageSquare, 
    Lightbulb,
    AlertTriangle,
    Copy,
    ExternalLink,
    Phone,
    Camera,
    Type,
    MousePointer,
    Eye,
    Loader2,
    Brain
} from "lucide-react";

export default function MarketingTaskDetails({ task, onUpdateTask, onClose }) {
    const [completedSteps, setCompletedSteps] = useState(
        task.detailed_steps?.map(step => step.completed || false) || []
    );
    const [aiConsultation, setAiConsultation] = useState('');
    const [isConsulting, setIsConsulting] = useState(false);
    const [consultationResult, setConsultationResult] = useState('');
    const [activeStepConsultation, setActiveStepConsultation] = useState(null);

    const handleStepToggle = (stepIndex) => {
        const newCompletedSteps = [...completedSteps];
        newCompletedSteps[stepIndex] = !newCompletedSteps[stepIndex];
        setCompletedSteps(newCompletedSteps);

        // Update the task with new progress
        const updatedSteps = task.detailed_steps.map((step, index) => ({
            ...step,
            completed: newCompletedSteps[index]
        }));

        const completedCount = newCompletedSteps.filter(Boolean).length;
        const totalSteps = newCompletedSteps.length;
        const progressPercentage = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

        const updatedTask = {
            ...task,
            detailed_steps: updatedSteps,
            progress_percentage: progressPercentage,
            status: progressPercentage === 100 ? 'completed' : progressPercentage > 0 ? 'in_progress' : 'pending'
        };

        onUpdateTask(updatedTask);
    };

    const handleConsultAI = async (stepIndex = null) => {
        if (!aiConsultation.trim() && stepIndex === null) return;

        setIsConsulting(true);
        try {
            const stepInfo = stepIndex !== null ? task.detailed_steps[stepIndex] : null;
            const contextPrompt = stepIndex !== null 
                ? `המשתמש נתקע בשלב "${stepInfo.title}" במשימה "${task.title}". השלב כולל: ${stepInfo.description}. השאלה שלו: ${aiConsultation}`
                : `המשתמש צריך עזרה במשימה "${task.title}". השאלה שלו: ${aiConsultation}`;

            const prompt = `
                אתה יועץ שיווק מומחה למסעדות. המשתמש מבקש עזרה ספציפית.

                **ההקשר:** ${contextPrompt}

                תן לו עצה מעשית, קונקרטית וברורה. אם זה קשור לשלב ספציפי, תמקד בשלב הזה.
                תן גם טיפים נוספים שיכולים לעזור להצליח במשימה.

                התשובה צריכה להיות בעברית ומעשית.
            `;

            const aiResponse = await InvokeLLM({
                prompt,
                add_context_from_internet: stepIndex === null // רק למשימות כלליות, לא לשלבים ספציפיים
            });

            if (stepIndex !== null) {
                setActiveStepConsultation(stepIndex);
                setConsultationResult(aiResponse);
            } else {
                setConsultationResult(aiResponse);
            }
        } catch (error) {
            console.error('Error consulting AI:', error);
            setConsultationResult('מצטער, אירעה שגיאה בהתייעצות. נסה שוב.');
        } finally {
            setIsConsulting(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
    };

    const getActionIcon = (action) => {
        if (action.includes('לחץ') || action.includes('בחר')) return <MousePointer className="w-4 h-4" />;
        if (action.includes('כתוב') || action.includes('הקלד')) return <Type className="w-4 h-4" />;
        if (action.includes('צלם') || action.includes('תמונה')) return <Camera className="w-4 h-4" />;
        if (action.includes('פתח') || action.includes('התחבר')) return <ExternalLink className="w-4 h-4" />;
        if (action.includes('התקשר') || action.includes('טלפן')) return <Phone className="w-4 h-4" />;
        if (action.includes('בדוק') || action.includes('וודא')) return <Eye className="w-4 h-4" />;
        return <CheckCircle2 className="w-4 h-4" />;
    };

    const completedCount = completedSteps.filter(Boolean).length;
    const totalSteps = completedSteps.length;
    const progressPercentage = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

    return (
        <div className="space-y-6 max-h-[80vh] overflow-y-auto">
            {/* Task Header */}
            <div className="sticky top-0 bg-white z-10 pb-4 border-b">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-2xl font-bold">{task.title}</h2>
                        <p className="text-gray-600 mt-2">{task.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge className="bg-blue-100 text-blue-800">
                            {task.platform}
                        </Badge>
                        <Badge className="bg-green-100 text-green-800">
                            {task.estimated_time} דק׳
                        </Badge>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">התקדמות המשימה</span>
                        <span className="text-sm text-gray-600">{completedCount}/{totalSteps} שלבים</span>
                    </div>
                    <Progress value={progressPercentage} className="h-3" />
                    <p className="text-xs text-center font-semibold text-blue-600">{progressPercentage}% הושלם</p>
                </div>
            </div>

            {/* Detailed Steps */}
            <div className="space-y-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5" />
                    שלבי הביצוע המפורטים
                </h3>

                {task.detailed_steps?.map((step, stepIndex) => (
                    <Card key={stepIndex} className={`border-2 ${completedSteps[stepIndex] ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                    <Checkbox
                                        checked={completedSteps[stepIndex]}
                                        onCheckedChange={() => handleStepToggle(stepIndex)}
                                        className="mt-1"
                                    />
                                    <div className="flex-1">
                                        <h4 className="font-bold text-lg">
                                            {step.step_number}. {step.title}
                                        </h4>
                                        <p className="text-gray-600 mt-1">{step.description}</p>
                                        {step.estimated_minutes && (
                                            <div className="flex items-center gap-2 mt-2">
                                                <Clock className="w-4 h-4 text-blue-500" />
                                                <span className="text-sm text-blue-600">{step.estimated_minutes} דקות</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setActiveStepConsultation(stepIndex);
                                        setAiConsultation('');
                                    }}
                                    className="ml-2"
                                >
                                    <MessageSquare className="w-4 h-4 mr-1" />
                                    התייעץ
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {/* Specific Actions */}
                            {step.specific_actions && step.specific_actions.length > 0 && (
                                <div className="space-y-3">
                                    <h5 className="font-semibold text-purple-800 flex items-center gap-2">
                                        <MousePointer className="w-4 h-4" />
                                        פעולות מדויקות:
                                    </h5>
                                    {step.specific_actions.map((action, actionIndex) => (
                                        <div key={actionIndex} className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                                            <div className="flex items-start gap-3">
                                                {getActionIcon(action.action)}
                                                <div className="flex-1 space-y-1">
                                                    <p className="font-medium text-purple-900">{action.action}</p>
                                                    {action.details && <p className="text-sm text-purple-700">{action.details}</p>}
                                                    {action.what_to_click && (
                                                        <p className="text-xs bg-blue-100 text-blue-800 p-1 rounded">
                                                            👆 לחץ על: {action.what_to_click}
                                                        </p>
                                                    )}
                                                    {action.what_to_type && (
                                                        <div className="bg-gray-100 p-2 rounded text-xs font-mono relative">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="absolute top-1 left-1 h-6 w-6 p-0"
                                                                onClick={() => copyToClipboard(action.what_to_type)}
                                                            >
                                                                <Copy className="w-3 h-3" />
                                                            </Button>
                                                            ⌨️ הקלד: {action.what_to_type}
                                                        </div>
                                                    )}
                                                    {action.where_to_find_it && (
                                                        <p className="text-xs text-green-700">
                                                            📍 איפה למצוא: {action.where_to_find_it}
                                                        </p>
                                                    )}
                                                    {action.screenshot_hint && (
                                                        <p className="text-xs text-orange-600">
                                                            💡 עזרה חזותית: {action.screenshot_hint}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Ready Content */}
                            {step.ready_content && (
                                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                    <div className="flex justify-between items-start">
                                        <h5 className="font-semibold text-green-800 mb-2">📝 תוכן מוכן לשימוש:</h5>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => copyToClipboard(step.ready_content)}
                                        >
                                            <Copy className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <p className="text-green-700 whitespace-pre-wrap">{step.ready_content}</p>
                                </div>
                            )}

                            {/* Tools Needed */}
                            {step.tools_needed && step.tools_needed.length > 0 && (
                                <div>
                                    <h5 className="font-semibold mb-2">🛠️ כלים נדרשים:</h5>
                                    <div className="flex flex-wrap gap-2">
                                        {step.tools_needed.map((tool, toolIndex) => (
                                            <Badge key={toolIndex} variant="outline">
                                                {tool}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Success Check */}
                            {step.success_check && (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                    <h5 className="font-semibold text-blue-800 mb-1 flex items-center gap-2">
                                        <Eye className="w-4 h-4" />
                                        איך לוודא שהצלחת:
                                    </h5>
                                    <p className="text-blue-700">{step.success_check}</p>
                                </div>
                            )}

                            {/* Common Mistakes */}
                            {step.common_mistakes && step.common_mistakes.length > 0 && (
                                <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                                    <h5 className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4" />
                                        שגיאות נפוצות להימנע מהן:
                                    </h5>
                                    <ul className="text-red-700 text-sm space-y-1">
                                        {step.common_mistakes.map((mistake, mistakeIndex) => (
                                            <li key={mistakeIndex} className="flex items-start gap-2">
                                                <span className="text-red-500 mt-1">⚠️</span>
                                                {mistake}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Tips */}
                            {step.tips && step.tips.length > 0 && (
                                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                                    <h5 className="font-semibold text-yellow-800 mb-2 flex items-center gap-2">
                                        <Lightbulb className="w-4 h-4" />
                                        טיפים לצלחה:
                                    </h5>
                                    <ul className="text-yellow-700 text-sm space-y-1">
                                        {step.tips.map((tip, tipIndex) => (
                                            <li key={tipIndex} className="flex items-start gap-2">
                                                <span className="text-yellow-500 mt-1">💡</span>
                                                {tip}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* AI Consultation Dialog */}
            <Dialog open={activeStepConsultation !== null} onOpenChange={() => setActiveStepConsultation(null)}>
                <DialogContent className="max-w-2xl" dir="rtl">
                    <DialogHeader>
                        <DialogTitle>התייעצות עם יועץ AI</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <Textarea
                            placeholder="במה אתה צריך עזרה? (למשל: 'לא מוצא את הכפתור', 'איך כותבים פוסט טוב', 'מה השעה הטובה לפרסם')"
                            value={aiConsultation}
                            onChange={(e) => setAiConsultation(e.target.value)}
                            className="min-h-20"
                        />
                        <Button 
                            onClick={() => handleConsultAI(activeStepConsultation)} 
                            disabled={isConsulting || !aiConsultation.trim()}
                            className="w-full"
                        >
                            {isConsulting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    AI חושב...
                                </>
                            ) : (
                                <>
                                    <MessageSquare className="w-4 h-4 mr-2" />
                                    קבל עצה מה-AI
                                </>
                            )}
                        </Button>
                        
                        {consultationResult && (
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                                    <Brain className="w-4 h-4" />
                                    עצת היועץ:
                                </h4>
                                <p className="text-blue-700 whitespace-pre-wrap">{consultationResult}</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
