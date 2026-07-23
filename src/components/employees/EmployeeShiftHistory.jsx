// Employee CRM — real shift history with lateness: scheduled (roster) vs actual
// clock (ShiftTracking). Pulls live from getEmployeeShiftHistory.
import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Clock, AlertTriangle } from 'lucide-react';

const fmtDate = (iso) => { try { return new Date(iso + 'T00:00:00').toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' }); } catch { return iso; } };

export default function EmployeeShiftHistory({ employeeId }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try { const r = await base44.functions.getEmployeeShiftHistory({ employee_id: employeeId }); if (alive) setData(r?.data || r); }
      catch { if (alive) setData({ shifts: [] }); }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [employeeId]);

  const shifts = data?.shifts || [];

  return (
    <Card dir="rtl">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Clock className="w-5 h-5 text-[#44512C]" /> נוכחות ואיחורים
          {data?.late_count > 0 && <span className="text-xs font-normal text-red-600">· {data.late_count} איחורים</span>}
        </CardTitle>
        <p className="text-xs text-slate-500">שעה בסידור מול שעה בפועל בשעון</p>
      </CardHeader>
      <CardContent>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div> : (
          shifts.length === 0 ? <p className="text-sm text-slate-500 text-center py-4">אין רישומי שעון עבור עובד זה.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b">
                    <th className="text-right py-1.5 font-medium">תאריך</th>
                    <th className="text-center font-medium">בסידור</th>
                    <th className="text-center font-medium">בפועל</th>
                    <th className="text-center font-medium">שעות</th>
                    <th className="text-center font-medium">איחור/מוקדם</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{fmtDate(s.date)}{s.role ? <span className="text-xs text-slate-400"> · {s.role}</span> : ''}</td>
                      <td className="text-center text-slate-600" dir="ltr">{s.scheduled_start && s.scheduled_end ? `${s.scheduled_start}-${s.scheduled_end}` : s.no_schedule ? <span className="text-amber-500 text-xs">לא בסידור</span> : '—'}</td>
                      <td className="text-center text-slate-600" dir="ltr">{s.actual_start || '—'}{s.actual_end ? `-${s.actual_end}` : ''}</td>
                      <td className="text-center">{s.hours != null ? Number(s.hours).toFixed(1) : '—'}</td>
                      <td className="text-center">
                        {s.late_minutes ? <span className="inline-flex items-center gap-1 text-red-600 text-xs font-bold"><AlertTriangle className="w-3 h-3" /> +{s.late_minutes}׳ איחור</span>
                          : s.early_leave_minutes ? <span className="text-amber-600 text-xs">-{s.early_leave_minutes}׳ מוקדם</span>
                          : (s.scheduled_start && s.actual_start) ? <span className="text-emerald-600 text-xs">בזמן ✓</span> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
