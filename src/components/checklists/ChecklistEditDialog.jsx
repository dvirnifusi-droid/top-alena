
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Plus, User } from "lucide-react"; // Add User icon

export default function ChecklistEditDialog({ isOpen, checklist, employees, onClose, onSave }) {
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: 'operational',
        frequency: 'daily',
        assigned_role: '',
        items: []
    });

    useEffect(() => {
        if (checklist) {
            setFormData({
                title: checklist.title || '',
                description: checklist.description || '',
                category: checklist.category || 'operational',
                frequency: checklist.frequency || 'daily',
                assigned_role: checklist.assigned_role || '',
                items: checklist.items ? checklist.items.map(item => ({
                    ...item,
                    requires_photo_evidence: item.requires_photo_evidence ?? false,
                    assigned_to_employee_id: item.assigned_to_employee_id ?? null,
                    assigned_to_employee_name: item.assigned_to_employee_name ?? null
                })) : []
            });
        }
    }, [checklist]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.title.trim()) {
            alert('אנא הזן שם צ\'קליסט');
            return;
        }

        // Ensure assigned_to_employee_name is set based on id
        const updatedItems = formData.items.map(item => {
            let assignedEmployeeName = null;
            if (item.assigned_to_employee_id && employees) {
                const assignedEmployee = employees.find(emp => emp.id === item.assigned_to_employee_id);
                assignedEmployeeName = assignedEmployee ? assignedEmployee.full_name : null;
            }
            return {
                ...item,
                assigned_to_employee_name: assignedEmployeeName
            };
        });

        onSave({ ...formData, items: updatedItems });
    };

    const addItem = () => {
        const newItem = {
            order: formData.items.length + 1,
            area: '',
            task: '',
            description: '',
            critical: false,
            points: 5,
            requires_photo_evidence: false,
            assigned_to_employee_id: null,
            assigned_to_employee_name: null
        };
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, newItem]
        }));
    };

    const removeItem = (index) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index).map((item, i) => ({
                ...item,
                order: i + 1
            }))
        }));
    };

    const updateItem = (index, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map((item, i) => 
                i === index ? { ...item, [field]: value } : item
            )
        }));
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
                <DialogHeader>
                    <DialogTitle>עריכת צ'קליסט</DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="title">שם הצ'קליסט</Label>
                            <Input
                                id="title"
                                value={formData.title}
                                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="לדוגמה: צ'ק ליסט פתיחת משמרת"
                                required
                            />
                        </div>
                        
                        <div>
                            <Label htmlFor="assigned_role">תפקיד אחראי</Label>
                            <Input
                                id="assigned_role"
                                value={formData.assigned_role}
                                onChange={(e) => setFormData(prev => ({ ...prev, assigned_role: e.target.value }))}
                                placeholder="לדוגמה: אחמ״ש"
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="description">תיאור</Label>
                        <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="תיאור קצר של מטרת הצ'קליסט"
                            rows={3}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="category">קטגוריה</Label>
                            <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="safety">בטיחות</SelectItem>
                                    <SelectItem value="quality">איכות</SelectItem>
                                    <SelectItem value="maintenance">תחזוקה</SelectItem>
                                    <SelectItem value="compliance">ציות</SelectItem>
                                    <SelectItem value="onboarding">הכשרה</SelectItem>
                                    <SelectItem value="operational">תפעולי</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="frequency">תדירות</Label>
                            <Select value={formData.frequency} onValueChange={(value) => setFormData(prev => ({ ...prev, frequency: value }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">יומי</SelectItem>
                                    <SelectItem value="weekly">שבועי</SelectItem>
                                    <SelectItem value="monthly">חודשי</SelectItem>
                                    <SelectItem value="quarterly">רבעוני</SelectItem>
                                    <SelectItem value="yearly">שנתי</SelectItem>
                                    <SelectItem value="as_needed">לפי צורך</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* פריטי הצ'קליסט */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">פריטי הצ'קליסט</h3>
                            <Button type="button" onClick={addItem} variant="outline">
                                <Plus className="w-4 h-4 mr-2" />
                                הוסף פריט
                            </Button>
                        </div>
                        
                        <div className="space-y-4 max-h-96 overflow-y-auto">
                            {formData.items.map((item, index) => (
                                <Card key={index}>
                                    <CardContent className="p-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <Label>אזור</Label>
                                                <Input
                                                    value={item.area || ''}
                                                    onChange={(e) => updateItem(index, 'area', e.target.value)}
                                                    placeholder="לדוגמה: אזור פנים"
                                                />
                                            </div>
                                            <div>
                                                <Label>משימה</Label>
                                                <Input
                                                    value={item.task || ''}
                                                    onChange={(e) => updateItem(index, 'task', e.target.value)}
                                                    placeholder="לדוגמה: ניקיון שולחנות"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <Label>תיאור מפורט</Label>
                                                <Textarea
                                                    value={item.description || ''}
                                                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                                                    placeholder="הסבר מפורט על המשימה"
                                                    rows={2}
                                                />
                                            </div>

                                            {/* Employee Assignment Dropdown */}
                                            <div className="md:col-span-2">
                                                <Label className="flex items-center gap-2"><User className="w-4 h-4"/>שייך ל...</Label>
                                                <Select
                                                    value={item.assigned_to_employee_id || ''}
                                                    onValueChange={(value) => updateItem(index, 'assigned_to_employee_id', value === '' ? null : value)}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="בחר עובד לשיוך המשימה" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value={null}>ללא שיוך</SelectItem>
                                                        {employees && employees.map(employee => (
                                                            <SelectItem key={employee.id} value={employee.id}>
                                                                {employee.full_name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-center space-x-4 space-x-reverse">
                                                <label className="flex items-center space-x-2 space-x-reverse">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.critical || false}
                                                        onChange={(e) => updateItem(index, 'critical', e.target.checked)}
                                                    />
                                                    <span>קריטי</span>
                                                </label>
                                                <label className="flex items-center space-x-2 space-x-reverse">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.requires_photo_evidence || false}
                                                        onChange={(e) => updateItem(index, 'requires_photo_evidence', e.target.checked)}
                                                    />
                                                    <span>צילום חובה</span>
                                                </label>
                                                <div className="flex items-center space-x-2 space-x-reverse">
                                                    <Label>נקודות:</Label>
                                                    <Input
                                                        type="number"
                                                        value={item.points || 5}
                                                        onChange={(e) => updateItem(index, 'points', parseInt(e.target.value) || 5)}
                                                        className="w-16"
                                                        min="1"
                                                        max="20"
                                                    />
                                                </div>
                                                <Button
                                                    type="button"
                                                    onClick={() => removeItem(index)}
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-600 hover:text-red-700"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            ביטול
                        </Button>
                        <Button type="submit">
                            שמור צ'קליסט
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
