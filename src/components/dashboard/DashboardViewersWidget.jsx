import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { base44 } from '@/api/base44Client';
import { BookOpen, User } from 'lucide-react';

export default function DashboardViewersWidget() {
    const [briefReaders, setBriefReaders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadBriefReaders = async () => {
            try {
                const today = new Date().toISOString().split('T')[0];
                const briefs = await base44.entities.DailyBrief.filter({ date: today });
                
                // Get all employees
                const employees = await base44.entities.Employee.list();
                const employeeMap = {};
                employees.forEach(emp => {
                    employeeMap[emp.id] = emp;
                });
                
                // Aggregate readers with their brief types
                const readers = {};
                briefs.forEach(brief => {
                    const readBy = brief.read_by || [];
                    const shiftType = brief.shift_type === 'lunch' ? 'צהריים' : brief.shift_type === 'dinner' ? 'ערב' : 'unknown';
                    
                    readBy.forEach(empId => {
                        const emp = employeeMap[empId];
                        if (emp) {
                            if (!readers[empId]) {
                                readers[empId] = {
                                    id: empId,
                                    email: emp.email,
                                    name: emp.full_name,
                                    shifts: []
                                };
                            }
                            if (!readers[empId].shifts.includes(shiftType)) {
                                readers[empId].shifts.push(shiftType);
                            }
                        }
                    });
                });
                
                setBriefReaders(Object.values(readers).sort((a, b) => a.name.localeCompare(b.name)));
            } catch (error) {
                console.error('Failed to load brief readers:', error);
            } finally {
                setLoading(false);
            }
        };

        loadBriefReaders();
        const interval = setInterval(loadBriefReaders, 30000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-green-600" />
                        שקראו את התדריך
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-gray-500 text-sm">טוען...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-green-600" />
                    שקראו את התדריך היום ({briefReaders.length})
                </CardTitle>
            </CardHeader>
            <CardContent>
                {briefReaders.length === 0 ? (
                    <p className="text-gray-500 text-sm">אף אחד עדיין לא קרא את התדריך היום</p>
                ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {briefReaders.map((reader) => (
                            <div key={reader.email} className="flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 transition">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center flex-shrink-0">
                                        <User className="w-4 h-4 text-green-700" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-medium text-sm text-gray-900 truncate">{reader.name}</p>
                                        <p className="text-xs text-gray-500">{reader.email}</p>
                                    </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <p className="text-xs font-medium text-green-700">
                                        {reader.shifts.includes('צהריים') && reader.shifts.includes('ערב') 
                                            ? 'שניהם' 
                                            : reader.shifts.join(', ')}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}