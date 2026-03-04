import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Edit, Save, X, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const emptyStep = {
    situation_name: '',
    role: 'מלצר',
    customer_prompt: '',
    correct_response: '',
    incorrect_response: '',
    feedback_note: ''
};

export default function SimulationScriptEditor({ scriptId, onBack }) {
    const [steps, setSteps] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingStep, setEditingStep] = useState(null);
    const [form, setForm] = useState(emptyStep);

    const load = async () => {
        setLoading(true);
        const data = await base44.entities.ConversationScript.filter({ script_id: scriptId });
        setSteps(data.sort((a, b) => a.id > b.id ? 1 : -1));
        setLoading(false);
    };

    useEffect(() => { load(); }, [scriptId]);

    const openEdit = (step) => {
        setEditingStep(step);
        setForm({
            situation_name: step.situation_name,
            role: step.role || 'מלצר',
            customer_prompt: step.customer_prompt,
            correct_response: step.correct_response,
            incorrect_response: step.incorrect_response,
            feedback_note: step.feedback_note || ''
        });
    };

    const openNew = () => {
        setEditingStep('new');
        setForm({ ...emptyStep });
    };

    const close = () => setEditingStep(null);

    const save = async () => {
        if (editingStep === 'new') {
            await base44.entities.ConversationScript.create({ ...form, script_id: scriptId });
        } else {
            await base44.entities.ConversationScript.update(editingStep.id, form);
        }
        close();
        load();
    };

    const remove = async (id) => {
        if (!window.confirm('למחוק שלב זה?')) return;
        await base44.entities.ConversationScript.delete(id);
        load();
    };

    if (loading) return <div className="text-center py-8 text-gray-500">טוען...</div>;

    return (
        <div className="space-y-4" dir="rtl">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={onBack}>
                        <ArrowRight className="w-4 h-4 ml-2" /> חזור
                    </Button>
                    <h3 className="text-lg font-bold">עריכת שלבי הסימולציה: <span className="text-blue-600">{scriptId}</span></h3>
                </div>
                <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 ml-2" /> הוסף שלב
                </Button>
            </div>

            {steps.length === 0 && (
                <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg">
                    אין שלבים לסימולציה זו עדיין.
                </div>
            )}

            <div className="space-y-3">
                {steps.map((step, i) => (
                    <Card key={step.id} className="bg-white">
                        <CardContent className="p-4">
                            <div className="flex justify-between items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-bold text-gray-400 bg-gray-100 rounded px-2 py-0.5">שלב {i + 1}</span>
                                        <p className="font-semibold text-slate-800 truncate">{step.situation_name}</p>
                                    </div>
                                    <p className="text-sm text-blue-700 italic truncate">לקוח: "{step.customer_prompt}"</p>
                                    <p className="text-xs text-green-700 truncate mt-1">✓ {step.correct_response}</p>
                                    <p className="text-xs text-red-600 truncate">✗ {step.incorrect_response}</p>
                                </div>
                                <div className="flex gap-1 flex-shrink-0">
                                    <Button variant="ghost" size="sm" onClick={() => openEdit(step)}>
                                        <Edit className="w-4 h-4 text-blue-600" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => remove(step.id)}>
                                        <Trash2 className="w-4 h-4 text-red-500" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Dialog open={!!editingStep} onOpenChange={close}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
                    <DialogHeader>
                        <DialogTitle>{editingStep === 'new' ? 'שלב חדש' : 'עריכת שלב'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div>
                            <label className="text-sm font-medium">שם הסיטואציה</label>
                            <Input value={form.situation_name} onChange={e => setForm({...form, situation_name: e.target.value})} placeholder="לדוגמה: פתיחת שולחן" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">תפקיד מתרגל</label>
                            <Input value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="לדוגמה: מלצר" />
                        </div>
                        <div>
                            <label className="text-sm font-medium">מה הלקוח אומר</label>
                            <Textarea value={form.customer_prompt} onChange={e => setForm({...form, customer_prompt: e.target.value})} className="h-20" placeholder="משפט הלקוח..." />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-green-700">✓ תגובה נכונה</label>
                            <Textarea value={form.correct_response} onChange={e => setForm({...form, correct_response: e.target.value})} className="h-20 border-green-300" placeholder="התגובה הנכונה של המלצר..." />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-red-600">✗ תגובה שגויה</label>
                            <Textarea value={form.incorrect_response} onChange={e => setForm({...form, incorrect_response: e.target.value})} className="h-20 border-red-300" placeholder="תגובה שגויה לדוגמה..." />
                        </div>
                        <div>
                            <label className="text-sm font-medium">הסבר / פידבק</label>
                            <Textarea value={form.feedback_note} onChange={e => setForm({...form, feedback_note: e.target.value})} className="h-16" placeholder="הסבר מדוע התגובה הנכונה עדיפה..." />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button variant="outline" onClick={close}><X className="w-4 h-4 ml-2" />ביטול</Button>
                        <Button onClick={save} disabled={!form.situation_name || !form.role || !form.customer_prompt || !form.correct_response}>
                            <Save className="w-4 h-4 ml-2" />שמור
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}