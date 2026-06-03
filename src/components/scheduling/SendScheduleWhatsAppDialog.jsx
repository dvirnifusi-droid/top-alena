import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { MessageCircle, Copy, Check, Clock, Lock, Star, Save } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const DINNER_POSITIONS_ORDER = [
    'מנהל משמרת', 'ברמן', 'מלצר', 'ראנר', 'מארח/ת', 'מתלמד פלור',
    'טבח', 'צאקר', 'גריל', 'פס בטטה', 'מקשר', 'מתלמד מטבח', 'שוטף כלים', 'בלתם'
];
const LUNCH_POSITIONS_ORDER = ['קופה + אריזות', 'מלצר', 'טבח', 'מתלמד פלור', 'בלתם'];

// parse "HH:mm" or "HH:mm:ss" → minutes since midnight (handles overnight: times < 06:00 treated as next day)
function timeToMinutes(t) {
    if (!t) return 9999;
    const parts = t.split(':');
    const h = parseInt(parts[0]) || 0;
    const m = parseInt(parts[1]) || 0;
    const total = h * 60 + m;
    // treat times before 6am as "next day" (e.g. 01:00 = 25:00)
    return total < 360 ? total + 1440 : total;
}

function buildMessage(shift, selectedDay, shiftType, staffOverrides) {
    if (!shift || !shift.assigned_staff?.length) return null;

    const dayStr = format(selectedDay, 'EEEE dd/MM', { locale: he });
    const shiftLabel = shiftType === 'lunch' ? '🌞 משמרת צהריים' : '🌙 משמרת ערב';
    const posOrder = shiftType === 'lunch' ? LUNCH_POSITIONS_ORDER : DINNER_POSITIONS_ORDER;

    const byPosition = {};
    for (const a of shift.assigned_staff) {
        if (!byPosition[a.position]) byPosition[a.position] = [];
        byPosition[a.position].push(a);
    }

    const orderedPositions = posOrder.filter(p => byPosition[p]);
    const extras = Object.keys(byPosition).filter(p => !posOrder.includes(p));
    const allPositions = [...orderedPositions, ...extras];

    let msg = `📅 סידור עבודה - ${dayStr}\n${shiftLabel}\n`;
    msg += `${'─'.repeat(25)}\n`;

    for (const pos of allPositions) {
        const staffList = byPosition[pos];
        if (!staffList?.length) continue;

        // sort by start_time (override first, then original)
        const sorted = [...staffList].sort((a, b) => {
            const overrideA = staffOverrides[a.employee_id]?.start_time;
            const overrideB = staffOverrides[b.employee_id]?.start_time;
            const tA = timeToMinutes(overrideA || a.start_time);
            const tB = timeToMinutes(overrideB || b.start_time);
            return tA - tB;
        });

        msg += `\n*${pos}:*\n`;
        for (const a of sorted) {
            const ov = staffOverrides[a.employee_id] || {};
            const displayTime = ov.start_time || a.start_time;
            const tags = [];
            if (ov.isClosing) tags.push('🔒סגירה');
            if (ov.isPromoter) tags.push('⭐מקדם');
            const tagStr = tags.length ? ` [${tags.join(' | ')}]` : '';
            const timeStr = displayTime ? ` (${displayTime.slice(0,5)})` : '';
            msg += `• ${a.employee_name}${timeStr}${tagStr}\n`;
        }
    }

    msg += `\n${'─'.repeat(25)}\n`;
    msg += `✅ סה"כ ${shift.assigned_staff.length} עובדים`;

    return msg;
}

