import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Clock, Utensils, Coffee, Plus, Trash2, Save, X, Briefcase, MoveRight } from 'lucide-react';
import TimePicker from '../shared/TimePicker';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Constants for position filtering
const EXCLUDED_LUNCH_POSITIONS = ['ברמן', 'מארחת', 'מנהל מטבח', 'מנהלת משמרת', 'מנהל פלור', 'ראנר', 'שוטף כלים'];
const EXCLUDED_DINNER_POSITIONS = ['מנהל פלור', 'מנהל מטבח', 'קופה +אריזות'];

const filterPositionsByShiftType = (positions, shiftType) => {
    if (!positions) return [];
    const excludedPositions = shiftType === 'lunch' ? EXCLUDED_LUNCH_POSITIONS : EXCLUDED_DINNER_POSITIONS;
    return positions.filter(position => !excludedPositions.includes(position.position_name));
};


export default function AssignmentEditDialog({ isOpen, onOpenChange, assignment, onSave, onDelete, positions, onMoveShift }) {
  const [editData, setEditData] = useState(null);
  const [showMoveDate, setShowMoveDate] = useState(false);
  const [moveDate, setMoveDate] = useState('');

  useEffect(() => {
    if (assignment) {
      setEditData({
        ...assignment,
        breaks: assignment.breaks || [],
        notes: assignment.notes || '',
        had_meal: assignment.had_meal || false,
        meal_details: assignment.meal_details || ''
      });
    } else {
      setEditData(null);
    }
  }, [assignment]);

  const updateBreak = (index, field, value) => {
    setEditData(prev => {
      const newBreaks = [...prev.breaks];
      newBreaks[index] = { ...newBreaks[index], [field]: value };
      return { ...prev, breaks: newBreaks };
    });
  };

  const addBreak = () => {
    setEditData(prev => ({
      ...prev,
      breaks: [...prev.breaks, { break_start: '', break_end: '', notes: '' }]
    }));
  };

  const removeBreak = (index) => {
    setEditData(prev => ({
      ...prev,
      breaks: prev.breaks.filter((_, i) => i !== index)
    }));
  };

  const handleSave = () => {
    if (!editData) return;

    // Calculate break durations and total
    let totalBreakMinutes = 0;
    const processedBreaks = editData.breaks.map(brk => {
        let duration = 0;
        if (brk.break_start && brk.break_end) {
            const start = new Date(`1970-01-01T${brk.break_start}`);
            const end = new Date(`1970-01-01T${brk.break_end}`);
            if (end < start) end.setDate(end.getDate() + 1);
            duration = Math.round((end - start) / (1000 * 60));
        }
        totalBreakMinutes += duration;
        return { ...brk, duration_minutes: duration };
    });

    onSave({ 
        ...editData, 
        breaks: processedBreaks,
        total_break_minutes: totalBreakMinutes
    });
    onOpenChange(false);
  };

  const handleDeleteConfirm = () => {
      if(window.confirm('האם אתה בטוח שברצונך למחוק שיבוץ זה?')) {
          onDelete(editData);
          onOpenChange(false);
      }
  }

  if (!isOpen || !editData) return null;
  
  const filteredPositions = filterPositionsByShiftType(positions, editData.shift_type);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת שיבוץ - {editData.employee_name}</DialogTitle>
          <DialogDescription>
            {format(new Date(editData.date), 'EEEE, dd/MM/yyyy', { locale: he })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {/* תפקיד */}
          <div className="space-y-2">
            <Label htmlFor="position" className="font-semibold flex items-center gap-2"><Briefcase className="w-4 h-4"/>תפקיד</Label>
             <Select value={editData.position} onValueChange={val => setEditData({...editData, position: val})}>
                <SelectTrigger>
                    <SelectValue placeholder="בחר תפקיד" />
                </SelectTrigger>
                <SelectContent>
                    {filteredPositions.map(pos => (
                        <SelectItem key={pos.id} value={pos.position_name}>
                            {pos.position_name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>

          {/* שעות עבודה */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4"/>שעות עבודה</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_time">שעת התחלה</Label>
                <TimePicker value={editData.start_time} onChange={val => setEditData({...editData, start_time: val})} />
              </div>
              <div>
                <Label htmlFor="end_time">שעת סיום</Label>
                <TimePicker value={editData.end_time} onChange={val => setEditData({...editData, end_time: val})} />
              </div>
            </div>
          </div>
          
          {/* ארוחה */}
          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><Utensils className="w-4 h-4"/>ארוחה</h3>
                <Switch checked={editData.had_meal} onCheckedChange={val => setEditData({...editData, had_meal: val})} />
            </div>
            {editData.had_meal && (
              <div>
                <Label>פרטי ארוחה</Label>
                <Input value={editData.meal_details} onChange={e => setEditData({...editData, meal_details: e.target.value})} placeholder="מה העובד אכל?"/>
              </div>
            )}
          </div>

          {/* הפסקות */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2"><Coffee className="w-4 h-4"/>הפסקות</h3>
              <Button size="sm" variant="outline" onClick={addBreak}><Plus className="w-4 h-4 ml-1"/>הוסף הפסקה</Button>
            </div>
            {editData.breaks.map((brk, index) => (
              <div key={index} className="border p-3 rounded-lg space-y-3 relative">
                 <div className="flex items-center justify-between">
                    <Label>הפסקה #{index + 1}</Label>
                    <Button variant="ghost" size="icon" className="absolute top-1 left-1 h-7 w-7" onClick={() => removeBreak(index)}><Trash2 className="w-4 h-4 text-red-500"/></Button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>התחלה</Label>
                    <TimePicker value={brk.break_start || ''} onChange={val => updateBreak(index, 'break_start', val)} />
                  </div>
                  <div>
                    <Label>סיום</Label>
                    <TimePicker value={brk.break_end || ''} onChange={val => updateBreak(index, 'break_end', val)} />
                  </div>
                </div>
                <div>
                    <Label>הערות</Label>
                    <Input value={brk.notes || ''} onChange={e => updateBreak(index, 'notes', e.target.value)} placeholder="סיבת הפסקה..."/>
                </div>
              </div>
            ))}
          </div>

          {/* הערות */}
          <div>
            <Label>הערות כלליות</Label>
            <Textarea value={editData.notes} onChange={e => setEditData({...editData, notes: e.target.value})} placeholder="הערות למשמרת..." />
          </div>
        </div>
        {showMoveDate && (
          <div className="border rounded-lg p-3 bg-blue-50 space-y-2 mx-1 mb-2">
            <label className="text-sm font-medium block">בחר תאריך חדש למשמרת</label>
            <div className="flex gap-2 items-center">
              <Input type="date" value={moveDate} onChange={e => setMoveDate(e.target.value)} className="flex-1" />
              <Button size="sm" disabled={!moveDate} onClick={() => { onMoveShift && onMoveShift(editData, moveDate); setShowMoveDate(false); setMoveDate(''); onOpenChange(false); }}>
                אישור
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowMoveDate(false); setMoveDate(''); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
        <DialogFooter className="justify-between flex-row gap-1">
            <Button size="sm" variant="destructive" onClick={handleDeleteConfirm}><Trash2 className="w-3.5 h-3.5 ml-1"/>מחק שיבוץ</Button>
            <div className="flex gap-1">
                {onMoveShift && (
                  <Button size="sm" variant="outline" className="border-blue-300 text-blue-600 hover:bg-blue-50 px-2" onClick={() => setShowMoveDate(v => !v)}>
                    <MoveRight className="w-3.5 h-3.5 ml-1"/>העבר תאריך
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}><X className="w-3.5 h-3.5 ml-1"/>ביטול</Button>
                <Button size="sm" onClick={handleSave}><Save className="w-3.5 h-3.5 ml-1"/>שמור</Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}