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
        const today = new Date().toISOString().split('T')[0];

        // Pull active/on_break trackings AND the full Employee roster so we
        // can replace email-shaped employee_name values (legacy records made
        // before clockInWithLocation resolved by email) with the real name.
        const [shiftTracking, employees] = await Promise.all([
          base44.entities.ShiftTracking.filter({ date: today }),
          base44.entities.Employee.filter({ status: 'active' }).catch(() => []),
        ]);

        // Email → full_name lookup
        const byEmail = {};
        const byId = {};
        for (const e of employees || []) {
          if (e.email) byEmail[String(e.email).toLowerCase()] = e.full_name;
          if (e.id) byId[e.id] = e.full_name;
        }

        const looksLikeEmail = (s) => typeof s === 'string' && s.includes('@');

        const active = [];
        for (const tracking of shiftTracking) {
          if (tracking.status !== 'active' && tracking.status !== 'on_break') continue;
          const checkInDateTime = new Date(tracking.shift_start);
          const checkInTime = checkInDateTime.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

          // Try several routes to get a real name:
          //  1. The record's employee_name unless it's an email
          //  2. Employee lookup by employee_id
          //  3. Employee lookup by the email currently stored as name
          //  4. Last resort: keep what we have
          let name = tracking.employee_name;
          if (!name || looksLikeEmail(name)) {
            name = byId[tracking.employee_id]
              || byEmail[String(tracking.employee_name || '').toLowerCase()]
              || tracking.employee_name
              || 'לא ידוע';
          }

          active.push({
            name,
            position: tracking.position || 'לא מוגדר',
            checkInTime,
            shiftType: tracking.shift_type || 'general',
            status: 'active',
          });
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