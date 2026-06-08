
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrCode, Download, Printer, Copy, Check } from 'lucide-react';

export default function SurveyQRGenerator() {
    const [qrText, setQrText] = useState('');
    const [copied, setCopied] = useState(false);
    
    // יוצר קישור לסקר עם מזהה ייחודי
    const surveyUrl = `${window.location.origin}/CustomerSurvey?source=qr&table=general`;
    
    React.useEffect(() => {
        // יוצר QR code עם API חינמי
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(surveyUrl)}`;
        setQrText(qrApiUrl);
    }, [surveyUrl]);

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(surveyUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleDownloadQR = () => {
        const link = document.createElement('a');
        link.href = qrText;
        link.download = 'survey-qr-code.png';
        link.click();
    };

    const handlePrint = () => {
        const printWindow = window.open('', '', 'width=400,height=600');
        printWindow.document.write(`
            <html>
                <head>
                    <title>ברקוד סקר שביעות רצון</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            text-align: center; 
                            padding: 20px;
                            direction: rtl;
                        }
                        .qr-container {
                            border: 2px dashed #ccc;
                            padding: 20px;
                            margin: 20px 0;
                        }
                        .instructions {
                            margin: 20px 0;
                            font-size: 14px;
                        }
                        @media print {
                            body { margin: 0; }
                        }
                    </style>
                </head>
                <body>
                    <h2>🍽️ עלינא - סקר שביעות רצון</h2>
                    <div class="qr-container">
                        <img src="${qrText}" alt="QR Code" style="max-width: 200px;">
                    </div>
                    <div class="instructions">
                        <p><strong>איך זה עובד?</strong></p>
                        <p>1️⃣ פתח את המצלמה בטלפון</p>
                        <p>2️⃣ כוון על הברקוד</p>
                        <p>3️⃣ לחץ על הקישור שיופיע</p>
                        <p>4️⃣ מלא את הסקר הקצר</p>
                        <br>
                        <p style="font-size: 12px; color: #666;">
                            המשוב שלכם חשוב לנו ומשפר את השירות 💚
                        </p>
                    </div>
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    };

    return (
        <Card className="shadow-lg border-purple-200">
            <CardHeader className="flex flex-row items-center gap-3">
                <QrCode className="w-6 h-6 text-[#A04A2E]" />
                <div>
                    <CardTitle className="text-slate-800">ברקוד סקר שביעות רצון</CardTitle>
                    <CardDescription>הדפס ברקוד זה על כל חשבון כדי שלקוחות יוכלו למלא סקר</CardDescription>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* QR Code Display */}
                <div className="flex justify-center">
                    <div className="bg-white p-4 border-2 border-dashed border-gray-300 rounded-lg">
                        {qrText ? (
                            <img 
                                src={qrText} 
                                alt="QR Code לסקר" 
                                className="max-w-[250px] max-h-[250px]"
                            />
                        ) : (
                            <div className="w-[250px] h-[250px] bg-gray-200 animate-pulse rounded"></div>
                        )}
                    </div>
                </div>

                {/* Instructions */}
                <div className="bg-[#F4ECD8] p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-900 mb-2">📱 הוראות ללקוח:</h4>
                    <div className="text-sm text-[#2E3819] space-y-1">
                        <p>1. פתח את המצלמה בטלפון שלך</p>
                        <p>2. כוון על הברקוד</p>
                        <p>3. לחץ על הקישור שיופיע</p>
                        <p>4. מלא את הסקר הקצר (דקה אחת)</p>
                    </div>
                </div>

                {/* URL Display */}
                <div className="bg-gray-50 p-3 rounded-lg">
                    <Label className="text-xs text-gray-600">קישור הסקר:</Label>
                    <div className="flex items-center gap-2 mt-1">
                        <Input 
                            value={surveyUrl} 
                            readOnly 
                            className="text-xs bg-white"
                        />
                        <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={handleCopyUrl}
                            className="flex-shrink-0"
                        >
                            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </Button>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                    <Button 
                        onClick={handleDownloadQR} 
                        variant="outline"
                        className="bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    >
                        <Download className="w-4 h-4 ml-2" />
                        הורד תמונה
                    </Button>
                    <Button 
                        onClick={handlePrint}
                        className="bg-[#A04A2E] hover:bg-[#7A3722]"
                    >
                        <Printer className="w-4 h-4 ml-2" />
                        הדפס ברקוד
                    </Button>
                </div>

                {/* Usage Tips */}
                <div className="bg-[#FAF5E8] p-4 rounded-lg border border-yellow-200">
                    <h4 className="font-semibold text-yellow-900 mb-2">💡 עצות שימוש:</h4>
                    <div className="text-sm text-yellow-800 space-y-1">
                        <p>• הדפס את הברקוד על כל חשבון</p>
                        <p>• שים אותו גם על השולחנות כמדבקה</p>
                        <p>• בקש מהמלצרים לעודד לקוחות למלא</p>
                        <p>• הברקוד תקף לתמיד - אפשר להדפיס הרבה</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
