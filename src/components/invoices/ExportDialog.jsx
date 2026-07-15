import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2, Send, Copy, CheckCircle, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { AccountantExport } from '@/entities/AccountantExport';
import { SendEmail } from '@/integrations/Core';
import { createPageUrl } from '@/utils';
import { useTenantBranding } from '@/hooks/useTenantBranding';

export default function ExportDialog({ isOpen, onClose }) {
    const branding = useTenantBranding();
    const [dateRange, setDateRange] = useState({ from: null, to: null });
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [exportUrl, setExportUrl] = useState('');

    const handleExport = async () => {
        if (!dateRange.from || !dateRange.to || !email) {
            alert('אנא מלא את כל השדות.');
            return;
        }

        setLoading(true);
        setResult(null);

        try {
            console.log('מתחיל תהליך ייצוא...', { dateRange, email });

            // 1. Generate a secure token
            const token = `export-${Date.now()}-${Math.random().toString(36).substring(2)}`;
            console.log('נוצר טוקן:', token);

            // 2. Set an expiration date (e.g., 7 days from now)
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);

            // 3. Save the export record
            console.log('שומר רשומת ייצוא...');
            await AccountantExport.create({
                token: token,
                accountant_email: email,
                start_date: format(dateRange.from, 'yyyy-MM-dd'),
                end_date: format(dateRange.to, 'yyyy-MM-dd'),
                expires_at: expiresAt.toISOString(),
                status: 'pending',
            });
            console.log('רשומת ייצוא נשמרה בהצלחה');

            // 4. Create the public URL
            const generatedExportUrl = `${window.location.origin}${createPageUrl(`AccountantExportView?token=${token}`)}`;
            setExportUrl(generatedExportUrl);
            console.log('נוצר קישור:', generatedExportUrl);

            // 5. Send the email to the accountant
            console.log('מנסה לשלוח מייל...');
            try {
                const emailResult = await SendEmail({
                    to: email,
                    subject: `ייצוא חשבוניות מחברת ${branding.name}`,
                    body: `
                        <div dir="rtl" style="font-family: Arial, sans-serif;">
                            <h2>שלום רב,</h2>
                            <p>מצורף קישור מאובטח לצפייה והורדה של החשבוניות עבור התקופה:</p>
                            <p><strong>${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}</strong></p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="${generatedExportUrl}" style="background-color: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-size: 16px; display: inline-block;">
                                    לחץ כאן לצפייה בחשבוניות
                                </a>
                            </div>
                            <p><strong>חשוב:</strong> הקישור יהיה זמין למשך 7 ימים בלבד.</p>
                            <p>במידה ויש בעיות או שאלות, אנא צור קשר איתנו.</p>
                            <br>
                            <p>בברכה,<br>צוות ${branding.name}</p>
                        </div>
                    `
                });
                
                console.log('תוצאת שליחת מייל:', emailResult);
                setResult({ 
                    type: 'success', 
                    message: `המייל נשלח בהצלחה ל-${email}! בדוק גם בתיקיית הספאם.`
                });

            } catch (emailError) {
                console.error('שגיאה בשליחת מייל:', emailError);
                setResult({ 
                    type: 'warning', 
                    message: `הקישור נוצר, אבל המייל לא נשלח. תוכל להעתיק את הקישור ולשלוח אותו ידנית.`
                });
            }

        } catch (error) {
            console.error('Failed to export invoices:', error);
            setResult({ type: 'error', message: 'שגיאה כללית. אנא נסה שוב או פנה לתמיכה.' });
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(exportUrl);
            alert('הקישור הועתק! כעת תוכל לשלוח אותו ידנית לרואה החשבון.');
        } catch (err) {
            console.error('Failed to copy:', err);
            alert('לא ניתן להעתיק. נסה לסמן את הקישור ולהעתיק ידנית.');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent dir="rtl" className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>ייצוא חשבוניות לרואה חשבון</DialogTitle>
                    <DialogDescription>
                        בחר טווח תאריכים וכתובת מייל. המערכת תשלח קישור מאובטח עם כל החשבוניות.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div>
                        <Label>טווח תאריכים</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-full justify-start text-left font-normal">
                                    <CalendarIcon className="ml-2 h-4 w-4" />
                                    {dateRange.from ? 
                                        (dateRange.to ? 
                                            `${format(dateRange.from, 'dd/MM/yy')} - ${format(dateRange.to, 'dd/MM/yy')}` : 
                                            format(dateRange.from, 'dd/MM/yyyy')) 
                                        : 'בחר תאריכים'}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="range"
                                    selected={dateRange}
                                    onSelect={setDateRange}
                                    numberOfMonths={2}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div>
                        <Label htmlFor="accountant-email">מייל של רואה החשבון</Label>
                        <Input
                            id="accountant-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="accountant@example.com"
                        />
                    </div>

                    {/* הצגת הקישור אם נוצר */}
                    {exportUrl && (
                        <div className="p-3 bg-gray-50 rounded-lg border">
                            <Label className="text-sm font-medium">קישור לייצוא:</Label>
                            <div className="flex items-center gap-2 mt-2">
                                <Input 
                                    value={exportUrl} 
                                    readOnly 
                                    className="text-xs"
                                />
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={copyToClipboard}
                                >
                                    <Copy className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
                <DialogFooter className="flex-col gap-4">
                    {result && (
                        <div className={`flex items-center gap-2 text-sm ${
                            result.type === 'success' ? 'text-green-600' : 
                            result.type === 'warning' ? 'text-orange-600' : 'text-red-600'
                        }`}>
                            {result.type === 'success' ? <CheckCircle className="w-4 h-4" /> : 
                             <AlertTriangle className="w-4 h-4" />}
                            {result.message}
                        </div>
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>
                            סגור
                        </Button>
                        <Button onClick={handleExport} disabled={loading}>
                            {loading ? (
                                <><Loader2 className="w-4 h-4 ml-2 animate-spin" /> עובד...</>
                            ) : (
                                <><Send className="w-4 h-4 ml-2" /> שלח מייל</>
                            )}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}