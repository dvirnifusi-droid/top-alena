import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { Clock, User } from 'lucide-react';

export default function ActiveEmployeesWidget() {
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadActiveEmployees = async () => {
      try {
        // חיפוש עובדים שנכנסו בפועל היום
        const today = new Date().toISOString().split('T')[0];
        
        // ספיקת עובדים שנכנסו למשמרת (בעל check_in_time היום)
        const shiftTracking = await base44.entities.ShiftTracking.filter({});
        
        const active = [];
        const seen = new Set();
        
        for (const tracking of shiftTracking) {
          if (tracking.check_in_time && tracking.check_in_time.startsWith(today) && !seen.has(tracking.employee_id)) {
            seen.add(tracking.employee_id);
            
            // קבל את זמן הכניסה
            const checkInDateTime = new Date(tracking.check_in_time);
            const checkInTime = checkInDateTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            
            active.push({
              name: tracking.employee_name || 'לא ידוע',
              position: tracking.position || 'לא מוגדר',
              checkInTime: checkInTime,
              shiftType: tracking.shift_type || 'general',
              status: 'active'
            });
          }
        }

        setActiveEmployees(active);
      } catch (error) {
        console.error('Error loading active employees:', error);
      } finally {
        setLoading(false);
      }
    };

    loadActiveEmployees();
    
    // רענון כל 15 שניות לעדכון בזמן אמת
    const interval = setInterval(loadActiveEmployees, 15000);
    
    return () => clearInterval(interval);
  }, []);

  const shiftTypeLabel = {
    lunch: 'צהריים',
    dinner: 'ערב'
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            עובדים פעילים במשמרת
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600">טוען...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5" />
            עובדים פעילים במשמרת
          </div>
          <Badge variant="secondary" className="text-lg">
            {activeEmployees.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activeEmployees.length === 0 ? (
          <p className="text-gray-500 text-sm">אין עובדים פעילים כרגע</p>
        ) : (
          <div className="space-y-2">
            {activeEmployees.map((emp, idx) => (
              <div 
                key={idx} 
                className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
              >
                <div className="flex-1">
                  <div className="font-semibold text-green-900">{emp.name}</div>
                  <div className="text-xs text-green-700">{emp.position}</div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-xs text-green-700 mb-1">
                    <Clock className="w-3 h-3" />
                    {emp.checkInTime}
                  </div>
                  <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300">
                    {shiftTypeLabel[emp.shiftType] || emp.shiftType}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}