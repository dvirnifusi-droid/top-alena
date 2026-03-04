import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, MessageSquare, Volume2, RotateCw, Settings } from 'lucide-react';
import ToneScenarioManager from './ToneScenarioManager';

// Fallback hardcoded scenarios if DB is empty
const DEFAULT_SCENARIOS = [
    {
        id: 'default-1',
        situation: "לקוח מתלונן שהמנה שלו קרה",
        customer_says: "המנה שלי קרה! זה לא מקבל על הדעת!",
        responses: [
            { text: "אני כל כך מתנצל לשמוע על זה! אני אחליף לך את המנה מיד ואדאג שהחדשה תגיע חמה מהמטבח.", tone: "אמפתי ופרואקטיבי", is_correct: true, explanation: "תגובה מעולה! אתה מבטא אמפתיה, נוטל אחריות ונותן פתרון מיידי." },
            { text: "אוקיי, אני אביא לך מנה חדשה.", tone: "ניטרלי וקר", is_correct: false, explanation: "התגובה יבשה מדי ולא מראה אכפתיות." },
            { text: "מוזר, המנה יצאה הרגע מהמטבח. אולי אתה מגזים?", tone: "מתגונן", is_correct: false, explanation: "אסור לעולם להטיל ספק בלקוח." }
        ]
    },
    {
        id: 'default-2',
        situation: "זוג מתלבט בין שתי מנות יקרות",
        customer_says: "אנחנו לא יודעים מה לבחור... האנטריקוט נשמע טוב אבל הוא יקר. מה אתה ממליץ?",
        responses: [
            { text: "האנטריקוט שלנו הוא המנה הכי פופולרית! זה באמת שווה כל שקל.", tone: "משכנע ומקצועי", is_correct: true, explanation: "מעולה! אתה מציג את הערך ונותן ביטחון בבחירה." },
            { text: "כן, זה יקר. אבל זה טוב.", tone: "חסר השראה", is_correct: false, explanation: "תגובה חלשה שמדגישה את הבעיה של המחיר." },
            { text: "אם המחיר מפריע, אולי תרצו משהו זול יותר?", tone: "מזלזל", is_correct: false, explanation: "הטון מזלזל ויכול לבזות את הלקוח." }
        ]
    }
];

