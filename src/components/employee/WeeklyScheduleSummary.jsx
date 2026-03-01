import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Briefcase } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import { he } from 'date-fns/locale';

export default function WeeklyScheduleSummary({ userId }) {
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadWeeklySchedule();
    }, [userId]);

    const loadWeeklySchedule = async () => {
        setLoading(true);
        try {
            const today = new Date();
            const weekStart = startOfWeek(today, { weekStartsOn: 0 });
            
            // טוען משמרות דינמית לכל יום בשבוע
            const weekShifts = [];
            
            for (let i = 0; i < 7; i++) {
                const date = addDays(weekStart, i);
                const dateStr = format(date, 'yyyy-MM-dd');
                
                // סנן משמרות לתאריך זה
                const shifts = await base44.entities.WorkShift.filter({ date: dateStr });
                
                shifts.forEach(shift => {
                    const userAssignment = (shift.assigned_staff || []).find(a => a.employee_id === userId);
                    if (userAssignment) {
                        weekShifts.push({
                            date,
                            dateStr,
                            shift_type: shift.shift_type,
                            start_time: userAssignment.start_time || shift.start_time,
                            end_time: userAssignment.end_time || shift.end_time,
                            position: userAssignment.position
                        });
                    }
                });
            }
            
            setShifts(weekShifts);
        } catch (error) {
            console.error('Error loading weekly schedule:', error);
        }
        setLoading(false);
    };

    const totalHours = shifts.reduce((acc, shift) => {
        if (!shift.start_time || !shift.end_time) return acc;
        const [startH, startM] = shift.start_time.split(':').map(Number);
        const [endH, endM] = shift.end_time.split(':').map(Number);
        const hours = endH - startH + (endM - startM) / 60;
        return acc + hours;
    }, 0);

    if (loading) return <div className="text-center py-4">טוען סידור...</div>;

    return (
        <Card className="border-2 border-blue-200">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    סידור העבודה שלך השבוע
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {shifts.length === 0 ? (
                        <p className="text-gray-500 text-center py-4">אין משמרות בשבוע זה</p>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {shifts.map((shift) => (
                                    <div key={shift.dateStr} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <div>
                                            <p className="font-semibold text-sm">
                                                {format(shift.date, 'EEEE', { locale: he })}
                                            </p>
                                            <p className="text-xs text-gray-600">{format(shift.date, 'dd/MM')}</p>
                                        </div>
                                        <div className="text-right">
                                            <Badge variant={shift.shift_type === 'lunch' ? 'default' : 'secondary'} className="mb-1 block w-fit ml-auto">
                                                {shift.shift_type === 'lunch' ? '☀️ צהריים' : '🌙 ערב'}
                                            </Badge>
                                            <p className="text-xs text-gray-700">
                                                {shift.start_time && shift.end_time 
                                                    ? `${shift.start_time} - ${shift.end_time}`
                                                    : 'שעות לא קבועות'
                                                }
                                            </p>
                                            <p className="text-xs text-blue-600 font-medium">{shift.position}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-blue-900">סה"כ שעות בשבוע:</span>
                                    <span className="text-lg font-bold text-blue-600">{totalHours.toFixed(1)} שעות</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

// Icon import fix
function Calendar({ className }) {
    return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M8 2v4m8-4v4M3 10h18"/><rect x="2" y="3" width="20" height="19" rx="2" ry="2"/><path d="M3 10h18"/></svg>;
}