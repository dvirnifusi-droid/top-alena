import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, ChevronRight, ChevronLeft, Settings, ListChecks, ArrowUp, ArrowDown } from "lucide-react";

export default function ChecklistEditDialog({ isOpen, checklist, employees, onClose, onSave }) {
    const [step, setStep] = useState('details'); // 'details' | 'items'
    const [selectedItemIndex, setSelectedItemIndex] = useState(null);
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        category: 'operational',
        frequency: 'daily',
        assigned_role: '',
        department: '',
        shift: 'all',
        color: 'emerald',
        items: []
    });

    useEffect(() => {
        if (isOpen) {
            setStep('details');
            setSelectedItemIndex(null);
        }
        if (checklist) {
            setFormData({
                title: checklist.title || '',
                description: checklist.description || '',
                category: checklist.category || 'operational',
                frequency: checklist.frequency || 'daily',
                assigned_role: checklist.assigned_role || '',
                department: checklist.department || '',
                shift: checklist.shift || 'all',
                color: checklist.color || 'emerald',
                items: checklist.items ? checklist.items.map(item => ({ ...item })) : []
            });
        } else {
            setFormData({ title: '', description: '', category: 'operational', frequency: 'daily', assigned_role: '', department: '', shift: 'all', color: 'emerald', items: [] });
        }
    }, [checklist, isOpen]);

    const handleSave = () => {
        if (!formData.title.trim()) {
            alert("אנא הזן שם צ'קליסט");
            return;
        }
        const updatedItems = formData.items.map(item => {
            let assignedEmployeeName = null;
            if (item.assigned_to_employee_id && employees) {
                const emp = employees.find(e => e.id === item.assigned_to_employee_id);
                assignedEmployeeName = emp ? emp.full_name : null;
            }
            return { ...item, assigned_to_employee_name: assignedEmployeeName };
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
        const newItems = [...formData.items, newItem];
        setFormData(prev => ({ ...prev, items: newItems }));
        setSelectedItemIndex(newItems.length - 1);
    };

    const removeItem = (index) => {
        const updated = formData.items.filter((_, i) => i !== index).map((item, i) => ({ ...item, order: i + 1 }));
        setFormData(prev => ({ ...prev, items: updated }));
        if (selectedItemIndex >= updated.length) setSelectedItemIndex(updated.length - 1);
        else if (selectedItemIndex === index) setSelectedItemIndex(null);
    };

    const moveItem = (index, direction) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= formData.items.length) return;
        const updated = [...formData.items];
        [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
        const reordered = updated.map((item, i) => ({ ...item, order: i + 1 }));
        setFormData(prev => ({ ...prev, items: reordered }));
        setSelectedItemIndex(newIndex);
    };

    const updateItem = (index, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map((item, i) => i === index ? { ...item, [field]: value } : item)
        }));
    };

    const currentItem = (selectedItemIndex !== null && selectedItemIndex < formData.items.length) ? formData.items[selectedItemIndex] : null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" dir="rtl">
                <DialogHeader className="pb-0">
                    <DialogTitle className="text-xl font-bold">
                        {checklist?.id ? "עריכת צ'קליסט" : "צ'קליסט חדש"}
                    </DialogTitle>
                    {/* Step tabs */}
                    <div className="flex gap-2 mt-3 border-b pb-0">
                        <button
                            onClick={() => setStep('details')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${step === 'details' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <Settings className="w-4 h-4" /> פרטים כלליים
                        </button>
                        <button
                            onClick={() => setStep('items')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${step === 'items' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <ListChecks className="w-4 h-4" /> משימות
                            <Badge variant="secondary" className="text-xs">{formData.items.length}</Badge>
                        </button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4">
                    {/* --- פרטים כלליים --- */}
                    {step === 'details' && (
                        <div className="space-y-4 px-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>שם הצ'קליסט *</Label>
                                    <Input
                                        value={formData.title}
                                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                                        placeholder="לדוגמה: פתיחת משמרת"
                                    />
                                </div>
                                <div>
                                    <Label>תפקיד אחראי</Label>
                                    <Input
                                        value={formData.assigned_role}
                                        onChange={(e) => setFormData(prev => ({ ...prev, assigned_role: e.target.value }))}
                                        placeholder='לדוגמה: אחמ"ש'
                                    />
                                </div>
                            </div>
                            <div>
                                <Label>תיאור</Label>
                                <Textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="תיאור קצר של מטרת הצ'קליסט"
                                    rows={3}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>קטגוריה</Label>
                                    <Select value={formData.category} onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
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
                                    <Label>תדירות</Label>
                                    <Select value={formData.frequency} onValueChange={(v) => setFormData(prev => ({ ...prev, frequency: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
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

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <Label>משמרת</Label>
                                    <Select value={formData.shift} onValueChange={(v) => setFormData(prev => ({ ...prev, shift: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">🔁 כל המשמרות</SelectItem>
                                            <SelectItem value="morning">🌅 בוקר</SelectItem>
                                            <SelectItem value="evening">🌆 ערב</SelectItem>
                                            <SelectItem value="thursday">🎉 חמישי</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>מחלקה</Label>
                                    <Select value={formData.department || 'none'} onValueChange={(v) => setFormData(prev => ({ ...prev, department: v === 'none' ? '' : v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">— ללא מחלקה —</SelectItem>
                                            <SelectItem value="floor">🍽️ פלור</SelectItem>
                                            <SelectItem value="bar">🍷 בר</SelectItem>
                                            <SelectItem value="kitchen">🍳 מטבח</SelectItem>
                                            <SelectItem value="managers">👔 מנהלים</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label>צבע</Label>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {[
                                            { value: 'emerald', label: 'ירוק', bg: 'bg-emerald-500' },
                                            { value: 'blue', label: 'כחול', bg: 'bg-blue-500' },
                                            { value: 'orange', label: 'כתום', bg: 'bg-orange-500' },
                                            { value: 'purple', label: 'סגול', bg: 'bg-purple-500' },
                                            { value: 'pink', label: 'ורוד', bg: 'bg-pink-500' },
                                            { value: 'yellow', label: 'צהוב', bg: 'bg-yellow-500' },
                                            { value: 'red', label: 'אדום', bg: 'bg-red-500' },
                                            { value: 'cyan', label: 'תכלת', bg: 'bg-cyan-500' },
                                        ].map(c => (
                                            <button
                                                key={c.value}
                                                type="button"
                                                title={c.label}
                                                onClick={() => setFormData(prev => ({ ...prev, color: c.value }))}
                                                className={`w-8 h-8 rounded-full ${c.bg} transition-all ${formData.color === c.value ? 'ring-2 ring-offset-2 ring-gray-700 scale-110' : 'opacity-70 hover:opacity-100'}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <Button onClick={() => setStep('items')} className="w-full mt-2" variant="outline">
                                המשך לעריכת משימות <ChevronLeft className="w-4 h-4 mr-1" />
                            </Button>
                        </div>
                    )}

                    {/* --- משימות --- */}
                    {step === 'items' && (
                        <div className="flex gap-4 h-full min-h-[400px]">
                            {/* רשימת משימות */}
                            <div className="w-1/3 border-l pl-4 flex flex-col gap-2">
                                <Button onClick={addItem} size="sm" className="w-full mb-2">
                                    <Plus className="w-4 h-4 ml-1" /> הוסף משימה
                                </Button>
                                <div className="overflow-y-auto flex-1 space-y-1 max-h-[350px]">
                                    {formData.items.length === 0 && (
                                        <p className="text-sm text-gray-400 text-center py-4">אין משימות עדיין</p>
                                    )}
                                    {formData.items.map((item, index) => (
                                        <button
                                            key={index}
                                            onClick={() => setSelectedItemIndex(index)}
                                            className={`w-full text-right p-2.5 rounded-lg text-sm border transition-all ${selectedItemIndex === index ? 'bg-primary text-primary-foreground border-primary' : 'bg-gray-50 hover:bg-gray-100 border-transparent'}`}
                                        >
                                            <div className="font-medium truncate">{item.task || `משימה ${index + 1}`}</div>
                                            {item.area && <div className={`text-xs truncate ${selectedItemIndex === index ? 'text-primary-foreground/70' : 'text-gray-400'}`}>{item.area}</div>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* עריכת משימה נבחרת */}
                            <div className="flex-1">
                                {currentItem === null ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                        <ListChecks className="w-12 h-12 mb-2 opacity-30" />
                                        <p className="text-sm">בחר משימה לעריכה או הוסף חדשה</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="font-semibold text-gray-700">עריכת משימה {selectedItemIndex + 1}</h4>
                                            <div className="flex gap-1">
                                                <Button
                                                    variant="ghost" size="sm"
                                                    disabled={selectedItemIndex === 0}
                                                    onClick={() => setSelectedItemIndex(i => i - 1)}
                                                    title="משימה קודמת"
                                                >
                                                    <ChevronRight className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="sm"
                                                    disabled={selectedItemIndex === formData.items.length - 1}
                                                    onClick={() => setSelectedItemIndex(i => i + 1)}
                                                    title="משימה הבאה"
                                                >
                                                    <ChevronLeft className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="sm"
                                                    disabled={selectedItemIndex === 0}
                                                    onClick={() => moveItem(selectedItemIndex, -1)}
                                                    title="הזז למעלה"
                                                >
                                                    <ArrowUp className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="sm"
                                                    disabled={selectedItemIndex === formData.items.length - 1}
                                                    onClick={() => moveItem(selectedItemIndex, 1)}
                                                    title="הזז למטה"
                                                >
                                                    <ArrowDown className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="sm"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => removeItem(selectedItemIndex)}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label>משימה *</Label>
                                                <Input
                                                    value={currentItem.task || ''}
                                                    onChange={(e) => updateItem(selectedItemIndex, 'task', e.target.value)}
                                                    placeholder="שם המשימה"
                                                />
                                            </div>
                                            <div>
                                                <Label>אזור</Label>
                                                <Input
                                                    value={currentItem.area || ''}
                                                    onChange={(e) => updateItem(selectedItemIndex, 'area', e.target.value)}
                                                    placeholder="לדוגמה: מטבח"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <Label>תיאור מפורט</Label>
                                            <Textarea
                                                value={currentItem.description || ''}
                                                onChange={(e) => updateItem(selectedItemIndex, 'description', e.target.value)}
                                                placeholder="הסבר מפורט על המשימה"
                                                rows={3}
                                            />
                                        </div>

                                        <div>
                                            <Label>שייך לעובד</Label>
                                            <Select
                                                value={currentItem.assigned_to_employee_id || ''}
                                                onValueChange={(v) => updateItem(selectedItemIndex, 'assigned_to_employee_id', v === '' ? null : v)}
                                            >
                                                <SelectTrigger><SelectValue placeholder="ללא שיוך" /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value={null}>ללא שיוך</SelectItem>
                                                    {employees && employees.map(emp => (
                                                        <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-4 pt-1">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={currentItem.critical || false}
                                                    onChange={(e) => updateItem(selectedItemIndex, 'critical', e.target.checked)}
                                                    className="w-4 h-4"
                                                />
                                                <span className="text-sm font-medium text-red-600">קריטי</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={currentItem.requires_photo_evidence || false}
                                                    onChange={(e) => updateItem(selectedItemIndex, 'requires_photo_evidence', e.target.checked)}
                                                    className="w-4 h-4"
                                                />
                                                <span className="text-sm font-medium">צילום חובה</span>
                                            </label>
                                            {currentItem.requires_photo_evidence && (
                                                <div className="flex items-center gap-2">
                                                    <Label className="text-sm">מינ׳ תמונות:</Label>
                                                    <Input
                                                        type="number"
                                                        value={currentItem.min_photos || 1}
                                                        onChange={(e) => updateItem(selectedItemIndex, 'min_photos', parseInt(e.target.value) || 1)}
                                                        className="w-16 h-8"
                                                        min="1" max="10"
                                                    />
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 mr-auto">
                                                <Label className="text-sm">נקודות:</Label>
                                                <Input
                                                    type="number"
                                                    value={currentItem.points || 5}
                                                    onChange={(e) => updateItem(selectedItemIndex, 'points', parseInt(e.target.value) || 5)}
                                                    className="w-16 h-8"
                                                    min="1" max="20"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t pt-4">
                    <Button variant="outline" onClick={onClose}>ביטול</Button>
                    <Button onClick={handleSave} className="bg-primary hover:bg-primary/90">
                        שמור צ'קליסט
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}