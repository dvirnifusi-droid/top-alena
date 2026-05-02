import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, RefreshCw, MessageCircle } from 'lucide-react';

export default function TaskAssignmentDialog({ isOpen, onClose, checklist, employees, onSave }) {
    const [assignments, setAssignments] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (checklist?.items) {
            const initialAssignments = {};
            checklist.items.forEach(item => {
                const taskId = `${checklist.id}_${item.order}`;
                initialAssignments[taskId] = item.assigned_to_employee_id || '';
            });
            setAssignments(initialAssignments);
        }
    }, [checklist]);

    if (!checklist) {
        return null;
    }

    const handleAssignmentChange = (taskId, employeeId) => {
        setAssignments(prev => ({
            ...prev,
            [taskId]: employeeId === 'none' ? '' : employeeId,
        }));
    };
    
    const getEmployeeName = (employeeId) => {
        const employee = employees.find(emp => emp.id === employeeId);
        return employee ? employee.full_name : '';
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updatedItems = checklist.items.map(item => {
                const taskId = `${checklist.id}_${item.order}`;
                const assignedEmployeeId = assignments[taskId];
                return {
                    ...item,
                    assigned_to_employee_id: assignedEmployeeId || null,
                    assigned_to_employee_name: assignedEmployeeId ? getEmployeeName(assignedEmployeeId) : null,
                };
            });
            await onSave({ ...checklist, items: updatedItems });
        } finally {
            setSaving(false);
        }
    };

    const handleSendWhatsApp = () => {
        if (!checklist) return;
        // Build message grouped by employee
        const byEmployee = {};
        checklist.items?.forEach(item => {
            const taskId = `${checklist.id}_${item.order}`;
            const empId = assignments[taskId];
            if (!empId) return;
            const name = getEmployeeName(empId);
            if (!byEmployee[name]) byEmployee[name] = [];
            byEmployee[name].push(`• ${item.area} - ${item.task}`);
        });

        if (Object.keys(byEmployee).length === 0) return;

        let msg = `📋 שיוך משימות - ${checklist.title}\n`;
        msg += `${'─'.repeat(25)}\n\n`;
        for (const [name, tasks] of Object.entries(byEmployee)) {
            msg += `👤 *${name}:*\n${tasks.join('\n')}\n\n`;
        }
        msg += `✅ סה"כ ${checklist.items?.filter(i => assignments[`${checklist.id}_${i.order}`]).length} משימות משויכות`;

        const encoded = encodeURIComponent(msg);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col" dir="rtl">
                <DialogHeader>
                    <DialogTitle>שיוך משימות - {checklist.title}</DialogTitle>
                    <DialogDescription>שייך כל משימה לעובד המתאים מהרשימה.</DialogDescription>
                </DialogHeader>
                
                <div className="flex-grow overflow-y-auto pr-2 space-y-3">
                    {checklist.items?.map(item => {
                        const taskId = `${checklist.id}_${item.order}`;
                        return (
                            <div key={taskId} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                                <div className="flex-1 mr-4">
                                    <p className="font-semibold">{item.area} - {item.task}</p>
                                    <p className="text-sm text-gray-500">{item.description}</p>
                                </div>
                                <div className="w-56">
                                    <Select 
                                        value={assignments[taskId] || 'none'} 
                                        onValueChange={(employeeId) => handleAssignmentChange(taskId, employeeId)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="בחר עובד..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">ללא שיוך</SelectItem>
                                            {employees.map(employee => (
                                                <SelectItem key={employee.id} value={employee.id}>
                                                    {employee.full_name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <DialogFooter className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={onClose} disabled={saving}>
                        ביטול
                    </Button>
                    <Button variant="outline" onClick={handleSendWhatsApp} className="bg-green-50 border-green-300 text-green-700 hover:bg-green-100">
                        <MessageCircle className="w-4 h-4 mr-2" />
                        שלח לוואטסאפ
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                        {saving ? 'שומר...' : 'שמור שיוכים'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}