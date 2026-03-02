import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { User } from '@/entities/User';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const DEFAULT_DEPARTMENTS = [
    { key: 'floor', label: 'פלור (מלצרים)', default_position: 'מלצר' },
    { key: 'kitchen', label: 'מטבח (טבחים)', default_position: 'טבח' },
];

const DEFAULT_POSITIONS = [
    'מלצר', 'ברמן', 'ראנר', 'מארח/ת', 'טבח', 'מנהל משמרת',
    'קופה + אריזות', 'צאקר', 'גריל', 'פס בטטה', 'מקשר', 'שוטף כלים', 'מתלמד מטבח'
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

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_OF_WEEK_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function AvailabilityFormSettings() {
    const [user, setUser] = useState(null);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [newPosition, setNewPosition] = useState('');
    const [activeTab, setActiveTab] = useState('positions');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const currentUser = await User.me();
            if (currentUser?.role !== 'admin') {
                setUser(null);
                setLoading(false);
                return;
            }
            setUser(currentUser);

            const existingSettings = await base44.entities.AvailabilityFormSettings.list();
            if (existingSettings.length > 0) {
                setSettings(existingSettings[0]);
            } else {
                const newSettings = {
                    departments: DEFAULT_DEPARTMENTS,
                    positions: DEFAULT_POSITIONS,
                    availability_types: DEFAULT_AVAILABILITY_TYPES,
                    shift_options: DEFAULT_SHIFT_OPTIONS,
                    default_days_unavailable: [],
                    week_starts_offset: 7,
                };
                const created = await base44.entities.AvailabilityFormSettings.create(newSettings);
                setSettings(created);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
        setLoading(false);
    };

    const saveSettings = async () => {
        setSaving(true);
        try {
            await base44.entities.AvailabilityFormSettings.update(settings.id, settings);
            alert('ההגדרות נשמרו בהצלחה');
        } catch (error) {
            console.error('Error saving settings:', error);
            alert('שגיאה בשמירת ההגדרות');
        }
        setSaving(false);
    };

    const addPosition = () => {
        if (newPosition.trim() && !settings.positions.includes(newPosition.trim())) {
            setSettings({
                ...settings,
                positions: [...settings.positions, newPosition.trim()]
            });
            setNewPosition('');
        }
    };

    const removePosition = (pos) => {
        setSettings({
            ...settings,
            positions: settings.positions.filter(p => p !== pos)
        });
    };

    const toggleDefaultDay = (day) => {
        const updated = settings.default_days_unavailable.includes(day)
            ? settings.default_days_unavailable.filter(d => d !== day)
            : [...settings.default_days_unavailable, day];
        setSettings({ ...settings, default_days_unavailable: updated });
    };

    if (loading) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    if (!user || user.role !== 'admin') {
        return (
            <div className="flex items-center justify-center h-screen">
                <Card className="max-w-md w-full text-center p-8">
                    <h2 className="text-2xl font-bold mb-2">גישה מוגבלת</h2>
                    <p className="text-gray-500">רק מנהלים יכולים לגשת לדף זה.</p>
                </Card>
            </div>
        );
    }

    if (!settings) {
        return <div className="flex justify-center items-center h-screen"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto" dir="rtl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold flex items-center gap-2 mb-2">
                    <Settings className="w-8 h-8 text-primary" />
                    הגדרות עמוד הגשת זמינות
                </h1>
                <p className="text-gray-600">ערוך את הגדרות דף הגשת הזמינות של העובדים</p>
            </div>

            <div className="flex gap-2 mb-6 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('departments')}
                    className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
                        activeTab === 'departments'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                >
                    חטיבות
                </button>
                <button
                    onClick={() => setActiveTab('positions')}
                    className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
                        activeTab === 'positions'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                >
                    תפקידים
                </button>
                <button
                    onClick={() => setActiveTab('defaults')}
                    className={`px-4 py-2 font-semibold border-b-2 transition-colors ${
                        activeTab === 'defaults'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                >
                    ימים קבועים
                </button>
            </div>

            {activeTab === 'departments' && (
                <Card>
                    <CardHeader>
                        <CardTitle>ניהול חטיבות</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-gray-600 text-sm">הגדר את החטיבות ותפקיד הברירה המחדל לכל אחת</p>
                        <div className="space-y-3">
                            {settings.departments?.map((dept) => (
                                <div key={dept.key} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <p className="font-semibold mb-2">{dept.label}</p>
                                    <div>
                                        <Label className="text-sm mb-1 block">תפקיד ברירת מחדל</Label>
                                        <select
                                            value={dept.default_position || ''}
                                            onChange={(e) => {
                                                setSettings({
                                                    ...settings,
                                                    departments: settings.departments.map(d => 
                                                        d.key === dept.key ? { ...d, default_position: e.target.value } : d
                                                    )
                                                });
                                            }}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                        >
                                            <option value="">בחר תפקיד</option>
                                            {settings.positions.map(pos => (
                                                <option key={pos} value={pos}>{pos}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'positions' && (
                <Card>
                    <CardHeader>
                        <CardTitle>ניהול תפקידים</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="mb-2 block font-semibold">הוסף תפקיד חדש</Label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="שם התפקיד"
                                    value={newPosition}
                                    onChange={(e) => setNewPosition(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && addPosition()}
                                />
                                <Button onClick={addPosition} className="gap-2">
                                    <Plus className="w-4 h-4" />
                                    הוסף
                                </Button>
                            </div>
                        </div>

                        <div>
                            <Label className="mb-3 block font-semibold">התפקידים הקיימים</Label>
                            <div className="space-y-2">
                                {settings.positions.map((pos) => (
                                    <div
                                        key={pos}
                                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                                    >
                                        <span className="font-medium">{pos}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removePosition(pos)}
                                            className="text-red-600 hover:text-red-800"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activeTab === 'defaults' && (
                <Card>
                    <CardHeader>
                        <CardTitle>ימים קבועים לכולם</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-gray-600 text-sm">בחר ימים שיהיו בברירת מחדל "לא פנוי" לכל העובדים</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {DAYS_OF_WEEK.map((day, idx) => (
                                <button
                                    key={day}
                                    onClick={() => toggleDefaultDay(day)}
                                    className={`p-3 rounded-lg border-2 font-semibold transition-all ${
                                        settings.default_days_unavailable.includes(day)
                                            ? 'bg-red-100 border-red-400 text-red-800'
                                            : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                                    }`}
                                >
                                    {DAYS_OF_WEEK_HE[idx]}
                                </button>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            <div className="mt-8 flex justify-end gap-3">
                <Button variant="outline" onClick={loadData}>
                    בטל
                </Button>
                <Button
                    size="lg"
                    onClick={saveSettings}
                    disabled={saving}
                    className="px-8"
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin ml-2" /> : null}
                    שמור שינויים
                </Button>
            </div>
        </div>
    );
}