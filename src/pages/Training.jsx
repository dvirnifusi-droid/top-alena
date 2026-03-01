import React, { useState, useEffect, useMemo } from 'react';
import { TrainingCourse, TrainingEnrollment, TrainingLesson, QuizQuestion, ConversationScript, User } from '@/entities/all';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, Loader2, GraduationCap, BookOpen, MessageSquare, Gamepad2, ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import SpeedGame from "../components/training/SpeedGame";
import MenuLearning from "../components/training/MenuLearning";

// New Imports for Lesson Management
import { Edit, Trash2, ChevronUp, ChevronDown, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import LiveSimulation from "../components/training/LiveSimulation";
import ToneTraining from "../components/training/ToneTraining";
import QuizManager from "../components/training/QuizManager";

// --- Components ---

const CourseCard = ({ course, enrollment, onSelect }) => {
    const progress = useMemo(() => {
        if (!enrollment || !course.total_lessons) return 0;
        // Fix: Ensure completed_lessons is always an array
        const completed = Array.isArray(enrollment.completed_lessons) ? enrollment.completed_lessons : [];
        return (completed.length / course.total_lessons) * 100;
    }, [enrollment, course]);

    return (
        <Card onClick={() => onSelect(course)} className="cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 bg-white flex flex-col">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <Badge variant="outline" className="font-semibold">{course.assigned_role}</Badge>
                    <GraduationCap className="w-8 h-8 p-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg shadow-md" />
                </div>
                <CardTitle className="pt-4 text-slate-800">{course.title}</CardTitle>
                <CardDescription className="text-slate-600 h-10">{course.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow">
                 <Progress value={progress} className="w-full h-2" />
                 <p className="text-xs text-slate-500 mt-2">התקדמות: {Math.round(progress)}%</p>
            </CardContent>
            <CardFooter>
                <Button className="w-full bg-orange-600 hover:bg-orange-700">{progress > 0 && progress < 100 ? "המשך קורס" : "התחל קורס"}</Button>
            </CardFooter>
        </Card>
    );
};

const QuizView = ({ quizId, onComplete }) => {
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadQuiz = async () => {
            setLoading(true);
            const allQuestions = await QuizQuestion.filter({ quiz_id: quizId });
            // Randomize questions order
            const shuffled = [...allQuestions].sort(() => Math.random() - 0.5);
            setQuestions(shuffled);
            setLoading(false);
        };
        loadQuiz();
    }, [quizId]);

    const handleAnswer = (questionId, answer) => {
        setAnswers(prev => ({...prev, [questionId]: answer}));
    };

    const nextQuestion = () => {
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };

    const prevQuestion = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };

    const submitQuiz = () => {
        let correctCount = 0;
        const correctQuestions = [];
        const incorrectQuestions = [];
        
        questions.forEach(q => {
            if(answers[q.id] === q.correct_answer) {
                correctCount++;
                correctQuestions.push({
                    question: q.question_text,
                    yourAnswer: q.correct_answer,
                    explanation: q.explanation
                });
            } else {
                incorrectQuestions.push({
                    question: q.question_text,
                    yourAnswer: answers[q.id] || "לא נענה",
                    correctAnswer: q.correct_answer,
                    explanation: q.explanation
                });
            }
        });
        const score = (correctCount / questions.length) * 100;
        setResult({ 
            score, 
            correct: correctCount, 
            total: questions.length, 
            correctQuestions, 
            incorrectQuestions 
        });
        onComplete(score >= 80);
    };
    
    const restartQuiz = () => {
        setCurrentQuestionIndex(0);
        setAnswers({});
        setResult(null);
    };

    if (loading) return <Loader2 className="animate-spin mx-auto"/>;
    
    if (result) return (
        <div className="p-4 sm:p-8 bg-slate-50 rounded-lg">
            <div className="text-center">
                {result.score >= 80 ? <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" /> : <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />}
                <h3 className="text-2xl font-bold mb-2">{result.score >= 80 ? 'עברת בהצלחה!' : 'נכשלת במבחן'}</h3>
                <p className="text-lg">הציון שלך: <span className="font-bold">{result.score.toFixed(0)}%</span> ({result.correct}/{result.total})</p>
            </div>

            {/* Summary of correct answers */}
            {result.correctQuestions.length > 0 && (
                <div className="mt-8">
                    <h4 className="text-lg font-semibold mb-4 text-center border-b pb-2 text-green-700">💪 מה שצדקת בו:</h4>
                    <div className="space-y-3">
                        {result.correctQuestions.map((item, index) => (
                            <div key={index} className="p-4 border-r-4 border-green-500 bg-green-50 rounded-md shadow-sm">
                                <p className="font-semibold text-slate-800">✓ {item.question}</p>
                                <p className="text-sm mt-2 text-green-700">התשובה שלך: <span className="font-medium">{item.yourAnswer}</span></p>
                                <p className="text-xs mt-1 p-2 bg-green-100 rounded italic text-slate-600">{item.explanation}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {result.incorrectQuestions.length > 0 && (
                <div className="mt-8">
                    <h4 className="text-lg font-semibold mb-4 text-center border-b pb-2 text-red-700">🎯 מה לשפר:</h4>
                    <div className="space-y-4">
                        {result.incorrectQuestions.map((item, index) => (
                            <div key={index} className="p-4 border-r-4 border-red-500 bg-red-50 rounded-md shadow-sm">
                                <p className="font-semibold text-slate-800">{item.question}</p>
                                <p className="text-sm mt-2">התשובה שלך: <span className="font-medium text-red-700">{item.yourAnswer}</span></p>
                                <p className="text-sm">התשובה הנכונה: <span className="font-medium text-green-700">{item.correctAnswer}</span></p>
                                <p className="text-xs mt-2 p-2 bg-yellow-50 rounded italic text-slate-600">הסבר: {item.explanation}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mt-8 text-center space-y-4">
                <Button onClick={restartQuiz} variant="outline">
                    <RotateCw className="w-4 h-4 ml-2" />
                    התחל מבחן מחדש
                </Button>
                
                {result.score >= 80 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                        <h4 className="text-lg font-bold text-blue-800 mb-3">🎉 מוכן לאתגר הבא?</h4>
                        <p className="text-blue-700 mb-4">עברת את המבחן בהצלחה! עכשיו בואו נתרגל עם לקוח אמיתי (AI)</p>
                        <Button className="bg-blue-600 hover:bg-blue-700" onClick={() => window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'})}>
                            🤖 תתחיל סימולציה חיה איתי
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
    
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return <p>לא נמצאו שאלות למבחן.</p>;

    return (
        <div>
            <div className="mb-4 text-center">
                <Badge variant="outline">שאלה {currentQuestionIndex + 1} מתוך {questions.length}</Badge>
            </div>
            
            <h3 className="text-xl font-semibold mb-4">{currentQuestion.question_text}</h3>
            <div className="space-y-2">
                {currentQuestion.options.map((option, index) => (
                    <button 
                        key={`${currentQuestion.id}-${index}`}
                        onClick={() => handleAnswer(currentQuestion.id, option)}
                        className={`w-full text-right p-4 border rounded-lg transition-colors ${
                            answers[currentQuestion.id] === option 
                                ? 'bg-blue-100 border-blue-400' 
                                : 'bg-white hover:bg-slate-50'
                        }`}
                    >
                        {option}
                    </button>
                ))}
            </div>
            
            <div className="mt-6 flex justify-between">
                <Button 
                    variant="outline" 
                    onClick={prevQuestion}
                    disabled={currentQuestionIndex === 0}
                >
                    <ArrowRight className="w-4 h-4 ml-2"/>
                    הקודם
                </Button>
                
                {currentQuestionIndex < questions.length - 1 ? (
                    <Button 
                        onClick={nextQuestion}
                        disabled={!answers[currentQuestion.id]}
                    >
                        הבא
                        <ArrowLeft className="w-4 h-4 mr-2"/>
                    </Button>
                ) : (
                    <Button 
                        onClick={submitQuiz} 
                        className="bg-green-600 hover:bg-green-700"
                        disabled={Object.keys(answers).length !== questions.length}
                    >
                        הגש מבחן
                    </Button>
                )}
            </div>
        </div>
    );
};

const SimulationView = ({ scriptId, onComplete }) => {
    const [scripts, setScripts] = useState([]);
    const [currentScriptIndex, setCurrentScriptIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [loading, setLoading] = useState(true);
    const [showResults, setShowResults] = useState(false);

    useEffect(() => {
        const loadScript = async () => {
            setLoading(true);
            try {
                // Load all scripts that match this simulation
                const allScripts = await ConversationScript.filter({ script_id: scriptId });
                // Sort by ID to ensure consistent order if no explicit 'order' field exists
                setScripts(allScripts.sort((a, b) => a.id - b.id)); 
            } catch(e) { 
                console.log("Script not found:", e);
            }
            setLoading(false);
        };
        if(scriptId) {
            loadScript();
        }
    }, [scriptId]);

    const handleAnswer = (scriptUniqueId, isCorrect) => {
        setAnswers(prev => ({
            ...prev,
            [scriptUniqueId]: isCorrect
        }));
    };

    const nextStep = () => {
        if (currentScriptIndex < scripts.length - 1) {
            setCurrentScriptIndex(prev => prev + 1);
        } else {
            // All steps completed - show results
            setShowResults(true);
        }
    };

    const prevStep = () => {
        if (currentScriptIndex > 0) {
            setCurrentScriptIndex(prev => prev - 1);
        }
    };

    const completeSimulation = () => {
        const correctAnswers = Object.values(answers).filter(Boolean).length;
        const totalQuestions = scripts.length;
        const score = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 100;
        onComplete(score >= 70); // 70% passing grade
    };
    
    if (loading) return <Loader2 className="animate-spin mx-auto"/>;
    
    if (scripts.length === 0) return (
        <Card>
            <CardHeader>
                <CardTitle>סימולציה בבנייה</CardTitle>
            </CardHeader>
            <CardContent>
                <p>הסימולציה לשיעור זה עדיין לא מוכנה.</p>
                <p>אני ממתין לתשריט השיחה ממך כדי לבנות אותה.</p>
                <Button className="mt-4" onClick={() => onComplete(true)}>סמן כהושלם והמשך</Button>
            </CardContent>
        </Card>
    );

    if (showResults) {
        const correctAnswers = Object.values(answers).filter(Boolean).length;
        const totalQuestions = scripts.length;
        const score = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 100;
        
        return (
            <div className="p-4 sm:p-8 bg-slate-50 rounded-lg">
                <div className="text-center">
                    {score >= 70 ? 
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" /> : 
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                    }
                    <h3 className="text-2xl font-bold mb-2">
                        {score >= 70 ? 'סיימת בהצלחה!' : 'יש מקום לשיפור'}
                    </h3>
                    <p className="text-lg">
                        עניתי נכון על {correctAnswers} מתוך {totalQuestions} שלבים ({Math.round(score)}%)
                    </p>
                </div>

                <div className="mt-8 text-center">
                    <Button onClick={completeSimulation} className="bg-blue-600 hover:bg-blue-700">
                        המשך לשיעור הבא
                    </Button>
                </div>
            </div>
        );
    }

    const currentScript = scripts[currentScriptIndex];
    if (!currentScript) return <p>שגיאה בטעינת השלב.</p>;

    // Get lesson explanation based on script_id
    // Note: This assumes currentScript.script_id maps to one of the hardcoded keys.
    // If all steps in a multi-step simulation share the same `script_id` (the prop), 
    // then this explanation will be the same for all steps.
    const getLessonExplanation = () => {
        const explanations = {
            'table_opening_script': `
**למה זה חשוב:**
השאלה "פעם ראשונה פה?" פותחת דיאלוג ומאפשרת לך לנהל את השיחה. זה יוצר חיבור אישי ונותן לך מידע חשוב על הלקוח.

**מה זה נותן לך:**
- מבין אם צריך להסביר על המקום
- יוצר אווירה חברותית
- מוביל את השיחה במקום להיות פסיבי
- מראה עניין אמיתי בלקוח
            `,
            'first_time_visitors_script': `
**למה חשוב להסביר ללקוחות חדשים:**
לקוחות חדשים לא מכירים את הקונסטרקט של עלינא. הסבר מונע בלבול ויוצר ציפיות נכונות.

**מה לכלול בהסבר:**
- חמארה ים תיכונית
- תנור ג'וספר (פחמים)
- מנות לחלוקה
- האווירה המיוחדת

**התוצאה:** לקוח מוכן ומבין = חוויה טובה יותר
            `,
            'returning_visitors_script': `
**איך לטפל בלקוחות חוזרים:**
לקוחות חוזרים הם הזהב שלנו! הם כבר אוהבים את המקום, אבל צריך לרענן את החוויה.

**הטכניקה:**
- גלה עניין במה שאכלו קודם
- הזכר חידושים או מנות חדשות
- צור תחושת "בית" אבל גם התרגשות

**מטרה:** לגרום להם להרגיש מיוחדים ולנסות דברים חדשים
            `,
            'restaurant_explanation_script': `
**איך להסביר את עלינא בצורה מושכת:**
ההסבר על המקום צריך לעורר תיאבון ולהכין את הלקוח לחוויה מיוחדת.

**מרכיבי ההסבר המנצח:**
1. **חמארה ים תיכונית** - מקום לא רשמי, חברותי
2. **ג'וספר פחמים** - טכנולוגיה מיוחדת שנותנת טעם
3. **מנות מגיבות** - הדגש על הטריות והמהירות
4. **התלהבות!** - זה המפתח להצלחה

**זכור:** ההסבר שלך מכין את הקרקע לכל ההזמנה
            `,
            'order_anchor_script': `
**למה חשוב לקבוע עוגן:**
בלי עוגן, הלקוח לא יודע כמה להזמין ואתה לא יודע איך להוביל אותו.

**העוגן של עלינא: 4-5 מנות לזוג**
- נותן מסגרת ברורה
- מונע הזמנה של יותר מדי או פחות מדי
- מאפשר לך לבנות הזמנה מותאמת
- יוצר ציפיות נכונות למחיר

**התוצאה:** שליטה מלאה על ההזמנה וחוויה טובה יותר
            `,
            'dietary_preferences_script': `
**למה לשאול על העדפות:**
השאלה הזו נותנת לך את השליטה בשיחה ומאפשרת המלצות מדויקות.

**איך זה עובד:**
- אם בשר: 3-4 מנות בשריות + 2-3 לא בשריות
- אם צמחוני: ההפך
- אתה מוביל את ההזמנה במקום שהם יבחרו לבד

**היתרון:** לקוח מרגיש שמטפלים בו אישית ואתה שולט בהזמנה
            `,
            'alcohol_recommendation_script': `
**למה כל שולחן חייב אלכוהול:**
זה לא רק רווח - זה חלק מהחוויה של עלינא כבר מסעדה.

**איך להציע נכון:**
- תמיד הזכר את ה-Happy Hour (40% הנחה)
- הדגש שזה חלק מהחוויה
- תן אפשרויות: קוקטיילים, בירה, יין, ערק
- היה בטוח בעצמך - זה נורמלי ורצוי

**זכור:** אלכוהול = אווירה + רווחיות + חוויה שלמה
            `,
            'customer_matching_script': `
**איך להתאים משקאות ללקוחות:**
כל לקוח שונה, וההתאמה האישית סוגרת מכירות.

**הכללים:**
- **נשים**: בד"כ אוהבות קוקטיילים. שאל חמוץ/מתוק
- **גברים**: בד"כ בירה קרה או משהו חזק
- **שאלת חמוץ/מתוק**: סוגרת מכירה מיד!

**טיפול בהתנגדות:**
- "מה לא?" (לא בירה? לא קוקטייל?)
- ואז הצע חלופה מתאימה

**המטרה:** כל אחד מקבל בדיוק מה שמתאים לו
            `,
            'chasers_offer_script': `
**למה צ'ייסרים חובה:**
צ'ייסרים זה לא רק מכירה נוספת - זה חלק מהאווירה והחוויה.

**איך להכניס צ'ייסרים:**
- "אין מצב שאין צ'ייסרים בשולחן!"
- הזכר שזה דיל/מבצע
- תן להרגיש שאתה עושה להם טובה
- תהיה בטוח - זה נורמלי פה

**התוצאה:** 
- מכירה נוספת
- אווירה טובה יותר
- לקוחות מרוצים יותר
            `,
            'order_closing_script': `
**איך לסגור הזמנה נכון:**
הסגירה קובעת את הטון לכל הארוחה.

**השלבים:**
1. **רשום שם** - יוצר חיבור אישי
2. **תאם ציפיות** - "מה שמוכן יוצא מיד"
3. **חזור על ההזמנה** - מונע טעויות
4. **הוסף הערות מיוחדות** - מראה שאכפת לך
5. **היה זמין** - "אם צריך משהו אנחנו פה"

**מה זה מונע:** 
- בלבול והפתעות
- תלונות
- אכזבות

**מה זה יוצר:**
- ביטחון ומקצועיות
- חוויה חלקה
- טיפים טובים יותר
            `
        };
        return explanations[currentScript.script_id] || "הסבר לא זמין לשלב זה.";
    };

    const hasAnsweredCurrentStep = answers[currentScript.id] !== undefined;

    return (
        <div className="space-y-6">
            {/* Progress indicator */}
            <div className="text-center">
                <Badge variant="outline">
                    שלב {currentScriptIndex + 1} מתוך {scripts.length}
                </Badge>
            </div>

            {/* Lesson Explanation */}
            <Card className="bg-blue-50 border-blue-200">
                <CardHeader>
                    <CardTitle className="text-blue-800 flex items-center gap-2">
                        <BookOpen className="w-5 h-5" />
                        הסבר השלב: {currentScript.situation_name}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="prose prose-sm max-w-none text-blue-900 whitespace-pre-line">
                        <ReactMarkdown>{getLessonExplanation()}</ReactMarkdown>
                    </div>
                </CardContent>
            </Card>

            {/* Simulation */}
            <div className="p-6 bg-slate-50 rounded-lg border">
                <Badge variant="secondary" className="mb-4">{currentScript.situation_name}</Badge>
                <p className="text-lg italic text-slate-600 mb-6">
                    "<span className="font-bold">לקוח:</span> {currentScript.customer_prompt}"
                </p>
                
                <div className="space-y-3">
                    <Button 
                        onClick={() => handleAnswer(currentScript.id, true)} 
                        disabled={hasAnsweredCurrentStep}
                        className={`w-full h-auto justify-start p-4 text-right ${
                            answers[currentScript.id] === true ? 'bg-green-100 border-green-400' : 
                            'bg-white text-slate-800 border-slate-300 hover:bg-green-50 hover:border-green-400'
                        }`}
                    >
                        {currentScript.correct_response}
                    </Button>
                    <Button 
                        onClick={() => handleAnswer(currentScript.id, false)} 
                        disabled={hasAnsweredCurrentStep}
                        className={`w-full h-auto justify-start p-4 text-right ${
                            answers[currentScript.id] === false ? 'bg-red-100 border-red-400' : 
                            'bg-white text-slate-800 border-slate-300 hover:bg-red-50 hover:border-red-400'
                        }`}
                    >
                        {currentScript.incorrect_response}
                    </Button>
                </div>
                
                {hasAnsweredCurrentStep && (
                    <div className={`mt-6 p-4 rounded-lg ${answers[currentScript.id] ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        <h4 className="font-bold">{answers[currentScript.id] ? 'מעולה!' : 'לא מדויק.'}</h4>
                        <p>{currentScript.feedback_note}</p>
                    </div>
                )}

                {/* Navigation */}
                <div className="mt-6 flex justify-between items-center">
                    <Button 
                        variant="outline" 
                        onClick={prevStep}
                        disabled={currentScriptIndex === 0}
                    >
                        <ArrowRight className="w-4 h-4 ml-2"/>
                        השלב הקודם
                    </Button>
                    
                    {currentScriptIndex < scripts.length - 1 ? (
                        <Button 
                            onClick={nextStep} // This will trigger setShowResults(true)
                            disabled={!hasAnsweredCurrentStep}
                            className="bg-blue-600 hover:bg-blue-700"
                        >
                            השלב הבא
                            <ArrowLeft className="w-4 h-4 mr-2"/>
                        </Button>
                    ) : (
                        <Button 
                            onClick={nextStep} // This will trigger setShowResults(true)
                            disabled={!hasAnsweredCurrentStep}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            סיום סימולציה
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

const CourseDetails = ({ course, user, onBack }) => {
    // Ensure lessons are always sorted by order for consistent display and reordering logic
    const sortedLessons = useMemo(() => {
        return course.lessons ? [...course.lessons].sort((a, b) => a.order - b.order) : [];
    }, [course.lessons]);

    const [enrollment, setEnrollment] = useState(null);
    const [activeLesson, setActiveLesson] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // New states for lesson management
    const [editingLesson, setEditingLesson] = useState(null);
    const [lessonForm, setLessonForm] = useState({
        title: '',
        content_type: '',
        content: '',
        order: 0
    });

    useEffect(() => {
        const loadEnrollment = async () => {
            setLoading(true);
            let userEnrollment;
            try {
                const userEnrollments = await TrainingEnrollment.filter({ employee_id: user.id, course_code: course.course_code });
                if (userEnrollments.length > 0) {
                    userEnrollment = userEnrollments[0];
                } else {
                    userEnrollment = await TrainingEnrollment.create({
                        employee_id: user.id,
                        course_code: course.course_code,
                        status: 'in_progress',
                        enrollment_date: new Date().toISOString(),
                        completed_lessons: []
                    });
                }
                setEnrollment(userEnrollment);
                
                // Use sortedLessons here
                if (sortedLessons.length > 0) {
                    // Fix: Ensure completed_lessons is always an array
                    const completedLessons = Array.isArray(userEnrollment.completed_lessons) ? userEnrollment.completed_lessons : [];
                    const firstUncompleted = sortedLessons.find(l => !completedLessons.includes(l.id));
                    setActiveLesson(firstUncompleted || sortedLessons[0]);
                } else {
                    setActiveLesson(null);
                }
            } catch (error) {
                console.error("Error loading enrollment:", error);
            } finally {
                setLoading(false);
            }
        };

        if (course && user) {
            loadEnrollment();
        }
    }, [course, user, sortedLessons]);

    const handleLessonComplete = async (lessonId) => {
        // Fix: Ensure completed_lessons is always an array
        const completed = Array.isArray(enrollment?.completed_lessons) 
            ? enrollment.completed_lessons 
            : [];
            
        if (!completed.includes(lessonId)) {
            try {
                const updatedEnrollment = await TrainingEnrollment.update(enrollment.id, {
                    completed_lessons: [...completed, lessonId]
                });
                setEnrollment(updatedEnrollment);
            } catch (error) {
                console.error("Failed to update enrollment", error);
            }
        }
    };

    const handleSimulationComplete = (lessonId, didPass) => {
        if (didPass) {
            handleLessonComplete(lessonId); // Mark as complete
            changeLesson(1); // Move to the next lesson
        } else {
            // Optionally, handle failure (e.g., prompt to retry, or do nothing and let user retry)
            alert('Simulation not passed. Please try again.');
        }
    };
    
    const changeLesson = (direction) => {
        const currentIndex = sortedLessons.findIndex(l => l.id === activeLesson.id);
        const nextIndex = currentIndex + direction;
        if(nextIndex >= 0 && nextIndex < sortedLessons.length) {
            setActiveLesson(sortedLessons[nextIndex]);
        }
    };

    // New functions for lesson management
    const deleteLesson = async (lessonId) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק שיעור זה?')) {
            try {
                await TrainingLesson.delete(lessonId);
                window.location.reload(); 
            } catch (error) {
                console.error("שגיאה במחיקת השיעור:", error);
                alert('שגיאה במחיקת השיעור');
            }
        }
    };

    const editLesson = (lesson) => {
        setEditingLesson(lesson);
        setLessonForm({
            title: lesson.title,
            content_type: lesson.content_type,
            content: lesson.content,
            order: lesson.order
        });
    };

    const saveLesson = async () => {
        try {
            if (editingLesson) {
                await TrainingLesson.update(editingLesson.id, {
                    lesson_id: editingLesson.lesson_id,
                    course_code: editingLesson.course_code,
                    title: lessonForm.title,
                    content_type: lessonForm.content_type,
                    content: lessonForm.content,
                    order: lessonForm.order
                });
            }
            setEditingLesson(null);
            window.location.reload(); 
        } catch (error) {
            console.error("שגיאה בעדכון השיעור:", error);
            alert('שגיאה בעדכון השיעור');
        }
    };

    const changeLessonOrder = async (lessonToMove, direction) => {
        const currentOrder = lessonToMove.order;
        const targetOrder = direction === 'up' ? currentOrder - 1 : currentOrder + 1;
        
        if (targetOrder < 1 || targetOrder > sortedLessons.length) {
            return;
        }
        
        try {
            const otherLesson = sortedLessons.find(l => l.order === targetOrder);
            
            if (otherLesson) {
                await TrainingLesson.update(otherLesson.id, {
                    lesson_id: otherLesson.lesson_id,
                    course_code: otherLesson.course_code,
                    title: otherLesson.title,
                    content_type: otherLesson.content_type,
                    content: otherLesson.content,
                    order: currentOrder
                });
                
                await TrainingLesson.update(lessonToMove.id, {
                    lesson_id: lessonToMove.lesson_id,
                    course_code: lessonToMove.course_code,
                    title: lessonToMove.title,
                    content_type: lessonToMove.content_type,
                    content: lessonToMove.content,
                    order: targetOrder
                });
                
                window.location.reload();
            }
        } catch (error) {
            console.error("שגיאה בשינוי הסדר:", error);
            alert('שגיאה בשינוי הסדר');
        }
    };

    // Fix the progress calculation as well
    const getProgressPercentage = () => {
        if (!enrollment || sortedLessons.length === 0) return 0;
        const completed = Array.isArray(enrollment.completed_lessons) 
            ? enrollment.completed_lessons 
            : [];
        return Math.round((completed.length / sortedLessons.length) * 100);
    };

    if (loading) return <div className="flex justify-center items-center h-screen"><Loader2 className="w-12 h-12 animate-spin text-orange-600" /></div>;

    return (
        <div className="space-y-8">
            <Card>
                <CardHeader><CardTitle>תוכן הקורס</CardTitle></CardHeader>
                <CardContent>
                    <ul className="space-y-2">
                        {sortedLessons.map((lesson, index) => {
                            // Fix: Ensure completed_lessons is always an array
                            const completedLessons = Array.isArray(enrollment?.completed_lessons) ? enrollment.completed_lessons : [];
                            return (
                                <li key={lesson.id || index} className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${activeLesson?.id === lesson.id ? 'bg-orange-100' : 'hover:bg-orange-50'}`}>
                                    <div onClick={() => setActiveLesson(lesson)} className="flex-grow cursor-pointer flex items-center gap-3">
                                        {completedLessons.includes(lesson.id) ? 
                                            <CheckCircle className="w-5 h-5 text-green-500"/> : 
                                            <div className="w-5 h-5 rounded-full border-2 border-slate-400"></div>
                                        }
                                        <span className="flex-grow font-medium">{lesson.title}</span>
                                        {lesson.content_type === 'quiz' && <BookOpen className="w-4 h-4 text-slate-500" />}
                                        {lesson.content_type === 'simulation' && <MessageSquare className="w-4 h-4 text-slate-500" />}
                                        {lesson.content_type === 'game' && <Gamepad2 className="w-4 h-4 text-slate-500" />}
                                        {lesson.content_type === 'menu' && <BookOpen className="w-4 h-4 text-slate-500" />}
                                        {lesson.content_type === 'tone_training' && <MessageSquare className="w-4 h-4 text-slate-500" />}
                                    </div>
                                    
                                    {user?.role === 'admin' && (
                                        <div className="flex items-center gap-1">
                                            <Button variant="ghost" size="sm" onClick={() => changeLessonOrder(lesson, 'up')} disabled={lesson.order <= 1}>
                                                <ChevronUp className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => changeLessonOrder(lesson, 'down')} disabled={lesson.order >= sortedLessons.length}>
                                                <ChevronDown className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => editLesson(lesson)}>
                                                <Edit className="w-4 h-4 text-blue-600" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => deleteLesson(lesson.id)}>
                                                <Trash2 className="w-4 h-4 text-red-600" />
                                            </Button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </CardContent>
            </Card>

            {/* Dialog for editing a lesson */}
            <Dialog open={!!editingLesson} onOpenChange={() => setEditingLesson(null)}>
                <DialogContent className="sm:max-w-[425px]" dir="rtl">
                    <DialogHeader>
                        <DialogTitle>עריכת שיעור</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div>
                            <label htmlFor="lesson-title" className="text-sm font-medium">שם השיעור</label>
                            <Input
                                id="lesson-title"
                                value={lessonForm.title}
                                onChange={(e) => setLessonForm({...lessonForm, title: e.target.value})}
                                placeholder="הכנס שם שיעור"
                            />
                        </div>
                        <div>
                            <label htmlFor="content-type" className="text-sm font-medium">סוג תוכן</label>
                            <Select value={lessonForm.content_type} onValueChange={(value) => setLessonForm({...lessonForm, content_type: value})}>
                                <SelectTrigger id="content-type">
                                    <SelectValue placeholder="בחר סוג תוכן" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">טקסט</SelectItem>
                                    <SelectItem value="quiz">מבחן</SelectItem>
                                    <SelectItem value="simulation">סימולציה</SelectItem>
                                    <SelectItem value="game">משחק</SelectItem>
                                    <SelectItem value="menu">לימוד תפריט</SelectItem>
                                    <SelectItem value="tone_training">אימון טון</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label htmlFor="lesson-content" className="text-sm font-medium">תוכן</label>
                            <Textarea
                                id="lesson-content"
                                value={lessonForm.content}
                                onChange={(e) => setLessonForm({...lessonForm, content: e.target.value})}
                                placeholder="תוכן השיעור (לדוגמה: מזהה מבחן/סימולציה, או טקסט לשיעור)"
                                className="h-32"
                            />
                        </div>
                        <div>
                            <label htmlFor="lesson-order" className="text-sm font-medium">מיקום בסדר</label>
                            <Input
                                id="lesson-order"
                                type="number"
                                value={lessonForm.order}
                                onChange={(e) => setLessonForm({...lessonForm, order: parseInt(e.target.value) || 0})}
                                min="1"
                                max={sortedLessons.length}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="outline" onClick={() => setEditingLesson(null)}>
                            <X className="w-4 h-4 ml-2" />
                            ביטול
                        </Button>
                        <Button onClick={saveLesson} disabled={!lessonForm.title || !lessonForm.content_type || !lessonForm.content || lessonForm.order < 1}>
                            <Save className="w-4 h-4 ml-2" />
                            שמור
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <Card className="shadow-xl">
                <CardHeader>
                    <div className="flex justify-between items-center">
                       <Button variant="outline" onClick={onBack}><ArrowRight className="w-4 h-4 ml-2" /> חזור לרשימה</Button>
                       <Badge variant="default" className="bg-orange-600">{course.title}</Badge>
                    </div>
                    <CardTitle className="text-3xl pt-4">{activeLesson?.title}</CardTitle>
                </CardHeader>
                <CardContent>
                    {sortedLessons.length > 0 && activeLesson ? (
                        <>
                            {activeLesson.content_type === 'text' && <ReactMarkdown className="prose max-w-none">{activeLesson.content}</ReactMarkdown>}
                            {activeLesson.content_type === 'quiz' && (
                                <div>
                                    <QuizView quizId={activeLesson.content} onComplete={() => handleLessonComplete(activeLesson.id)} />
                                    {/* Live Simulation after quiz */}
                                    <div className="mt-8">
                                        <LiveSimulation onComplete={(score) => {
                                            console.log(`Live simulation completed with score: ${score}%`);
                                            // Could add additional logic here
                                        }} />
                                    </div>
                                </div>
                            )}
                            {activeLesson.content_type === 'simulation' && <SimulationView scriptId={activeLesson.content} onComplete={(didPass) => handleSimulationComplete(activeLesson.id, didPass)} />}
                            {activeLesson.content_type === 'game' && <SpeedGame gameId={activeLesson.content} onComplete={() => handleLessonComplete(activeLesson.id)} />}
                            {activeLesson.content_type === 'menu' && <MenuLearning user={user} onComplete={() => handleLessonComplete(activeLesson.id)} />}
                            {activeLesson.content_type === 'tone_training' && <ToneTraining onComplete={() => handleLessonComplete(activeLesson.id)} />}

                            <div className="mt-8 flex justify-between items-center">
                                <Button variant="outline" onClick={() => changeLesson(-1)} disabled={sortedLessons.findIndex(l => l.id === activeLesson.id) === 0}>
                                    <ArrowRight className="w-4 h-4 ml-2"/>שיעור קודם
                                </Button>
                                
                                {/* Only show 'Mark as Complete' for text lessons, others handle completion internally */}
                                {activeLesson.content_type === 'text' && (
                                    <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleLessonComplete(activeLesson.id)}>
                                        סמן כהושלם
                                    </Button>
                                )}

                                <Button onClick={() => changeLesson(1)} disabled={sortedLessons.findIndex(l => l.id === activeLesson.id) === sortedLessons.length - 1}>
                                    שיעור הבא<ArrowLeft className="w-4 h-4 mr-2"/>
                                </Button>
                            </div>
                        </>
                    ) : <p className="text-center text-gray-500 py-8">לא נמצאו שיעורים לקורס זה.</p>}
                </CardContent>
            </Card>
        </div>
    );
};

// --- Main Page Component ---
export default function TrainingPage() {
    const [courses, setCourses] = useState([]);
    const [enrollments, setEnrollments] = useState({});
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [showQuickPractice, setShowQuickPractice] = useState(false);
    const [showQuizManager, setShowQuizManager] = useState(false);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const currentUser = await User.me();
            setUser(currentUser);

            if (currentUser) {
                const [allCourses, allLessons, userEnrollments] = await Promise.all([
                    TrainingCourse.list(),
                    TrainingLesson.list(),
                    TrainingEnrollment.filter({ employee_id: currentUser.id })
                ]);
                
                const coursesWithData = allCourses.map(course => {
                    const courseLessons = allLessons.filter(lesson => 
                        lesson.course_code === course.course_code
                    );
                    
                    return {
                        ...course,
                        lessons: courseLessons.sort((a, b) => a.order - b.order),
                        total_lessons: courseLessons.length
                    };
                });

                setCourses(coursesWithData);
                
                const enrollmentsMap = userEnrollments.reduce((acc, curr) => {
                    acc[curr.course_code] = curr;
                    return acc;
                }, {});
                setEnrollments(enrollmentsMap);
            }
        } catch (e) {
            console.error("Failed to fetch data:", e);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleBack = () => {
        setSelectedCourse(null);
        setShowQuickPractice(false);
        loadData();
    };

    const handleQuickPractice = () => {
        setShowQuickPractice(true);
        setSelectedCourse(null);
    };

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="w-12 h-12 animate-spin text-orange-600" /></div>
    }

    const isAdmin = user?.role === 'admin';

    return (
        <div className="p-4 sm:p-8 bg-gradient-to-br from-orange-50 to-red-50 min-h-screen" dir="rtl">
            <div className="max-w-7xl mx-auto">
                {showQuickPractice ? (
                    <div className="space-y-8">
                        <div className="flex items-center gap-4">
                            <Button variant="outline" onClick={handleBack}>
                                <ArrowRight className="w-4 h-4 ml-2" /> 
                                חזור להכשרות
                            </Button>
                            <Badge variant="default" className="bg-blue-600 text-white">
                                תרגול מהיר
                            </Badge>
                        </div>
                        
                        <Card className="shadow-xl">
                            <CardHeader>
                                <CardTitle className="text-3xl pt-4 text-center">
                                    תרגול שיחת הזמנה עם לקוח AI
                                </CardTitle>
                                <CardDescription className="text-center">
                                    תתרגל עם לקוח מלאכותי שמתנהג כמו לקוח אמיתי
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <LiveSimulation onComplete={(score) => {
                                    console.log(`Quick practice completed with score: ${score}%`);
                                }} />
                            </CardContent>
                        </Card>
                    </div>
                ) : !selectedCourse ? (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <h1 className="text-4xl font-bold text-slate-900">מסלולי הכשרה</h1>
                            {isAdmin && (
                                <div className="flex gap-2 border rounded-xl p-1 bg-white shadow-sm">
                                    <Button
                                        variant={!showQuizManager ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => setShowQuizManager(false)}
                                    >
                                        📚 קורסים
                                    </Button>
                                    <Button
                                        variant={showQuizManager ? 'default' : 'ghost'}
                                        size="sm"
                                        onClick={() => setShowQuizManager(true)}
                                        className={showQuizManager ? 'bg-blue-600 hover:bg-blue-700' : ''}
                                    >
                                        🎓 מבחנים
                                    </Button>
                                </div>
                            )}
                        </div>

                        {isAdmin && showQuizManager ? (
                            <div className="mt-4">
                                <QuizManager />
                            </div>
                        ) : (
                        <>
                        <p className="text-lg text-slate-600 mb-6">אלו הקורסים המיועדים עבורך. בחר קורס כדי להתחיל.</p>
                        
                        {/* Quick Practice Button */}
                        <div className="mb-8 text-center">
                            <Button 
                                onClick={handleQuickPractice}
                                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white text-lg px-8 py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300"
                            >
                                <MessageSquare className="w-6 h-6 mr-3" />
                                🚀 תרגול מהיר עם לקוח AI
                                <span className="block text-sm font-normal opacity-90 mt-1">
                                    דלג על התיאוריה - ישר לתרגול!
                                </span>
                            </Button>
                        </div>
                        
                        {courses.length === 0 ? (
                            <div className="text-center py-12">
                                <GraduationCap className="w-16 h-16 mx-auto text-gray-400 mb-4" />
                                <h3 className="text-xl font-semibold text-gray-600 mb-2">אין קורסים זמינים כרגע</h3>
                                <p className="text-gray-500">קורסי ההדרכה יופיעו כאן ברגע שיהיו מוכנים</p>
                                <Button 
                                    onClick={loadData} 
                                    className="mt-4 bg-orange-600 hover:bg-orange-700"
                                >
                                    רענן
                                </Button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {courses.map(course => (
                                    <CourseCard 
                                        key={course.id} 
                                        course={course} 
                                        onSelect={setSelectedCourse} 
                                        enrollment={enrollments[course.course_code]} 
                                    />
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <CourseDetails 
                        course={selectedCourse} 
                        onBack={handleBack}
                        user={user}
                    />
                )}
            </div>
        </div>
    );
}