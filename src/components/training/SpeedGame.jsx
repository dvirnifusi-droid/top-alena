import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy, Zap } from 'lucide-react';

export default function SpeedGame({ gameId, onComplete }) {
    const [gameState, setGameState] = useState('waiting'); // waiting, playing, finished
    const [orders, setOrders] = useState([]);
    const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
    const [timeLeft, setTimeLeft] = useState(60);
    const [score, setScore] = useState(0);
    const [selectedSequence, setSelectedSequence] = useState([]);

    const barOrders = [
        { id: 1, drink: "אפרול שפריץ", steps: ["פרוסקו", "אפרול", "סודה", "קרח", "פירור תפוז"] },
        { id: 2, drink: "מוהיטו", steps: ["נענע", "לייט", "רום", "סודה", "קרח"] },
        { id: 3, drink: "מרגריטה", steps: ["טקילה", "לייט", "טריפל סק", "קרח", "מלח"] },
        { id: 4, drink: "ג'ין טוניק", steps: ["ג'ין", "טוניק", "קרח", "לייט"] },
        { id: 5, drink: "ווירצקי קולה", steps: ["וודקה", "קולה", "קרח", "לייט"] }
    ];

    useEffect(() => {
        if (gameState === 'playing' && timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        } else if (timeLeft === 0) {
            endGame();
        }
    }, [gameState, timeLeft]);

    const startGame = () => {
        setGameState('playing');
        setOrders(barOrders.sort(() => Math.random() - 0.5).slice(0, 5));
        setCurrentOrderIndex(0);
        setTimeLeft(60);
        setScore(0);
        setSelectedSequence([]);
    };

    const selectStep = (step) => {
        const newSequence = [...selectedSequence, step];
        setSelectedSequence(newSequence);
        
        const currentOrder = orders[currentOrderIndex];
        if (newSequence.length === currentOrder.steps.length) {
            // Check if sequence is correct
            const isCorrect = newSequence.every((step, index) => 
                step === currentOrder.steps[index]
            );
            
            if (isCorrect) {
                const newScore = score + 10;
                setScore(newScore);
                if (currentOrderIndex < orders.length - 1) {
                    setCurrentOrderIndex(prev => prev + 1);
                    setSelectedSequence([]);
                } else {
                    endGame(newScore);
                }
            } else {
                // Reset current order
                setSelectedSequence([]);
                setScore(prev => Math.max(0, prev - 2)); // Lose 2 points for mistake
            }
        }
    };

    const endGame = (rawScore = score) => {
        setGameState('finished');
        const finalScore = Math.round((rawScore / orders.length) * 10);
        onComplete(finalScore);
    };

    const currentOrder = orders[currentOrderIndex];

    if (gameState === 'waiting') {
        return (
            <Card className="p-6 text-center">
                <CardHeader>
                    <CardTitle className="flex items-center justify-center gap-2">
                        <Zap className="w-6 h-6 text-yellow-500" />
                        תרגול מהירות בבר
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-gray-600">הכן 5 משקאות בסדר הנכון במהירות האפשרית!</p>
                    <p className="text-sm text-gray-500">יש לך 60 שניות. כל טעות מורידה נקודות.</p>
                    <Button onClick={startGame} className="bg-yellow-600 hover:bg-yellow-700">
                        <Zap className="w-4 h-4 mr-2" />
                        התחל משחק
                    </Button>
                </CardContent>
            </Card>
        );
    }

    if (gameState === 'finished') {
        return (
            <Card className="p-6 text-center">
                <CardHeader>
                    <CardTitle className="flex items-center justify-center gap-2">
                        <Trophy className="w-6 h-6 text-gold-500" />
                        המשחק הסתיים!
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="text-3xl font-bold text-green-600">{score} נקודות</div>
                    <p className="text-gray-600">
                        {score >= 40 ? 'מעולה! אתה ברמן מקצועי!' : 
                         score >= 25 ? 'לא רע! עוד קצת תרגול ותהיה מושלם' : 
                         'צריך לתרגל עוד. זה בסדר, כולם מתחילים ככה!'}
                    </p>
                    <Button onClick={() => setGameState('waiting')} variant="outline">
                        שחק שוב
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="p-6">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="w-5 h-5" />
                        זמן: {timeLeft}s
                    </CardTitle>
                    <Badge variant="outline">ציון: {score}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="text-center">
                    <h3 className="text-xl font-bold mb-2">הכן: {currentOrder?.drink}</h3>
                    <p className="text-sm text-gray-600">
                        משקה {currentOrderIndex + 1} מתוך {orders.length}
                    </p>
                </div>

                <div className="space-y-3">
                    <h4 className="font-semibold">בחר את השלב הבא:</h4>
                    <div className="grid grid-cols-2 gap-2">
                        {currentOrder?.steps.map((step, index) => (
                            <Button
                                key={step}
                                onClick={() => selectStep(step)}
                                variant={selectedSequence.includes(step) ? "secondary" : "outline"}
                                disabled={selectedSequence.includes(step)}
                                className="h-12"
                            >
                                {step}
                            </Button>
                        ))}
                    </div>
                </div>

                {selectedSequence.length > 0 && (
                    <div className="bg-blue-50 p-3 rounded-lg">
                        <p className="text-sm font-medium mb-1">הסדר שבחרת:</p>
                        <div className="flex gap-2 flex-wrap">
                            {selectedSequence.map((step, index) => (
                                <Badge key={index} variant="secondary">{step}</Badge>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}