export default function ToneTraining({ onComplete, isAdmin }) {
    const [scenarios, setScenarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectedResponse, setSelectedResponse] = useState(null);
    const [showFeedback, setShowFeedback] = useState(false);
    const [score, setScore] = useState(0);
    const [completedCount, setCompletedCount] = useState(0);
    const [showManager, setShowManager] = useState(false);

    const loadScenarios = async () => {
        setLoading(true);
        const data = await base44.entities.ToneScenario.list('order');
        setScenarios(data.length > 0 ? data : DEFAULT_SCENARIOS);
        setLoading(false);
    };

    useEffect(() => { loadScenarios(); }, []);

    const currentScenario = scenarios[currentIndex];

    const handleResponseSelect = (responseIndex) => {
        setSelectedResponse(responseIndex);
        setShowFeedback(true);
        if (currentScenario.responses[responseIndex].is_correct) {
            setScore(score + 20);
        }
        setCompletedCount(completedCount + 1);
    };

    const nextScenario = () => {
        if (currentIndex < scenarios.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setSelectedResponse(null);
            setShowFeedback(false);
        } else {
            const finalScore = Math.round((score / (scenarios.length * 20)) * 100);
            onComplete(finalScore >= 70);
        }
    };

    const restartTraining = () => {
        setCurrentIndex(0);
        setSelectedResponse(null);
        setShowFeedback(false);
        setScore(0);
        setCompletedCount(0);
    };

    if (loading) return <div className="text-center py-8 text-gray-500">טוען תרחישים...</div>;

    if (showManager) return (
        <div className="space-y-4">
            <Button variant="outline" onClick={() => { setShowManager(false); loadScenarios(); }}>
                ← חזור לאימון
            </Button>
            <ToneScenarioManager />
        </div>
    );

    if (currentIndex >= scenarios.length) {
        const finalScore = Math.round((score / (scenarios.length * 20)) * 100);
        return (
            <Card className="shadow-lg">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4">
                        {finalScore >= 70 ? <CheckCircle className="w-16 h-16 text-green-500 mx-auto" /> : <XCircle className="w-16 h-16 text-red-500 mx-auto" />}
                    </div>
                    <CardTitle className="text-2xl">{finalScore >= 70 ? 'כל הכבוד! טון מעולה' : 'יש מקום לשיפור בטון'}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                    <div className="text-4xl font-bold text-blue-600 mb-4">{finalScore}%</div>
                    <p className="text-gray-600 mb-6">עניתי נכון על {score / 20} מתוך {scenarios.length} תרחישים</p>
                    <div className="flex gap-4 justify-center">
                        <Button onClick={restartTraining} variant="outline"><RotateCw className="w-4 h-4 mr-2" />תתחיל מחדש</Button>
                        <Button onClick={() => onComplete(finalScore >= 70)} className="bg-blue-600 hover:bg-blue-700">המשך לשיעור הבא</Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header with admin button */}
            <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                    <Badge variant="outline" className="text-lg p-2">
                        תרחיש {currentIndex + 1} מתוך {scenarios.length}
                    </Badge>
                    <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{width: `${(completedCount / scenarios.length) * 100}%`}}></div>
                        </div>
                    </div>
                </div>
                {isAdmin && (
                    <Button variant="outline" size="sm" onClick={() => setShowManager(true)} className="mr-2">
                        <Settings className="w-4 h-4 ml-1" /> ניהול תרחישים
                    </Button>
                )}
            </div>

            <Card className="shadow-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-xl">
                        <Volume2 className="w-6 h-6 text-blue-600" />
                        אימון טון דיבור - {currentScenario.situation}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="bg-gray-50 p-4 rounded-lg border-r-4 border-gray-400">
                        <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-4 h-4 text-gray-600" />
                            <span className="font-semibold text-gray-800">הלקוח אומר:</span>
                        </div>
                        <p className="text-lg italic">"{currentScenario.customer_says}"</p>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">איך תגיב? בחר את התגובה עם הטון הנכון:</h3>
                        {currentScenario.responses.map((response, index) => (
                            <button
                                key={index}
                                onClick={() => !showFeedback && handleResponseSelect(index)}
                                disabled={showFeedback}
                                className={`w-full text-right p-4 rounded-lg border-2 transition-all duration-300 ${
                                    selectedResponse === index
                                        ? response.is_correct ? 'bg-green-100 border-green-400' : 'bg-red-100 border-red-400'
                                        : showFeedback
                                            ? response.is_correct ? 'bg-green-50 border-green-300' : 'bg-gray-100 border-gray-300'
                                            : 'bg-white border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                                } ${showFeedback ? 'cursor-default' : 'cursor-pointer'}`}
                            >
                                <div className="flex justify-between items-start gap-3">
                                    <div className="text-right">
                                        <p className="font-medium">{response.text}</p>
                                        <Badge variant="outline" className="mt-2 text-xs">טון: {response.tone}</Badge>
                                    </div>
                                    {showFeedback && (
                                        response.is_correct ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" /> : <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>

                    {showFeedback && selectedResponse !== null && (
                        <div className={`p-4 rounded-lg ${currentScenario.responses[selectedResponse].is_correct ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'}`}>
                            <h4 className="font-bold mb-2">{currentScenario.responses[selectedResponse].is_correct ? '✅ מעולה!' : '❌ לא מדויק'}</h4>
                            <p className="text-sm">{currentScenario.responses[selectedResponse].explanation}</p>
                        </div>
                    )}

                    {showFeedback && (
                        <div className="text-center">
                            <Button onClick={nextScenario} className="bg-blue-600 hover:bg-blue-700">
                                {currentIndex < scenarios.length - 1 ? 'התרחיש הבא' : 'סיים אימון'}
                            </Button>
                        </div>
                    )}

                    <div className="text-center text-sm text-gray-600">
                        ציון נוכחי: {score} נקודות | {completedCount}/{scenarios.length} תרחישים הושלמו
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}