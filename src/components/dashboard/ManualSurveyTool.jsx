
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { User } from '@/entities/User';
import { MessageSquare, History, CheckCircle, Clock, Copy, ExternalLink, QrCode } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTenantBranding } from '@/hooks/useTenantBranding';

export default function ManualSurveyTool() {
    const branding = useTenantBranding();
    const brandName = branding?.name || 'המסעדה';
    const [customerName, setCustomerName] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [recentSurveys, setRecentSurveys] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadRecentSurveys();
        User.me().then(setCurrentUser).catch(() => setCurrentUser(null));
    }, []);

    const loadRecentSurveys = async () => {
        try {
            // Try to import ManualSurvey, if it fails, show mock data
            try {
                const { ManualSurvey } = await import('@/entities/ManualSurvey');
                const surveys = await ManualSurvey.list('-created_date', 5);
                setRecentSurveys(surveys);
            } catch (entityError) {
                console.warn('ManualSurvey entity not available:', entityError);
                setRecentSurveys([]); // Use empty array if entity doesn't exist
            }
        } catch (error) {
            console.error('Error loading recent surveys:', error);
            setError('שגיאה בטעינת סקרים');
        }
    };

    const handleSendSurvey = async () => {
        if (!customerName.trim() || !customerPhone.trim()) {
            alert('אנא מלא שם לקוח ומספר טלפון.');
            return;
        }

        if (!currentUser) {
            alert('שגיאה - לא ניתן לזהות משתמש.');
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            // יצירת מזהה קצר וייחודי לסקר
            const shortId = Math.random().toString(36).substring(2, 9);
            
            // Try to save the survey, if entity doesn't exist, just create the URL
            try {
                const { ManualSurvey } = await import('@/entities/ManualSurvey');
                await ManualSurvey.create({
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    sent_by: currentUser.email,
                    survey_id: shortId,
                    status: 'sent',
                    notes: notes
                });
            } catch (entityError) {
                console.warn('Could not save survey to database:', entityError);
            }

            // יצירת קישור מקוצר לסקר
            const surveyUrl = window.location.origin + createPageUrl(`CustomerSurvey?s=${shortId}`);
            
            // הכנת הודעת הוואטסאפ
            const message = `היי ${customerName}, תודה שביקרת אצלנו ב${brandName}! נשמח אם תקדיש רגע לדרג את החוויה שלך: ${surveyUrl}`;

            // העתקת ההודעה ללוח
            try {
                await navigator.clipboard.writeText(message);
                const businessPhone = branding?.phone;
                setResult({
                    type: 'success',
                    message: businessPhone
                        ? `ההודעה הועתקה ללוח! כעת פתח את וואטסאפ העסקי שלך (${businessPhone}) ושלח אותה ל-${customerPhone}`
                        : `ההודעה הועתקה ללוח! כעת פתח את וואטסאפ העסקי שלך ושלח אותה ל-${customerPhone}`
                });
            } catch (clipboardError) {
                console.error('Failed to copy to clipboard:', clipboardError);
                // Fallback - פתח וואטסאפ בדפדפן
                const whatsappUrl = `https://wa.me/${customerPhone}?text=${encodeURIComponent(message)}`;
                window.open(whatsappUrl, '_blank');
                setResult({ 
                    type: 'success', 
                    message: 'וואטסאפ נפתח עם הודעה מוכנה - לחץ שלח!' 
                });
            }

            // איפוס הטופס
            setCustomerName('');
            setCustomerPhone('');
            setNotes('');
            
            loadRecentSurveys();

        } catch (error) {
            console.error('Error sending survey:', error);
            setResult({ type: 'error', message: 'שגיאה בשליחת הסקר. נסה שוב.' });
        } finally {
            setLoading(false);
        }
    };

    const openWhatsAppBusiness = () => {
        // פתח את וואטסאפ ווב עם המספר העסקי
        window.open('https://web.whatsapp.com/', '_blank');
    };

    const formatPhoneForDisplay = (phone) => {
        if (!phone) return '';
        if (phone.startsWith('972')) {
            return '0' + phone.substring(3);
        }
        return phone;
    };

    return (
        <Card className="shadow-lg border-0 bg-gradient-to-br from-white to-green-50/30">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                        <MessageSquare className="w-5 h-5 text-white" />
                    </div>
                    <CardTitle className="text-lg text-slate-800">שלח סקר ללקוח</CardTitle>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}
                
                <div>
                    <Label htmlFor="customer-name" className="text-sm font-medium text-slate-700">שם הלקוח</Label>
                    <Input
                        id="customer-name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="למשל: ישראל ישראלי"
                        className="mt-1"
                    />
                </div>

                <div>
                    <Label htmlFor="customer-phone" className="text-sm font-medium text-slate-700">מספר טלפון</Label>
                    <Input
                        id="customer-phone"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="למשל: 0501234567"
                        className="mt-1"
                    />
                </div>

                <div>
                    <Label htmlFor="notes" className="text-sm font-medium text-slate-700">הערות (אופציונלי)</Label>
                    <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="למשל: אירוע יום הולדת, לקוח VIP..."
                        className="mt-1 h-16 resize-none"
                    />
                </div>

                <div className="flex gap-2">
                    <Button 
                        onClick={handleSendSurvey} 
                        disabled={loading || !customerName.trim() || !customerPhone.trim()}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                        {loading ? (
                            <>
                                <Clock className="w-4 h-4 ml-2 animate-spin" />
                                מכין סקר...
                            </>
                        ) : (
                            <>
                                <Copy className="w-4 h-4 ml-2" />
                                הכן והעתק סקר
                            </>
                        )}
                    </Button>
                    <Button 
                        variant="outline" 
                        onClick={openWhatsAppBusiness}
                        className="border-green-300 text-green-700 hover:bg-green-50"
                        title="פתח וואטסאפ ווב"
                    >
                        <ExternalLink className="w-4 h-4" />
                    </Button>
                </div>

                {result && (
                    <Alert variant={result.type === 'error' ? 'destructive' : 'default'}>
                        <AlertDescription>{result.message}</AlertDescription>
                    </Alert>
                )}

                {/* QR Code Section */}
                <div className="bg-[#F4ECD8] p-4 rounded-lg border border-purple-200">
                    <h4 className="font-semibold text-purple-900 mb-2">📱 ברקוד להדפסה</h4>
                    <p className="text-sm text-[#7A3722] mb-3">
                        במקום לשלוח SMS לכל לקוח, אפשר להדפיס ברקוד על כל חשבון
                    </p>
                    <Button 
                        onClick={() => window.open('/SurveyQRCodes', '_blank')}
                        variant="outline"
                        className="border-[#D9BD83] text-[#7A3722] hover:bg-[#F4ECD8]"
                    >
                        <QrCode className="w-4 h-4 ml-2" />
                        צור ברקוד לסקרים
                    </Button>
                </div>

                {/* היסטוריית סקרים אחרונים */}
                {recentSurveys.length > 0 && (
                    <div className="pt-4 border-t">
                        <div className="flex items-center gap-2 mb-3">
                            <History className="w-4 h-4 text-slate-500" />
                            <span className="text-sm font-medium text-slate-700">סקרים שנשלחו לאחרונה</span>
                        </div>
                        <div className="space-y-2">
                            {recentSurveys.map((survey) => (
                                <div key={survey.id} className="flex items-center justify-between p-2 bg-[#FAF5E8] rounded-lg">
                                    <div>
                                        <p className="text-sm font-medium">{survey.customer_name}</p>
                                        <p className="text-xs text-slate-600">{formatPhoneForDisplay(survey.customer_phone)}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {survey.status === 'completed' ? (
                                            <CheckCircle className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <Clock className="w-4 h-4 text-amber-500" />
                                        )}
                                        <span className="text-xs text-slate-500">
                                            {survey.status === 'completed' ? 'הושלם' : 'נשלח'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
