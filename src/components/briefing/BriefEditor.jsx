import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, PlusCircle, Trash2, Save, Send } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

const fieldLabels = {
    item: 'פריט',
    target_description: 'תיאור יעד',
    target_value: 'ערך יעד',
    bonus_description: 'תיאור בונוס',
    employee_name: 'שם עובד',
    station_name: 'אזור / עמדה',
    assigned_to: 'אחראי',
    task_description: 'תיאור משימה',
};

const DynamicListEditor = ({ title, items, setItems, itemStructure, placeholder }) => {
    const keys = Object.keys(itemStructure);

    const handleAdd = () => setItems([...items, { ...itemStructure, id: Date.now() }]);
    const handleChange = (index, field, value) => {
        const next = [...items];
        next[index] = { ...next[index], [field]: value };
        setItems(next);
    };
    const handleRemove = (index) => setItems(items.filter((_, i) => i !== index));

    return (
        <div className="border rounded-xl bg-slate-50 overflow-hidden">
            <div className="px-4 py-3 bg-slate-100 border-b">
                <h4 className="font-bold text-slate-700 text-sm">{title}</h4>
            </div>
            <div className="p-3 space-y-2">
                {items.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-2">אין פריטים עדיין</p>
                )}
                {items.map((item, index) => (
                    <div key={item.id || index} className="bg-white border rounded-lg p-3 space-y-2">
                        <div className={`grid gap-2 ${keys.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                            {keys.map(key => (
                                <div key={key} className="flex flex-col gap-1">
                                    <Label className="text-xs font-semibold text-slate-500">
                                        {fieldLabels[key] || key.replace(/_/g, ' ')}
                                    </Label>
                                    <Input
                                        value={item[key] || ''}
                                        onChange={(e) => handleChange(index, key, e.target.value)}
                                        placeholder={placeholder[key]}
                                        type={key === 'target_value' ? 'number' : 'text'}
                                        className="h-9 text-sm"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemove(index)}
                                className="text-red-500 hover:text-red-600 hover:bg-red-50 h-7 px-2 text-xs"
                            >
                                <Trash2 className="w-3 h-3 ml-1" /> הסר
                            </Button>
                        </div>
                    </div>
                ))}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAdd}
                    className="w-full border-dashed border-slate-300 text-slate-600 hover:bg-slate-100 h-9 mt-1"
                >
                    <PlusCircle className="w-4 h-4 ml-2" /> הוסף פריט
                </Button>
            </div>
        </div>
    );
};

const AiButton = ({ fieldName, shiftType, onGenerate, isAiLoading }) => (
    <Button
        size="sm"
        variant="outline"
        onClick={() => onGenerate(fieldName, shiftType)}
        disabled={isAiLoading}
        className="h-7 px-2 text-xs text-purple-600 border-purple-200 hover:bg-purple-50 gap-1"
    >
        {isAiLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        AI
    </Button>
);

const FieldWithAI = ({ label, fieldId, value, onChange, placeholder, fieldName, shiftType, onGenerate, isAiLoading }) => (
    <div className="space-y-1.5">
        <div className="flex items-center justify-between">
            <Label htmlFor={fieldId} className="text-sm font-semibold text-slate-700">{label}</Label>
            <AiButton fieldName={fieldName} shiftType={shiftType} onGenerate={onGenerate} isAiLoading={isAiLoading} />
        </div>
        <Textarea
            id={fieldId}
            value={value || ''}
            onChange={onChange}
            placeholder={placeholder}
            className="min-h-[80px] text-sm resize-none"
        />
    </div>
);

export default function BriefEditor({ briefData, onChange, onSave, onCancel, isLoading, isAiLoading, onGenerateWithAI }) {
    const shiftType = briefData.shift_type;

    return (
        <Card className="relative shadow-lg border">
            {isAiLoading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col justify-center items-center z-20 rounded-xl gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                    <p className="text-sm text-purple-700 font-medium">AI מייצר תוכן...</p>
                </div>
            )}

            <CardHeader className="pb-3 border-b">
                <CardTitle className="text-lg">
                    {briefData.id ? 'עריכת' : 'יצירת'} תדריך {shiftType === 'lunch' ? '☀️ צהריים' : '🌙 ערב'}
                </CardTitle>
                <CardDescription>
                    תאריך: {briefData.date && !isNaN(new Date(briefData.date)) ? format(new Date(briefData.date), 'PPP', { locale: he }) : 'תאריך לא תקין'}
                </CardDescription>
            </CardHeader>

            <CardContent className="pt-4">
                <Tabs defaultValue="general">
                    <TabsList className="grid w-full grid-cols-2 gap-1 h-auto bg-gray-100 p-1 rounded-xl">
                        <TabsTrigger value="general" className="rounded-lg py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">🎯 דגשים</TabsTrigger>
                        <TabsTrigger value="operations" className="rounded-lg py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">🔧 תפעול</TabsTrigger>
                        <TabsTrigger value="goals" className="rounded-lg py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">🏆 יעדים</TabsTrigger>
                        <TabsTrigger value="assignments" className="rounded-lg py-2.5 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">👤 איוש</TabsTrigger>
                    </TabsList>

                    <div className="mt-4 space-y-4 min-h-[300px]">
                        <TabsContent value="general" className="space-y-4 mt-0">
                            <FieldWithAI
                                label="סיפור המשמרת"
                                fieldId="story_of_the_day"
                                value={briefData.story_of_the_day}
                                onChange={e => onChange('story_of_the_day', e.target.value)}
                                placeholder="ספר משהו שיכניס את הצוות לאווירה הנכונה..."
                                fieldName="story_of_the_day"
                                shiftType={shiftType}
                                onGenerate={onGenerateWithAI}
                                isAiLoading={isAiLoading}
                            />
                            <FieldWithAI
                                label="דגש שירות"
                                fieldId="service_focus"
                                value={briefData.service_focus}
                                onChange={e => onChange('service_focus', e.target.value)}
                                placeholder="על מה מתמקדים בשירות היום?"
                                fieldName="service_focus"
                                shiftType={shiftType}
                                onGenerate={onGenerateWithAI}
                                isAiLoading={isAiLoading}
                            />
                            <FieldWithAI
                                label="דגש מכירות"
                                fieldId="sales_focus"
                                value={briefData.sales_focus}
                                onChange={e => onChange('sales_focus', e.target.value)}
                                placeholder="אילו פריטים אנחנו רוצים לקדם במיוחד?"
                                fieldName="sales_focus"
                                shiftType={shiftType}
                                onGenerate={onGenerateWithAI}
                                isAiLoading={isAiLoading}
                            />
                        </TabsContent>

                        <TabsContent value="operations" className="space-y-4 mt-0">
                            <FieldWithAI
                                label="דגשים תפעוליים"
                                fieldId="operational_focus"
                                value={briefData.operational_focus}
                                onChange={e => onChange('operational_focus', e.target.value)}
                                placeholder="דברים מיוחדים שצריך לשים לב אליהם תפעולית..."
                                fieldName="operational_focus"
                                shiftType={shiftType}
                                onGenerate={onGenerateWithAI}
                                isAiLoading={isAiLoading}
                            />
                            <DynamicListEditor
                                title="חוסרים במטבח"
                                items={(briefData.kitchen_shortages || []).map(s => ({ item: s }))}
                                setItems={v => onChange('kitchen_shortages', v.map(i => i.item))}
                                itemStructure={{ item: '' }}
                                placeholder={{ item: 'למשל: נגמר הטריאקי' }}
                            />
                            <DynamicListEditor
                                title="חוסרים בבר"
                                items={(briefData.bar_shortages || []).map(s => ({ item: s }))}
                                setItems={v => onChange('bar_shortages', v.map(i => i.item))}
                                itemStructure={{ item: '' }}
                                placeholder={{ item: 'למשל: נגמר מונסטר לבן' }}
                            />
                        </TabsContent>

                        <TabsContent value="goals" className="space-y-4 mt-0">
                            <DynamicListEditor
                                title="יעדי מכירות"
                                items={briefData.sales_targets || []}
                                setItems={v => onChange('sales_targets', v)}
                                itemStructure={{ target_description: '', target_value: '', bonus_description: '' }}
                                placeholder={{ target_description: 'למכור 40 צייסרים', target_value: '40', bonus_description: 'בונוס 5 שח לשעה' }}
                            />
                            <DynamicListEditor
                                title="יעדי שירות"
                                items={briefData.service_targets || []}
                                setItems={v => onChange('service_targets', v)}
                                itemStructure={{ target_description: '' }}
                                placeholder={{ target_description: 'כל שולחן מקבל מים תוך דקה' }}
                            />
                        </TabsContent>

                        <TabsContent value="assignments" className="space-y-4 mt-0">
                            <DynamicListEditor
                                title="חלוקה לאזורים (פיק)"
                                items={briefData.station_assignments || []}
                                setItems={v => onChange('station_assignments', v)}
                                itemStructure={{ employee_name: '', station_name: '' }}
                                placeholder={{ employee_name: 'שם עובד/ת', station_name: 'אזור שירות' }}
                            />
                            <DynamicListEditor
                                title="משימות סגירה"
                                items={briefData.closing_tasks || []}
                                setItems={v => onChange('closing_tasks', v)}
                                itemStructure={{ assigned_to: '', task_description: '' }}
                                placeholder={{ assigned_to: 'שם עובד/ת', task_description: 'משימה' }}
                            />
                        </TabsContent>
                    </div>
                </Tabs>

                <div className="flex flex-col sm:flex-row justify-between gap-3 mt-6 pt-4 border-t">
                    <Button variant="outline" onClick={onCancel} className="sm:w-auto w-full">
                        ביטול
                    </Button>
                    <div className="flex gap-2 sm:flex-row flex-col">
                        <Button
                            onClick={() => onSave(false)}
                            disabled={isLoading}
                            variant="outline"
                            className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Save className="w-4 h-4 ml-2" />}
                            שמור טיוטה
                        </Button>
                        <Button
                            onClick={() => onSave(true)}
                            disabled={isLoading}
                            className="bg-green-600 hover:bg-green-700 text-white"
                        >
                            {isLoading ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Send className="w-4 h-4 ml-2" />}
                            פרסם לצוות
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}