
import React, { useState, useEffect } from 'react';
import { WorkPosition } from '@/entities/all';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Edit, Trash2, Briefcase, Sparkles, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { canonRole } from '@/lib/roles';
import PageHeader from '@/components/shared/PageHeader';

function PositionForm({ position, onSave, onCancel }) {
    const [formData, setFormData] = useState({
        position_name: position?.position_name || '',
        emoji: position?.emoji || '👔',
        description: position?.description || '',
        responsibilities: position?.responsibilities || [''],
        recruitment_guidelines: position?.recruitment_guidelines || {
            what_to_look_for: '',
            where_to_post: ''
        },
        interview_questions: position?.interview_questions || [''],
        training_plan: position?.training_plan || '', // Added this
        required_skills: position?.required_skills || [''],
        color: position?.color || '#3b82f6',
        hourly_rate: position?.hourly_rate || 0,
        is_active: position?.is_active !== false,
        requires_kashrut: position?.requires_kashrut === true,
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        // Clean up empty arrays
        const cleanedData = {
            ...formData,
            responsibilities: formData.responsibilities.filter(r => r.trim()),
            interview_questions: formData.interview_questions.filter(q => q.trim()),
            required_skills: formData.required_skills.filter(s => s.trim())
        };
        onSave(cleanedData);
    };

    const updateArrayField = (field, index, value) => {
        const newArray = [...formData[field]];
        newArray[index] = value;
        setFormData({...formData, [field]: newArray});
    };

    const addArrayItem = (field) => {
        setFormData({...formData, [field]: [...formData[field], '']});
    };

    const removeArrayItem = (field, index) => {
        const newArray = formData[field].filter((_, i) => i !== index);
        setFormData({...formData, [field]: newArray});
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="position_name">שם התפקיד</Label>
                    <Input
                        id="position_name"
                        value={formData.position_name}
                        onChange={(e) => setFormData({ ...formData, position_name: e.target.value })}
                        required
                    />
                </div>
                <div>
                    <Label htmlFor="emoji">אייקון/אימוג'י</Label>
                    <Input
                        id="emoji"
                        value={formData.emoji}
                        onChange={(e) => setFormData({ ...formData, emoji: e.target.value })}
                        placeholder="🍽️"
                    />
                </div>
            </div>

            <div>
                <Label htmlFor="description">הגדרת התפקיד</Label>
                <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="h-32"
                    placeholder="תיאור כללי של התפקיד, מטרותיו ותפקידו בצוות..."
                />
            </div>

            <div>
                <Label>תחומי אחריות</Label>
                {formData.responsibilities.map((resp, index) => (
                    <div key={index} className="flex gap-2 mt-2">
                        <Input
                            value={resp}
                            onChange={(e) => updateArrayField('responsibilities', index, e.target.value)}
                            placeholder="תחום אחריות..."
                        />
                        {formData.responsibilities.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" 
                                onClick={() => removeArrayItem('responsibilities', index)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                ))}
                <Button type="button" variant="outline" className="mt-2" 
                    onClick={() => addArrayItem('responsibilities')}>
                    הוסף תחום אחריות
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="what_to_look_for">מה לחפש בגיוס</Label>
                    <Textarea
                        id="what_to_look_for"
                        value={formData.recruitment_guidelines.what_to_look_for}
                        onChange={(e) => setFormData({
                            ...formData,
                            recruitment_guidelines: {
                                ...formData.recruitment_guidelines,
                                what_to_look_for: e.target.value
                            }
                        })}
                        placeholder="אנשים אנרגטיים, עם חיוך, יכולת לעמוד בלחץ..."
                    />
                </div>
                <div>
                    <Label htmlFor="where_to_post">איפה לפרסם</Label>
                    <Textarea
                        id="where_to_post"
                        value={formData.recruitment_guidelines.where_to_post}
                        onChange={(e) => setFormData({
                            ...formData,
                            recruitment_guidelines: {
                                ...formData.recruitment_guidelines,
                                where_to_post: e.target.value
                            }
                        })}
                        placeholder="קבוצות פייסבוק מקומיות, אינסטגרם, לוחות דרושים..."
                    />
                </div>
            </div>
            
            <div>
                <Label htmlFor="training_plan">תוכנית הכשרה</Label>
                <Textarea
                    id="training_plan"
                    value={formData.training_plan}
                    onChange={(e) => setFormData({ ...formData, training_plan: e.target.value })}
                    className="h-32"
                    placeholder="תיאור תהליך ההכשרה שלב אחר שלב..."
                />
            </div>

            <div>
                <Label>שאלות ריאיון לדוגמה</Label>
                {formData.interview_questions.map((question, index) => (
                    <div key={index} className="flex gap-2 mt-2">
                        <Input
                            value={question}
                            onChange={(e) => updateArrayField('interview_questions', index, e.target.value)}
                            placeholder="שאלת ריאיון..."
                        />
                        {formData.interview_questions.length > 1 && (
                            <Button type="button" variant="ghost" size="icon" 
                                onClick={() => removeArrayItem('interview_questions', index)}>
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        )}
                    </div>
                ))}
                <Button type="button" variant="outline" className="mt-2" 
                    onClick={() => addArrayItem('interview_questions')}>
                    הוסף שאלת ריאיון
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <Label htmlFor="color">צבע לסידור עבודה</Label>
                    <Input
                        id="color"
                        type="color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    />
                </div>
                <div>
                    <Label htmlFor="hourly_rate">שכר לשעה (₪)</Label>
                    <Input
                        id="hourly_rate"
                        type="number"
                        value={formData.hourly_rate}
                        onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
                    />
                </div>
            </div>

            {/* Kashrut requirement (cooking-side positions) */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!formData.requires_kashrut}
                        onChange={(e) => setFormData({ ...formData, requires_kashrut: e.target.checked })}
                        className="mt-0.5 w-5 h-5 accent-amber-600"
                    />
                    <div className="flex-1">
                        <p className="font-bold text-amber-900 text-sm">🍽️ דורש עמידה בדיני בישול גויים (כשרות)</p>
                        <p className="text-xs text-amber-700 mt-1">
                            סמן עבור תפקידים במטבח בלבד (טבח, סו שף וכו'). הסוכן יוסיף שאלה מפורשת על כך לכל מועמד לתפקיד הזה — מי שעונה "לא" יורד 21 נקודות ויעבור לסקירה ידנית במקום קביעה אוטומטית.
                            לתפקידי מלצרות/מארחת/קופה/שטיפה — אין צורך לסמן.
                        </p>
                    </div>
                </label>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={onCancel}>ביטול</Button>
                <Button type="submit">{position ? 'שמור שינויים' : 'הוסף תפקיד'}</Button>
            </div>
        </form>
    );
}

function PositionViewPage({ position, onBack }) {
    if (!position) return null;

    return (
        <div className="p-4 md:p-8" dir="rtl">
            <div className="max-w-4xl mx-auto">
                <Button onClick={onBack} variant="outline" className="mb-6">
                    ← חזור לרשימת התפקידים
                </Button>
                
                <div className="space-y-8">
                    {/* Header */}
                    <div className="text-center border-b pb-6">
                        <div className="text-6xl mb-4">{position.emoji || '👔'}</div>
                        <h1 className="text-4xl font-bold text-gray-900">{position.position_name}</h1>
                    </div>

                    {/* Job Description */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-2xl">הגדרת תפקיד</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg leading-relaxed text-gray-700">
                                {position.description}
                            </p>
                        </CardContent>
                    </Card>

                    {/* Responsibilities */}
                    {position.responsibilities && position.responsibilities.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-2xl">תחומי אחריות:</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-3">
                                    {position.responsibilities.map((resp, index) => (
                                        <li key={index} className="flex items-start gap-3">
                                            <span className="text-[#44512C] font-bold">•</span>
                                            <span className="text-lg text-gray-700">{resp}</span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    )}

                    {/* Recruitment Guidelines */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-2xl">איך לגייס</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {position.recruitment_guidelines?.what_to_look_for && (
                                <div>
                                    <h3 className="text-xl font-semibold mb-3">מה לחפש:</h3>
                                    <p className="text-lg text-gray-700 leading-relaxed">
                                        {position.recruitment_guidelines.what_to_look_for}
                                    </p>
                                </div>
                            )}
                            {position.recruitment_guidelines?.where_to_post && (
                                <div>
                                    <h3 className="text-xl font-semibold mb-3">איפה לפרסם:</h3>
                                    <p className="text-lg text-gray-700 leading-relaxed">
                                        {position.recruitment_guidelines.where_to_post}
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Training Plan */}
                    {position.training_plan && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-2xl">איך להכשיר</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-lg text-gray-700 leading-relaxed whitespace-pre-line">
                                    {position.training_plan}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Interview Questions */}
                    {position.interview_questions && position.interview_questions.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-2xl">שאלות ריאיון לדוגמה:</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <ol className="space-y-4">
                                    {position.interview_questions.map((question, index) => (
                                        <li key={index} className="flex items-start gap-4">
                                            <span className="flex-shrink-0 w-8 h-8 bg-[#F4ECD8] text-[#44512C] rounded-full flex items-center justify-center font-bold">
                                                {index + 1}
                                            </span>
                                            <span className="text-lg text-gray-700">{question}</span>
                                        </li>
                                    ))}
                                </ol>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function PositionsManagementPage() {
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingPosition, setEditingPosition] = useState(null);
    const [viewingPosition, setViewingPosition] = useState(null);
    const [aiSuggesting, setAiSuggesting] = useState(false);
    const [aiSuggestions, setAiSuggestions] = useState(null);
    const [importing, setImporting] = useState(false);

    const runAiSuggest = async () => {
        setAiSuggesting(true);
        try {
            const res = await base44.functions.suggestRoles({});
            const data = res?.data || res;
            const roles = (data?.roles || []).map((r) => ({ ...r, selected: true }));
            setAiSuggestions(roles);
        } catch (e) {
            alert('שגיאה: ' + (e?.message || ''));
        } finally {
            setAiSuggesting(false);
        }
    };

    const importSelected = async () => {
        if (!aiSuggestions) return;
        setImporting(true);
        const chosen = aiSuggestions.filter((r) => r.selected);
        try {
            for (const r of chosen) {
                await WorkPosition.create({
                    position_name: r.emoji ? `${r.emoji} ${r.name}` : r.name,
                    emoji: r.emoji || '👔',
                    color: r.color || '#3b82f6',
                    hourly_rate: r.hourly_rate_ils || 0,
                    is_active: true,
                    description: (r.shifts && r.shifts.length ? `משמרות: ${r.shifts.join(', ')}` : ''),
                });
            }
            setAiSuggestions(null);
            loadPositions();
        } catch (e) {
            alert('שגיאה בייבוא: ' + (e?.message || ''));
        } finally {
            setImporting(false);
        }
    };

    useEffect(() => {
        loadPositions();
    }, []);

    const loadPositions = async () => {
        setLoading(true);
        try {
            const data = await WorkPosition.list();
            setPositions(data);
        } catch (error) {
            console.error("Error loading positions:", error);
        }
        setLoading(false);
    };

    const handleSave = async (data) => {
        try {
            if (editingPosition) {
                const oldName = String(editingPosition.position_name || '').trim();
                const newName = String(data.position_name || '').trim();
                await WorkPosition.update(editingPosition.id, data);
                // A rename must follow the name into every place it's referenced
                // (shift assignments, coverage, tips, employee role/positions,
                // availability) — otherwise scheduled staff vanish from the column.
                if (oldName && newName && oldName !== newName) {
                    try {
                        await base44.functions.renameWorkPosition({ old_name: oldName, old_canon: canonRole(oldName), new_name: newName });
                    } catch (e) {
                        alert('שם התפקיד עודכן, אך העדכון בסידור/עובדים נכשל — נסה שוב או פנה לתמיכה. (' + (e?.message || '') + ')');
                    }
                }
            } else {
                await WorkPosition.create(data);
            }
            setIsFormOpen(false);
            setEditingPosition(null);
            loadPositions();
        } catch (error) {
            console.error("Error saving position:", error);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק תפקיד זה?')) {
            try {
                await WorkPosition.delete(id);
                loadPositions();
            } catch (error) {
                console.error("Error deleting position:", error);
            }
        }
    };

    const openForm = (position = null) => {
        setEditingPosition(position);
        setIsFormOpen(true);
    };

    // If viewing a specific position, show the detailed view
    if (viewingPosition) {
        return (
            <PositionViewPage 
                position={viewingPosition} 
                onBack={() => setViewingPosition(null)} 
            />
        );
    }

    return (
        <div className="p-4 md:p-8 bg-gradient-to-br from-[#FAF5E8] via-[#F7EFDD] to-[#F1E6CE] min-h-screen" dir="rtl">
            <div className="max-w-6xl mx-auto">
                <PageHeader
                    title="ניהול תפקידים"
                    subtitle="הגדרת תפקידים, תיאורים ונהלי גיוס"
                    icon={Briefcase}
                    action={
                        <div className="flex items-center gap-2">
                            <Button variant="outline" onClick={runAiSuggest} disabled={aiSuggesting} className="gap-1">
                                {aiSuggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                {aiSuggesting ? 'AI חושב...' : 'הצע תפקידים לפי הפרופיל'}
                            </Button>
                            <Button onClick={() => openForm()}>
                                <Plus className="w-4 h-4 ml-2" />הוסף תפקיד חדש
                            </Button>
                        </div>
                    }
                />

                {aiSuggestions && (
                    <Card className="mb-4 border-amber-200 bg-amber-50">
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-bold flex items-center gap-1">
                                    <Sparkles className="w-4 h-4 text-amber-600" /> הצעות AI ({aiSuggestions.length})
                                </h3>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => setAiSuggestions(null)}>ביטול</Button>
                                    <Button size="sm" onClick={importSelected} disabled={importing || !aiSuggestions.some(r => r.selected)}>
                                        {importing ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : null}
                                        ייבא נבחרים ({aiSuggestions.filter(r => r.selected).length})
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {aiSuggestions.map((r, i) => (
                                    <label key={i} className="flex items-center gap-3 p-3 bg-white rounded-lg border cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={r.selected}
                                            onChange={(e) => {
                                                const next = [...aiSuggestions];
                                                next[i] = { ...r, selected: e.target.checked };
                                                setAiSuggestions(next);
                                            }}
                                        />
                                        <span className="text-2xl">{r.emoji}</span>
                                        <div className="flex-1">
                                            <div className="font-bold">{r.name}</div>
                                            <div className="text-xs text-slate-500">
                                                ₪{r.hourly_rate_ils}/שעה
                                                {r.shifts?.length ? ` · ${r.shifts.join(' / ')}` : ''}
                                            </div>
                                        </div>
                                        <div className="w-6 h-6 rounded" style={{ background: r.color }} />
                                    </label>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>תפקיד</TableHead>
                                    <TableHead>צבע</TableHead>
                                    <TableHead>שכר לשעה</TableHead>
                                    <TableHead>סטטוס</TableHead>
                                    <TableHead>פעולות</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {positions.map(pos => (
                                    <TableRow key={pos.id}>
                                        <TableCell className="font-medium">
                                            <button 
                                                onClick={() => setViewingPosition(pos)}
                                                className="flex items-center gap-3 hover:text-[#44512C] transition-colors"
                                            >
                                                <span className="text-xl">{pos.emoji || '👔'}</span>
                                                <span className="underline">{pos.position_name}</span>
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full" style={{ backgroundColor: pos.color }}></div>
                                                {pos.color}
                                            </div>
                                        </TableCell>
                                        <TableCell>₪{pos.hourly_rate || 0}</TableCell>
                                        <TableCell>
                                            <span className={`px-2 py-1 rounded-full text-xs ${pos.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {pos.is_active ? 'פעיל' : 'לא פעיל'}
                                            </span>
                                        </TableCell>
                                        <TableCell className="flex gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => openForm(pos)}>
                                                <Edit className="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(pos.id)}>
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Form Dialog */}
                <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
                    <DialogContent className="sm:max-w-[800px]">
                        <DialogHeader>
                            <DialogTitle>{editingPosition ? 'עריכת תפקיד' : 'הוספת תפקיד חדש'}</DialogTitle>
                        </DialogHeader>
                        <PositionForm 
                            position={editingPosition} 
                            onSave={handleSave} 
                            onCancel={() => setIsFormOpen(false)} 
                        />
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
}
