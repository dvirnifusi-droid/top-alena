import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, MessageSquare, Volume2, RotateCw } from 'lucide-react';

export default function ToneTraining({ onComplete }) {
    const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
    const [selectedResponse, setSelectedResponse] = useState(null);
    const [showFeedback, setShowFeedback] = useState(false);
    const [score, setScore] = useState(0);
    const [completedScenarios, setCompletedScenarios] = useState(0);

    const scenarios = [
        {
            id: 1,
            situation: "לקוח מתלונן שהמנה שלו קרה",
            customerSays: "המנה שלי קרה! זה לא מקבל על הדעת!",
            responses: [
                {
                    text: "אני כל כך מתנצל לשמוע על זה! אני אחליף לך את המנה מיד ואדאג שהחדשה תגיע חמה מהמטבח.",
                    tone: "אמפתי ופרואקטיבי",
                    isCorrect: true,
                    explanation: "תגובה מעולה! אתה מבטא אמפתיה, נוטל אחריות ונותן פתרון מיידי. הטון חם ומקצועי."
                },
                {
                    text: "אוקיי, אני אביא לך מנה חדשה.",
                    tone: "ניטרלי וקר",
                    isCorrect: false,
                    explanation: "התגובה יבשה מדי ולא מראה אכפתיות. הלקוח צריך להרגיש שאכפת לך מהבעיה שלו."
                },
                {
                    text: "מוזר, המנה יצאה הרגע מהמטבח. אולי אתה מגזים?",
                    tone: "מתגונן ומטיל ספק",
                    isCorrect: false,
                    explanation: "אסור לעולם להטיל ספק בלקוח או להישמע מתגונן. זה רק יחריף את המצב."
                }
            ]
        },
        {
            id: 2,
            situation: "זוג מתלבט בין שתי מנות יקרות",
            customerSays: "אנחנו לא יודעים מה לבחור... האנטריקוט נשמע טוב אבל הוא יקר. מה אתה ממליץ?",
            responses: [
                {
                    text: "האנטריקוט שלנו הוא המנה הכי פופולרית! הוא מגיע עם תוספות ובאיכות מעולה. זה באמת שווה כל שקל.",
                    tone: "משכנע ומקצועי",
                    isCorrect: true,
                    explanation: "מעולה! אתה מציג את הערך הכספי, מדגיש את הפופולריות ונותן ביטחון בבחירה."
                },
                {
                    text: "כן, זה יקר. אבל זה טוב.",
                    tone: "חסר השראה",
                    isCorrect: false,
                    explanation: "תגובה חלשה שלא עוזרת ללקוח להחליט ואפילו מדגישה את הבעיה של המחיר."
                },
                {
                    text: "אם המחיר מפריע לכם, אולי תרצו משהו זול יותר?",
                    tone: "מזלזל ולא רגיש",
                    isCorrect: false,
                    explanation: "הטון מזלזל ויכול לבזות את הלקוח. אף פעם אל תניח שהלקוח לא יכול להרשות לעצמו."
                }
            ]
        },
        {
            id: 3,
            situation: "לקוח שואל על מנה שלא מכיר",
            customerSays: "מה זה 'מלוואח'? אני לא מכיר את זה.",
            responses: [
                {
                    text: "המלוואח הוא לחם דק ופריך שאופים לנו בתנור הג'וספר עם זעתר וסומק. זה מקסים ונותן טעם מדהים!",
                    tone: "נלהב ומסביר",
                    isCorrect: true,
                    explanation: "תגובה מושלמת! אתה מסביר בצורה ברורה, מראה התלהבות ועושה את המנה לנשמע מושכת."
                },
                {
                    text: "זה סוג של לחם. טעים.",
                    tone: "עצלני ולא מועיל",
                    isCorrect: false,
                    explanation: "הסבר דל מדי שלא עוזר ללקוח להבין או להתלהב מהמנה."
                },
                {
                    text: "אה... אני לא בטוח בדיוק. אני אשאל במטבח.",
                    tone: "חסר ביטחון",
                    isCorrect: false,
                    explanation: "מלצר חייב להכיר את התפריט! חוסר ידע פוגע באמינות ובביטחון של הלקוח."
                }
            ]
        },
        {
            id: 4,
            situation: "לקוח מסרב לקוקטייל ומעדיף בירה",
            customerSays: "לא, תודה. קוקטיילים זה לא בשבילי. אני אקח בירה.",
            responses: [
                {
                    text: "מובן לגמרי! יש לנו בירות מצוינות. מה אתה אוהב - משהו קל ומרענן או בירה עם יותר גוף?",
                    tone: "מכבד ומתאים",
                    isCorrect: true,
                    explanation: "מעולה! אתה מכבד את הבחירה, לא לוחץ, ועובר לחקור מה באמת מתאים ללקוח."
                },
                {
                    text: "אבל הקוקטיילים שלנו באמת טובים! אתה בטוח שלא תנסה?",
                    tone: "לוחץ ולא מקשיב",
                    isCorrect: false,
                    explanation: "הלקוח כבר אמר לא. חזרה על ההצעה נתפסת כלחיצה ויכולה לעצבן."
                },
                {
                    text: "אוקיי, איזו בירה אתה רוצה?",
                    tone: "מתפקד אבל מפספס הזדמנות",
                    isCorrect: false,
                    explanation: "לא רע, אבל מפספס הזדמנות לחקור ולהמליץ על הבירה הכי מתאימה."
                }
            ]
        },
        {
            id: 5,
            situation: "משפחה עם ילדים מחפשת משהו מהיר",
            customerSays: "יש לכם משהו שהילדים יאכלו מהר? הם רעבים ולא סבלניים...",
            responses: [
                {
                    text: "בטח! יש לנו שניצל פשוט וצ'יפס שהילדים אוהבים, ויוצא תוך 8 דקות. אני גם אביא להם לחמים בינתיים.",
                    tone: "מבין ופותר בעיות",
                    isCorrect: true,
                    explanation: "תגובה מושלמת למשפחות! אתה מבין את הלחץ, נותן פתרון מהיר ואפילו חושב על פתרון ביניים."
                },
                {
                    text: "הכל לוקח זמן להכין. בסבלנות.",
                    tone: "לא אמפתי ומתנשא",
                    isCorrect: false,
                    explanation: "תגובה לא רגישה שלא מבינה את המצב המיוחד של משפחות עם ילדים קטנים."
                },
                {
                    text: "אני לא בטוח מה יהיה הכי מהיר. תבדקו בתפריט.",
                    tone: "לא מועיל",
                    isCorrect: false,
                    explanation: "המלצר צריך להיות מומחה ולדעת מה מתאים בכל מצב. זה התפקיד שלו!"
                }
            ]
        }
    ];

    const currentScenario = scenarios[currentScenarioIndex];

    const handleResponseSelect = (responseIndex) => {
        setSelectedResponse(responseIndex);
        setShowFeedback(true);
        
        if (currentScenario.responses[responseIndex].isCorrect) {
            setScore(score + 20);
        }
        setCompletedScenarios(completedScenarios + 1);
    };

    const nextScenario = () => {
        if (currentScenarioIndex < scenarios.length - 1) {
            setCurrentScenarioIndex(currentScenarioIndex + 1);
            setSelectedResponse(null);
            setShowFeedback(false);
        } else {
            // Training completed
            const finalScore = Math.round((score / (scenarios.length * 20)) * 100);
            onComplete(finalScore >= 70);
        }
    };

    const restartTraining = () => {
        setCurrentScenarioIndex(0);
        setSelectedResponse(null);
        setShowFeedback(false);
        setScore(0);
        setCompletedScenarios(0);
    };

    if (currentScenarioIndex >= scenarios.length) {
        const finalScore = Math.round((score / (scenarios.length * 20)) * 100);
        return (
            <Card className="shadow-lg">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4">
                        {finalScore >= 70 ? 
                            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" /> : 
                            <XCircle className="w-16 h-16 text-red-500 mx-auto" />
                        }
                    </div>
                    <CardTitle className="text-2xl">
                        {finalScore >= 70 ? 'כל הכבוד! טון מעולה' : 'יש מקום לשיפור בטון'}
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                    <div className="text-4xl font-bold text-blue-600 mb-4">{finalScore}%</div>
                    <p className="text-gray-600 mb-6">
                        עניתי נכון על {score / 20} מתוך {scenarios.length} תרחישים
                    </p>
                    <div className="flex gap-4 justify-center">
                        <Button onClick={restartTraining} variant="outline">
                            <RotateCw className="w-4 h-4 mr-2" />
                            תתחיל מחדש
                        </Button>
                        <Button onClick={() => onComplete(finalScore >= 70)} className="bg-blue-600 hover:bg-blue-700">
                            המשך לשיעור הבא
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Progress */}
            <div className="text-center">
                <Badge variant="outline" className="text-lg p-2">
                    תרחיש {currentScenarioIndex + 1} מתוך {scenarios.length}
                </Badge>
                <div className="mt-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{width: `${(completedScenarios / scenarios.length) * 100}%`}}
                        ></div>
                    </div>
                </div>
            </div>

            {/* Main Training Card */}
            <Card className="shadow-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-xl">
                        <Volume2 className="w-6 h-6 text-blue-600" />
                        אימון טון דיבור - {currentScenario.situation}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Customer Speech */}
                    <div className="bg-gray-50 p-4 rounded-lg border-r-4 border-gray-400">
                        <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-4 h-4 text-gray-600" />
                            <span className="font-semibold text-gray-800">הלקוח אומר:</span>
                        </div>
                        <p className="text-lg italic">"{currentScenario.customerSays}"</p>
                    </div>

                    {/* Response Options */}
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold">איך תגיב? בחר את התגובה עם הטון הנכון:</h3>
                        {currentScenario.responses.map((response, index) => (
                            <button
                                key={index}
                                onClick={() => !showFeedback && handleResponseSelect(index)}
                                disabled={showFeedback}
                                className={`w-full text-right p-4 rounded-lg border-2 transition-all duration-300 ${
                                    selectedResponse === index 
                                        ? response.isCorrect 
                                            ? 'bg-green-100 border-green-400' 
                                            : 'bg-red-100 border-red-400'
                                        : showFeedback 
                                            ? response.isCorrect 
                                                ? 'bg-green-50 border-green-300'
                                                : 'bg-gray-100 border-gray-300'
                                            : 'bg-white border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                                } ${showFeedback ? 'cursor-default' : 'cursor-pointer'}`}
                            >
                                <div className="flex justify-between items-start gap-3">
                                    <div className="text-right">
                                        <p className="font-medium">{response.text}</p>
                                        <Badge variant="outline" className="mt-2 text-xs">
                                            טון: {response.tone}
                                        </Badge>
                                    </div>
                                    {showFeedback && (
                                        <div>
                                            {response.isCorrect ? (
                                                <CheckCircle className="w-5 h-5 text-green-500" />
                                            ) : (
                                                <XCircle className="w-5 h-5 text-red-500" />
                                            )}
                                        </div>
                                    )}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Feedback */}
                    {showFeedback && selectedResponse !== null && (
                        <div className={`p-4 rounded-lg ${
                            currentScenario.responses[selectedResponse].isCorrect 
                                ? 'bg-green-100 border border-green-300' 
                                : 'bg-red-100 border border-red-300'
                        }`}>
                            <h4 className="font-bold mb-2">
                                {currentScenario.responses[selectedResponse].isCorrect ? '✅ מעולה!' : '❌ לא מדויק'}
                            </h4>
                            <p className="text-sm">{currentScenario.responses[selectedResponse].explanation}</p>
                        </div>
                    )}

                    {/* Next Button */}
                    {showFeedback && (
                        <div className="text-center">
                            <Button onClick={nextScenario} className="bg-blue-600 hover:bg-blue-700">
                                {currentScenarioIndex < scenarios.length - 1 ? 'התרחיש הבא' : 'סיים אימון'}
                            </Button>
                        </div>
                    )}

                    {/* Score Display */}
                    <div className="text-center text-sm text-gray-600">
                        ציון נוכחי: {score} נקודות | {completedScenarios}/{scenarios.length} תרחישים הושלמו
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}