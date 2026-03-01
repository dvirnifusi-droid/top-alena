import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvokeLLM, UploadFile } from "@/integrations/Core";
import { TableSession } from "@/entities/TableSession";
import { Camera, Send, Lightbulb, Loader2, MessageCircle } from 'lucide-react';

export default function WaiterAiAssistant({ session, currentStep, onClose }) {
    const [question, setQuestion] = useState('');
    const [response, setResponse] = useState('');
    const [loading, setLoading] = useState(false);
    const [imageFile, setImageFile] = useState(null);
    const [showImageUpload, setShowImageUpload] = useState(false);

    const getContextualPrompt = () => {
        const tableStyle = {
            date: 'דייט רומנטי',
            family_with_kids: 'משפחה עם ילדים',
            business: 'פגישת עסקים',
            friends: 'חברים',
            celebration: 'חגיגה',
            couple: 'זוג',
            solo: 'אדם יחיד'
        };

        return `אתה עוזר AI מומחה למלצרים במסעדה "עלינא" - מסעדת חמארה ים תיכונית יוקרתית.

פרטי השולחן הנוכחי:
- שולחן מספר: ${session.table_number}
- מספר סועדים: ${session.party_size}
- סגנון השולחן: ${tableStyle[session.table_style] || session.table_style}
- השלב הנוכחי: ${currentStep.step_name}
- תיאור השלב: ${currentStep.description}

המטרה שלך היא לתת עצות מעשיות, ספציפיות ומועילות למלצר כיצד לטפל בשולחן הזה בשלב הנוכחי.
תן תשובות קצרות, מעשיות ומותאמות לסגנון השולחן.

תמיד כלול:
1. עצה ספציפית לשלב הנוכחי
2. טיפ להתנהגות מול סוג השולחן הזה
3. המלצה להתקדמות לשלב הבא

היה חברותי אבל מקצועי, כמו מלצר ותיק שמלמד מלצר חדש.`;
    };

    const handleAskAI = async () => {
        if (!question.trim() && !imageFile) return;

        setLoading(true);
        try {
            let fileUrl = null;
            if (imageFile) {
                const uploadResult = await UploadFile({ file: imageFile });
                fileUrl = uploadResult.file_url;
            }

            const contextPrompt = getContextualPrompt();
            const userQuestion = question || "מה אתה יכול לראות בתמונה הזו? איך זה עוזר לי לתת שירות טוב יותר?";

            const aiResponse = await InvokeLLM({
                prompt: `${contextPrompt}\n\nשאלת המלצר: ${userQuestion}`,
                file_urls: fileUrl ? [fileUrl] : undefined
            });

            setResponse(aiResponse);

            // שמירת השימוש בהמלצות AI
            if (session.ai_recommendations_used) {
                await TableSession.update(session.id, {
                    ...session,
                    ai_recommendations_used: [...session.ai_recommendations_used, userQuestion]
                });
            }

        } catch (error) {
            console.error('Error getting AI advice:', error);
            setResponse('מצטער, יש לי בעיה טכנית כרגע. נסה שוב בעוד רגע.');
        } finally {
            setLoading(false);
        }
    };

    const getQuickTips = () => {
        const tips = {
            date: [
                "תן להם פרטיות ומרחב",
                "הצע יין או קוקטייל רומנטי",
                "דבר בשקט ובעדינות"
            ],
            family_with_kids: [
                "הבא תפריט ילדים מהר",
                "הצע פעילות לילדים",
                "היה סבלני עם רעש"
            ],
            business: [
                "היה מהיר ויעיל",
                "אל תפריע יותר מדי",
                "הצע משקאות קלים"
            ],
            friends: [
                "היה חברותי ואנרגטי", 
                "הצע לחלוק מנות",
                "שמח איתם"
            ],
            celebration: [
                "שאל על האירוע",
                "הצע קינוח מיוחד",
                "תן תשומת לב מיוחדת"
            ]
        };

        return tips[session.table_style] || tips.friends;
    };

    return (
        <Dialog open={true} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" dir="rtl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-yellow-500" />
                        עוזר AI - שולחן {session.table_number}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* מידע על השלב הנוכחי */}
                    <Card className="bg-blue-50 border-blue-200">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm text-blue-800">השלב הנוכחי</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="font-semibold text-blue-900">{currentStep.step_name}</p>
                            <p className="text-sm text-blue-700 mt-1">{currentStep.description}</p>
                        </CardContent>
                    </Card>

                    {/* טיפים מהירים */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">טיפים מהירים לסוג השולחן הזה</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-1">
                                {getQuickTips().map((tip, idx) => (
                                    <li key={idx} className="text-sm flex items-start gap-2">
                                        <span className="text-green-600 mt-0.5">•</span>
                                        {tip}
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>

                    {/* העלאת תמונה */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => setShowImageUpload(!showImageUpload)}
                            >
                                <Camera className="w-4 h-4 ml-2" />
                                {showImageUpload ? 'הסתר העלאת תמונה' : 'צלם ושאל את ה-AI'}
                            </Button>
                        </div>

                        {showImageUpload && (
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={(e) => setImageFile(e.target.files[0])}
                                className="text-sm"
                            />
                        )}
                    </div>

                    {/* שדה שאלה */}
                    <div className="space-y-2">
                        <Textarea
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="שאל את העוזר AI כל דבר על השולחן או השלב הנוכחי..."
                            className="min-h-20"
                        />
                        <Button onClick={handleAskAI} disabled={loading} className="w-full">
                            {loading ? (
                                <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> חושב...</>
                            ) : (
                                <><Send className="w-4 h-4 ml-2" /> קבל עצה מה-AI</>
                            )}
                        </Button>
                    </div>

                    {/* תשובת AI */}
                    {response && (
                        <Card className="bg-green-50 border-green-200">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm text-green-800 flex items-center gap-2">
                                    <MessageCircle className="w-4 h-4" />
                                    עצת העוזר החכם
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-green-900 whitespace-pre-wrap">{response}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}