import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Plus, Trash2, Settings } from 'lucide-react';
import PageGuard from '../components/shared/PageGuard';

const DEFAULT_DEPARTMENTS = [
    { key: 'floor', label: 'פלור', default_position: 'מלצר' },
    { key: 'kitchen', label: 'מטבח', default_position: 'טבח' }
];

const DEFAULT_AVAILABILITY_TYPES = [
    { key: 'available', label: '✅ פנוי/ה', color: 'bg-green-100 text-green-800 border-green-300' },
    { key: 'unavailable', label: '❌ לא פנוי/ה', color: 'bg-red-100 text-red-800 border-red-300' },
    { key: 'partial', label: '⏰ פנוי/ה חלקית', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
    { key: 'preferred_off', label: '🙏 מעדיף/ה לא', color: 'bg-orange-100 text-orange-800 border-orange-300' },
];

const DEFAULT_SHIFT_OPTIONS = [
    { value: 'lunch', label: 'צהריים' },
    { value: 'dinner', label: 'ערב' },
    { value: 'both', label: 'שתיהן' },
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function AvailabilityFormSettingsInner() {
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newDepartmentLabel, setNewDepartmentLabel] = useState('');
    const [newDepartmentPosition, setNewDepartmentPosition] = useState('');
    const [activeTab, setActiveTab] = useState('departments');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const existing = await base44.entities.AvailabilityFormSettings.list();
            if (existing.length > 0) {
                setSettings(existing[0]);
            } else {
                const defaultSettings = {
                    departments: DEFAULT_DEPARTMENTS,
                    availability_types: DEFAULT_AVAILABILITY_TYPES,
                    shift_options: DEFAULT_SHIFT_OPTIONS,
                    default_days_unavailable: [],
                    week_starts_offset: 7,
                };
                const created = await base44.entities.AvailabilityFormSettings.create(defaultSettings);
                setSettings(created);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
        setLoading(false);
    };

    const handleSave = async () => {
        if (!settings) return;
        setSaving(true);
        try {
            await base44.entities.AvailabilityFormSettings.update(settings.id, settings);
            alert('הגדרות נשמרו בהצלחה!');
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('שגיאה בשמירת ההגדרות');
        }
        setSaving(false);
    };

    const addDepartment = () => {
        if (!newDepartmentLabel.trim() || !newDepartmentPosition.trim()) {
            alert('חובה למלא שם קטגוריה ותפקיד ברירת מחדל');
            return;
        }
        const newDept = {
            key: newDepartmentLabel.toLowerCase().replace(/\s+/g, '_'),
            label: newDepartmentLabel,
            default_position: newDepartmentPosition,
        };
        setSettings(prev => ({
            ...prev,
            departments: [...prev.departments, newDept]
        }));
        setNewDepartmentLabel('');
        setNewDepartmentPosition('');
    };

    const removeDepartment = (key) => {
        setSettings(prev => ({
            ...prev,
            departments: prev.departments.filter(d => d.key !== key)
        }));
    };

    const updateDepartment = (key, field, value) => {
        setSettings(prev => ({
            ...prev,
            departments: prev.departments.map(d => 
                d.key === key ? { ...d, [field]: value } : d
            )
        }));
    };

    const toggleDefaultDay = (day) => {
        setSettings(prev => ({
            ...prev,
            default_days_unavailable: prev.default_days_unavailable.includes(day)
                ? prev.default_days_unavailable.filter(d => d !== day)
                : [...prev.default_days_unavailable, day]
        }));
    };

    if (loading) return (
        <div className="flex items-center justify-center h-screen">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
    );

    if (!settings) return <div className="p-8">שגיאה בטעינת ההגדרות</div>;

    return (
        <div className="p-4 sm:p-8 max-w-4xl mx-auto" dir="rtl">
            <div className="mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    <Settings className="w-8 h-8 text-primary" />
                    הגדרות טופס הגשת זמינות
                </h1>
                <p className="text-gray-600 mt-2">ניהול קטגוריות (פלור/מטבח), סוגי זמינות וימים מסוימים</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="departments">קטגוריות</TabsTrigger>
                    <TabsTrigger value="days">ימים מסוימים</TabsTrigger>
                </TabsList>

                <TabsContent value="departments" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>קטגוריות עבודה</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {settings.departments.map(dept => (
                                <div key={dept.key} className="p-4 border rounded-lg space-y-3 bg-gray-50">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-sm">שם הקטגוריה</Label>
                                            <Input
                                                value={dept.label}
                                                onChange={(e) => updateDepartment(dept.key, 'label', e.target.value)}
                                                placeholder="לדוגמה: פלור"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-sm">תפקיד ברירת מחדל</Label>
                                            <Input
                                                value={dept.default_position}
                                                onChange={(e) => updateDepartment(dept.key, 'default_position', e.target.value)}
                                                placeholder="לדוגמה: מלצר"
                                            />
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => removeDepartment(dept.key)}
                                        variant="destructive"
                                        size="sm"
                                        className="w-full"
                                    >
                                        <Trash2 className="w-4 h-4 ml-2" />
                                        מחק קטגוריה
                                    </Button>
                                </div>
                            ))}

                            <div className="p-4 border-2 border-dashed rounded-lg space-y-3 bg-blue-50">
                                <h3 className="font-semibold">הוספת קטגוריה חדשה</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <Input
                                        value={newDepartmentLabel}
                                        onChange={(e) => setNewDepartmentLabel(e.target.value)}
                                        placeholder="שם הקטגוריה"
                                    />
                                    <Input
                                        value={newDepartmentPosition}
                                        onChange={(e) => setNewDepartmentPosition(e.target.value)}
                                        placeholder="תפקיד ברירת מחדל"
                                    />
                                </div>
                                <Button
                                    onClick={addDepartment}
                                    className="w-full bg-blue-600 hover:bg-blue-700"
                                >
                                    <Plus className="w-4 h-4 ml-2" />
                                    הוסף קטגוריה
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="days" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>ימים שהם בברירת מחדל "לא פנוי"</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-gray-600 mb-4">
                                בחר ימים שכל העובדים יהיו בברירת מחדל לא פנויים בהם:
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {DAYS.map(day => (
                                    <button
                                        key={day}
                                        onClick={() => toggleDefaultDay(day)}
                                        className={`p-3 rounded-lg border-2 font-semibold transition-all ${
                                            settings.default_days_unavailable.includes(day)
                                                ? 'bg-red-100 border-red-500 text-red-800'
                                                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                                        }`}
                                    >
                                        {day === 'Sunday' && 'ראשון'}
                                        {day === 'Monday' && 'שני'}
                                        {day === 'Tuesday' && 'שלישי'}
                                        {day === 'Wednesday' && 'רביעי'}
                                        {day === 'Thursday' && 'חמישי'}
                                        {day === 'Friday' && 'שישי'}
                                        {day === 'Saturday' && 'שבת'}
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <div className="mt-8 flex gap-3 justify-end">
                <Button
                    onClick={loadSettings}
                    variant="outline"
                    disabled={saving}
                >
                    בטל
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-primary hover:bg-primary/90"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
                    {saving ? 'שומר...' : 'שמור הגדרות'}
                </Button>
            </div>
        </div>
    );
}

export default function AvailabilityFormSettingsPage() {
    return (
        <PageGuard pageName="AvailabilityFormSettings" pageTitle="הגדרות הגשת זמינות">
            <AvailabilityFormSettingsInner />
        </PageGuard>
    );
}