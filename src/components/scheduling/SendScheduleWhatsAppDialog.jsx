import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { MessageCircle, Copy, Check } from 'lucide-react';

const DINNER_POSITIONS_ORDER = [
    'מנהל משמרת', 'ברמן', 'מלצר', 'ראנר', 'מארח/ת', 'מתלמד פלור',
    'טבח', 'צאקר', 'גריל', 'פס בטטה', 'מקשר', 'מתלמד מטבח', 'שוטף כלים', 'בלתם'
];
const LUNCH_POSITIONS_ORDER = ['קופה + אריזות', 'מלצר', 'טבח', 'מתלמד פלור', 'בלתם'];

function buildMessage(shift, selectedDay, shiftType) {
    if (!shift || !shift.assigned_staff?.length) return null;

    const dayStr = format(selectedDay, 'EEEE dd/MM', { locale: he });
    const shiftLabel = shiftType === 'lunch' ? '🌞 משמרת צהריים' : '🌙 משמרת ערב';
    const posOrder = shiftType === 'lunch' ? LUNCH_POSITIONS_ORDER : DINNER_POSITIONS_ORDER;

    // Group staff by position
    const byPosition = {};
    for (const a of shift.assigned_staff) {
        if (!byPosition[a.position]) byPosition[a.position] = [];
        byPosition[a.position].push(a);
    }

    // Build ordered sections
    const orderedPositions = posOrder.filter(p => byPosition[p]);
    // Add any leftover positions not in the order
    const extras = Object.keys(byPosition).filter(p => !posOrder.includes(p));
    const allPositions = [...orderedPositions, ...extras];

    let msg = `📅 סידור עבודה - ${dayStr}\n${shiftLabel}\n`;
    msg += `${'─'.repeat(25)}\n`;

    for (const pos of allPositions) {
        const staff = byPosition[pos];
        if (!staff?.length) continue;
        msg += `\n*${pos}:*\n`;
        for (const a of staff) {
            msg += `• ${a.employee_name}`;
            if (a.start_time && a.end_time) msg += ` (${a.start_time}-${a.end_time})`;
            msg += '\n';
        }
    }

    msg += `\n${'─'.repeat(25)}\n`;
    msg += `✅ סה"כ ${shift.assigned_staff.length} עובדים`;

    return msg;
}

export default function SendScheduleWhatsAppDialog({ open, onClose, week, days }) {
    const [selectedDate, setSelectedDate] = useState('');
    const [shiftType, setShiftType] = useState('dinner');
    const [copied, setCopied] = useState(false);

    const selectedDay = selectedDate ? new Date(selectedDate + 'T12:00:00') : null;
    const shift = selectedDay
        ? week.find(s => s.date === selectedDate && s.shift_type === shiftType)
        : null;

    const message = selectedDay && shift ? buildMessage(shift, selectedDay, shiftType) : null;

    const handleCopy = () => {
        if (!message) return;
        navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSendWhatsApp = () => {
        if (!message) return;
        const encoded = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent dir="rtl" className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-green-700">
                        <MessageCircle className="w-5 h-5" />
                        שלח סידור עבודה לוואטסאפ
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div>
                        <Label className="mb-1 block">בחר יום</Label>
                        <Select value={selectedDate} onValueChange={setSelectedDate}>
                            <SelectTrigger>
                                <SelectValue placeholder="בחר יום..." />
                            </SelectTrigger>
                            <SelectContent>
                                {days.map(d => (
                                    <SelectItem key={format(d, 'yyyy-MM-dd')} value={format(d, 'yyyy-MM-dd')}>
                                        {format(d, 'EEEE dd/MM', { locale: he })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <Label className="mb-1 block">סוג משמרת</Label>
                        <div className="flex gap-2">
                            <Button
                                variant={shiftType === 'lunch' ? 'default' : 'outline'}
                                onClick={() => setShiftType('lunch')}
                                className="flex-1"
                            >
                                🌞 צהריים
                            </Button>
                            <Button
                                variant={shiftType === 'dinner' ? 'default' : 'outline'}
                                onClick={() => setShiftType('dinner')}
                                className="flex-1"
                            >
                                🌙 ערב
                            </Button>
                        </div>
                    </div>

                    {selectedDate && !shift && (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            ⚠️ אין משמרת מוגדרת ליום ולסוג שנבחרו
                        </p>
                    )}

                    {message && (
                        <div className="bg-gray-50 border rounded-lg p-3 max-h-64 overflow-y-auto">
                            <pre className="text-sm whitespace-pre-wrap font-sans text-right">{message}</pre>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex gap-2">
                    <Button variant="outline" onClick={onClose}>סגור</Button>
                    {message && (
                        <>
                            <Button variant="outline" onClick={handleCopy}>
                                {copied ? <Check className="w-4 h-4 ml-1 text-green-600" /> : <Copy className="w-4 h-4 ml-1" />}
                                {copied ? 'הועתק!' : 'העתק טקסט'}
                            </Button>
                            <Button onClick={handleSendWhatsApp} className="bg-green-600 hover:bg-green-700 text-white">
                                <MessageCircle className="w-4 h-4 ml-2" />
                                שלח בוואטסאפ
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}