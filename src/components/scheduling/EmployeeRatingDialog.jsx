import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Star } from 'lucide-react';

const RATING_LABELS = {
  1: { label: '⭐ רמה 1 - מתחיל', desc: 'עובד בסיסי, צריך הדרכה' },
  2: { label: '⭐⭐ רמה 2 - מתפתח', desc: 'מסתדר בתפקיד אחד' },
  3: { label: '⭐⭐⭐ רמה 3 - טוב', desc: 'עובד אמין ועצמאי' },
  4: { label: '⭐⭐⭐⭐ רמה 4 - מצוין', desc: 'יודע בר + משלוחים + מלצר מצוין' },
  5: { label: '⭐⭐⭐⭐⭐ רמה 5 - על', desc: 'מלצר מצוין + בר + משלוחים + ארוח — הכל!' },
};

export default function EmployeeRatingDialog({ employee, open, onClose, onSaved }) {
  const [rating, setRating] = useState(employee?.manager_quality_rating || 0);
  const [notes, setNotes] = useState(employee?.manager_rating_notes || '');
  const [saving, setSaving] = useState(false);
  const [hovered, setHovered] = useState(0);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.Employee.update(employee.id, {
        manager_quality_rating: rating,
        manager_rating_notes: notes,
      });
      onSaved && onSaved({ ...employee, manager_quality_rating: rating, manager_rating_notes: notes });
      onClose();
    } catch (e) {
      console.error('Error saving rating:', e);
    } finally {
      setSaving(false);
    }
  };

  const displayRating = hovered || rating;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-yellow-500" />
            דירוג מנהל — {employee?.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* כוכבים */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">בחר דירוג:</p>
            <div className="flex gap-2 justify-center mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  className="transition-transform hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= displayRating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            {displayRating > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-center">
                <p className="font-bold text-yellow-800">{RATING_LABELS[displayRating]?.label}</p>
                <p className="text-sm text-yellow-600 mt-1">{RATING_LABELS[displayRating]?.desc}</p>
              </div>
            )}
          </div>

          {/* תיאור רמות */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1 border">
            <p className="text-xs font-bold text-gray-600 mb-2">מדריך דירוגים:</p>
            {Object.entries(RATING_LABELS).map(([r, { label, desc }]) => (
              <div key={r} className={`text-xs p-1.5 rounded ${parseInt(r) === rating ? 'bg-yellow-100 font-bold' : ''}`}>
                <span className="font-medium">{label}</span>
                <span className="text-gray-500"> — {desc}</span>
              </div>
            ))}
          </div>

          {/* הערות */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">הערות מנהל (פנימי בלבד):</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הוסף הערות על העובד..."
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSave} disabled={saving || rating === 0} className="bg-yellow-500 hover:bg-yellow-600 text-white">
            {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Star className="w-4 h-4 ml-1" />}
            שמור דירוג
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}