
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { 
  Clock, 
  Coffee, 
  Utensils, 
  Plus,
  Minus
} from 'lucide-react';
import TimePicker from '../shared/TimePicker';

export default function ShiftEditDialog({ isOpen, onOpenChange, staffMember, onSave }) {
  const [editData, setEditData] = useState({
    start_time: '',
    end_time: '',
    had_meal: false,
    meal_details: '',
    breaks: [],
    notes: ''
  });

  useEffect(() => {
    if (staffMember) {
      setEditData({
        start_time: staffMember.start_time || '',
        end_time: staffMember.end_time || '',
        had_meal: staffMember.had_meal || false,
        meal_details: staffMember.meal_details || '',
        breaks: staffMember.breaks || [],
        notes: staffMember.notes || ''
      });
    }
  }, [staffMember]);

  const addBreak = () => {
    const newBreak = {
      break_start: '',
      break_end: '',
      duration_minutes: 0,
      notes: ''
    };
    setEditData({
      ...editData,
      breaks: [...editData.breaks, newBreak]
    });
  };

  const removeBreak = (index) => {
    const newBreaks = editData.breaks.filter((_, i) => i !== index);
    setEditData({ ...editData, breaks: newBreaks });
  };

  const updateBreak = (index, field, value) => {
    const newBreaks = [...editData.breaks];
    newBreaks[index] = { ...newBreaks[index], [field]: value };
    
    // Auto-calculate duration if both times are set
    if (field === 'break_start' || field === 'break_end') {
      const breakData = newBreaks[index];
      if (breakData.break_start && breakData.break_end) {
        const start = new Date(`2000-01-01T${breakData.break_start}:00`);
        let end = new Date(`2000-01-01T${breakData.break_end}:00`);
        if (end < start) { // Handle overnight break
            end.setDate(end.getDate() + 1);
        }
        const diffMinutes = (end - start) / (1000 * 60);
        newBreaks[index].duration_minutes = Math.max(0, Math.round(diffMinutes));
      }
    }
    
    setEditData({ ...editData, breaks: newBreaks });
  };

  const handleSave = () => {
    const updatedStaff = {
      ...staffMember,
      ...editData,
      total_break_minutes: editData.breaks.reduce((sum, brk) => sum + (Number(brk.duration_minutes) || 0), 0)
    };
    onSave(updatedStaff);
    onOpenChange(false);
  };

  const calculateShiftHours = () => {
    if (!editData.start_time || !editData.end_time) return 0;
    const start = new Date(`2000-01-01T${editData.start_time}:00`);
    let end = new Date(`2000-01-01T${editData.end_time}:00`);
    
    // Handle overnight shifts
    if (end < start) {
      end = new Date(`2000-01-02T${editData.end_time}:00`);
    }
    
    return (end - start) / (1000 * 60 * 60);
  };

  const totalBreakMinutes = editData.breaks.reduce((sum, brk) => sum + (Number(brk.duration_minutes) || 0), 0);
  const effectiveHours = calculateShiftHours() - (totalBreakMinutes / 60);

  if (!staffMember) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            עריכת שיבוץ - {staffMember.employee_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Working Hours */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5" />
              שעות עבודה
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_time">שעת כניסה</Label>
                <TimePicker
                  value={editData.start_time}
                  onChange={(value) => setEditData({ ...editData, start_time: value })}
                />
              </div>
              <div>
                <Label htmlFor="end_time">שעת יציאה</Label>
                <TimePicker
                  value={editData.end_time}
                  onChange={(value) => setEditData({ ...editData, end_time: value })}
                />
              </div>
            </div>
            
            {/* Hours Summary */}
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-sm text-gray-600">סך שעות</div>
                  <div className="font-bold">{calculateShiftHours().toFixed(1)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">הפסקות</div>
                  <div className="font-bold">{totalBreakMinutes} דק'</div>
                </div>
                <div>
                  <div className="text-sm text-gray-600">שעות אפקטיביות</div>
                  <div className="font-bold text-green-600">{Math.max(0, effectiveHours).toFixed(1)}</div>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Meal Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Utensils className="w-5 h-5" />
                ארוחה במשמרת
              </h3>
              <Switch
                checked={editData.had_meal}
                onCheckedChange={(checked) => setEditData({ ...editData, had_meal: checked })}
              />
            </div>
            
            {editData.had_meal && (
              <div>
                <Label htmlFor="meal_details">פרטי הארוחה</Label>
                <Input
                  id="meal_details"
                  value={editData.meal_details}
                  onChange={(e) => setEditData({ ...editData, meal_details: e.target.value })}
                  placeholder="מה אכל העובד?"
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Breaks Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Coffee className="w-5 h-5" />
                הפסקות ({editData.breaks.length})
              </h3>
              <Button onClick={addBreak} size="sm" variant="outline">
                <Plus className="w-4 h-4 ml-1" />
                הוסף הפסקה
              </Button>
            </div>

            {editData.breaks.map((breakItem, index) => (
              <div key={index} className="border p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">הפסקה #{index + 1}</Badge>
                  <Button onClick={() => removeBreak(index)} size="sm" variant="ghost">
                    <Minus className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>שעת יציאה להפסקה</Label>
                    <TimePicker
                      value={breakItem.break_start || ''}
                      onChange={(value) => updateBreak(index, 'break_start', value)}
                    />
                  </div>
                  <div>
                    <Label>שעת חזרה מהפסקה</Label>
                    <TimePicker
                      value={breakItem.break_end || ''}
                      onChange={(value) => updateBreak(index, 'break_end', value)}
                    />
                  </div>
                </div>
                
                <div>
                  <Label>משך ההפסקה (דקות)</Label>
                  <Input
                    type="number"
                    value={breakItem.duration_minutes || ''}
                    onChange={(e) => updateBreak(index, 'duration_minutes', parseInt(e.target.value, 10) || 0)}
                    placeholder="יחושב אוטומטית לפי השעות"
                  />
                </div>

                <div>
                  <Label>הערות להפסקה</Label>
                  <Input
                    value={breakItem.notes || ''}
                    onChange={(e) => updateBreak(index, 'notes', e.target.value)}
                    placeholder="למה יצא להפסקה? (אוכל, סיגריה, וכו')"
                  />
                </div>
              </div>
            ))}
            
            {editData.breaks.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                <Coffee className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>לא נרשמו הפסקות</p>
              </div>
            )}
          </div>

          <Separator />

          {/* Notes */}
          <div>
            <Label htmlFor="notes">הערות כלליות</Label>
            <Textarea
              id="notes"
              value={editData.notes}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              placeholder="הערות על המשמרת..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={handleSave}>
            שמור שינויים
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
