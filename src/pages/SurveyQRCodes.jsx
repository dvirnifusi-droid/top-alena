import React from 'react';
import SurveyQRGenerator from '../components/dashboard/SurveyQRGenerator';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from 'lucide-react';

export default function SurveyQRCodes() {
    return (
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen" dir="rtl">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">ברקודים לסקרי לקוחות</h1>
                    <p className="text-gray-600">יצר והדפס ברקודים לסקרי שביעות רצון</p>
                </div>

                {/* Main QR Generator */}
                <SurveyQRGenerator />

                {/* Additional Info */}
                <Card className="border-[#E8D9B5]">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <Info className="w-5 h-5 text-[#44512C]" />
                            <CardTitle className="text-blue-900">מידע חשוב</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-[#F4ECD8] p-4 rounded-lg">
                            <h4 className="font-semibold text-blue-900 mb-2">איך זה עובד:</h4>
                            <ul className="text-sm text-[#2E3819] space-y-1 list-disc list-inside">
                                <li>לקוחות סורקים את הברקוד עם המצלמה</li>
                                <li>הם מועברים אוטומטית לסקר שביעות רצון</li>
                                <li>הסקר קצר ופשוט למילוי</li>
                                <li>אתה מקבל את כל התשובות במערכת</li>
                            </ul>
                        </div>
                        
                        <div className="bg-green-50 p-4 rounded-lg">
                            <h4 className="font-semibold text-green-900 mb-2">עצות שימוש:</h4>
                            <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
                                <li>הדפס את הברקוד על כל חשבון</li>
                                <li>שים מדבקות עם הברקוד על השולחנות</li>
                                <li>בקש מהמלצרים לעודד לקוחות למלא</li>
                                <li>הברקוד תקף לתמיד - אפשר להדפיס הרבה עותקים</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}