export default function SendScheduleWhatsAppDialog({ open, onClose, week, days, availabilities = [], onSaved }) {
    const [selectedDate, setSelectedDate] = useState('');
    const [shiftType, setShiftType] = useState('dinner');
    const [copied, setCopied] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    // staffOverrides: { [employee_id]: { start_time, isClosing, isPromoter } }
    const [staffOverrides, setStaffOverrides] = useState({});

    const selectedDay = selectedDate ? new Date(selectedDate + 'T12:00:00') : null;
    const shift = selectedDay
        ? week.find(s => s.date === selectedDate && s.shift_type === shiftType)
        : null;

    // reset overrides when shift changes, but pre-fill with existing start_time
    useEffect(() => {
        if (!shift) { setStaffOverrides({}); return; }
        const init = {};
        for (const a of shift.assigned_staff || []) {
            init[a.employee_id] = {
                start_time: a.start_time || '',
                isClosing: false,
                isPromoter: false,
            };
        }
        setStaffOverrides(init);
    }, [shift?.id, selectedDate, shiftType]);

    const setOverride = (empId, field, value) => {
        setStaffOverrides(prev => ({
            ...prev,
            [empId]: { ...prev[empId], [field]: value }
        }));
    };

    const message = selectedDay && shift ? buildMessage(shift, selectedDay, shiftType, staffOverrides) : null;

    const handleCopy = () => {
        if (!message) return;
        navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Persist edited start_times back to the WorkShift row so they sync with the
    // schedule grid and NextShiftCountdown widget. Only updates entries whose
    // start_time actually changed; closing/promoter flags stay dialog-local.
    const persistOverrides = async () => {
        if (!shift) return false;
        const updatedStaff = (shift.assigned_staff || []).map(a => {
            const ov = staffOverrides[a.employee_id];
            if (!ov) return a;
            const newStart = (ov.start_time || '').slice(0, 5);
            const oldStart = (a.start_time || '').slice(0, 5);
            if (!newStart || newStart === oldStart) return a;
            return { ...a, start_time: newStart };
        });
        const changed = updatedStaff.some((a, i) => a.start_time !== shift.assigned_staff[i].start_time);
        if (!changed) return true;
        try {
            setSaving(true);
            await base44.entities.WorkShift.update(shift.id, { assigned_staff: updatedStaff });
            if (onSaved) await onSaved();
            return true;
        } catch (e) {
            console.error('Failed to persist schedule overrides', e);
            alert('שגיאה בשמירת שעות הכניסה. נסה שוב.');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleSaveOnly = async () => {
        const ok = await persistOverrides();
        if (ok) {
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 2000);
        }
    };

    const handleSendWhatsApp = async () => {
        if (!message) return;
        const ok = await persistOverrides();
        if (!ok) return;
        const encoded = encodeURIComponent(message);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
    };

    // get sorted staff for display (same sort as message)
    const sortedStaffForDisplay = shift
        ? [...(shift.assigned_staff || [])].sort((a, b) => {
            const tA = timeToMinutes((staffOverrides[a.employee_id]?.start_time) || a.start_time);
            const tB = timeToMinutes((staffOverrides[b.employee_id]?.start_time) || b.start_time);
            return tA - tB;
        })
        : [];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent dir="rtl" className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-green-700">
                        <MessageCircle className="w-5 h-5" />
                        שלח סידור עבודה לוואטסאפ
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="grid grid-cols-2 gap-3">
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
                                    className="flex-1 text-sm"
                                    size="sm"
                                >
                                    🌞 צהריים
                                </Button>
                                <Button
                                    variant={shiftType === 'dinner' ? 'default' : 'outline'}
                                    onClick={() => setShiftType('dinner')}
                                    className="flex-1 text-sm"
                                    size="sm"
                                >
                                    🌙 ערב
                                </Button>
                            </div>
                        </div>
                    </div>

                    {selectedDate && !shift && (
                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            ⚠️ אין משמרת מוגדרת ליום ולסוג שנבחרו
                        </p>
                    )}

                    {shift && sortedStaffForDisplay.length > 0 && (
                        <div>
                            <Label className="mb-2 block font-semibold text-gray-700">
                                עובדים — ערוך שעות וסמן תפקידים
                            </Label>
                            <p className="text-xs text-gray-500 mb-2">הרשימה תמוין לפי שעת כניסה (מוקדם למעלה)</p>
                            <div className="border rounded-lg overflow-hidden">
                                <div className="grid grid-cols-[1fr_110px_90px_90px] gap-0 bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 border-b">
                                    <span>שם עובד</span>
                                    <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> שעת כניסה</span>
                                    <span className="flex items-center gap-1 justify-center"><Lock className="w-3 h-3"/> סגירה</span>
                                    <span className="flex items-center gap-1 justify-center"><Star className="w-3 h-3"/> מקדם</span>
                                </div>
                                <div className="divide-y max-h-52 overflow-y-auto">
                                    {sortedStaffForDisplay.map((a) => {
                                        const ov = staffOverrides[a.employee_id] || {};
                                        return (
                                            <div key={a.employee_id} className={`grid grid-cols-[1fr_110px_90px_90px] gap-0 px-3 py-2 items-center text-sm
                                                ${ov.isClosing && ov.isPromoter ? 'bg-amber-50' : ov.isClosing ? 'bg-orange-50' : ov.isPromoter ? 'bg-yellow-50' : ''}`}>
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <span className="font-medium truncate">{a.employee_name}
                                                        <span className="text-xs text-gray-400 mr-1">({a.position})</span>
                                                    </span>
                                                    {a.notes && (
                                                        <span className="text-[10px] text-orange-700 bg-orange-50 border border-orange-200 rounded px-1 py-0.5 leading-tight whitespace-normal break-words block">
                                                            📝 {a.notes}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                   <Input
                                                       type="time"
                                                       value={ov.start_time || ''}
                                                       onChange={e => setOverride(a.employee_id, 'start_time', e.target.value)}
                                                       className="h-7 text-xs px-1 w-24"
                                                   />
                                                   {(() => {
                                                       const note = availabilities.find(av => av.employee_id === a.employee_id && av.date === selectedDate)?.reason;
                                                       return note ? (
                                                           <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 leading-tight whitespace-normal break-words max-w-[160px] block">
                                                               💬 {note}
                                                           </span>
                                                       ) : null;
                                                   })()}
                                                </div>
                                                <div className="flex justify-center">
                                                    <button
                                                        onClick={() => setOverride(a.employee_id, 'isClosing', !ov.isClosing)}
                                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-semibold transition-colors
                                                            ${ov.isClosing
                                                                ? 'bg-orange-500 border-orange-600 text-white'
                                                                : 'border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-500'}`}
                                                    >
                                                        🔒 סגירה
                                                    </button>
                                                </div>
                                                <div className="flex justify-center">
                                                    <button
                                                        onClick={() => setOverride(a.employee_id, 'isPromoter', !ov.isPromoter)}
                                                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs font-semibold transition-colors
                                                            ${ov.isPromoter
                                                                ? 'bg-yellow-400 border-yellow-500 text-white'
                                                                : 'border-gray-300 text-gray-500 hover:border-yellow-400 hover:text-yellow-600'}`}
                                                    >
                                                        ⭐ מקדם
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {message && (
                        <div className="bg-gray-50 border rounded-lg p-3 max-h-48 overflow-y-auto">
                            <p className="text-xs text-gray-500 mb-1">תצוגה מקדימה:</p>
                            <pre className="text-sm whitespace-pre-wrap font-sans text-right">{message}</pre>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={onClose} disabled={saving}>סגור</Button>
                    {message && (
                        <>
                            <Button variant="outline" onClick={handleCopy} disabled={saving}>
                                {copied ? <Check className="w-4 h-4 ml-1 text-green-600" /> : <Copy className="w-4 h-4 ml-1" />}
                                {copied ? 'הועתק!' : 'העתק'}
                            </Button>
                            <Button variant="outline" onClick={handleSaveOnly} disabled={saving} className="border-blue-300 text-blue-700 hover:bg-blue-50">
                                {savedFlash ? <Check className="w-4 h-4 ml-1 text-green-600" /> : <Save className="w-4 h-4 ml-1" />}
                                {savedFlash ? 'נשמר!' : 'שמור שעות בסידור'}
                            </Button>
                            <Button onClick={handleSendWhatsApp} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                                <MessageCircle className="w-4 h-4 ml-2" />
                                {saving ? 'שומר...' : 'שמור ושלח בוואטסאפ'}
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}