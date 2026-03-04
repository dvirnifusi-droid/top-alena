import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, Save, X, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const emptyResponse = { text: '', tone: '', is_correct: false, explanation: '' };
const emptyScenario = { situation: '', customer_says: '', responses: [emptyResponse, emptyResponse, emptyResponse], order: 1 };

export default function ToneScenarioManager() {
    const [scenarios, setScenarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingScenario, setEditingScenario] = useState(null);
    const [form, setForm] = useState(emptyScenario);

    const load = async () => {
        setLoading(true);
        const data = await base44.entities.ToneScenario.list('order');
        setScenarios(data);
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const openEdit = (scenario) => {
        setEditingScenario(scenario);
        setForm({
            situation: scenario.situation,
            customer_says: scenario.customer_says,
            responses: scenario.responses || [emptyResponse, emptyResponse, emptyResponse],
            order: scenario.order || 1
        });
    };

    const openNew = () => {
        setEditingScenario('new');
        setForm({ ...emptyScenario, order: scenarios.length + 1 });
    };

    const close = () => { setEditingScenario(null); };

    const updateResponse = (index, field, value) => {
        const updated = form.responses.map((r, i) => i === index ? { ...r, [field]: value } : r);
        setForm({ ...form, responses: updated });
    };

    const setCorrect = (index) => {
        const updated = form.responses.map((r, i) => ({ ...r, is_correct: i === index }));
        setForm({ ...form, responses: updated });
    };

    const save = async () => {
        if (editingScenario === 'new') {
            await base44.entities.ToneScenario.create(form);
        } else {
            await base44.entities.ToneScenario.update(editingScenario.id, form);
        }
        close();
        load();
    };

    const remove = async (id) => {
        if (!window.confirm('למחוק תרחיש זה?')) return;
        await base44.entities.ToneScenario.delete(id);
        load();
    };

    if (loading) return <div className="text-center py-8 text-gray-500">טוען...</div>;

    return (
        <div className="space-y-4" dir="rtl">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">ניהול תרחישי אימון טון</h3>
                <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 ml-2" /> הוסף תרחיש
                </Button>
            </div>

            {scenarios.length === 0 && (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg">
                    אין תרחישים עדיין. לחץ "הוסף תרחיש" כדי להתחיל.
                </div>
            )}

            <div className="space-y-3">
                {scenarios.map((s) => (
                    <Card key={s.id} className="bg-white">
                        <CardContent className="p-4">
                            <div className="flex justify-between items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 truncate">{s.situation}</p>
                                    <p className="text-sm text-gray-500 truncate mt-1 italic">"{s.customer_says}"</p>
                                    <div className="flex gap-1 mt-2 flex-wrap">
                                        {(s.responses || []).map((r, i) => (
                                            <Badge key={i} variant={r.is_correct ? "default" : "outline"} className={r.is_correct ? "bg-green-600 text-xs" : "text-xs"}>
                                                {r.is_correct ? '✓ ' : ''}{r.tone}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                    <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                                        <Edit className="w-4 h-4 text-blue-600" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Dialog open={!!editingScenario} onOpenChange={close}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle>{editingScenario === 'new' ? 'תרחיש חדש' : 'עריכת תרחיש'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <label className="text-sm font-medium">שם הסיטואציה</label>
                            <Input value={form.situation} onChange={e => setForm({...form, situation: e.target.value})} placeholder="לדוגמה: לקוח מתלונן שהמנה קרה" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">מה הלקוח אומר</label>
                            <Textarea value={form.customer_says} onChange={e => setForm({...form, customer_says: e.target.value})} placeholder="הקלד את משפט הלקוח..." className="h-20" />
                        </div>

                        <div>
                            <label className="text-sm font-medium mb-2 block">תגובות (סמן את הנכונה)</label>
                            <div className="space-y-4">
                                {form.responses.map((r, i) => (
                                    <div key={i} className={`p-3 rounded-lg border-2 ${r.is_correct ? 'border-green-400 bg-green-50' : 'border-gray-200'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-sm font-semibold text-gray-600">תגובה {i + 1}</span>
                                            <Button
                                                type="button"
                                                variant={r.is_correct ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => setCorrect(i)}
                                                className={r.is_correct ? "bg-green-600 hover:bg-green-700 text-xs" : "text-xs"}
                                            >
                                                <CheckCircle className="w-3 h-3 ml-1" />
                                                {r.is_correct ? 'נכון ✓' : 'סמן כנכון'}
                                            </Button>
                                        </div>
                                        <Input
                                            value={r.text}
                                            onChange={e => updateResponse(i, 'text', e.target.value)}
                                            placeholder="טקסט התגובה"
                                            className="mb-2"
                                        />
                                        <Input
                                            value={r.tone}
                                            onChange={e => updateResponse(i, 'tone', e.target.value)}
                                            placeholder="שם הטון (לדוגמה: אמפתי ופרואקטיבי)"
                                            className="mb-2"
                                        />
                                        <Textarea
                                            value={r.explanation}
                                            onChange={e => updateResponse(i, 'explanation', e.target.value)}
                                            placeholder="הסבר למה תגובה זו נכונה/שגויה"
                                            className="h-16"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" onClick={close}><X className="w-4 h-4 ml-2" />ביטול</Button>
                        <Button onClick={save} disabled={!form.situation || !form.customer_says}>
                            <Save className="w-4 h-4 ml-2" />שמור
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}