import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Download, Mail, Loader2, CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

function generateCSV(employees, hourlyData, tipData, monthLabel) {
    const rows = [];
    rows.push(['דוח שעות עבודה - ' + monthLabel]);
    rows.push([]);
    rows.push(['שם עובד', 'תאריך', 'משמרת', 'תפקיד', 'כניסה', 'יציאה', 'הפסקה (דקות)', 'שעות נטו', 'סוג']);

    employees.forEach(emp => {
        // שעות מסידור
        const empHourly = (hourlyData[emp.id] || []).sort((a, b) => a.date.localeCompare(b.date));
        empHourly.forEach(e => {
            rows.push([
                emp.full_name,
                e.date,
                e.shift_type === 'lunch' ? 'צהריים' : 'ערב',
                e.position,
                e.start_time,
                e.end_time,
                e.break_minutes || 0,
                e.net_hours.toFixed(2),
                'שעתי'
            ]);
        });

        // משמרות טיפים
        const empTips = (tipData[emp.id] || []).sort((a, b) => a.date.localeCompare(b.date));
        empTips.forEach(e => {
            rows.push([
                emp.full_name,
                e.date,
                e.shift_type === 'lunch' ? 'צהריים' : 'ערב',
                e.position || 'מלצר',
                '-',
                '-',
                '-',
                (e.effectiveHours || 0).toFixed(2),
                `טיפים - ₪${(e.totalEarnings || 0).toFixed(2)}`
            ]);
        });

        // שורת סיכום לעובד
        const totalH = empHourly.reduce((s, e) => s + e.net_hours, 0);
        const totalT = empTips.reduce((s, e) => s + (e.effectiveHours || 0), 0);
        const totalTips = empTips.reduce((s, e) => s + (e.totalEarnings || 0), 0);
        if (empHourly.length > 0 || empTips.length > 0) {
            rows.push([
                `סה"כ - ${emp.full_name}`,
                '', '', '', '', '',
                '',
                (totalH + totalT).toFixed(2),
                totalTips > 0 ? `טיפים: ₪${totalTips.toFixed(2)}` : ''
            ]);
            rows.push([]);
        }
    });

    return rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export default function ExportToAccountantDialog({ open, onClose, employees, selectedEmployees, hourlyData, tipData, monthLabel }) {
    const [sendEmail, setSendEmail] = useState(false);
    const [accountantEmail, setAccountantEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleDownload = () => {
        const empsToExport = employees.filter(e => selectedEmployees.includes(e.id));
        const csv = generateCSV(empsToExport, hourlyData, tipData, monthLabel);
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `שעות_עובדים_${monthLabel.replace(' ', '_')}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const handleSendEmail = async () => {
        if (!accountantEmail) return;
        setSending(true);
        const empsToExport = employees.filter(e => selectedEmployees.includes(e.id));
        const csv = generateCSV(empsToExport, hourlyData, tipData, monthLabel);
        const empNames = empsToExport.map(e => e.full_name).join(', ');

        // Build HTML table for email body
        const rows = csv.split('\n').slice(2).map(r =>
            r.split(',').map(c => c.replace(/^"|"$/g, '')).join(' | ')
        ).join('\n');

        await base44.integrations.Core.SendEmail({
            to: accountantEmail,
            subject: `דוח שעות עובדים - ${monthLabel}`,
            body: `שלום,\n\nמצורף דוח שעות עבודה לחודש ${monthLabel}.\n\nעובדים: ${empNames}\n\n${rows}\n\n---\nנשלח ממערכת TOP ALENA`
        });

        setSending(false);
        setSent(true);
        setTimeout(() => { setSent(false); onClose(); }, 2000);
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-lg" dir="rtl">
                <DialogHeader>
                    <DialogTitle>ייצוא דוח לרואה חשבון</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <p className="text-sm text-blue-800 font-medium">
                            חודש: {monthLabel} | {employees.filter(e => selectedEmployees.includes(e.id)).length} עובדים
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                            {employees.filter(e => selectedEmployees.includes(e.id)).map(e => (
                                <Badge key={e.id} className="text-xs bg-blue-100 text-blue-700">{e.full_name}</Badge>
                            ))}
                        </div>
                    </div>

                    <Button onClick={handleDownload} className="w-full flex items-center gap-2 bg-green-600 hover:bg-green-700">
                        <Download className="w-4 h-4" />
                        הורד קובץ CSV (Excel)
                    </Button>

                    <div className="border-t pt-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Checkbox
                                id="sendEmail"
                                checked={sendEmail}
                                onCheckedChange={setSendEmail}
                            />
                            <Label htmlFor="sendEmail" className="cursor-pointer">שלח ישירות למייל רואה החשבון</Label>
                        </div>

                        {sendEmail && (
                            <div className="space-y-3">
                                <Input
                                    type="email"
                                    placeholder="כתובת מייל רואה חשבון"
                                    value={accountantEmail}
                                    onChange={e => setAccountantEmail(e.target.value)}
                                    dir="ltr"
                                />
                                <Button
                                    onClick={handleSendEmail}
                                    disabled={!accountantEmail || sending || sent}
                                    className="w-full flex items-center gap-2"
                                >
                                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : sent ? <CheckCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                                    {sending ? 'שולח...' : sent ? 'נשלח בהצלחה!' : 'שלח למייל'}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}