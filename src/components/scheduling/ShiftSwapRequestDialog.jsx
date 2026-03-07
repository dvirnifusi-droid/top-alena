import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { ArrowLeftRight, Loader2, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { sendWhatsApp } from '@/functions/sendWhatsApp';

export default function ShiftSwapRequestDialog({ open, onClose, myShift, employees, currentEmployee, managerPhone }) {
    const [targetEmployeeId, setTargetEmployeeId] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const otherEmployees = employees.filter(e => e.id !== currentEmployee?.id && e.status === 'active');

    const handleSubmit = async () => {
        if (!targetEmployeeId || !myShift) return;
        setLoading(true);
        const target = employees.find(e => e.id === targetEmployeeId);

        await base44.entities.ShiftSwapRequest.create({
            requester_employee_id: currentEmployee.id,
            requester_name: currentEmployee.full_name,
            target_employee_id: targetEmployeeId,
            target_name: target?.full_name || '',
            shift_date: myShift.date,
            shift_type: myShift.shift_type,
            position: myShift.position,
            start_time: myShift.start_time,
            end_time: myShift.end_time,
            message,
            status: 'pending'
        });

        // Send WhatsApp to manager if phone configured
        if (managerPhone) {
            const shiftDateFormatted = format(new Date(myShift.date), 'EEEE dd/MM/yyyy', { locale: he });
            const shiftTypeHe = myShift.shift_type === 'lunch' ? 'צהריים' : 'ערב';
            const msgText = `🔄 *בקשת החלפת משמרת*\n\n👤 ${currentEmployee.full_name} מבקש להחליף עם ${target?.full_name || ''}\n📅 ${shiftDateFormatted} - ${shiftTypeHe}\n💼 תפקיד: ${myShift.position}${message ? `\n💬 הערה: "${message}"` : ''}\n\nאנא אשר או דחה את הבקשה במערכת.`;
            try {
                await sendWhatsApp({ to: managerPhone, message: msgText });
            } catch (e) {
                console.warn('WhatsApp send failed:', e.message);
            }
        }

        setLoading(false);
        setSent(true);
        setTimeout(() => { setSent(false); setTargetEmployeeId(''); setMessage(''); onClose(); }, 1800);
    };

    const shiftLabel = myShift ? `${format(new Date(myShift.date), 'EEEE dd/MM', { locale: he })} - ${myShift.shift_type === 'lunch' ? 'צהריים' : 'ערב'} (${myShift.position})` : '';

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent dir="rtl" className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                        בקשת החלפת משמרת
                    </DialogTitle>
                </DialogHeader>
                {sent ? (
                    <div className="py-8 text-center text-green-600 font-bold text-lg">✅ הבקשה נשלחה למנהל!</div>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
                            <span className="font-bold">משמרת לבקשת החלפה: </span>{shiftLabel}
                        </div>
                        <div>
                            <Label className="mb-1 block">בחר עובד להחלפה עם</Label>
                            <Select value={targetEmployeeId} onValueChange={setTargetEmployeeId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="בחר עובד..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {otherEmployees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label className="mb-1 block">הערה (אופציונלי)</Label>
                            <Textarea
                                placeholder="לדוגמה: צריך להחליף בגלל..."
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                rows={2}
                            />
                        </div>
                    </div>
                )}
                {!sent && (
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={onClose}>ביטול</Button>
                        <Button onClick={handleSubmit} disabled={!targetEmployeeId || loading}>
                            {loading ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <ArrowLeftRight className="w-4 h-4 ml-2" />}
                            שלח בקשה למנהל
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}