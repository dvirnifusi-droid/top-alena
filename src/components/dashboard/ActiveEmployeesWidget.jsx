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
        // טעינת כל משמרות היום
        const today = new Date().toISOString().split('T')[0];
        const shifts = await base44.entities.WorkShift.filter({
          date: today
        });

        const active = [];
        
        // עברור כל משמרת
        for (const shift of shifts) {
          if (shift.assigned_staff && Array.isArray(shift.assigned_staff)) {
            for (const staff of shift.assigned_staff) {
              // בדיקה אם העובד אכן בעבודה (נמצא בתוך שעות המשמרת)
              const now = new Date();
              const [startHour, startMin] = shift.start_time.split(':').map(Number);
              const [endHour, endMin] = shift.end_time.split(':').map(Number);
              
              const shiftStart = new Date();
              shiftStart.setHours(startHour, startMin, 0);
              
              const shiftEnd = new Date();
              shiftEnd.setHours(endHour, endMin, 0);

              if (now >= shiftStart && now <= shiftEnd && staff.status === 'confirmed') {
                active.push({
                  name: staff.employee_name,
                  position: staff.position,
                  checkInTime: staff.start_time,
                  shiftType: shift.shift_type,
                  status: staff.status
                });
              }
            }
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
    
    // רענון כל דקה
    const interval = setInterval(loadActiveEmployees, 60000);
    
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