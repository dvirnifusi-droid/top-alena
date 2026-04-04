import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Download, Mail, Loader2, CheckCircle, Search, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

const TIP_POSITIONS_EXPORT = ['מלצר', 'ברמן', 'ראנר'];

function calcOTBreakdown(h) {
    const regular = Math.min(h, 8);
    const h125 = h > 8 ? Math.min(h - 8, 2) : 0;
    const h150 = h > 10 ? h - 10 : 0;
    return { regular, h125, h150 };
}

function generateCSV(employees, hourlyData, tipData, monthLabel) {
    const rows = [];

    // --- סיכום כללי לפי תפקיד ---
    const posSummary = {};
    employees.forEach(emp => {
        (hourlyData[emp.id] || []).forEach(e => {
            const pos = e.position || 'לא מוגדר';
            if (!posSummary[pos]) posSummary[pos] = { hours: 0, regular: 0, h125: 0, h150: 0, tipEarnings: 0, isTip: false, empSet: new Set() };
            const { regular, h125, h150 } = calcOTBreakdown(e.net_hours);
            posSummary[pos].hours += e.net_hours;
            posSummary[pos].regular += regular;
            posSummary[pos].h125 += h125;
            posSummary[pos].h150 += h150;
            posSummary[pos].empSet.add(emp.id);
        });
        (tipData[emp.id] || []).forEach(e => {
            const pos = e.position || 'מלצר';
            if (!posSummary[pos]) posSummary[pos] = { hours: 0, regular: 0, h125: 0, h150: 0, tipEarnings: 0, isTip: true, empSet: new Set() };
            posSummary[pos].hours += e.effectiveHours || 0;
            posSummary[pos].tipEarnings += e.totalEarnings || 0;
            posSummary[pos].isTip = true;
            posSummary[pos].empSet.add(emp.id);
        });
    });

    rows.push(['סיכום כללי לפי תפקיד - ' + monthLabel]);
    rows.push(['תפקיד', 'עובדים', 'סה"כ שעות', 'רגילות (100%)', '125%', '150%', 'סה"כ טיפים']);
    Object.entries(posSummary).forEach(([pos, s]) => {
        rows.push([
            pos,
            s.empSet.size,
            s.hours.toFixed(2),
            s.isTip ? '-' : s.regular.toFixed(2),
            s.isTip ? '-' : s.h125.toFixed(2),
            s.isTip ? '-' : s.h150.toFixed(2),
            s.isTip ? `₪${s.tipEarnings.toFixed(2)}` : '-',
        ]);
    });
    rows.push([]);
    rows.push([]);

    // --- פירוט לפי עובד ---
    rows.push(['דוח שעות עבודה - ' + monthLabel]);
    rows.push([]);
    rows.push(['שם עובד', 'תאריך', 'משמרת', 'תפקיד', 'כניסה', 'יציאה', 'הפסקה (דקות)', 'שעות נטו', 'סוג']);
}

export default function ExportToAccountantDialog({ open, onClose, employees, selectedEmployees: initSelected, hourlyData, tipData, monthLabel }) {
    const [selectedEmps, setSelectedEmps] = useState(initSelected || []);
    const [sendEmail, setSendEmail] = useState(false);
    const [accountantEmail, setAccountantEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [search, setSearch] = useState('');
    const [deptFilter, setDeptFilter] = useState('all');

    React.useEffect(() => { setSelectedEmps(initSelected || []); setSearch(''); setDeptFilter('all'); }, [open]);

    const toggleEmp = (id) => setSelectedEmps(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

    const filteredEmployees = employees.filter(emp => {
        const matchSearch = !search || emp.full_name?.toLowerCase().includes(search.toLowerCase());
        const matchDept = deptFilter === 'all' || emp.department === deptFilter;
        return matchSearch && matchDept;
    });

    const handleDownload = () => {
        const empsToExport = employees.filter(e => selectedEmps.includes(e.id));
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
        const empsToExport = employees.filter(e => selectedEmps.includes(e.id));
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
                    <div className="border rounded-lg p-3 bg-slate-50">
                        <p className="text-sm font-medium text-slate-700 mb-2">בחר עובדים לייצוא - {monthLabel}</p>

                        {/* פילטרים */}
                        <div className="flex gap-2 mb-2">
                            <div className="relative flex-1">
                                <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="חיפוש לפי שם..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full pr-7 pl-2 py-1 text-xs border rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
                                />
                                {search && <button onClick={() => setSearch('')} className="absolute left-1 top-1/2 -translate-y-1/2"><X className="w-3 h-3 text-slate-400" /></button>}
                            </div>
                            <select
                                value={deptFilter}
                                onChange={e => setDeptFilter(e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-white focus:outline-none"
                            >
                                <option value="all">כל המחלקות</option>
                                <option value="floor">פלור</option>
                                <option value="kitchen">מטבח</option>
                            </select>
                        </div>

                        {/* בחר הכל / נקה הכל */}
                        <div className="flex gap-3 mb-2">
                            <button className="text-xs text-blue-600 underline" onClick={() => setSelectedEmps(filteredEmployees.map(e => e.id))}>בחר הכל</button>
                            <button className="text-xs text-slate-500 underline" onClick={() => setSelectedEmps([])}>נקה הכל</button>
                        </div>

                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {filteredEmployees.map(emp => (
                                <div key={emp.id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`emp-${emp.id}`}
                                        checked={selectedEmps.includes(emp.id)}
                                        onCheckedChange={() => toggleEmp(emp.id)}
                                    />
                                    <label htmlFor={`emp-${emp.id}`} className="text-sm cursor-pointer">{emp.full_name}</label>
                                </div>
                            ))}
                            {filteredEmployees.length === 0 && <p className="text-xs text-slate-400 text-center py-2">לא נמצאו עובדים</p>}
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